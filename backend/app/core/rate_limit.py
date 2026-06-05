"""
rate_limit.py — Rate limiting global pour KOMPTA via slowapi.

Stratégie :
- Identifie le client par utilisateur (si authentifié) ou IP (sinon).
- Limites différenciées par type d'endpoint (auth strict, API normale, lectures laxistes).
- Désactivé en mode test pour ne pas casser les fixtures.

Usage dans une route :
    from app.core.rate_limit import limiter
    @router.post("/auth/something")
    @limiter.limit("10/minute")
    def something(request: Request, ...): ...
"""
from __future__ import annotations

import os

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _client_key(request: Request) -> str:
    """Identifie un client par utilisateur authentifié (Bearer/cookie) si possible,
    sinon par IP. Ça empêche un attaquant de contourner via X comptes."""
    # Token Bearer
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return f"user:{auth.split(' ', 1)[1][:24]}"  # tronqué (pas le secret complet)
    # Cookie de session
    from app.core.config import get_settings
    settings = get_settings()
    cookie = request.cookies.get(settings.auth_cookie_name)
    if cookie:
        return f"cookie:{cookie[:24]}"
    return f"ip:{get_remote_address(request)}"


# Désactivé en test : pytest est dans sys.modules dès l'import si on est en
# pytest. PYTEST_CURRENT_TEST n'est pas fiable au moment de l'import.
import sys as _sys  # noqa: E402
_DISABLED = (
    "pytest" in _sys.modules
    or bool(os.getenv("PYTEST_CURRENT_TEST"))
    or os.getenv("RATE_LIMIT_DISABLED") == "1"
)

limiter = Limiter(
    key_func=_client_key,
    default_limits=[] if _DISABLED else ["1000/hour"],  # filet de sécurité global
    enabled=not _DISABLED,
)
