import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any, TYPE_CHECKING

from app.core.config import get_settings

if TYPE_CHECKING:
    from fastapi import Response


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, expected = stored_hash.split("$", 1)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
    return hmac.compare_digest(digest, expected)


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    settings = get_settings()
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(time.time()),
        "exp": int(time.time()) + settings.access_token_expire_minutes * 60,
    }
    if extra:
        payload.update(extra)
    body = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(settings.secret_key.encode(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{_b64encode(signature)}"


def decode_access_token(token: str) -> dict[str, Any] | None:
    settings = get_settings()
    try:
        body, signature = token.split(".", 1)
    except ValueError:
        return None
    expected = hmac.new(settings.secret_key.encode(), body.encode(), hashlib.sha256).digest()
    try:
        provided = _b64decode(signature)
    except Exception:
        return None
    if not hmac.compare_digest(provided, expected):
        return None
    try:
        payload = json.loads(_b64decode(body))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    return payload


# ── Cookie de session HttpOnly ────────────────────────────────────────────────
# Le token de session est posé dans un cookie HttpOnly (inaccessible au JS),
# ce qui supprime le vecteur de vol de session par XSS via localStorage.

def set_auth_cookie(response: "Response", token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=settings.effective_cookie_secure,
        samesite=settings.auth_cookie_samesite,  # type: ignore[arg-type]
        domain=settings.effective_cookie_domain or None,
        path="/",
    )


def clear_auth_cookie(response: "Response") -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.auth_cookie_name,
        domain=settings.effective_cookie_domain or None,
        path="/",
    )
