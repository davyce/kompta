"""
routes_budget.py — Module de gestion budgétaire.

Endpoints:
  GET    /budget/categories           — liste des catégories budgétaires
  POST   /budget/categories           — créer une catégorie
  PUT    /budget/categories/{id}      — modifier
  DELETE /budget/categories/{id}      — supprimer
  GET    /budget/summary              — résumé avec montants dépensés vs prévus
"""

from __future__ import annotations

from datetime import datetime, date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import BudgetCategory
from app.models.domain import Invoice, Sale
from app.schemas.domain import (
    BudgetCategoryCreate,
    BudgetCategoryRead,
    BudgetCategoryUpdate,
    BudgetSummaryItem,
)

router = APIRouter(tags=["budget"])


# ═══════════════════════════════════════════════════════════════════
# CRUD
# ═══════════════════════════════════════════════════════════════════

@router.get("/budget/categories", response_model=list[BudgetCategoryRead])
def list_budget_categories(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[BudgetCategory]:
    return db.scalars(
        select(BudgetCategory)
        .where(BudgetCategory.company_id == current_user.company_id)
        .order_by(BudgetCategory.created_at)
    ).all()


@router.post("/budget/categories", response_model=BudgetCategoryRead, status_code=201)
def create_budget_category(
    payload: BudgetCategoryCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> BudgetCategory:
    cat = BudgetCategory(
        **payload.model_dump(),
        company_id=current_user.company_id,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/budget/categories/{cat_id}", response_model=BudgetCategoryRead)
def update_budget_category(
    cat_id: int,
    payload: BudgetCategoryUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> BudgetCategory:
    cat = db.get(BudgetCategory, cat_id)
    if not cat or cat.company_id != current_user.company_id:
        raise HTTPException(404, "Catégorie introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/budget/categories/{cat_id}", status_code=204)
def delete_budget_category(
    cat_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> None:
    cat = db.get(BudgetCategory, cat_id)
    if not cat or cat.company_id != current_user.company_id:
        raise HTTPException(404, "Catégorie introuvable")
    db.delete(cat)
    db.commit()


# ═══════════════════════════════════════════════════════════════════
# SUMMARY — planned vs spent
# ═══════════════════════════════════════════════════════════════════

def _period_bounds(period: str) -> tuple[date, date]:
    """Return (start, end) dates for the current period window."""
    import calendar
    today = date.today()
    if period == "monthly":
        start = today.replace(day=1)
        last_day = calendar.monthrange(today.year, today.month)[1]
        end = today.replace(day=last_day)
        return start, end
    elif period == "quarterly":
        q = (today.month - 1) // 3
        start_month = q * 3 + 1
        end_month = start_month + 2
        last_day = calendar.monthrange(today.year, end_month)[1]
        return today.replace(month=start_month, day=1), today.replace(month=end_month, day=last_day)
    else:  # yearly
        return today.replace(month=1, day=1), today.replace(month=12, day=31)


def _compute_spent(
    db: Session,
    company_id: int,
    category_name: str,
    category_type: str,
    period: str,
) -> float:
    """
    Compute the total spent for a budget category over the current period.

    For 'expense' categories: sum invoices where customer_name LIKE category_name
      (or where any invoice line description matches), plus matching POS sales.
    For 'income' categories: sum paid invoices where the category name matches.
    For 'investment' categories: not matched to invoices — returns 0 (investments
      are tracked separately via the Investments module).
    """
    if category_type == "investment":
        return 0.0

    start, end = _period_bounds(period)
    start_dt = datetime.combine(start, datetime.min.time())
    end_dt = datetime.combine(end, datetime.max.time())

    total = 0.0
    name_lower = category_name.lower()

    # ── Invoices ──────────────────────────────────────────────────
    invoices = db.scalars(
        select(Invoice).where(
            Invoice.company_id == company_id,
            Invoice.status == "paid",
            Invoice.paid_at >= start_dt,
            Invoice.paid_at <= end_dt,
        )
    ).all()

    for inv in invoices:
        # Match if any line description contains the category name
        matched = any(
            name_lower in (line.description or "").lower()
            for line in inv.lines
        )
        if not matched:
            # Also check customer name as a fallback
            matched = name_lower in (inv.customer_name or "").lower()
        if matched:
            if category_type == "expense":
                total += inv.total_amount
            elif category_type == "income":
                total += inv.total_amount

    # ── POS Sales (expense categories only — cost of sales) ───────
    if category_type == "expense":
        sales = db.scalars(
            select(Sale).where(
                Sale.company_id == company_id,
                Sale.status == "paid",
                Sale.created_at >= start_dt,
                Sale.created_at <= end_dt,
            )
        ).all()
        for sale in sales:
            matched = any(
                name_lower in (item.product_name or "").lower()
                for item in sale.items
            )
            if matched:
                total += sale.total_amount

    return round(total, 2)


@router.get("/budget/summary", response_model=list[BudgetSummaryItem])
def budget_summary(
    period: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> list[dict[str, Any]]:
    """
    Returns each budget category with planned_amount, spent (from invoices/sales),
    remaining, and progress_pct for the current period.
    Optionally filter by period (monthly | quarterly | yearly).
    """
    query = select(BudgetCategory).where(
        BudgetCategory.company_id == current_user.company_id
    )
    if period:
        query = query.where(BudgetCategory.period == period)
    query = query.order_by(BudgetCategory.created_at)

    categories = db.scalars(query).all()

    result = []
    for cat in categories:
        spent = _compute_spent(
            db,
            current_user.company_id,
            cat.name,
            cat.category_type,
            cat.period,
        )
        planned = cat.planned_amount or 0.0
        remaining = round(planned - spent, 2)
        progress_pct = round((spent / planned * 100) if planned > 0 else 0.0, 1)
        result.append({
            "id": cat.id,
            "name": cat.name,
            "icon": cat.icon,
            "color": cat.color,
            "planned_amount": planned,
            "period": cat.period,
            "category_type": cat.category_type,
            "spent": spent,
            "remaining": remaining,
            "progress_pct": progress_pct,
        })

    return result
