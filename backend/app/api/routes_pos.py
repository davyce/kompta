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
    opening_balance_cents: int = 0


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
    opening_balance_cents: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PosSessionBalance(BaseModel):
    session_id: int
    opening_balance_cents: int
    cash_sales_cents: int
    expected_cash_cents: int
    opened_at: datetime
    opened_by: str


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


@router.get("/pos/sessions/current/balance", response_model=Optional[PosSessionBalance])
def get_current_session_balance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Optional[PosSessionBalance]:
    session = db.scalars(
        select(PosSession).where(
            PosSession.company_id == current_user.company_id,
            PosSession.opened_by_user_id == current_user.id,
            PosSession.status == "open",
        )
    ).first()
    if not session:
        # Aucune session ouverte n'est un état normal (avant la première
        # ouverture de caisse du jour), pas une erreur — 200 + null évite un
        # 404 bruyant (log navigateur "Failed to load resource") à chaque
        # visite de la page POS sans session active.
        return None

    # Rattachement exact par session_id (FK) plutôt que par plage de dates :
    # évite le double-comptage entre sessions/caissiers concurrents (cf. POS-01).
    cash_sales_query = select(func.coalesce(func.sum(Sale.total_amount_cents), 0)).where(
        Sale.company_id == current_user.company_id,
        Sale.session_id == session.id,
        Sale.payment_method == "cash",
    )
    cash_sales_cents = int(db.execute(cash_sales_query).scalar() or 0)

    return PosSessionBalance(
        session_id=session.id,
        opening_balance_cents=session.opening_balance_cents,
        cash_sales_cents=cash_sales_cents,
        expected_cash_cents=session.opening_balance_cents + cash_sales_cents,
        opened_at=session.opened_at,
        opened_by=session.opened_by,
    )


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
        opening_balance_cents=payload.opening_balance_cents,
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

    # Rattachement exact par session_id (FK) plutôt que par plage de dates :
    # évite le double-comptage entre sessions/caissiers concurrents (cf. POS-01).
    sales_query = select(func.count(Sale.id), func.coalesce(func.sum(Sale.total_amount), 0)).where(
        Sale.company_id == current_user.company_id,
        Sale.session_id == session.id,
    )
    sales_count, total_amount = db.execute(sales_query).one()

    session.closed_at = datetime.now(timezone.utc)
    session.status = "closed"
    session.sales_count = sales_count or 0
    session.total_amount = float(total_amount or 0)
    db.commit()
    db.refresh(session)
    return session
