"""
routes_clients.py — Module CRM / Clients.

Endpoints :
  GET    /clients                   — liste des clients (filtres: status, search)
  POST   /clients                   — créer un client
  PUT    /clients/{id}              — modifier un client
  DELETE /clients/{id}              — supprimer un client
  GET    /clients/{id}/stats        — stats factures liées (CA, impayés, dernière facture)
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Client, Invoice
from app.schemas.domain import ClientCreate, ClientRead, ClientStatsRead, ClientUpdate

router = APIRouter(tags=["clients"])


# ═══════════════════════════════════════════════════════════════════
# CRUD
# ═══════════════════════════════════════════════════════════════════

@router.get("/clients", response_model=list[ClientRead])
def list_clients(
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[Client]:
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
    return db.scalars(stmt).all()


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
# STATS — jointure sur invoices.customer_name LIKE client.name
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

    # Toutes les factures dont customer_name contient le nom du client
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
    unpaid_count = sum(
        1 for inv in invoices if inv.status in ("sent", "overdue")
    )
    dates = [
        inv.created_at.isoformat()
        for inv in invoices
        if inv.created_at is not None
    ]
    last_invoice_date = max(dates) if dates else None

    return ClientStatsRead(
        client_id=client_id,
        invoice_count=invoice_count,
        total_revenue=total_revenue,
        unpaid_count=unpaid_count,
        last_invoice_date=last_invoice_date,
    )
