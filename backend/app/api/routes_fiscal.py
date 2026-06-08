"""
routes_fiscal.py — Agenda fiscal et échéances déclaratives.

Endpoints :
  GET    /fiscal/deadlines          — liste (filtres: status, tax_type, year)
  POST   /fiscal/deadlines          — créer une échéance
  PATCH  /fiscal/deadlines/{id}     — modifier (notamment status=done)
  DELETE /fiscal/deadlines/{id}     — supprimer
  POST   /fiscal/deadlines/generate — génère les échéances standard annuelles
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import FiscalDeadline, Invoice, User

router = APIRouter(tags=["fiscal"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class FiscalDeadlineCreate(BaseModel):
    title: str
    description: str = ""
    due_date: date
    tax_type: str = "autre"  # TVA|IS|CNSS|IRpp|patente|autre
    status: str = "upcoming"  # upcoming|done|overdue
    recurrence: str = "once"  # monthly|quarterly|annual|once
    reminder_days: int = 7


class FiscalDeadlineUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[date] = None
    tax_type: Optional[str] = None
    status: Optional[str] = None
    recurrence: Optional[str] = None
    reminder_days: Optional[int] = None


class FiscalDeadlineRead(BaseModel):
    id: int
    company_id: int
    title: str
    description: str
    due_date: date
    tax_type: str
    status: str
    recurrence: str
    reminder_days: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VatSummaryRead(BaseModel):
    period: str
    from_date: date
    to_date: date
    invoices_count: int
    taxable_turnover: float
    vat_collected: float
    total_including_tax: float
    currency: str
    status_breakdown: dict[str, int]


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/fiscal/deadlines", response_model=list[FiscalDeadlineRead])
def list_fiscal_deadlines(
    status: Optional[str] = None,
    tax_type: Optional[str] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[FiscalDeadline]:
    stmt = select(FiscalDeadline).where(FiscalDeadline.company_id == current_user.company_id)
    if status:
        stmt = stmt.where(FiscalDeadline.status == status)
    if tax_type:
        stmt = stmt.where(FiscalDeadline.tax_type == tax_type)
    if year:
        stmt = stmt.where(
            FiscalDeadline.due_date >= date(year, 1, 1),
            FiscalDeadline.due_date <= date(year, 12, 31),
        )
    stmt = stmt.order_by(FiscalDeadline.due_date)
    return db.scalars(stmt).all()


@router.get("/fiscal/vat-summary", response_model=VatSummaryRead)
def vat_summary(
    period: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Résumé TVA réel pour une période YYYY-MM.

    Source: factures de l'entreprise (subtotal/tax_amount/total_amount). Les
    factures en avoir restent incluses avec leurs montants négatifs.
    """
    today = date.today()
    if period:
        try:
            year, month = [int(part) for part in period.split("-", 1)]
            from_date = date(year, month, 1)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Période invalide, format attendu YYYY-MM") from exc
    else:
        from_date = date(today.year, today.month, 1)
    next_month = date(from_date.year + (from_date.month // 12), 1 if from_date.month == 12 else from_date.month + 1, 1)
    to_date = next_month - date.resolution

    invoices = db.scalars(
        select(Invoice).where(
            Invoice.company_id == current_user.company_id,
            Invoice.created_at >= datetime.combine(from_date, datetime.min.time()),
            Invoice.created_at < datetime.combine(next_month, datetime.min.time()),
        )
    ).all()
    currencies = [inv.currency or "XAF" for inv in invoices]
    currency = max(set(currencies), key=currencies.count) if currencies else "XAF"
    status_breakdown: dict[str, int] = {}
    for inv in invoices:
        status_breakdown[inv.status] = status_breakdown.get(inv.status, 0) + 1

    return {
        "period": f"{from_date.year:04d}-{from_date.month:02d}",
        "from_date": from_date,
        "to_date": to_date,
        "invoices_count": len(invoices),
        "taxable_turnover": round(sum(inv.subtotal or 0 for inv in invoices), 2),
        "vat_collected": round(sum(inv.tax_amount or 0 for inv in invoices), 2),
        "total_including_tax": round(sum(inv.total_amount or 0 for inv in invoices), 2),
        "currency": currency,
        "status_breakdown": status_breakdown,
    }


@router.post("/fiscal/deadlines", response_model=FiscalDeadlineRead, status_code=201)
def create_fiscal_deadline(
    payload: FiscalDeadlineCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FiscalDeadline:
    deadline = FiscalDeadline(
        company_id=current_user.company_id,
        title=payload.title,
        description=payload.description,
        due_date=payload.due_date,
        tax_type=payload.tax_type,
        status=payload.status,
        recurrence=payload.recurrence,
        reminder_days=payload.reminder_days,
    )
    db.add(deadline)
    db.commit()
    db.refresh(deadline)
    return deadline


@router.patch("/fiscal/deadlines/{deadline_id}", response_model=FiscalDeadlineRead)
def update_fiscal_deadline(
    deadline_id: int,
    payload: FiscalDeadlineUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FiscalDeadline:
    deadline = db.get(FiscalDeadline, deadline_id)
    if not deadline or deadline.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Échéance non trouvée")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(deadline, field, value)
    db.commit()
    db.refresh(deadline)
    return deadline


@router.delete("/fiscal/deadlines/{deadline_id}", status_code=204)
def delete_fiscal_deadline(
    deadline_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    deadline = db.get(FiscalDeadline, deadline_id)
    if not deadline or deadline.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Échéance non trouvée")
    db.delete(deadline)
    db.commit()


@router.post("/fiscal/deadlines/generate", response_model=list[FiscalDeadlineRead], status_code=201)
def generate_annual_deadlines(
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[FiscalDeadline]:
    """Génère automatiquement les échéances fiscales standard pour l'année donnée (défaut: année courante)."""
    today = date.today()
    target_year = year or today.year

    # Définition des échéances standard annuelles
    # TVA mensuelle : le 15 de chaque mois
    # CNSS mensuelle : le 10 de chaque mois
    # IS : 30 avril
    # Patente : 31 janvier

    templates: list[dict] = []

    # TVA mensuelle (12 échéances)
    for month in range(1, 13):
        last_day = 28 if month == 2 else 30 if month in (4, 6, 9, 11) else 31
        day = min(15, last_day)
        templates.append({
            "title": f"TVA mensuelle — {date(target_year, month, 1).strftime('%B %Y')}",
            "description": "Déclaration et paiement de la TVA mensuelle",
            "due_date": date(target_year, month, day),
            "tax_type": "TVA",
            "recurrence": "monthly",
        })

    # CNSS mensuelle (12 échéances)
    for month in range(1, 13):
        last_day = 28 if month == 2 else 30 if month in (4, 6, 9, 11) else 31
        day = min(10, last_day)
        templates.append({
            "title": f"CNSS mensuelle — {date(target_year, month, 1).strftime('%B %Y')}",
            "description": "Cotisations CNSS employeur et salarié",
            "due_date": date(target_year, month, day),
            "tax_type": "CNSS",
            "recurrence": "monthly",
        })

    # IS annuel : 30 avril
    templates.append({
        "title": f"Impôt sur les Sociétés (IS) — {target_year}",
        "description": "Déclaration et paiement de l'IS exercice précédent",
        "due_date": date(target_year, 4, 30),
        "tax_type": "IS",
        "recurrence": "annual",
    })

    # Patente : 31 janvier
    templates.append({
        "title": f"Patente — {target_year}",
        "description": "Règlement de la patente annuelle",
        "due_date": date(target_year, 1, 31),
        "tax_type": "patente",
        "recurrence": "annual",
    })

    created: list[FiscalDeadline] = []
    for tpl in templates:
        # Ne pas dupliquer si une échéance identique (même titre + date) existe déjà
        existing = db.scalars(
            select(FiscalDeadline).where(
                FiscalDeadline.company_id == current_user.company_id,
                FiscalDeadline.title == tpl["title"],
                FiscalDeadline.due_date == tpl["due_date"],
            )
        ).first()
        if existing:
            continue
        status_val = "done" if tpl["due_date"] < today else "upcoming"
        deadline = FiscalDeadline(
            company_id=current_user.company_id,
            title=tpl["title"],
            description=tpl.get("description", ""),
            due_date=tpl["due_date"],
            tax_type=tpl["tax_type"],
            status=status_val,
            recurrence=tpl.get("recurrence", "once"),
            reminder_days=7,
        )
        db.add(deadline)
        created.append(deadline)

    db.commit()
    for d in created:
        db.refresh(d)
    return created
