"""
routes_audit.py — Journal d'audit unifié.

Avant ce correctif, il existait deux tables d'audit déconnectées :
  - audit_logs       : actions frontend / explicites (create invoice, delete task…)
  - access_audit_logs: actions RH / accès / tâches (task_updated, task_deleted,
                       employee_account_created, leadership_changed…)

Désormais, GET /audit-logs agrège les deux tables en une vue normalisée et paginée
triée par date décroissante. POST /audit-logs écrit dans audit_logs comme avant.
La fonction write_audit() permet d'écrire une entrée unifiée depuis n'importe
quel module du backend.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, union_all, literal
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import AccessAuditLog, AuditLog, User

router = APIRouter(tags=["audit"])


# ── Schéma normalisé de sortie ────────────────────────────────────────────────
class AuditLogCreate(BaseModel):
    action: str
    resource_type: str
    resource_id: Optional[int] = None
    details: str = ""
    ip_address: Optional[str] = None


class AuditEntry(BaseModel):
    """Vue normalisée commune aux deux tables d'audit."""
    id: str           # préfixé "al:" ou "aal:" pour distinguer la source
    source: str       # "audit_logs" | "access_audit_logs"
    user_id: Optional[int]
    user_name: str
    action: str
    resource_type: str
    resource_id: Optional[int]
    details: str
    company_id: int
    created_at: datetime


# ── Helper : resource_type à partir d'une action AccessAuditLog ──────────────
def _resource_type_from_action(action: str) -> str:
    """Déduit un resource_type normalisé à partir du nom d'action AccessAuditLog."""
    a = action.lower()
    if "task" in a:
        return "task"
    if "employee" in a or "account" in a or "password" in a or "rh" in a:
        return "employee"
    if "leadership" in a or "role" in a or "bureau" in a:
        return "group_leadership"
    if "payment" in a or "contribution" in a:
        return "group_payment"
    if "expense" in a:
        return "group_expense"
    if "group" in a:
        return "group"
    return "access"


def _user_name_for(db: Session, user_id: Optional[int]) -> str:
    if not user_id:
        return "Système"
    u = db.get(User, user_id)
    return u.full_name if u else f"User #{user_id}"


# ── GET /audit-logs — agrège les deux tables ─────────────────────────────────
_AUDIT_ALLOWED_ROLES = {"admin_entreprise", "manager_entreprise", "comptable", "super_admin"}


@router.get("/audit-logs")
def list_audit_logs(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    action: Optional[str] = Query(default=None),
    resource_type: Optional[str] = Query(default=None),
    source: Optional[str] = Query(default=None),  # "audit_logs"|"access_audit_logs"|None
    company_id: Optional[int] = Query(default=None),  # super_admin uniquement : filtrer une entreprise précise
    all_companies: bool = Query(default=False),  # super_admin uniquement : vue plateforme entière
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.role not in _AUDIT_ALLOWED_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : les journaux d'audit sont réservés aux administrateurs et comptables.",
        )
    is_super_admin = current_user.role == "super_admin"
    entries: list[AuditEntry] = []

    # ── Table 1 : audit_logs ─────────────────────────────────────────────────
    if not source or source == "audit_logs":
        stmt = select(AuditLog)
        if is_super_admin and company_id:
            stmt = stmt.where(AuditLog.company_id == company_id)
        elif not (is_super_admin and all_companies):
            stmt = stmt.where(AuditLog.company_id == current_user.company_id)
        if action:
            stmt = stmt.where(AuditLog.action.ilike(f"%{action}%"))
        if resource_type:
            stmt = stmt.where(AuditLog.resource_type == resource_type)
        for item in db.scalars(stmt).all():
            entries.append(AuditEntry(
                id=f"al:{item.id}", source="audit_logs",
                user_id=item.user_id, user_name=item.user_name or _user_name_for(db, item.user_id),
                action=item.action, resource_type=item.resource_type or "",
                resource_id=item.resource_id, details=item.details,
                company_id=item.company_id, created_at=item.created_at,
            ))

    # ── Table 2 : access_audit_logs ──────────────────────────────────────────
    if not source or source == "access_audit_logs":
        stmt2 = select(AccessAuditLog)
        if is_super_admin and company_id:
            stmt2 = stmt2.where(AccessAuditLog.company_id == company_id)
        elif not (is_super_admin and all_companies):
            stmt2 = stmt2.where(AccessAuditLog.company_id == current_user.company_id)
        if action:
            stmt2 = stmt2.where(AccessAuditLog.action.ilike(f"%{action}%"))
        for item in db.scalars(stmt2).all():
            rt = _resource_type_from_action(item.action)
            if resource_type and rt != resource_type:
                continue
            entries.append(AuditEntry(
                id=f"aal:{item.id}", source="access_audit_logs",
                user_id=item.actor_user_id,
                user_name=_user_name_for(db, item.actor_user_id),
                action=item.action, resource_type=rt,
                resource_id=item.employee_id or item.target_user_id,
                details=item.details, company_id=item.company_id,
                created_at=item.created_at,
            ))

    # ── Tri + pagination ──────────────────────────────────────────────────────
    entries.sort(key=lambda e: e.created_at, reverse=True)
    total = len(entries)
    offset = (page - 1) * per_page
    page_items = entries[offset: offset + per_page]
    return {
        "items": [e.model_dump() for e in page_items],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": math.ceil(total / per_page) if total else 0,
    }


# ── GET /me/activity — chaque utilisateur peut consulter SA propre activité ──
# Conformité RGPD : droit d'accès aux données personnelles + détection d'abus.
@router.get("/me/activity")
def my_activity(
    limit: int = Query(default=30, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Renvoie les 30 dernières actions de l'utilisateur courant : connexions,
    changements de mot de passe, accès à des documents sensibles, etc."""
    entries: list[dict] = []

    # Logs où l'utilisateur est ACTEUR
    rows = db.scalars(
        select(AccessAuditLog).where(AccessAuditLog.actor_user_id == current_user.id)
    ).all()
    for r in rows:
        entries.append({
            "id": f"act:{r.id}",
            "action": r.action,
            "details": r.details or "",
            "target_user_id": r.target_user_id,
            "employee_id": r.employee_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    # Logs où l'utilisateur est CIBLE (mot de passe reset par admin, etc.)
    target_rows = db.scalars(
        select(AccessAuditLog).where(
            AccessAuditLog.target_user_id == current_user.id,
            AccessAuditLog.actor_user_id != current_user.id,
        )
    ).all()
    for r in target_rows:
        entries.append({
            "id": f"tgt:{r.id}",
            "action": f"sur moi: {r.action}",
            "details": r.details or "",
            "actor_user_id": r.actor_user_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    entries.sort(key=lambda e: e["created_at"] or "", reverse=True)
    return {"items": entries[:limit], "count": len(entries[:limit])}


# ── POST /audit-logs ─────────────────────────────────────────────────────────
@router.post("/audit-logs", status_code=201)
def create_audit_log(
    payload: AuditLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    entry = AuditLog(
        user_id=current_user.id,
        user_name=current_user.full_name,
        action=payload.action,
        resource_type=payload.resource_type,
        resource_id=payload.resource_id,
        details=payload.details,
        ip_address=payload.ip_address,
        company_id=current_user.company_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {
        "id": f"al:{entry.id}", "source": "audit_logs",
        "action": entry.action, "resource_type": entry.resource_type,
        "details": entry.details, "created_at": entry.created_at,
    }


# ── Fonction utilitaire : écrire dans audit_logs depuis n'importe quel module ─
def write_audit(
    db: Session, *, company_id: int, user_id: Optional[int], user_name: str,
    action: str, resource_type: str = "", resource_id: Optional[int] = None,
    details: str = "",
) -> AuditLog:
    """Raccourci pour écrire dans audit_logs (maintenant la source canonique)."""
    entry = AuditLog(
        user_id=user_id, user_name=user_name, action=action,
        resource_type=resource_type, resource_id=resource_id,
        details=details, company_id=company_id,
    )
    db.add(entry)
    return entry
