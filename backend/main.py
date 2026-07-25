import os
import asyncio
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI
from prompts import SYSTEM_PROMPT

app = FastAPI()

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
load_dotenv()

# Read OpenRouter API key from environment variable
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

if not OPENROUTER_API_KEY:
    raise ValueError("OPENROUTER_API_KEY environment variable is not set")

# Initialize OpenAI client with OpenRouter configuration
client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
    default_headers={
        "HTTP-Referer": "https://nexus-proj.vercel.app",
        "X-Title": "NexusPROJ"
    }
)


class ReflectionRequest(BaseModel):
    prompt: str


async def stream_openrouter_response(prompt: str):
    """Stream response using OpenRouter with fallback support."""
    try:
        try:
            # Try primary model: google/gemma-3-27b-it:free
            response = await client.chat.completions.create(
                model="deepseek/deepseek-chat-v3-0324",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                stream=True,
                temperature=0.3,
                max_tokens=900,
            )
        except Exception:
            # Fallback to deepseek/deepseek-chat-v3-0324:free
            response = await client.chat.completions.create(
                model="deepseek/deepseek-r1-0528:free",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                stream=True,
                temperature=0.3,
                max_tokens=900,
            )

        async for chunk in response:
            if chunk.choices and len(chunk.choices) > 0:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    print(delta.content, end="", flush=True)
                    yield f"data: {delta.content}\n\n"
                    await asyncio.sleep(0)

        # Send end signal
        yield "data: [DONE]\n\n"
    except Exception as e:
        yield f"data: [ERROR] {str(e)}\n\n"


@app.post("/reflect")
async def reflect(request: ReflectionRequest):
    """
    POST endpoint that streams responses via SSE.
    
    Accepts a JSON body with 'prompt' field.
    Returns Server-Sent Events stream with progressive tokens.
    """
    if not request.prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")
    
    return StreamingResponse(
        stream_openrouter_response(request.prompt),
        media_type="text/event-stream"
    )

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}

