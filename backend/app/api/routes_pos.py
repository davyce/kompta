"""
routes_pos.py — Sessions de caisse POS.

Endpoints :
  GET    /pos/sessions          — liste des sessions
  POST   /pos/sessions          — ouvrir une session
  PATCH  /pos/sessions/{id}/close — fermer une session
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import PosSession, Sale, User

router = APIRouter(tags=["pos"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class PosSessionCreate(BaseModel):
    notes: str = ""


class PosSessionRead(BaseModel):
    id: int
    opened_at: datetime
    closed_at: Optional[datetime]
    opened_by: str
    opened_by_user_id: Optional[int]
    sales_count: int
    total_amount: float
    status: str
    notes: str
    company_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/pos/sessions", response_model=list[PosSessionRead])
def list_pos_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[PosSession]:
    stmt = (
        select(PosSession)
        .where(PosSession.company_id == current_user.company_id)
        .order_by(PosSession.opened_at.desc())
    )
    return db.scalars(stmt).all()


@router.post("/pos/sessions", response_model=PosSessionRead, status_code=201)
def open_pos_session(
    payload: PosSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PosSession:
    # Vérifier qu'aucune session n'est déjà ouverte pour cet utilisateur
    existing = db.scalars(
        select(PosSession).where(
            PosSession.company_id == current_user.company_id,
            PosSession.opened_by_user_id == current_user.id,
            PosSession.status == "open",
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Une session est déjà ouverte (id={existing.id}). Fermez-la d'abord.",
        )
    session = PosSession(
        company_id=current_user.company_id,
        opened_at=datetime.now(timezone.utc),
        opened_by=current_user.full_name,
        opened_by_user_id=current_user.id,
        status="open",
        notes=payload.notes,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.patch("/pos/sessions/{session_id}/close", response_model=PosSessionRead)
def close_pos_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PosSession:
    session = db.get(PosSession, session_id)
    if not session or session.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Session introuvable")
    if session.status == "closed":
        raise HTTPException(status_code=400, detail="Session déjà fermée")

    # Calculer le total des ventes depuis l'ouverture de la session
    sales_query = select(func.count(Sale.id), func.coalesce(func.sum(Sale.total_amount), 0)).where(
        Sale.company_id == current_user.company_id,
        Sale.created_at >= session.opened_at,
    )
    sales_count, total_amount = db.execute(sales_query).one()

    session.closed_at = datetime.now(timezone.utc)
    session.status = "closed"
    session.sales_count = sales_count or 0
    session.total_amount = float(total_amount or 0)
    db.commit()
    db.refresh(session)
    return session
