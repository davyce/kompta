from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User
from app.models.domain import Client


def _extract_token(authorization: str | None, cookie_token: str | None) -> str | None:
    """Token de session : header Bearer explicite prioritaire, cookie en fallback.

    Un header Authorization est une intention délibérée par requête (client API,
    impersonation admin) et doit primer. Le cookie HttpOnly est le mécanisme
    ambiant du navigateur : il immunise contre le vol de session par XSS depuis
    localStorage et prend le relais quand aucun header n'est fourni."""
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1]
    if cookie_token:
        return cookie_token
    return None


def get_current_user(
    authorization: str | None = Header(default=None),
    session_cookie: str | None = Cookie(default=None, alias=get_settings().auth_cookie_name),
    db: Session = Depends(get_db),
) -> User:
    token = _extract_token(authorization, session_cookie)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    # Un token du portail client (scope=client_portal) ne doit jamais être accepté
    # sur les routes de l'app principale : les deux espaces d'auth sont cloisonnés.
    if payload.get("scope") == "client_portal":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token portail invalide ici")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")
    # Révocation : un token dont la version ne correspond plus est rejeté
    # (logout, suspension ou changement de mot de passe a incrémenté token_version).
    if int(payload.get("ver", 0)) != int(getattr(user, "token_version", 0) or 0):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token révoqué")
    return user


def require_roles(*roles: str):
    def checker(current_user: User = Depends(get_current_user)) -> User:
        if roles and current_user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
        return current_user

    return checker


# ── Garde entreprise : bloque les membres de groupe ──────────────────────────
# Les utilisateurs avec le rôle 'membre_groupe' n'ont accès qu'aux routes
# /groups/* et /auth/*. Toutes les routes entreprise (produits, factures,
# employés, comptabilité…) doivent utiliser `get_company_user` au lieu de
# `get_current_user` pour appliquer ce cloisonnement automatiquement.

COMPANY_ONLY_ROLES_EXCLUDED = {"membre_groupe"}


def get_company_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Comme get_current_user mais refuse les rôles sans accès entreprise."""
    if current_user.role in COMPANY_ONLY_ROLES_EXCLUDED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux membres de l'entreprise",
        )
    return current_user


def company_scope(db: Session, current_user: User, model, order_by=None):
    statement = select(model).where(model.company_id == current_user.company_id)
    if order_by is not None:
        statement = statement.order_by(order_by)
    return db.scalars(statement).all()


# ── Portail client : auth séparée pour les Client (pas les User de l'app) ────
# Le token porte un claim "scope": "client_portal" et un "sub" = id du Client.
# Cloisonnement strict : un token app normal (sans ce scope) est rejeté ici,
# et get_current_user rejette symétriquement les tokens scope=client_portal.

def get_current_client(
    authorization: str | None = Header(default=None),
    portal_cookie: str | None = Cookie(default=None, alias="kompta_portal_session"),
    db: Session = Depends(get_db),
) -> Client:
    token = _extract_token(authorization, portal_cookie)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    payload = decode_access_token(token)
    if not payload or payload.get("scope") != "client_portal":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired portal token")
    client = db.get(Client, int(payload["sub"]))
    if not client or not client.portal_enabled or not client.portal_password_hash:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Accès portail désactivé")
    if int(payload.get("company_id", -1)) != int(client.company_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")
    return client
