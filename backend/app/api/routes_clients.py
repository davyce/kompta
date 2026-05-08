"""
routes_clients.py — Module CRM / Clients + Fidélité + Remises.

Endpoints :
  GET    /clients                            — liste des clients
  POST   /clients                            — créer un client
  PUT    /clients/{id}                       — modifier un client
  DELETE /clients/{id}                       — supprimer un client
  GET    /clients/{id}/stats                 — stats factures liées
  GET    /clients/{id}/discounts             — liste des remises du client
  POST   /clients/{id}/discounts             — créer une remise
  PUT    /clients/{id}/discounts/{disc_id}   — modifier une remise
  DELETE /clients/{id}/discounts/{disc_id}   — supprimer une remise
  PATCH  /clients/{id}/loyalty               — modifier points / tier / remise globale
"""

from __future__ import annotations

from datetime import datetime

import math

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.domain import Client, ClientDiscount, Invoice
from app.schemas.domain import (
    ClientCreate,
    ClientDiscountCreate,
    ClientDiscountRead,
    ClientDiscountUpdate,
    ClientLoyaltyUpdate,
    ClientRead,
    ClientStatsRead,
    ClientUpdate,
)

router = APIRouter(tags=["clients"])


# ═══════════════════════════════════════════════════════════════════
# CRUD clients
# ═══════════════════════════════════════════════════════════════════

@router.get("/clients")
def list_clients(
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=0, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    stmt = select(Client).where(Client.company_id == current_user.company_id)
    if status:
        stmt = stmt.where(Client.status == status)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            Client.name.ilike(pattern)
            | Client.email.ilike(pattern)
            | Client.city.ilike(pattern)
        )
    stmt = stmt.order_by(Client.name)
    if per_page == 0:
        return db.scalars(stmt).all()
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.offset((page - 1) * per_page).limit(per_page)).all()
    return {"items": items, "total": total, "page": page, "per_page": per_page, "pages": math.ceil(total / per_page) if per_page else 1}


@router.post("/clients", response_model=ClientRead, status_code=201)
def create_client(
    payload: ClientCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Client:
    client = Client(
        **payload.model_dump(),
        company_id=current_user.company_id,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.put("/clients/{client_id}", response_model=ClientRead)
def update_client(
    client_id: int,
    payload: ClientUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Client:
    client = db.get(Client, client_id)
    if not client or client.company_id != current_user.company_id:
        raise HTTPException(404, "Client introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(client, k, v)
    client.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(client)
    return client


@router.delete("/clients/{client_id}", status_code=204)
def delete_client(
    client_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> None:
    client = db.get(Client, client_id)
    if not client or client.company_id != current_user.company_id:
        raise HTTPException(404, "Client introuvable")
    db.delete(client)
    db.commit()


# ═══════════════════════════════════════════════════════════════════
# STATS
# ═══════════════════════════════════════════════════════════════════

@router.get("/clients/{client_id}/stats", response_model=ClientStatsRead)
def client_stats(
    client_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ClientStatsRead:
    client = db.get(Client, client_id)
    if not client or client.company_id != current_user.company_id:
        raise HTTPException(404, "Client introuvable")

    invoices = db.scalars(
        select(Invoice).where(
            Invoice.company_id == current_user.company_id,
            Invoice.customer_name.ilike(f"%{client.name}%"),
        )
    ).all()

    invoice_count = len(invoices)
    total_revenue = sum(
        inv.total_amount for inv in invoices if inv.status in ("paid", "sent", "overdue")
    )
    unpaid_count = sum(1 for inv in invoices if inv.status in ("sent", "overdue"))
    dates = [inv.created_at.isoformat() for inv in invoices if inv.created_at is not None]
    last_invoice_date = max(dates) if dates else None

    return ClientStatsRead(
        client_id=client_id,
        invoice_count=invoice_count,
        total_revenue=total_revenue,
        unpaid_count=unpaid_count,
        last_invoice_date=last_invoice_date,
    )


# ═══════════════════════════════════════════════════════════════════
# REMISES / DISCOUNTS
# ═══════════════════════════════════════════════════════════════════

@router.get("/clients/{client_id}/discounts", response_model=list[ClientDiscountRead])
def list_discounts(
    client_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[ClientDiscount]:
    client = db.get(Client, client_id)
    if not client or client.company_id != current_user.company_id:
        raise HTTPException(404, "Client introuvable")
    return db.scalars(
        select(ClientDiscount)
        .where(ClientDiscount.client_id == client_id)
        .order_by(ClientDiscount.created_at.desc())
    ).all()


@router.post("/clients/{client_id}/discounts", response_model=ClientDiscountRead, status_code=201)
def create_discount(
    client_id: int,
    payload: ClientDiscountCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ClientDiscount:
    client = db.get(Client, client_id)
    if not client or client.company_id != current_user.company_id:
        raise HTTPException(404, "Client introuvable")
    discount = ClientDiscount(
        **payload.model_dump(),
        client_id=client_id,
        company_id=current_user.company_id,
    )
    db.add(discount)
    # Mettre à jour la remise globale si c'est un % simple
    if payload.discount_type == "percent" and payload.applies_to == "all":
        client.global_discount_percent = max(client.global_discount_percent, payload.discount_value)
    db.commit()
    db.refresh(discount)
    return discount


@router.put("/clients/{client_id}/discounts/{discount_id}", response_model=ClientDiscountRead)
def update_discount(
    client_id: int,
    discount_id: int,
    payload: ClientDiscountUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> ClientDiscount:
    discount = db.get(ClientDiscount, discount_id)
    if not discount or discount.client_id != client_id or discount.company_id != current_user.company_id:
        raise HTTPException(404, "Remise introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(discount, k, v)
    discount.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(discount)
    return discount


@router.delete("/clients/{client_id}/discounts/{discount_id}", status_code=204)
def delete_discount(
    client_id: int,
    discount_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> None:
    discount = db.get(ClientDiscount, discount_id)
    if not discount or discount.client_id != client_id or discount.company_id != current_user.company_id:
        raise HTTPException(404, "Remise introuvable")
    db.delete(discount)
    db.commit()


# ═══════════════════════════════════════════════════════════════════
# FIDÉLITÉ — points & tier
# ═══════════════════════════════════════════════════════════════════

TIER_THRESHOLDS = [
    (5000, "vip"),
    (2000, "gold"),
    (500, "silver"),
    (0, "standard"),
]

def _compute_tier(points: int) -> str:
    for threshold, tier in TIER_THRESHOLDS:
        if points >= threshold:
            return tier
    return "standard"


@router.patch("/clients/{client_id}/loyalty", response_model=ClientRead)
def update_loyalty(
    client_id: int,
    payload: ClientLoyaltyUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Client:
    client = db.get(Client, client_id)
    if not client or client.company_id != current_user.company_id:
        raise HTTPException(404, "Client introuvable")

    if payload.points_delta:
        client.loyalty_points = max(0, (client.loyalty_points or 0) + payload.points_delta)
        # Auto-calcul du tier selon les points
        client.loyalty_tier = _compute_tier(client.loyalty_points)

    if payload.loyalty_tier is not None:
        client.loyalty_tier = payload.loyalty_tier

    if payload.global_discount_percent is not None:
        client.global_discount_percent = max(0.0, min(100.0, payload.global_discount_percent))

    client.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(client)
    return client
