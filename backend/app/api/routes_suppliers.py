"""
routes_suppliers.py — Module Fournisseurs (Phase B : achats/stock) + réseau
fournisseurs inter-entreprises (connexion B2B entre deux entreprises KOMPTA).

Endpoints :
  GET    /suppliers               — liste des fournisseurs
  POST   /suppliers               — créer un fournisseur
  PUT    /suppliers/{id}          — modifier un fournisseur
  DELETE /suppliers/{id}          — supprimer un fournisseur
  GET    /suppliers/{id}/stats    — stats bons de commande liés

  GET    /companies/search                        — rechercher une entreprise KOMPTA par nom/email
  POST   /suppliers/{id}/connect                   — inviter une entreprise à se connecter comme ce fournisseur
  GET    /supplier-connections/incoming            — demandes de connexion reçues (en tant que cible)
  GET    /supplier-connections/outgoing            — demandes envoyées par mon entreprise
  POST   /supplier-connections/{id}/accept         — accepter une demande reçue
  POST   /supplier-connections/{id}/decline        — refuser une demande reçue
"""

from __future__ import annotations

from datetime import datetime, timezone

import math

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.domain import Company, PurchaseOrder, Supplier, SupplierConnection
from app.schemas.domain import (
    CompanySearchResult,
    SupplierConnectPayload,
    SupplierConnectionRead,
    SupplierCreate,
    SupplierRead,
    SupplierStatsRead,
    SupplierUpdate,
)

router = APIRouter(tags=["suppliers"])


@router.get("/suppliers")
def list_suppliers(
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=0, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    stmt = select(Supplier).where(Supplier.company_id == current_user.company_id)
    if status:
        stmt = stmt.where(Supplier.status == status)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            Supplier.name.ilike(pattern)
            | Supplier.email.ilike(pattern)
            | Supplier.city.ilike(pattern)
        )
    stmt = stmt.order_by(Supplier.name)
    if per_page == 0:
        return db.scalars(stmt).all()
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.offset((page - 1) * per_page).limit(per_page)).all()
    return {"items": items, "total": total, "page": page, "per_page": per_page, "pages": math.ceil(total / per_page) if per_page else 1}


@router.post("/suppliers", response_model=SupplierRead, status_code=201)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Supplier:
    supplier = Supplier(**payload.model_dump(), company_id=current_user.company_id)
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.put("/suppliers/{supplier_id}", response_model=SupplierRead)
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> Supplier:
    supplier = db.get(Supplier, supplier_id)
    if not supplier or supplier.company_id != current_user.company_id:
        raise HTTPException(404, "Fournisseur introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(supplier, k, v)
    supplier.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.delete("/suppliers/{supplier_id}", status_code=204)
def delete_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> None:
    supplier = db.get(Supplier, supplier_id)
    if not supplier or supplier.company_id != current_user.company_id:
        raise HTTPException(404, "Fournisseur introuvable")
    db.delete(supplier)
    db.commit()


@router.get("/suppliers/{supplier_id}/stats", response_model=SupplierStatsRead)
def supplier_stats(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> SupplierStatsRead:
    supplier = db.get(Supplier, supplier_id)
    if not supplier or supplier.company_id != current_user.company_id:
        raise HTTPException(404, "Fournisseur introuvable")

    orders = db.scalars(
        select(PurchaseOrder).where(
            PurchaseOrder.company_id == current_user.company_id,
            PurchaseOrder.supplier_id == supplier_id,
        )
    ).all()

    total_owed = sum(
        (o.total_amount_cents or 0) / 100 for o in orders if o.status in ("received", "ordered") and not o.paid_at
    )
    unpaid_count = sum(1 for o in orders if o.status in ("received", "ordered") and not o.paid_at)
    dates = [o.created_at.isoformat() for o in orders if o.created_at is not None]
    last_order_date = max(dates) if dates else None

    return SupplierStatsRead(
        supplier_id=supplier_id,
        purchase_order_count=len(orders),
        total_owed=total_owed,
        unpaid_count=unpaid_count,
        last_order_date=last_order_date,
    )


# ── Réseau fournisseurs inter-entreprises ───────────────────────────────────

@router.get("/companies/search", response_model=list[CompanySearchResult])
def search_companies(
    q: str = Query(min_length=2, max_length=120),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[Company]:
    """Recherche une entreprise KOMPTA par nom ou email, pour l'inviter comme
    fournisseur connecté. Ne renvoie que des informations non sensibles
    (nom, secteur, ville) — jamais de données financières/internes."""
    pattern = f"%{q}%"
    companies = db.scalars(
        select(Company)
        .where(
            Company.id != current_user.company_id,
            Company.status == "active",
            or_(Company.name.ilike(pattern), Company.email.ilike(pattern)),
        )
        .order_by(Company.name)
        .limit(20)
    ).all()
    return companies


@router.post("/suppliers/{supplier_id}/connect", response_model=SupplierConnectionRead, status_code=201)
def connect_supplier(
    supplier_id: int,
    payload: SupplierConnectPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    supplier = db.get(Supplier, supplier_id)
    if not supplier or supplier.company_id != current_user.company_id:
        raise HTTPException(404, "Fournisseur introuvable")
    if payload.target_company_id == current_user.company_id:
        raise HTTPException(400, "Impossible de se connecter à sa propre entreprise")
    target = db.get(Company, payload.target_company_id)
    if not target:
        raise HTTPException(404, "Entreprise introuvable")
    existing = db.scalar(
        select(SupplierConnection).where(
            SupplierConnection.supplier_id == supplier_id,
            SupplierConnection.target_company_id == payload.target_company_id,
            SupplierConnection.status == "pending",
        )
    )
    if existing:
        raise HTTPException(409, "Une demande de connexion est déjà en attente pour ce fournisseur")
    connection = SupplierConnection(
        requester_company_id=current_user.company_id,
        supplier_id=supplier_id,
        target_company_id=payload.target_company_id,
        status="pending",
        requested_by_user_id=current_user.id,
    )
    db.add(connection)
    db.commit()
    db.refresh(connection)
    return _serialize_connection(db, connection)


def _serialize_connection(db: Session, connection: SupplierConnection) -> dict:
    requester = db.get(Company, connection.requester_company_id)
    return {
        "id": connection.id,
        "requester_company_id": connection.requester_company_id,
        "requester_company_name": requester.name if requester else "",
        "supplier_id": connection.supplier_id,
        "target_company_id": connection.target_company_id,
        "status": connection.status,
        "created_at": connection.created_at,
        "responded_at": connection.responded_at,
    }


@router.get("/supplier-connections/incoming", response_model=list[SupplierConnectionRead])
def list_incoming_connections(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[dict]:
    stmt = select(SupplierConnection).where(SupplierConnection.target_company_id == current_user.company_id)
    if status:
        stmt = stmt.where(SupplierConnection.status == status)
    connections = db.scalars(stmt.order_by(SupplierConnection.created_at.desc())).all()
    return [_serialize_connection(db, c) for c in connections]


@router.get("/supplier-connections/outgoing", response_model=list[SupplierConnectionRead])
def list_outgoing_connections(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[dict]:
    connections = db.scalars(
        select(SupplierConnection)
        .where(SupplierConnection.requester_company_id == current_user.company_id)
        .order_by(SupplierConnection.created_at.desc())
    ).all()
    return [_serialize_connection(db, c) for c in connections]


def _get_incoming_connection(db: Session, connection_id: int, current_user) -> SupplierConnection:
    connection = db.get(SupplierConnection, connection_id)
    if not connection or connection.target_company_id != current_user.company_id:
        raise HTTPException(404, "Demande de connexion introuvable")
    if connection.status != "pending":
        raise HTTPException(409, "Cette demande a déjà été traitée")
    return connection


@router.post("/supplier-connections/{connection_id}/accept", response_model=SupplierConnectionRead)
def accept_connection(
    connection_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    connection = _get_incoming_connection(db, connection_id, current_user)
    connection.status = "accepted"
    connection.responded_by_user_id = current_user.id
    connection.responded_at = datetime.now(timezone.utc)
    supplier = db.get(Supplier, connection.supplier_id)
    if supplier:
        supplier.linked_company_id = current_user.company_id
    db.commit()
    db.refresh(connection)
    return _serialize_connection(db, connection)


@router.post("/supplier-connections/{connection_id}/decline", response_model=SupplierConnectionRead)
def decline_connection(
    connection_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    connection = _get_incoming_connection(db, connection_id, current_user)
    connection.status = "declined"
    connection.responded_by_user_id = current_user.id
    connection.responded_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(connection)
    return _serialize_connection(db, connection)
