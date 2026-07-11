"""
routes_purchases.py — Bons de commande / Achats fournisseurs (Phase B).

Cycle de vie : draft → (pending_approval si seuil dépassé) → approved →
ordered → received (poste l'écriture comptable + met à jour le CMP du
stock) → paid (règlement fournisseur). cancelled possible avant received.

Endpoints :
  GET    /purchase-orders                    — liste
  POST   /purchase-orders                    — créer (brouillon)
  GET    /purchase-orders/{id}                — détail
  POST   /purchase-orders/{id}/approve
  POST   /purchase-orders/{id}/reject
  POST   /purchase-orders/{id}/order          — passe en "ordered" (envoyé au fournisseur)
  POST   /purchase-orders/{id}/receive        — réception : écriture comptable + CMP
  POST   /purchase-orders/{id}/pay            — règlement fournisseur
  DELETE /purchase-orders/{id}                — brouillon uniquement
"""

from __future__ import annotations

from datetime import date, datetime, timezone

import math

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.api.routes import _require_admin
from app.db.session import get_db
from app.models.domain import Company, Product, PurchaseOrder, PurchaseOrderLine, Supplier, User
from app.schemas.domain import (
    PurchaseOrderCreate,
    PurchaseOrderRead,
    PurchaseOrderRejectPayload,
    SupplierDeclinePayload,
)
from app.services import accounting as _accounting
from app.services import inventory_valuation as _inv

router = APIRouter(tags=["purchases"])


def _next_po_number(db: Session, company_id: int) -> str:
    seq = db.execute(
        text("UPDATE companies SET purchase_order_seq = purchase_order_seq + 1 WHERE id = :cid RETURNING purchase_order_seq"),
        {"cid": company_id},
    ).scalar_one()
    return f"PO-{date.today().year}-C{company_id:04d}-{seq:04d}"


def _scoped_po(db: Session, po_id: int, current_user: User) -> PurchaseOrder:
    po = db.scalar(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines))
        .where(PurchaseOrder.id == po_id, PurchaseOrder.company_id == current_user.company_id)
    )
    if not po:
        raise HTTPException(status_code=404, detail="Bon de commande introuvable")
    return po


@router.get("/purchase-orders")
def list_purchase_orders(
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=0, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = (
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines))
        .where(PurchaseOrder.company_id == current_user.company_id)
        .order_by(PurchaseOrder.created_at.desc())
    )
    if status:
        stmt = stmt.where(PurchaseOrder.status == status)
    if per_page == 0:
        items = db.scalars(stmt).all()
        return [PurchaseOrderRead.model_validate(po) for po in items]
    total = db.scalar(
        select(func.count()).select_from(
            select(PurchaseOrder.id).where(PurchaseOrder.company_id == current_user.company_id).subquery()
        )
    ) or 0
    items = db.scalars(stmt.offset((page - 1) * per_page).limit(per_page)).all()
    return {
        "items": [PurchaseOrderRead.model_validate(po) for po in items],
        "page": page,
        "per_page": per_page,
        "pages": math.ceil(total / per_page) if per_page else 1,
    }


@router.post("/purchase-orders", response_model=PurchaseOrderRead, status_code=201)
def create_purchase_order(
    payload: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PurchaseOrder:
    supplier = db.get(Supplier, payload.supplier_id)
    if not supplier or supplier.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Fournisseur introuvable")
    if not payload.lines:
        raise HTTPException(status_code=400, detail="Au moins une ligne est requise.")

    po = PurchaseOrder(
        number=_next_po_number(db, current_user.company_id),
        supplier_id=supplier.id,
        supplier_name=supplier.name,
        expected_date=payload.expected_date,
        notes=payload.notes,
        company_id=current_user.company_id,
        # Fournisseur connecté à une vraie entreprise KOMPTA (voir SupplierConnection) :
        # le BC devient visible et actionnable dans son propre espace Achats.
        supplier_company_id=supplier.linked_company_id,
        supplier_decision="pending" if supplier.linked_company_id else "",
    )
    subtotal_c = tax_c = 0
    for line in payload.lines:
        unit_cost_c = _accounting.to_cents(line.unit_cost)
        line_ht_c = unit_cost_c * line.quantity
        subtotal_c += line_ht_c
        tax_c += round(line_ht_c * (line.tax_rate / 100.0))
        po.lines.append(PurchaseOrderLine(
            product_id=line.product_id, description=line.description, quantity=line.quantity,
            unit_cost_cents=unit_cost_c, tax_rate=line.tax_rate, total_cents=line_ht_c,
        ))
    po.subtotal_cents = subtotal_c
    po.tax_amount_cents = tax_c
    po.total_amount_cents = subtotal_c + tax_c

    company = db.get(Company, current_user.company_id)
    threshold = int(getattr(company, "purchase_approval_threshold_cents", 0) or 0)
    po.approval_status = "pending" if (threshold > 0 and po.total_amount_cents >= threshold) else "not_required"

    db.add(po)
    db.commit()
    db.refresh(po)
    return po


@router.get("/purchase-orders/received")
def list_received_purchase_orders(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bons de commande émis par d'autres entreprises KOMPTA connectées comme
    clients de mon entreprise (via SupplierConnection acceptée). Déclarée
    AVANT /purchase-orders/{po_id} : sinon FastAPI matcherait "received"
    comme un po_id et cette route ne serait jamais atteinte."""
    stmt = (
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines))
        .where(PurchaseOrder.supplier_company_id == current_user.company_id)
        .order_by(PurchaseOrder.created_at.desc())
    )
    if status:
        stmt = stmt.where(PurchaseOrder.supplier_decision == status)
    items = db.scalars(stmt).all()
    buyer_ids = {po.company_id for po in items}
    buyers = {c.id: c.name for c in db.scalars(select(Company).where(Company.id.in_(buyer_ids))).all()} if buyer_ids else {}
    result = []
    for po in items:
        data = PurchaseOrderRead.model_validate(po).model_dump()
        data["buyer_company_name"] = buyers.get(po.company_id, "")
        result.append(data)
    return result


@router.get("/purchase-orders/{po_id}", response_model=PurchaseOrderRead)
def get_purchase_order(po_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> PurchaseOrder:
    return _scoped_po(db, po_id, current_user)


@router.post("/purchase-orders/{po_id}/approve", response_model=PurchaseOrderRead)
def approve_purchase_order(po_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> PurchaseOrder:
    _require_admin(current_user)
    po = _scoped_po(db, po_id, current_user)
    if po.approval_status not in {"pending", "rejected"}:
        raise HTTPException(status_code=409, detail=f"Non approuvable dans l'état '{po.approval_status}'.")
    po.approval_status = "approved"
    po.approved_by_user_id = current_user.id
    po.approved_at = datetime.now(timezone.utc)
    po.rejection_reason = ""
    db.commit()
    db.refresh(po)
    return po


@router.post("/purchase-orders/{po_id}/reject", response_model=PurchaseOrderRead)
def reject_purchase_order(
    po_id: int, payload: PurchaseOrderRejectPayload,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
) -> PurchaseOrder:
    _require_admin(current_user)
    po = _scoped_po(db, po_id, current_user)
    if po.approval_status not in {"pending", "approved"}:
        raise HTTPException(status_code=409, detail=f"Non rejetable dans l'état '{po.approval_status}'.")
    po.approval_status = "rejected"
    po.rejection_reason = payload.reason.strip()
    po.approved_by_user_id = current_user.id
    po.approved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(po)
    return po


@router.post("/purchase-orders/{po_id}/order", response_model=PurchaseOrderRead)
def order_purchase_order(po_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> PurchaseOrder:
    po = _scoped_po(db, po_id, current_user)
    if po.status != "draft":
        raise HTTPException(status_code=409, detail=f"Non commandable dans l'état '{po.status}'.")
    if po.approval_status == "pending":
        raise HTTPException(status_code=409, detail="En attente d'approbation.")
    if po.approval_status == "rejected":
        raise HTTPException(status_code=409, detail="Bon de commande rejeté.")
    po.status = "ordered"
    db.commit()
    db.refresh(po)
    return po


@router.post("/purchase-orders/{po_id}/receive", response_model=PurchaseOrderRead)
def receive_purchase_order(po_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> PurchaseOrder:
    """Réception : met à jour le stock/CMP des lignes produit et poste
    l'écriture comptable (31 Stocks pour les lignes produit, 60 Achats pour
    les lignes hors-stock, Cr 401 Fournisseurs)."""
    po = _scoped_po(db, po_id, current_user)
    if po.status not in {"draft", "ordered"}:
        raise HTTPException(status_code=409, detail=f"Non réceptionnable dans l'état '{po.status}'.")
    if po.approval_status == "pending":
        raise HTTPException(status_code=409, detail="En attente d'approbation.")

    company = db.get(Company, current_user.company_id)
    stock_ht_c = expense_ht_c = 0
    for line in po.lines:
        if line.product_id:
            product = db.get(Product, line.product_id)
            if product and product.company_id == current_user.company_id:
                _inv.apply_purchase_receipt(
                    db, product, quantity=line.quantity, unit_cost_cents=line.unit_cost_cents,
                    company_id=current_user.company_id, source_id=po.id,
                )
                stock_ht_c += line.total_cents
                continue
        expense_ht_c += line.total_cents

    try:
        _accounting.record_purchase_receipt(
            db, company, po_id=po.id, stock_ht_cents=stock_ht_c, expense_ht_cents=expense_ht_c,
            tax_cents=po.tax_amount_cents, user_id=current_user.id,
        )
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Échec de l'écriture comptable de réception — rien n'a été enregistré.")

    po.status = "received"
    po.received_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(po)
    return po


@router.post("/purchase-orders/{po_id}/pay", response_model=PurchaseOrderRead)
def pay_purchase_order(po_id: int, payment_method: str = "bank", db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> PurchaseOrder:
    po = _scoped_po(db, po_id, current_user)
    if po.status != "received":
        raise HTTPException(status_code=409, detail="Seul un bon de commande réceptionné peut être réglé.")
    company = db.get(Company, current_user.company_id)
    try:
        _accounting.record_purchase_payment(
            db, company, po_id=po.id, total=po.total_amount, payment_method=payment_method, user_id=current_user.id,
        )
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Échec de l'écriture comptable de règlement — rien n'a été enregistré.")
    po.status = "paid"
    po.payment_method = payment_method
    po.paid_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(po)
    return po


@router.delete("/purchase-orders/{po_id}", status_code=204)
def delete_purchase_order(po_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> None:
    po = _scoped_po(db, po_id, current_user)
    if po.status != "draft":
        raise HTTPException(status_code=409, detail="Seul un brouillon peut être supprimé.")
    db.delete(po)
    db.commit()


# ── Réseau fournisseurs — côté entreprise fournisseur ───────────────────────

def _scoped_received_po(db: Session, po_id: int, current_user: User) -> PurchaseOrder:
    """Comme _scoped_po, mais pour un bon de commande REÇU (l'entreprise
    courante est le fournisseur connecté, pas l'émetteur)."""
    po = db.scalar(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines))
        .where(PurchaseOrder.id == po_id, PurchaseOrder.supplier_company_id == current_user.company_id)
    )
    if not po:
        raise HTTPException(status_code=404, detail="Bon de commande introuvable")
    return po


@router.post("/purchase-orders/{po_id}/supplier-accept", response_model=PurchaseOrderRead)
def supplier_accept_purchase_order(po_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> PurchaseOrder:
    po = _scoped_received_po(db, po_id, current_user)
    if po.supplier_decision != "pending":
        raise HTTPException(status_code=409, detail=f"Non acceptable dans l'état '{po.supplier_decision}'.")
    po.supplier_decision = "accepted"
    po.supplier_decided_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(po)
    return po


@router.post("/purchase-orders/{po_id}/supplier-decline", response_model=PurchaseOrderRead)
def supplier_decline_purchase_order(
    po_id: int, payload: SupplierDeclinePayload,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
) -> PurchaseOrder:
    po = _scoped_received_po(db, po_id, current_user)
    if po.supplier_decision != "pending":
        raise HTTPException(status_code=409, detail=f"Non refusable dans l'état '{po.supplier_decision}'.")
    po.supplier_decision = "declined"
    po.supplier_decision_reason = payload.reason.strip()
    po.supplier_decided_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(po)
    return po
