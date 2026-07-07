"""
Phase 1 access-gate authentication.

POST /api/auth/verify-code — checks a submitted 8-digit code against the
SHA-256 hash allowlist in auth_codes.py and, if valid, issues a signed
httpOnly session cookie. No database, no per-user accounts — this is a
shared-secret gate, not real auth.
"""
import hashlib
import logging
import os
import time

from fastapi import APIRouter, Request, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pydantic import BaseModel

from .auth_codes import ACCESS_CODE_HASHES

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_COOKIE_NAME = "simforge_session"
SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60  # 30 days

_SECRET_KEY = os.environ.get("SIMFORGE_SESSION_SECRET")
if not _SECRET_KEY:
    logger.warning(
        "SIMFORGE_SESSION_SECRET not set in environment — using an "
        "ephemeral random key. Sessions will not survive a server restart. "
        "Set SIMFORGE_SESSION_SECRET for production."
    )
    _SECRET_KEY = os.urandom(32).hex()

_serializer = URLSafeTimedSerializer(_SECRET_KEY, salt="simforge-access-gate")

# In-memory rate limiter: IP -> list of attempt timestamps. Resets on
# server restart; fine for a single-process shared-secret gate.
_RATE_LIMIT_WINDOW_SECONDS = 60
_RATE_LIMIT_MAX_ATTEMPTS = 10
_attempts: dict[str, list[float]] = {}


class VerifyCodeRequest(BaseModel):
    code: str


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _is_rate_limited(ip: str) -> bool:
    now = time.time()
    window_start = now - _RATE_LIMIT_WINDOW_SECONDS
    attempts = [t for t in _attempts.get(ip, []) if t >= window_start]
    _attempts[ip] = attempts
    return len(attempts) >= _RATE_LIMIT_MAX_ATTEMPTS


def _record_attempt(ip: str) -> None:
    _attempts.setdefault(ip, []).append(time.time())


def is_valid_session(request: Request) -> bool:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return False
    try:
        _serializer.loads(token, max_age=SESSION_MAX_AGE_SECONDS)
        return True
    except (BadSignature, SignatureExpired):
        return False


@router.post("/verify-code")
async def verify_code(payload: VerifyCodeRequest, request: Request, response: Response):
    ip = _client_ip(request)

    if _is_rate_limited(ip):
        return {"success": False, "error": "Too many attempts. Please wait a minute and try again."}

    _record_attempt(ip)

    code = (payload.code or "").strip()
    if not code:
        return {"success": False, "error": "Please enter an access code."}

    code_hash = hashlib.sha256(code.encode()).hexdigest()

    if code_hash not in ACCESS_CODE_HASHES:
        return {"success": False, "error": "Invalid access code."}

    token = _serializer.dumps({"granted_at": time.time()})
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=os.environ.get("SIMFORGE_ENV") == "production",
        path="/",
    )
    return {"success": True}


@router.get("/session")
async def check_session(request: Request):
    return {"authenticated": is_valid_session(request)}
