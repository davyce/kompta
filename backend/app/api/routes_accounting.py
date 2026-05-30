"""
routes_accounting.py — API du moteur comptable (partie double, SYSCOHADA-lite).

Endpoints :
  GET   /accounting/mode               — mode comptable de la société (simple|full)
  PATCH /accounting/mode               — basculer simple ⇄ full
  GET   /accounting/accounts           — plan comptable
  GET   /accounting/journal            — journal des écritures (avec lignes)
  GET   /accounting/balance            — balance générale (trial balance)
  POST  /accounting/entries            — écriture manuelle (mode full, équilibre exigé)
  POST  /accounting/entries/{id}/reverse — contre-passation (correction immuable)
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Account, Company, JournalEntry, User
from app.services import accounting as acc

router = APIRouter(prefix="/accounting", tags=["accounting"])

_ACCOUNTING_MANAGER_ROLES = {"comptable", "rh_entreprise", "manager_entreprise", "super_admin"}


def _can_manage_accounting(user: User) -> bool:
    return user.role.startswith("admin") or user.role in _ACCOUNTING_MANAGER_ROLES


# ── Schemas ─────────────────────────────────────────────────────────────────
class ModeUpdate(BaseModel):
    mode: str = Field(pattern="^(simple|full)$")


class ManualLine(BaseModel):
    code: str
    debit: float = Field(default=0, ge=0)
    credit: float = Field(default=0, ge=0)
    label: str = ""


class ManualEntry(BaseModel):
    label: str
    entry_date: date | None = None
    lines: list[ManualLine]


# ── Mode ────────────────────────────────────────────────────────────────────
@router.get("/mode")
def get_mode(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    company = db.get(Company, current_user.company_id)
    return {"mode": getattr(company, "accounting_mode", "simple")}


@router.patch("/mode")
def set_mode(payload: ModeUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    if not _can_manage_accounting(current_user):
        raise HTTPException(status_code=403, detail="Permission comptable insuffisante")
    company = db.get(Company, current_user.company_id)
    company.accounting_mode = payload.mode
    if payload.mode == "full":
        acc.seed_chart_of_accounts(db, company.id)
    db.commit()
    return {"mode": company.accounting_mode}


# ── Plan comptable ──────────────────────────────────────────────────────────
@router.get("/accounts")
def list_accounts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    acc.seed_chart_of_accounts(db, current_user.company_id)
    db.commit()
    accounts = db.scalars(
        select(Account).where(Account.company_id == current_user.company_id).order_by(Account.code)
    ).all()
    return [
        {"id": a.id, "code": a.code, "name": a.name, "type": a.type, "syscohada_class": a.syscohada_class}
        for a in accounts
    ]


# ── Journal ─────────────────────────────────────────────────────────────────
@router.get("/journal")
def list_journal(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    if not _can_manage_accounting(current_user):
        raise HTTPException(status_code=403, detail="Permission comptable insuffisante")
    entries = db.scalars(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(JournalEntry.company_id == current_user.company_id)
        .order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())
        .limit(min(limit, 500))
    ).all()
    return [
        {
            "id": e.id,
            "reference": e.reference,
            "date": e.entry_date,
            "label": e.label,
            "source_type": e.source_type,
            "source_id": e.source_id,
            "amount": acc.from_cents(e.amount_cents),
            "currency": e.currency,
            "reversed_entry_id": e.reversed_entry_id,
            "lines": [
                {
                    "account_code": l.account_code,
                    "label": l.label,
                    "debit": acc.from_cents(l.debit_cents),
                    "credit": acc.from_cents(l.credit_cents),
                }
                for l in e.lines
            ],
        }
        for e in entries
    ]


# ── Balance ─────────────────────────────────────────────────────────────────
@router.get("/balance")
def get_balance(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    if not _can_manage_accounting(current_user):
        raise HTTPException(status_code=403, detail="Permission comptable insuffisante")
    return acc.trial_balance(db, current_user.company_id)


# ── Écriture manuelle (mode full) ───────────────────────────────────────────
@router.post("/entries", status_code=201)
def create_manual_entry(
    payload: ManualEntry,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not _can_manage_accounting(current_user):
        raise HTTPException(status_code=403, detail="Permission comptable insuffisante")
    lines = [
        {"code": l.code, "debit": acc.to_cents(l.debit), "credit": acc.to_cents(l.credit), "label": l.label or payload.label}
        for l in payload.lines
    ]
    entry = acc.post_entry(
        db,
        company_id=current_user.company_id,
        label=payload.label,
        lines=lines,
        source_type="manual",
        entry_date=payload.entry_date,
        user_id=current_user.id,
    )
    db.commit()
    return {"id": entry.id, "reference": entry.reference, "amount": acc.from_cents(entry.amount_cents)}


@router.post("/entries/{entry_id}/reverse", status_code=201)
def reverse_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Contre-passation : crée l'écriture miroir (débit↔crédit). L'originale reste immuable."""
    if not _can_manage_accounting(current_user):
        raise HTTPException(status_code=403, detail="Permission comptable insuffisante")
    origin = db.scalar(
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(JournalEntry.id == entry_id, JournalEntry.company_id == current_user.company_id)
    )
    if not origin:
        raise HTTPException(status_code=404, detail="Écriture introuvable")
    if origin.reversed_entry_id:
        raise HTTPException(status_code=409, detail="Écriture déjà contre-passée")
    lines = [
        {"code": l.account_code, "debit": l.credit_cents, "credit": l.debit_cents, "label": f"Extourne {origin.reference}"}
        for l in origin.lines
    ]
    reversal = acc.post_entry(
        db,
        company_id=current_user.company_id,
        label=f"Contre-passation de {origin.reference}",
        lines=lines,
        source_type="reversal",
        source_id=origin.id,
        user_id=current_user.id,
    )
    origin.reversed_entry_id = reversal.id
    db.commit()
    return {"id": reversal.id, "reference": reversal.reference, "reverses": origin.reference}
