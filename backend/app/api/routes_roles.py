"""Rôles personnalisés + photos de profil utilisateur.

- /roles               : CRUD de rôles custom (scope company/admin/group) avec
                         permissions par module + assignation aux utilisateurs.
- /roles/permissions   : catalogue des permissions assignables.
- /users/me/avatar     : upload / lecture de la photo de profil.
- /users/{id}/avatar   : lecture par un admin.
"""
from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models import CustomRole, User

router = APIRouter(tags=["roles"])

# ── Catalogue des permissions (clé module → libellé + scope applicable) ───────
PERMISSION_CATALOG: list[dict] = [
    {"key": "dashboard", "label": "Tableau de bord", "scopes": ["company"]},
    {"key": "pos", "label": "Caisse (POS)", "scopes": ["company"]},
    {"key": "clients", "label": "Clients", "scopes": ["company"]},
    {"key": "billing", "label": "Facturation", "scopes": ["company"]},
    {"key": "inventory", "label": "Inventaire", "scopes": ["company"]},
    {"key": "transactions", "label": "Transactions", "scopes": ["company"]},
    {"key": "budget", "label": "Budget", "scopes": ["company"]},
    {"key": "investments", "label": "Investissements", "scopes": ["company"]},
    {"key": "accounting", "label": "Comptabilité", "scopes": ["company"]},
    {"key": "reports", "label": "Rapports", "scopes": ["company"]},
    {"key": "analytics", "label": "Analytique", "scopes": ["company"]},
    {"key": "teras", "label": "Intelligence Teras", "scopes": ["company"]},
    {"key": "declarations", "label": "Déclarations", "scopes": ["company"]},
    {"key": "legislation", "label": "Législation", "scopes": ["company"]},
    {"key": "fiscal", "label": "Agenda fiscal", "scopes": ["company"]},
    {"key": "hr", "label": "Employés (RH)", "scopes": ["company"]},
    {"key": "payroll", "label": "Paie", "scopes": ["company"]},
    {"key": "documents", "label": "Documents", "scopes": ["company"]},
    {"key": "tasks", "label": "Tâches", "scopes": ["company"]},
    {"key": "projects", "label": "Projets", "scopes": ["company"]},
    {"key": "company", "label": "Profil entreprise", "scopes": ["company"]},
    {"key": "audit", "label": "Audit entreprise", "scopes": ["company"]},
    # Admin (staff plateforme)
    {"key": "admin_overview", "label": "Vue d'ensemble", "scopes": ["admin"]},
    {"key": "admin_companies", "label": "Gestion entreprises", "scopes": ["admin"]},
    {"key": "admin_users", "label": "Gestion utilisateurs", "scopes": ["admin"]},
    {"key": "admin_tickets", "label": "Tickets support", "scopes": ["admin"]},
    {"key": "admin_subscriptions", "label": "Abonnements", "scopes": ["admin"]},
    {"key": "admin_broadcast", "label": "Diffusion", "scopes": ["admin"]},
    {"key": "admin_analytics", "label": "Analytique plateforme", "scopes": ["admin"]},
    {"key": "admin_audit", "label": "Journal d'audit", "scopes": ["admin"]},
    {"key": "admin_system", "label": "Système", "scopes": ["admin"]},
    # Groupes & tontines
    {"key": "group_members", "label": "Membres", "scopes": ["group"]},
    {"key": "group_contributions", "label": "Cotisations", "scopes": ["group"]},
    {"key": "group_expenses", "label": "Dépenses", "scopes": ["group"]},
    {"key": "group_votes", "label": "Votes", "scopes": ["group"]},
    {"key": "group_documents", "label": "Documents", "scopes": ["group"]},
    {"key": "group_settings", "label": "Réglages du groupe", "scopes": ["group"]},
]


class RolePayload(BaseModel):
    name: str
    description: str = ""
    scope: str = "company"          # company | admin | group
    permissions: list[str] = []
    color: str = "#6366f1"
    group_id: int | None = None


class RoleRead(BaseModel):
    id: int
    name: str
    description: str
    scope: str
    permissions: list[str]
    color: str
    company_id: int | None
    group_id: int | None
    member_count: int = 0


def _serialize(db: Session, r: CustomRole) -> RoleRead:
    count = len(db.scalars(select(User.id).where(User.custom_role_id == r.id)).all())
    perms: list[str] = []
    try:
        perms = json.loads(r.permissions or "[]")
    except Exception:
        perms = []
    return RoleRead(id=r.id, name=r.name, description=r.description, scope=r.scope,
                    permissions=perms, color=r.color, company_id=r.company_id,
                    group_id=r.group_id, member_count=count)


def _can_manage_roles(user: User, scope: str) -> bool:
    if scope == "admin":
        return user.role == "super_admin"
    # company / group : admin entreprise ou super_admin
    return user.role in {"super_admin", "admin_entreprise", "manager_entreprise"}


@router.get("/roles/permissions")
def list_permissions(scope: str | None = None) -> list[dict]:
    if scope:
        return [p for p in PERMISSION_CATALOG if scope in p["scopes"]]
    return PERMISSION_CATALOG


@router.get("/roles", response_model=list[RoleRead])
def list_roles(scope: str = "company", group_id: int | None = None,
               db: Session = Depends(get_db),
               current_user: User = Depends(get_current_user)) -> list[RoleRead]:
    q = select(CustomRole).where(CustomRole.scope == scope)
    if scope == "admin":
        # rôles plateforme (company_id null)
        q = q.where(CustomRole.company_id.is_(None))
    else:
        q = q.where(CustomRole.company_id == current_user.company_id)
    if scope == "group" and group_id is not None:
        q = q.where(CustomRole.group_id == group_id)
    rows = db.scalars(q.order_by(CustomRole.created_at.desc())).all()
    return [_serialize(db, r) for r in rows]


@router.post("/roles", response_model=RoleRead, status_code=201)
def create_role(payload: RolePayload, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)) -> RoleRead:
    if not _can_manage_roles(current_user, payload.scope):
        raise HTTPException(status_code=403, detail="Accès refusé pour gérer ce type de rôle")
    role = CustomRole(
        name=payload.name.strip(),
        description=payload.description.strip(),
        scope=payload.scope,
        permissions=json.dumps(payload.permissions),
        color=payload.color,
        company_id=None if payload.scope == "admin" else current_user.company_id,
        group_id=payload.group_id,
        created_by_user_id=current_user.id,
    )
    db.add(role); db.commit(); db.refresh(role)
    return _serialize(db, role)


@router.patch("/roles/{role_id}", response_model=RoleRead)
def update_role(role_id: int, payload: RolePayload, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)) -> RoleRead:
    role = db.get(CustomRole, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Rôle introuvable")
    if not _can_manage_roles(current_user, role.scope):
        raise HTTPException(status_code=403, detail="Accès refusé")
    role.name = payload.name.strip()
    role.description = payload.description.strip()
    role.permissions = json.dumps(payload.permissions)
    role.color = payload.color
    db.commit(); db.refresh(role)
    return _serialize(db, role)


@router.delete("/roles/{role_id}", status_code=200)
def delete_role(role_id: int, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)) -> dict:
    role = db.get(CustomRole, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Rôle introuvable")
    if not _can_manage_roles(current_user, role.scope):
        raise HTTPException(status_code=403, detail="Accès refusé")
    # détacher les utilisateurs
    for u in db.scalars(select(User).where(User.custom_role_id == role_id)).all():
        u.custom_role_id = None
    db.delete(role); db.commit()
    return {"deleted": True}


class AssignRolePayload(BaseModel):
    custom_role_id: int | None = None


@router.get("/company/users")
def list_company_users(db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)) -> list[dict]:
    """Liste les utilisateurs de l'entreprise courante avec leur rôle d'accès,
    pour permettre à un admin/manager d'assigner des rôles personnalisés."""
    if current_user.role not in {"super_admin", "admin_entreprise", "manager_entreprise"}:
        raise HTTPException(status_code=403, detail="Accès refusé")
    users = db.scalars(
        select(User)
        .where(User.company_id == current_user.company_id)
        .order_by(User.full_name)
    ).all()
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "custom_role_id": u.custom_role_id,
            "custom_role_name": u.custom_role.name if u.custom_role else None,
            "has_avatar": bool(u.avatar_path),
        }
        for u in users
    ]


@router.patch("/users/{user_id}/custom-role", status_code=200)
def assign_role(user_id: int, payload: AssignRolePayload, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)) -> dict:
    if current_user.role not in {"super_admin", "admin_entreprise", "manager_entreprise"}:
        raise HTTPException(status_code=403, detail="Accès refusé")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if current_user.role != "super_admin" and user.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Utilisateur hors de votre entreprise")
    if payload.custom_role_id is not None:
        role = db.get(CustomRole, payload.custom_role_id)
        if not role:
            raise HTTPException(status_code=404, detail="Rôle introuvable")
    user.custom_role_id = payload.custom_role_id
    db.commit()
    return {"user_id": user_id, "custom_role_id": payload.custom_role_id}


# ── Création de staff plateforme (par le super-admin) ────────────────────────

class StaffCreatePayload(BaseModel):
    full_name: str
    email: str
    phone: str = ""
    address: str = ""
    department: str = "Plateforme"
    custom_role_id: int


class StaffCreatedResult(BaseModel):
    user_id: int
    login_identifier: str
    temporary_password: str
    role_name: str


@router.post("/admin/staff", response_model=StaffCreatedResult, status_code=201)
def create_staff(payload: StaffCreatePayload, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)) -> StaffCreatedResult:
    """Crée un membre du staff plateforme avec un rôle admin personnalisé et
    génère une clé d'accès (mot de passe temporaire) pour qu'il se connecte à
    l'interface admin avec les accès délimités."""
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Réservé au super-administrateur")
    role = db.get(CustomRole, payload.custom_role_id)
    if not role or role.scope != "admin":
        raise HTTPException(status_code=400, detail="Rôle admin invalide")
    email = payload.email.strip().lower()
    if email and db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Un compte existe déjà avec cet email")

    from app.core.security import hash_password
    from app.services.access import generate_temporary_password
    temp = generate_temporary_password()
    user = User(
        email=email or f"staff{uuid4().hex[:6]}@kompta.local",
        phone=payload.phone.strip(),
        full_name=payload.full_name.strip(),
        role="staff",
        department=payload.department,
        branch="Plateforme",
        address=payload.address.strip(),
        password_hash=hash_password(temp),
        must_change_password=True,
        account_status="pending_first_login",
        is_active=True,
        company_id=current_user.company_id,
        custom_role_id=role.id,
    )
    db.add(user); db.commit(); db.refresh(user)
    return StaffCreatedResult(user_id=user.id, login_identifier=user.email,
                              temporary_password=temp, role_name=role.name)


# ── Photos de profil ─────────────────────────────────────────────────────────

def _avatar_dir() -> Path:
    d = Path(get_settings().document_storage_dir).parent / "avatars"
    d.mkdir(parents=True, exist_ok=True)
    return d


class MyProfileUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    address: str | None = None


@router.patch("/users/me/profile")
def update_my_profile(payload: MyProfileUpdate, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)) -> dict:
    """Self-service: any authenticated user updates their own contact details."""
    user = db.get(User, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if payload.full_name is not None:
        name = payload.full_name.strip()
        if name:
            user.full_name = name
    if payload.phone is not None:
        user.phone = payload.phone.strip()
    if payload.address is not None:
        user.address = payload.address.strip()
    db.commit()
    return {
        "id": user.id,
        "full_name": user.full_name,
        "phone": user.phone or "",
        "address": getattr(user, "address", "") or "",
    }


@router.post("/users/me/avatar")
async def upload_my_avatar(file: UploadFile = File(...), db: Session = Depends(get_db),
                           current_user: User = Depends(get_current_user)) -> dict:
    allowed = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
    if (file.content_type or "") not in allowed:
        raise HTTPException(status_code=400, detail="Format non supporté (PNG, JPEG, WebP).")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Photo trop volumineuse (max 5 Mo).")
    user = db.get(User, current_user.id)
    ext = {"image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/webp": ".webp"}.get(file.content_type or "", ".png")
    if user.avatar_path:
        Path(user.avatar_path).unlink(missing_ok=True)
    dest = _avatar_dir() / f"user-{user.id}-{uuid4().hex[:12]}{ext}"
    dest.write_bytes(content)
    user.avatar_path = str(dest)
    db.commit()
    return {"has_avatar": True}


@router.get("/users/me/avatar")
def get_my_avatar(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> FileResponse:
    user = db.get(User, current_user.id)
    if not user or not user.avatar_path or not Path(user.avatar_path).exists():
        raise HTTPException(status_code=404, detail="Aucune photo")
    return FileResponse(user.avatar_path)


@router.get("/users/{user_id}/avatar")
def get_user_avatar(user_id: int, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)) -> FileResponse:
    user = db.get(User, user_id)
    if user and current_user.role != "super_admin" and user.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Utilisateur hors de votre entreprise")
    if not user or not user.avatar_path or not Path(user.avatar_path).exists():
        raise HTTPException(status_code=404, detail="Aucune photo")
    return FileResponse(user.avatar_path)
