"""
NEXUS backend — FastAPI + SQLite + OpenRouter.

Implements: auth (register/login/me), profile, settings, the streaming
/reflect endpoint (calls an LLM via OpenRouter), and reflection history
+ insights, matching the module list in the project synopsis.

Run with:
    uvicorn main:app --reload --port 8000
"""

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import jwt
import requests
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
SECRET_KEY = os.getenv("SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY environment variable is required. "
        "Set a strong random SECRET_KEY in backend/.env before starting the backend."
    )
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

DB_PATH = Path(__file__).parent / "nexus.db"
JWT_ALGO = "HS256"
TOKEN_TTL_DAYS = 30
bearer_scheme = HTTPBearer(auto_error=False)

# The 7 reflection dimensions from the synopsis, and which ones are
# generated at each depth level. Deeper = more dimensions explored.
SECTIONS = [
    "Possible Bias",
    "Hidden Assumption",
    "Potential Contradiction",
    "Alternative Perspective",
    "Blind Spot",
    "Reframe",
    "Reflection Prompt",
]
DEPTH_SECTIONS = {
    "gentle": ["Possible Bias", "Alternative Perspective", "Reflection Prompt"],
    "balanced": ["Possible Bias", "Hidden Assumption", "Alternative Perspective", "Blind Spot", "Reflection Prompt"],
    "deep": SECTIONS,
}

app = FastAPI(title="NEXUS API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SIGNAL_SECTIONS = [
    "Possible Bias",
    "Potential Contradiction",
    "Hidden Assumption",
    "Alternative Perspective",
    "Blind Spot",
    "Reframe",
]
# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                default_depth TEXT NOT NULL DEFAULT 'balanced',
                theme TEXT NOT NULL DEFAULT 'dark',
                created_at TEXT NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS reflections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                prompt TEXT NOT NULL,
                depth TEXT NOT NULL,
                result TEXT NOT NULL,
                thought_at TEXT,
                created_at TEXT NOT NULL
            )
        """)


init_db()


# ---------------------------------------------------------------------------
# Password hashing (PBKDF2 — no native/compiled dependency required)
# ---------------------------------------------------------------------------

def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 100_000)
    return digest.hex(), salt


def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    check, _ = hash_password(password, salt)
    return hmac.compare_digest(check, stored_hash)


# ---------------------------------------------------------------------------
# JWT auth
# ---------------------------------------------------------------------------

def create_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGO)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> sqlite3.Row:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    with get_db() as db:
        user = db.execute("SELECT * FROM users WHERE id = ?", (payload["sub"],)).fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return user


def public_user(user: sqlite3.Row) -> dict:
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "default_depth": user["default_depth"],
        "theme": user["theme"],
    }


# ---------------------------------------------------------------------------
# Request/response models
# ---------------------------------------------------------------------------

class RegisterBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=200)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class ProfileBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class SettingsBody(BaseModel):
    default_depth: str
    theme: str


class ReflectBody(BaseModel):
    prompt: str = Field(min_length=1, max_length=10_000)
    depth: str = "balanced"


class SaveReflectionBody(BaseModel):
    prompt: str
    depth: str
    result: dict
    thought_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@app.post("/auth/register")
def register(body: RegisterBody):
    with get_db() as db:
        existing = db.execute("SELECT id FROM users WHERE email = ?", (body.email,)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="An account with this email already exists.")
        password_hash, salt = hash_password(body.password)
        cur = db.execute(
            "INSERT INTO users (name, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)",
            (body.name, body.email, password_hash, salt, datetime.now(timezone.utc).isoformat()),
        )
        user = db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return {"token": create_token(user["id"]), "user": public_user(user)}


@app.post("/auth/login")
def login(body: LoginBody):
    with get_db() as db:
        user = db.execute("SELECT * FROM users WHERE email = ?", (body.email,)).fetchone()
    if not user or not verify_password(body.password, user["password_hash"], user["salt"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    return {"token": create_token(user["id"]), "user": public_user(user)}


@app.get("/auth/me")
def me(user: sqlite3.Row = Depends(get_current_user)):
    return {"user": public_user(user)}


@app.put("/profile")
def update_profile(body: ProfileBody, user: sqlite3.Row = Depends(get_current_user)):
    with get_db() as db:
        db.execute("UPDATE users SET name = ? WHERE id = ?", (body.name, user["id"]))
        updated = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return {"user": public_user(updated)}


# ---------------------------------------------------------------------------
# Settings routes
# ---------------------------------------------------------------------------

@app.get("/settings")
def get_settings(user: sqlite3.Row = Depends(get_current_user)):
    return {"default_depth": user["default_depth"], "theme": user["theme"]}


@app.put("/settings")
def update_settings(body: SettingsBody, user: sqlite3.Row = Depends(get_current_user)):
    if body.default_depth not in DEPTH_SECTIONS:
        raise HTTPException(status_code=400, detail="Invalid depth value.")
    if body.theme not in ("light", "dark", "system"):
        raise HTTPException(status_code=400, detail="Invalid theme value.")
    with get_db() as db:
        db.execute(
            "UPDATE users SET default_depth = ?, theme = ? WHERE id = ?",
            (body.default_depth, body.theme, user["id"]),
        )
    return {"default_depth": body.default_depth, "theme": body.theme}


# ---------------------------------------------------------------------------
# Reflection generation (streams from OpenRouter as Server-Sent Events)
# ---------------------------------------------------------------------------
def build_system_prompt(depth: str) -> str:
    sections = DEPTH_SECTIONS.get(depth, DEPTH_SECTIONS["balanced"])
    depth_guidance = {
        "gentle": "Keep each point short (1-2 sentences), warm, and easy to sit with.",
        "balanced": "Keep each point clear and specific (2-3 sentences), direct but not harsh.",
        "deep": "Go further into each point (3-4 sentences), naming specifics from what the person wrote.",
    }.get(depth, "Keep each point clear and specific (2-3 sentences).")

    keys = ", ".join(f'"{s}"' for s in sections)
    signal_keys = ", ".join(f'"{s}"' for s in SIGNAL_SECTIONS)
    return (
        "You are NEXUS, a reflection engine. You never give advice, diagnoses, or direct answers. "
        "Your only job is to help someone examine their own thought from multiple angles, in plain, "
        "calm English. Do not moralize and do not use therapy or clinical language. "
        f"{depth_guidance} "
        f"Respond with ONLY a raw JSON object (no markdown, no code fences, no commentary) with exactly "
        f"these keys: {keys}. Each value is a string written as a direct, second-person question or "
        "observation prompting reflection — never a solution or instruction. "
        f"The JSON must ALSO contain a key called \"_signals\", an object containing exactly these keys: "
        f"{signal_keys}. Each signal value must be true or false. A signal should be true ONLY when the "
        "user's original writing provides enough evidence that this pattern is genuinely present or "
        "meaningfully suggested — do not mark a signal true merely because the corresponding reflection "
        "section exists, and do not force signals to true. "
        "\"Possible Bias\" is true when the wording suggests a specific framing, preference, cognitive "
        "tendency, or one-sided interpretation. \"Potential Contradiction\" is true when the writing "
        "contains tension or inconsistency between ideas, goals, expectations, or statements. "
        "\"Hidden Assumption\" is true when the reasoning appears to depend on an unstated premise that "
        "may reasonably be questioned. \"Alternative Perspective\" is true when the situation can "
        "reasonably be understood from another perspective that differs meaningfully from the current "
        "framing. \"Blind Spot\" is true when the current framing appears to leave out an important "
        "relevant consideration. \"Reframe\" is true when the situation can meaningfully be expressed "
        "through a different framing without changing the underlying facts."
    )
  


@app.post("/reflect")
def reflect(body: ReflectBody, user: sqlite3.Row = Depends(get_current_user)):
    depth = body.depth if body.depth in DEPTH_SECTIONS else "balanced"

    def event_stream():
        if not OPENROUTER_API_KEY:
            yield "data: [ERROR] Server is missing an OPENROUTER_API_KEY. Add one to backend/.env.\n\n"
            return
        try:
            resp = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": OPENROUTER_MODEL,
                    "stream": True,
                    "messages": [
                        {"role": "system", "content": build_system_prompt(depth)},
                        {"role": "user", "content": body.prompt},
                    ],
                },
                stream=True,
                timeout=60,
            )
            if resp.status_code != 200:
                detail = resp.text[:300]
                yield f"data: [ERROR] AI service error ({resp.status_code}): {detail}\n\n"
                return

            for line in resp.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data: "):
                    continue
                chunk = line[len("data: "):]
                if chunk.strip() == "[DONE]":
                    break
                try:
                    piece = json.loads(chunk)
                    delta = piece["choices"][0]["delta"].get("content", "")
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
                if delta:
                    yield f"data: {delta.replace(chr(10), chr(92)+'n')}\n\n"
            yield "data: [DONE]\n\n"
        except requests.RequestException as exc:
            yield f"data: [ERROR] Could not reach the AI service: {exc}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Reflection history
# ---------------------------------------------------------------------------

@app.post("/reflections")
def save_reflection(body: SaveReflectionBody, user: sqlite3.Row = Depends(get_current_user)):
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO reflections (user_id, prompt, depth, result, thought_at, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                user["id"], body.prompt, body.depth, json.dumps(body.result),
                body.thought_at, datetime.now(timezone.utc).isoformat(),
            ),
        )
        row = db.execute("SELECT * FROM reflections WHERE id = ?", (cur.lastrowid,)).fetchone()
    return _serialize_reflection(row, include_result=True)


@app.get("/reflections")
def list_reflections(user: sqlite3.Row = Depends(get_current_user)):
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM reflections WHERE user_id = ? ORDER BY created_at DESC", (user["id"],)
        ).fetchall()
    return [_serialize_reflection(r, include_result=False) for r in rows]


@app.get("/reflections/{reflection_id}")
def get_reflection(reflection_id: int, user: sqlite3.Row = Depends(get_current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT * FROM reflections WHERE id = ? AND user_id = ?", (reflection_id, user["id"])
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Reflection not found.")
    return _serialize_reflection(row, include_result=True)


@app.delete("/reflections/{reflection_id}")
def delete_reflection(reflection_id: int, user: sqlite3.Row = Depends(get_current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT id FROM reflections WHERE id = ? AND user_id = ?", (reflection_id, user["id"])
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Reflection not found.")
        db.execute("DELETE FROM reflections WHERE id = ?", (reflection_id,))
    return {"deleted": True}


def _serialize_reflection(row: sqlite3.Row, include_result: bool) -> dict:
    data = {
        "id": row["id"],
        "prompt": row["prompt"],
        "depth": row["depth"],
        "thought_at": row["thought_at"],
        "created_at": row["created_at"],
    }
    if include_result:
        data["result"] = json.loads(row["result"])
    return data


# ---------------------------------------------------------------------------
# Insights
# ---------------------------------------------------------------------------

@app.get("/insights")
def insights(user: sqlite3.Row = Depends(get_current_user)):
    with get_db() as db:
        rows = db.execute(
            """
            SELECT depth, result, thought_at, created_at
            FROM reflections
            WHERE user_id = ?
            ORDER BY created_at ASC
            """,
            (user["id"],)
        ).fetchall()

    # ---------------------------------------------------------
    # Basic counts
    # ---------------------------------------------------------

    depth_counts = {
        "gentle": 0,
        "balanced": 0,
        "deep": 0,
    }

    # Only count actual detected thinking signals.
    signal_counts = {
        section: 0
        for section in SIGNAL_SECTIONS
    }

    # Daily reflection activity.
    activity = {}

    for row in rows:
        depth = row["depth"]

        depth_counts[depth] = depth_counts.get(depth, 0) + 1

        # -----------------------------------------------------
        # Safely decode stored result
        # -----------------------------------------------------

        try:
            result = json.loads(row["result"])
        except (json.JSONDecodeError, TypeError):
            result = {}

        # -----------------------------------------------------
        # Count actual AI-detected signals
        # -----------------------------------------------------

        signals = result.get("_signals", {})

        if isinstance(signals, dict):
            for section in SIGNAL_SECTIONS:
                if signals.get(section) is True:
                    signal_counts[section] += 1

        # -----------------------------------------------------
        # Activity date
        #
        # Prefer the date the user assigned to the reflection.
        # Fall back to created_at if thought_at is missing.
        # -----------------------------------------------------

        thought_at = row["thought_at"]
        created_at = row["created_at"]

        date_source = thought_at or created_at

        if date_source:
            day = date_source[:10]
            activity[day] = activity.get(day, 0) + 1

    # ---------------------------------------------------------
    # Most frequently detected thinking patterns
    # ---------------------------------------------------------

    most_explored = sorted(
        signal_counts.items(),
        key=lambda kv: kv[1],
        reverse=True
    )

    return {
        "total_reflections": len(rows),

        "depth_counts": depth_counts,

        # Keep the existing API field name so the frontend
        # does not need a large rewrite.
        "dimension_counts": signal_counts,

        "most_explored": most_explored,

        # Daily reflection activity, as an ordered array of
        # {date, count} objects (matches what the frontend expects).
        "timeline": [
            {"date": day, "count": count}
            for day, count in sorted(activity.items())
        ],
    }
@app.get("/")
def root():
    return {"status": "NEXUS API running", "time": time.time()}