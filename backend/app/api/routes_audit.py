"""
routes_audit.py — Journal d'audit des actions utilisateur.

Endpoints :
  GET  /audit-logs  — liste paginée avec filtres optionnels
  POST /audit-logs  — créer une entrée d'audit
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import AuditLog, User

router = APIRouter(tags=["audit"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class AuditLogCreate(BaseModel):
    action: str  # create|update|delete|login|export
    resource_type: str
    resource_id: Optional[int] = None
    details: str = ""
    ip_address: Optional[str] = None


class AuditLogRead(BaseModel):
    id: int
    user_id: Optional[int]
    user_name: str
    action: str
    resource_type: str
    resource_id: Optional[int]
    details: str
    ip_address: Optional[str]
    company_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/audit-logs")
def list_audit_logs(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    action: Optional[str] = Query(default=None),
    resource_type: Optional[str] = Query(default=None),
    user_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    stmt = select(AuditLog).where(AuditLog.company_id == current_user.company_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    stmt = stmt.order_by(AuditLog.created_at.desc())
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.offset((page - 1) * per_page).limit(per_page)).all()
    return {
        "items": [AuditLogRead.model_validate(item) for item in items],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": math.ceil(total / per_page),
    }


@router.post("/audit-logs", response_model=AuditLogRead, status_code=201)
def create_audit_log(
    payload: AuditLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AuditLog:
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
    return entry
