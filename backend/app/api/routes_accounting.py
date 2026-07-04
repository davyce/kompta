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
from app.models import Account, BankTransaction, Company, JournalEntry, PaymentAccount, User
from app.services import accounting as acc
from app.services.currency import convert_to_xaf
from app.services.readiness import build_ohada_readiness

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


class OpeningBalanceUpdate(BaseModel):
    payment_account_id: int | None = None  # None = caisse espèces
    amount: float = Field(ge=0)
    entry_date: date | None = None
    label: str = ""


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


@router.get("/ohada-readiness")
def ohada_readiness(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    """Diagnostic OHADA/CEMAC réel : mentions légales, SYSCOHADA, TVA, fiscal, paie."""
    if not _can_manage_accounting(current_user):
        raise HTTPException(status_code=403, detail="Permission comptable insuffisante")
    return build_ohada_readiness(db, current_user.company_id)


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


# ── Solde d'ouverture (trésorerie de départ) ────────────────────────────────
def _opening_balance_account_code(payment_account: PaymentAccount | None) -> str:
    if payment_account is None:
        return "571"  # Caisse espèces
    return acc.treasury_account_code(payment_account.provider)


def _serialize_opening_balance(txn: BankTransaction) -> dict:
    return {
        "id": txn.id,
        "payment_account_id": txn.payment_account_id,
        "amount": txn.amount,
        "currency": txn.currency,
        "date": txn.date,
        "label": txn.label,
    }


@router.get("/opening-balance")
def list_opening_balances(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Liste des soldes d'ouverture déjà saisis pour la société (un par compte, None = caisse)."""
    rows = db.scalars(
        select(BankTransaction).where(
            BankTransaction.company_id == current_user.company_id,
            BankTransaction.source_type == "solde_ouverture",
        )
    ).all()
    return [_serialize_opening_balance(r) for r in rows]


@router.post("/opening-balance", status_code=201)
def set_opening_balance(
    payload: OpeningBalanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Crée ou met à jour le solde d'ouverture d'un compte (ou de la caisse si payment_account_id=None).

    Poste une écriture comptable équilibrée : Dr compte de trésorerie / Cr 101 Capital
    (contre-passation de l'ancienne écriture si un solde d'ouverture existait déjà pour ce compte).
    """
    if not _can_manage_accounting(current_user):
        raise HTTPException(status_code=403, detail="Permission comptable insuffisante")

    company = db.get(Company, current_user.company_id)

    payment_account: PaymentAccount | None = None
    currency = "XAF"
    if payload.payment_account_id is not None:
        payment_account = db.scalar(
            select(PaymentAccount).where(
                PaymentAccount.id == payload.payment_account_id,
                PaymentAccount.company_id == current_user.company_id,
            )
        )
        if not payment_account:
            raise HTTPException(status_code=404, detail="Compte de paiement introuvable")
        currency = payment_account.currency or "XAF"

    entry_date = payload.entry_date or date.today()
    label = payload.label or "Solde d'ouverture"
    account_code = _opening_balance_account_code(payment_account)

    existing = db.scalar(
        select(BankTransaction).where(
            BankTransaction.company_id == current_user.company_id,
            BankTransaction.source_type == "solde_ouverture",
            BankTransaction.payment_account_id == payload.payment_account_id,
        )
    )

    # Si un solde d'ouverture existait déjà, on contre-passe son écriture comptable
    # avant de poster la nouvelle (pour ne jamais fausser le grand livre par doublon).
    if existing is not None:
        old_entry = db.scalar(
            select(JournalEntry).where(
                JournalEntry.company_id == current_user.company_id,
                JournalEntry.source_type == "solde_ouverture",
                JournalEntry.source_id == existing.id,
                JournalEntry.reversed_entry_id.is_(None),
            )
        )
        if old_entry:
            reversal_lines = [
                {"code": l.account_code, "debit": l.credit_cents, "credit": l.debit_cents, "label": f"Extourne {old_entry.reference}"}
                for l in old_entry.lines
            ]
            reversal = acc.post_entry(
                db,
                company_id=current_user.company_id,
                label=f"Contre-passation solde d'ouverture ({old_entry.reference})",
                lines=reversal_lines,
                source_type="reversal",
                source_id=old_entry.id,
                entry_date=entry_date,
                user_id=current_user.id,
            )
            old_entry.reversed_entry_id = reversal.id

        existing.amount = payload.amount
        existing.debit = None
        existing.credit = payload.amount
        existing.date = entry_date.isoformat()
        existing.label = label
        existing.currency = currency
        txn = existing
    else:
        txn = BankTransaction(
            company_id=current_user.company_id,
            payment_account_id=payload.payment_account_id,
            date=entry_date.isoformat(),
            label=label,
            amount=payload.amount,
            debit=None,
            credit=payload.amount,
            currency=currency,
            category="tresorerie",
            source_type="solde_ouverture",
            status="confirmed",
        )
        db.add(txn)
        db.flush()

    amount_xaf = convert_to_xaf(payload.amount, currency, current_user.company_id, db)
    amount_cents = acc.to_cents(amount_xaf)
    if amount_cents > 0:
        lines = [
            {"code": account_code, "debit": amount_cents, "credit": 0, "label": label},
            {"code": "101", "debit": 0, "credit": amount_cents, "label": "Capital — solde d'ouverture"},
        ]
        acc.post_entry(
            db,
            company_id=current_user.company_id,
            label=label,
            lines=lines,
            source_type="solde_ouverture",
            source_id=txn.id,
            entry_date=entry_date,
            currency="XAF",
            user_id=current_user.id,
        )

    db.commit()
    db.refresh(txn)
    return _serialize_opening_balance(txn)
