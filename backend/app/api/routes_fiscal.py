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
from app.models import FiscalDeadline, User

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
