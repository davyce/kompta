"""
inventory_valuation.py — Coût moyen pondéré (CMP) du stock (Phase B).

Principes :
- Montants en CENTIMES ENTIERS, jamais de Float (cohérent avec accounting.py).
- Le CMP (Product.average_cost_cents) ne bouge qu'à la RÉCEPTION d'un achat
  (nouvelle moyenne pondérée par les quantités). Une vente ne change jamais
  le CMP, elle le consomme tel quel.
- Chaque mouvement de stock est tracé dans InventoryMovement avec son coût
  unitaire et total au moment du mouvement (traçabilité, jamais recalculé
  rétroactivement).
"""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import InventoryMovement, Product


def apply_purchase_receipt(db: Session, product: Product, *, quantity: int, unit_cost_cents: int,
                           company_id: int, source_id: int | None = None) -> InventoryMovement:
    """Réception d'achat : recalcule le CMP pondéré par les quantités et
    incrémente le stock. Ne poste aucune écriture comptable (voir
    accounting.record_purchase_receipt, appelé séparément par l'appelant)."""
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantité reçue invalide.")
    prior_qty = product.stock_quantity or 0
    prior_value_cents = prior_qty * (product.average_cost_cents or 0)
    incoming_value_cents = quantity * unit_cost_cents
    new_qty = prior_qty + quantity
    product.average_cost_cents = (prior_value_cents + incoming_value_cents) // new_qty if new_qty else 0
    product.stock_quantity = new_qty

    movement = InventoryMovement(
        product_id=product.id,
        movement_type="in",
        quantity=quantity,
        reason="Réception achat",
        unit_cost_cents=unit_cost_cents,
        total_cost_cents=incoming_value_cents,
        source_type="purchase_receipt",
        source_id=source_id,
        company_id=company_id,
    )
    db.add(movement)
    return movement


def apply_sale_consumption(db: Session, product: Product, *, quantity: int,
                           company_id: int, source_id: int | None = None,
                           block_oversell: bool = True) -> int:
    """Sortie de stock à la vente, au CMP courant (inchangé par cette
    opération). Retourne le coût des marchandises vendues (COGS) en centimes,
    pour que l'appelant poste l'écriture comptable correspondante
    (accounting.record_cogs). Bloque la vente si le stock est insuffisant
    (garde-fou par défaut — évite un stock négatif incohérent avec le CMP)."""
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantité vendue invalide.")
    available = product.stock_quantity or 0
    if block_oversell and quantity > available:
        raise HTTPException(
            status_code=409,
            detail=f"Stock insuffisant pour {product.name} : {available} disponible(s), {quantity} demandé(s).",
        )
    cogs_cents = quantity * (product.average_cost_cents or 0)
    product.stock_quantity = available - quantity

    movement = InventoryMovement(
        product_id=product.id,
        movement_type="out",
        quantity=quantity,
        reason="Vente",
        unit_cost_cents=product.average_cost_cents or 0,
        total_cost_cents=-cogs_cents,
        source_type="sale",
        source_id=source_id,
        company_id=company_id,
    )
    db.add(movement)
    return cogs_cents
