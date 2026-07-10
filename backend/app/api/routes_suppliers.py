"""
routes_suppliers.py — Module Fournisseurs (Phase B : achats/stock).

Endpoints :
  GET    /suppliers               — liste des fournisseurs
  POST   /suppliers               — créer un fournisseur
  PUT    /suppliers/{id}          — modifier un fournisseur
  DELETE /suppliers/{id}          — supprimer un fournisseur
  GET    /suppliers/{id}/stats    — stats bons de commande liés
"""

from __future__ import annotations

from datetime import datetime, timezone

import math

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.domain import PurchaseOrder, Supplier
from app.schemas.domain import SupplierCreate, SupplierRead, SupplierStatsRead, SupplierUpdate

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
