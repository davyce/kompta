"""
routes_groups_g2.py — Cotisations, paiements, caisse, dépenses.

Intégration comptable :
  - Validation d'un paiement de cotisation → Dr Trésorerie / Cr 75 (auto via accounting.record_group_contribution)
  - Validation d'une dépense           → Dr 62 Charges / Cr Trésorerie (via accounting.record_group_expense)
Montants exclusivement en centimes (BigInteger) ; l'API reçoit/renvoie des floats.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes_groups import (
    FINANCE_ROLE_NAMES,
    MANAGER_ROLE_NAMES,
    _get_group,
    _group_audit,
    _user_group_roles,
    _company_admin,
)
from app.db.session import get_db
from app.models import (
    Company,
    ContributionPayment,
    ContributionPlan,
    GroupExpense,
    GroupMember,
    GroupTransaction,
    OrganizationGroup,
    User,
)
from app.services import accounting as acc

router = APIRouter(prefix="/groups", tags=["groups-g2"])


# ── Helpers ─────────────────────────────────────────────────────────────────
def _can_finance(db: Session, group: OrganizationGroup, user: User) -> bool:
    return _company_admin(user) or bool(_user_group_roles(db, group, user) & FINANCE_ROLE_NAMES)


def _require_finance(db: Session, group: OrganizationGroup, user: User) -> None:
    if not _can_finance(db, group, user):
        raise HTTPException(status_code=403, detail="Accès finances insuffisant sur ce groupe")


def _to_f(cents: int | None) -> float:
    return acc.from_cents(cents or 0)


def _get_company(db: Session, user: User) -> Company:
    c = db.get(Company, user.company_id)
    if not c:
        raise HTTPException(status_code=404, detail="Société introuvable")
    return c


# ── Schemas ─────────────────────────────────────────────────────────────────
class PlanCreate(BaseModel):
    title: str
    description: str = ""
    amount: float = Field(gt=0)
    currency: str = "XAF"
    frequency: str = "mensuelle"
    due_day: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_mandatory: bool = True
    target_amount: float = 0


class PaymentCreate(BaseModel):
    member_id: int
    plan_id: int
    amount_paid: float = Field(gt=0)
    payment_method: str = "cash"
    payment_date: date | None = None
    due_date: date | None = None
    notes: str = ""


class PaymentValidate(BaseModel):
    # Renommé pour éviter de masquer BaseModel.validate. Alias rétro-compat.
    validation_requested: bool = Field(default=True, alias="validate")

    model_config = {"populate_by_name": True}


class ExpenseCreate(BaseModel):
    title: str
    category: str = ""
    amount: float = Field(gt=0)
    currency: str = "XAF"
    expense_date: date | None = None
    paid_to: str = ""
    payment_method: str = "cash"
    notes: str = ""


# ── Plans de cotisation ─────────────────────────────────────────────────────
@router.post("/{group_id}/contributions/plans", status_code=201)
def create_plan(group_id: int, payload: PlanCreate, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    _require_finance(db, group, current_user)
    plan = ContributionPlan(
        group_id=group.id,
        title=payload.title, description=payload.description,
        amount_cents=acc.to_cents(payload.amount), currency=payload.currency,
        frequency=payload.frequency, due_day=payload.due_day,
        start_date=payload.start_date, end_date=payload.end_date,
        is_mandatory=payload.is_mandatory,
        target_amount_cents=acc.to_cents(payload.target_amount),
        created_by_user_id=current_user.id,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return _ser_plan(plan)


@router.get("/{group_id}/contributions/plans")
def list_plans(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    group = _get_group(db, group_id, current_user)
    plans = db.scalars(select(ContributionPlan).where(ContributionPlan.group_id == group.id).order_by(ContributionPlan.created_at.desc())).all()
    return [_ser_plan(p) for p in plans]


def _ser_plan(p: ContributionPlan) -> dict:
    return {
        "id": p.id, "title": p.title, "frequency": p.frequency,
        "amount": _to_f(p.amount_cents), "currency": p.currency,
        "due_day": p.due_day, "start_date": p.start_date, "end_date": p.end_date,
        "is_mandatory": p.is_mandatory, "status": p.status,
        "target_amount": _to_f(p.target_amount_cents),
    }


# ── Paiements de cotisation ─────────────────────────────────────────────────
@router.post("/{group_id}/contributions/payments", status_code=201)
def record_payment(group_id: int, payload: PaymentCreate, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    if not _can_finance(db, group, current_user) and not _is_own_payment(db, group, payload.member_id, current_user):
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas saisir ce paiement")
    plan = db.get(ContributionPlan, payload.plan_id)
    if not plan or plan.group_id != group.id:
        raise HTTPException(status_code=404, detail="Plan introuvable")
    member = db.get(GroupMember, payload.member_id)
    if not member or member.group_id != group.id:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    paid_c = acc.to_cents(payload.amount_paid)
    due_c = plan.amount_cents
    status = "paid" if paid_c >= due_c else "partial"
    payment = ContributionPayment(
        group_id=group.id, member_id=payload.member_id, plan_id=payload.plan_id,
        amount_due_cents=due_c, amount_paid_cents=paid_c,
        payment_date=payload.payment_date or date.today(),
        due_date=payload.due_date, payment_method=payload.payment_method,
        notes=payload.notes, status=status,
        recorded_by_user_id=current_user.id,
    )
    db.add(payment)
    db.flush()
    # Transaction de caisse automatique
    txn = GroupTransaction(
        group_id=group.id, type="in", category="cotisation",
        amount_cents=paid_c, currency=plan.currency,
        description=f"Cotisation {plan.title} — {member.full_name}",
        transaction_date=payment.payment_date,
        member_id=member.id, contribution_payment_id=payment.id,
        payment_method=payload.payment_method, status="confirmed",
        created_by_user_id=current_user.id,
    )
    db.add(txn)
    db.commit()
    db.refresh(payment)
    return _ser_payment(payment, member.full_name, plan.title)


@router.post("/{group_id}/contributions/payments/{payment_id}/validate", status_code=200)
def validate_payment(group_id: int, payment_id: int, db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)) -> dict:
    """Validation par trésorier : génère l'écriture comptable automatique."""
    group = _get_group(db, group_id, current_user)
    _require_finance(db, group, current_user)
    payment = db.get(ContributionPayment, payment_id)
    if not payment or payment.group_id != group.id:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    if payment.validated_at:
        return _ser_payment(payment)
    payment.validated_by_user_id = current_user.id
    payment.validated_at = datetime.now(timezone.utc)
    # Écriture comptable : Dr Trésorerie / Cr 75 Cotisations
    try:
        company = _get_company(db, current_user)
        entry = acc.record_group_contribution(
            db, company, payment_id=payment.id,
            amount=acc.from_cents(payment.amount_paid_cents),
            payment_method=payment.payment_method, user_id=current_user.id,
        )
        payment.journal_entry_id = entry.id
    except Exception:
        import logging
        logging.getLogger("kompta").exception("Échec écriture comptable cotisation #%s", payment.id)
    _group_audit(db, group.id, current_user, "payment_validated",
                 target_type="payment", target_id=payment.id)
    db.commit()
    db.refresh(payment)
    return _ser_payment(payment)


@router.get("/{group_id}/contributions/payments")
def list_payments(group_id: int, member_id: int | None = None, status: str | None = None,
                  db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    can_see_all = _can_finance(db, group, current_user)
    stmt = select(ContributionPayment).where(ContributionPayment.group_id == group.id)
    if not can_see_all:
        own_member = db.scalar(select(GroupMember).where(GroupMember.group_id == group.id, GroupMember.user_id == current_user.id))
        if own_member:
            stmt = stmt.where(ContributionPayment.member_id == own_member.id)
        else:
            return {"items": [], "stats": {}}
    if member_id:
        stmt = stmt.where(ContributionPayment.member_id == member_id)
    if status:
        stmt = stmt.where(ContributionPayment.status == status)
    payments = db.scalars(stmt.order_by(ContributionPayment.payment_date.desc())).all()
    # Stats caisse
    total_due = sum(p.amount_due_cents for p in payments)
    total_paid = sum(p.amount_paid_cents for p in payments)
    arrears = sum(p.amount_due_cents - p.amount_paid_cents for p in payments if p.status in ("partial", "pending", "late"))
    member_ids = {p.member_id for p in payments}
    members_up = sum(1 for mid in member_ids if any(p.member_id == mid and p.status == "paid" for p in payments))
    return {
        "items": [_ser_payment(p) for p in payments],
        "stats": {
            "total_due": _to_f(total_due),
            "total_paid": _to_f(total_paid),
            "arrears": _to_f(arrears),
            "members_up_to_date": members_up,
            "members_late": len(member_ids) - members_up,
        },
    }


def _is_own_payment(db: Session, group: OrganizationGroup, member_id: int, user: User) -> bool:
    own = db.scalar(select(GroupMember).where(GroupMember.group_id == group.id, GroupMember.user_id == user.id))
    return bool(own and own.id == member_id)


def _ser_payment(p: ContributionPayment, member_name: str = "", plan_title: str = "") -> dict:
    return {
        "id": p.id, "member_id": p.member_id, "member_name": member_name,
        "plan_id": p.plan_id, "plan_title": plan_title,
        "amount_due": _to_f(p.amount_due_cents), "amount_paid": _to_f(p.amount_paid_cents),
        "late_fee": _to_f(p.late_fee_cents),
        "payment_date": p.payment_date, "due_date": p.due_date,
        "payment_method": p.payment_method, "status": p.status,
        "validated_at": p.validated_at, "journal_entry_id": p.journal_entry_id,
    }


# ── Caisse & Transactions ───────────────────────────────────────────────────
@router.get("/{group_id}/transactions")
def list_transactions(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    _require_finance(db, group, current_user)
    txns = db.scalars(select(GroupTransaction).where(GroupTransaction.group_id == group.id)
                      .order_by(GroupTransaction.transaction_date.desc())).all()
    balance = sum(t.amount_cents if t.type == "in" else -t.amount_cents for t in txns if t.status == "confirmed")
    return {
        "balance": _to_f(balance),
        "total_in": _to_f(sum(t.amount_cents for t in txns if t.type == "in" and t.status == "confirmed")),
        "total_out": _to_f(sum(t.amount_cents for t in txns if t.type == "out" and t.status == "confirmed")),
        "items": [_ser_txn(t) for t in txns],
    }


def _ser_txn(t: GroupTransaction) -> dict:
    return {
        "id": t.id, "type": t.type, "category": t.category,
        "amount": _to_f(t.amount_cents), "currency": t.currency,
        "description": t.description, "transaction_date": t.transaction_date,
        "payment_method": t.payment_method, "status": t.status,
    }


# ── Dépenses ─────────────────────────────────────────────────────────────────
@router.post("/{group_id}/expenses", status_code=201)
def create_expense(group_id: int, payload: ExpenseCreate, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    _require_finance(db, group, current_user)
    expense = GroupExpense(
        group_id=group.id, title=payload.title, category=payload.category,
        amount_cents=acc.to_cents(payload.amount), currency=payload.currency,
        expense_date=payload.expense_date or date.today(),
        paid_to=payload.paid_to, payment_method=payload.payment_method,
        notes=payload.notes, status="pending",
        created_by_user_id=current_user.id,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return _ser_expense(expense)


@router.post("/{group_id}/expenses/{expense_id}/approve")
def approve_expense(group_id: int, expense_id: int, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)) -> dict:
    """Approuver + payer → génère écriture comptable Dr 62 / Cr Trésorerie."""
    group = _get_group(db, group_id, current_user)
    _require_finance(db, group, current_user)
    expense = db.get(GroupExpense, expense_id)
    if not expense or expense.group_id != group.id:
        raise HTTPException(status_code=404, detail="Dépense introuvable")
    if expense.status == "paid":
        return _ser_expense(expense)
    expense.status = "paid"
    expense.approved_by_user_id = current_user.id
    expense.approved_at = datetime.now(timezone.utc)
    # Transaction sortie
    txn = GroupTransaction(
        group_id=group.id, type="out", category=expense.category or "dépense",
        amount_cents=expense.amount_cents, currency=expense.currency,
        description=expense.title, transaction_date=expense.expense_date,
        payment_method=expense.payment_method, status="confirmed",
        created_by_user_id=current_user.id,
    )
    db.add(txn)
    db.flush()
    # Écriture comptable automatique
    try:
        company = _get_company(db, current_user)
        entry = acc.record_group_expense(
            db, company, expense_id=expense.id,
            amount=acc.from_cents(expense.amount_cents),
            payment_method=expense.payment_method, user_id=current_user.id,
        )
        expense.journal_entry_id = entry.id
        txn.journal_entry_id = entry.id
    except Exception:
        import logging
        logging.getLogger("kompta").exception("Échec écriture comptable dépense #%s", expense.id)
    _group_audit(db, group.id, current_user, "expense_approved", target_type="expense", target_id=expense.id)
    db.commit()
    db.refresh(expense)
    return _ser_expense(expense)


@router.get("/{group_id}/expenses")
def list_expenses(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    group = _get_group(db, group_id, current_user)
    _require_finance(db, group, current_user)
    expenses = db.scalars(select(GroupExpense).where(GroupExpense.group_id == group.id)
                          .order_by(GroupExpense.expense_date.desc())).all()
    return [_ser_expense(e) for e in expenses]


def _ser_expense(e: GroupExpense) -> dict:
    return {
        "id": e.id, "title": e.title, "category": e.category,
        "amount": _to_f(e.amount_cents), "currency": e.currency,
        "expense_date": e.expense_date, "paid_to": e.paid_to,
        "payment_method": e.payment_method, "status": e.status,
        "approved_at": e.approved_at, "journal_entry_id": e.journal_entry_id,
    }


# ── Dashboard financier du groupe ────────────────────────────────────────────
@router.get("/{group_id}/dashboard/finance")
def finance_dashboard(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    group = _get_group(db, group_id, current_user)
    _require_finance(db, group, current_user)
    txns = db.scalars(select(GroupTransaction).where(GroupTransaction.group_id == group.id, GroupTransaction.status == "confirmed")).all()
    payments = db.scalars(select(ContributionPayment).where(ContributionPayment.group_id == group.id)).all()
    expenses = db.scalars(select(GroupExpense).where(GroupExpense.group_id == group.id, GroupExpense.status == "paid")).all()
    members = db.scalars(select(GroupMember).where(GroupMember.group_id == group.id, GroupMember.is_active == True)).all()  # noqa: E712
    balance = sum(t.amount_cents if t.type == "in" else -t.amount_cents for t in txns)
    total_due = sum(p.amount_due_cents for p in payments)
    total_paid = sum(p.amount_paid_cents for p in payments)
    late = [p for p in payments if p.status in ("partial", "pending", "late")]
    late_member_ids = {p.member_id for p in late}
    return {
        "balance": _to_f(balance),
        "total_contributions_expected": _to_f(total_due),
        "total_contributions_received": _to_f(total_paid),
        "total_expenses": _to_f(sum(e.amount_cents for e in expenses)),
        "members_count": len(members),
        "members_up_to_date": len({p.member_id for p in payments if p.status == "paid"}),
        "members_late": len(late_member_ids),
        "pending_expenses": sum(1 for e in db.scalars(select(GroupExpense).where(GroupExpense.group_id == group.id, GroupExpense.status == "pending")).all()),
    }
