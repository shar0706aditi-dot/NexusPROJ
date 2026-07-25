# NEXUS Backend

FastAPI backend for the NEXUS reflection application.

## Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure environment:**
   - Copy `.env.example` to `.env`
   - Add your Gemini API key:
     ```
     GEMINI_API_KEY=your_actual_gemini_api_key
     ```

3. **Run the server:**
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

## API Endpoints

### POST /reflect

Streams Gemini responses via Server-Sent Events (SSE).

**Request:**
```json
{
  "prompt": "What's on your mind today?"
}
```

**Response:**
- Content-Type: `text/event-stream`
- Streams tokens progressively as they're generated

**Example:**
```bash
curl -X POST http://localhost:8000/reflect \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello"}'
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Your Google Gemini API key | Yes |

## Notes

- The API key is read from the `GEMINI_API_KEY` environment variable
- Never hardcode API keys in the source code
- CORS is enabled for all origins for development purposes