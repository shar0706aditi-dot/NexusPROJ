# NEXUS Backend

FastAPI backend for the NEXUS reflection application. Handles authentication, streaming AI reflections via OpenRouter, reflection storage, and usage insights.

## Setup

1. **Install dependencies:**

```bash
pip install -r requirements.txt
```

2. **Configure environment:**

- Copy `.env.example` to `.env`
- Add your OpenRouter API key:

```env
OPENROUTER_API_KEY=your_actual_openrouter_api_key
```

- Set the remaining variables as needed (see Environment Variables below).

3. **Run the server:**

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## API Endpoints

### Auth

- `POST /auth/register` — create an account (`name`, `email`, `password`)
- `POST /auth/login` — log in (`email`, `password`), returns a JWT `token`
- `GET /auth/me` — current user (requires `Authorization: Bearer <token>`)

### Profile & Settings

- `PUT /profile` — update display name
- `GET /settings` — get `default_depth` and `theme`
- `PUT /settings` — update `default_depth` and `theme`

### Reflection

- `POST /reflect` — streams an AI-generated reflection via Server-Sent Events (SSE)

**Request:**

```json
{
  "prompt": "What's on your mind today?",
  "depth": "balanced"
}
```

**Response:**

- Content-Type: `text/event-stream`
- Streams `data: ...` chunks of the model's JSON response as they're generated, ending with `data: [DONE]`

**Example:**

```bash
curl -N -X POST http://localhost:8000/reflect \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"prompt": "Hello", "depth": "balanced"}'
```

### Reflection History

- `POST /reflections` — save a completed reflection
- `GET /reflections` — list the current user's saved reflections
- `GET /reflections/{id}` — get one saved reflection (full result included)
- `DELETE /reflections/{id}` — delete a saved reflection

### Insights

- `GET /insights` — aggregate stats for the current user: total reflections, depth counts, dimension/signal counts, most-explored dimensions, and a daily activity `timeline`

### Root

- `GET /` — basic status check (`{"status": "NEXUS API running", "time": ...}`)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key | Yes |
| `OPENROUTER_MODEL` | OpenRouter model ID to use for reflections. Falls back to `openai/gpt-4o-mini` if unset | Recommended |
| `SECRET_KEY` | Secret used to sign JWT session tokens. Must be set to a real random value in any deployed environment | Recommended |
| `CORS_ORIGINS` | Comma-separated list of allowed origins for CORS. Falls back to `*` if unset | Recommended |

## Notes

- The OpenRouter API key is read from the `OPENROUTER_API_KEY` environment variable — never hardcode API keys in source code.
- Data is stored in a local SQLite database (`nexus.db`), created automatically on first run.
- `CORS_ORIGINS` defaults to allowing all origins, which is convenient for local development but should be set to the deployed frontend's exact origin in production.