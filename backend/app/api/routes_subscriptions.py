"""routes_subscriptions.py — Abonnements plateforme KOMPTA.

Côté entreprise : voir les plans, payer (carte Stripe / Mobile Money / Zola QR),
appliquer une promo, consulter son statut.
Côté super-admin : gérer plans, promotions, prix, et suspendre/réactiver/forcer
l'abonnement des entreprises EN DIRECT.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models import (
    Company,
    CompanySubscription,
    PaymentTransaction,
    Promotion,
    SubscriptionPlan,
    User,
)
from app.services import payments as pay
from app.services import subscriptions as subs

router = APIRouter(tags=["subscriptions"])
logger = logging.getLogger("kompta.subscriptions")


def _require_super_admin(user: User) -> None:
    if user.role != "super_admin":
        raise HTTPException(403, "Réservé au super-administrateur de la plateforme.")


def _require_company_admin(user: User) -> None:
    if user.role not in {"admin_entreprise", "super_admin"}:
        raise HTTPException(403, "Seul l'administrateur de l'entreprise peut gérer l'abonnement.")


def _get_plan(db: Session, code: str) -> SubscriptionPlan:
    plan = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.code == code))
    if not plan:
        raise HTTPException(404, "Plan introuvable.")
    return plan


# ═══════════════════════════════════════════════════════════════════════════
# CÔTÉ ENTREPRISE
# ═══════════════════════════════════════════════════════════════════════════
@router.get("/subscription/plans")
def list_plans(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    subs.seed_default_plans(db)
    plans = db.scalars(
        select(SubscriptionPlan).where(SubscriptionPlan.is_active == True).order_by(SubscriptionPlan.sort_order)  # noqa: E712
    ).all()
    return [subs.plan_to_dict(p) for p in plans]


@router.get("/subscription/me")
def my_subscription(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    company = db.get(Company, current_user.company_id)
    sub = db.scalar(select(CompanySubscription).where(CompanySubscription.company_id == current_user.company_id))
    status = subs.effective_status(db, company, sub) if company else "none"
    plan = None
    if sub and sub.plan_code:
        p = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.code == sub.plan_code))
        plan = subs.plan_to_dict(p) if p else None
    return {
        "status": status,
        "company_status": company.status if company else "active",
        "plan": plan,
        "plan_code": sub.plan_code if sub else "",
        "current_period_end": sub.current_period_end.isoformat() if sub and sub.current_period_end else None,
        "cancel_at_period_end": sub.cancel_at_period_end if sub else False,
        "applied_promo_code": sub.applied_promo_code if sub else "",
    }


class PromoValidateRequest(BaseModel):
    code: str
    plan_code: str


@router.post("/subscription/promo/validate")
def validate_promo_code(payload: PromoValidateRequest, db: Session = Depends(get_db),
                        current_user: User = Depends(get_current_user)) -> dict:
    plan = _get_plan(db, payload.plan_code)
    promo = subs.validate_promo(db, payload.code, payload.plan_code)
    if not promo:
        return {"valid": False, "percent_off": 0, "final_cents": plan.price_cents, "discount_cents": 0}
    final, discount = subs.compute_price_cents(plan, promo)
    return {
        "valid": True, "code": promo.code, "percent_off": promo.percent_off,
        "discount_cents": discount, "final_cents": final, "description": promo.description,
    }


class CheckoutRequest(BaseModel):
    plan_code: str
    method: str            # card | momo | zola
    promo_code: str = ""
    payer_phone: str = ""  # requis pour momo


@router.post("/subscription/checkout")
async def checkout(payload: CheckoutRequest, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)) -> dict:
    _require_company_admin(current_user)
    plan = _get_plan(db, payload.plan_code)
    if not plan.is_active:
        raise HTTPException(400, "Ce plan n'est plus disponible.")

    promo = subs.validate_promo(db, payload.promo_code, plan.code)
    amount_cents, _discount = subs.compute_price_cents(plan, promo)
    promo_code = promo.code if promo else ""

    # Plan gratuit (0) : activation immédiate sans paiement.
    if amount_cents <= 0:
        sub = subs.activate_after_payment(db, current_user.company_id, plan, promo_code, None)
        return {"status": "active", "free": True, "current_period_end": sub.current_period_end.isoformat()}

    idem = pay.new_reference()
    txn = PaymentTransaction(
        company_id=current_user.company_id,
        provider={"card": "stripe", "momo": "momo", "zola": "zola"}.get(payload.method, payload.method),
        idempotency_key=idem,
        amount_cents=amount_cents,
        currency=plan.currency,
        status="pending",
        purpose="subscription",
        subscription_plan_code=plan.code,
        description=f"Abonnement {plan.name} ({plan.period})",
        customer_phone=payload.payer_phone.strip(),
    )
    db.add(txn)
    db.flush()

    # ── Carte (Stripe) ──────────────────────────────────────────────────────
    if payload.method == "card":
        try:
            intent = await pay.stripe_create_payment_intent(
                amount_cents=amount_cents, currency=plan.currency, idempotency_key=idem,
                description=txn.description,
                metadata={"transaction_id": txn.id, "company_id": current_user.company_id, "purpose": "subscription"},
            )
        except pay.PaymentError as e:
            txn.status = "failed"; txn.failure_reason = e.message[:255]; db.commit()
            raise HTTPException(e.status, e.message)
        txn.provider_ref = intent.get("id", "")
        txn.status = pay.normalize_status("stripe", intent.get("status", ""))
        db.commit()
        return {
            "method": "card", "transaction_id": txn.id,
            "client_secret": intent.get("client_secret"),
            "publishable_key": get_settings().stripe_publishable_key,
        }

    # ── Mobile Money ────────────────────────────────────────────────────────
    if payload.method == "momo":
        if not payload.payer_phone.strip():
            raise HTTPException(400, "Numéro Mobile Money requis.")
        txn.provider_ref = idem
        try:
            await pay.momo_request_to_pay(
                reference_id=idem, amount_cents=amount_cents, currency=plan.currency,
                payer_phone=payload.payer_phone.strip(), external_id=str(txn.id),
                payer_message=txn.description,
            )
        except pay.PaymentError as e:
            txn.status = "failed"; txn.failure_reason = e.message[:255]; db.commit()
            raise HTTPException(e.status, e.message)
        txn.status = "processing"; db.commit()
        return {"method": "momo", "transaction_id": txn.id, "reference": idem, "status": "processing"}

    # ── Zola (QR) ───────────────────────────────────────────────────────────
    # Pas d'API de callback Zola : on émet une référence + un payload QR. Le paiement
    # est confirmé soit par le super-admin (réception constatée), soit via /confirm.
    if payload.method == "zola":
        txn.provider_ref = idem
        txn.status = "processing"
        db.commit()
        qr_payload = json.dumps({
            "provider": "zola", "ref": idem,
            "amount": amount_cents // 100, "currency": plan.currency,
            "company_id": current_user.company_id, "plan": plan.code,
        }, ensure_ascii=False)
        return {
            "method": "zola", "transaction_id": txn.id, "reference": idem,
            "qr_payload": qr_payload, "status": "processing",
            "instructions": f"Payez {amount_cents // 100} {plan.currency} via Zola, "
                            f"puis cliquez « J'ai payé ». Votre paiement sera validé.",
        }

    raise HTTPException(400, "Méthode de paiement inconnue (card | momo | zola).")


@router.post("/subscription/confirm/{txn_id}")
async def confirm_subscription_payment(txn_id: int, db: Session = Depends(get_db),
                                       current_user: User = Depends(get_current_user)) -> dict:
    """Re-vérifie le statut d'un paiement d'abonnement et active si réussi.
    (Stripe/MoMo : statut rafraîchi via le prestataire ; Zola : reste 'processing'
    jusqu'à validation par le super-admin.)"""
    txn = db.get(PaymentTransaction, txn_id)
    if not txn or txn.company_id != current_user.company_id or txn.purpose != "subscription":
        raise HTTPException(404, "Transaction d'abonnement introuvable.")

    # Rafraîchit depuis le prestataire si nécessaire
    if txn.provider == "stripe" and txn.status in {"pending", "processing"} and txn.provider_ref:
        try:
            data = await pay.stripe_retrieve_payment_intent(txn.provider_ref)
            txn.status = pay.normalize_status("stripe", data.get("status", ""))
        except pay.PaymentError:
            pass
    elif txn.provider == "momo" and txn.status == "processing":
        try:
            data = await pay.momo_get_status(txn.provider_ref)
            txn.status = pay.normalize_status("momo", data.get("status", ""))
        except pay.PaymentError:
            pass
    db.commit()

    if txn.status == "succeeded":
        plan = _get_plan(db, txn.subscription_plan_code)
        sub = subs.activate_after_payment(db, txn.company_id, plan, "", txn.id)
        return {"status": "active", "current_period_end": sub.current_period_end.isoformat()}
    return {"status": txn.status, "pending": True}


# ═══════════════════════════════════════════════════════════════════════════
# CÔTÉ SUPER-ADMIN — gestion live des plans, promos, abonnements
# ═══════════════════════════════════════════════════════════════════════════
class PlanUpsert(BaseModel):
    code: str
    name: str
    description: str = ""
    price_cents: int = 0
    currency: str = "XAF"
    period: str = "month"
    features: list[str] = []
    trial_days: int = 0
    is_active: bool = True
    sort_order: int = 0


@router.get("/admin/subscription/plans")
def admin_list_plans(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    _require_super_admin(current_user)
    subs.seed_default_plans(db)
    plans = db.scalars(select(SubscriptionPlan).order_by(SubscriptionPlan.sort_order)).all()
    return [subs.plan_to_dict(p) for p in plans]


@router.post("/admin/subscription/plans")
def admin_create_plan(payload: PlanUpsert, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)) -> dict:
    _require_super_admin(current_user)
    code = payload.code.strip().lower()
    if db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.code == code)):
        raise HTTPException(409, "Un plan avec ce code existe déjà.")
    plan = SubscriptionPlan(
        code=code, name=payload.name, description=payload.description,
        price_cents=max(0, payload.price_cents), currency=payload.currency.upper(),
        period=payload.period if payload.period in {"month", "year"} else "month",
        features=json.dumps(payload.features, ensure_ascii=False),
        trial_days=max(0, payload.trial_days), is_active=payload.is_active, sort_order=payload.sort_order,
    )
    db.add(plan); db.commit(); db.refresh(plan)
    return subs.plan_to_dict(plan)


@router.patch("/admin/subscription/plans/{plan_id}")
def admin_update_plan(plan_id: int, payload: dict, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)) -> dict:
    _require_super_admin(current_user)
    plan = db.get(SubscriptionPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan introuvable.")
    allowed = {"name", "description", "price_cents", "currency", "period", "trial_days", "is_active", "sort_order"}
    for k, v in payload.items():
        if k in allowed:
            setattr(plan, k, v)
    if "features" in payload and isinstance(payload["features"], list):
        plan.features = json.dumps(payload["features"], ensure_ascii=False)
    if plan.price_cents < 0:
        plan.price_cents = 0
    db.commit(); db.refresh(plan)
    return subs.plan_to_dict(plan)


@router.delete("/admin/subscription/plans/{plan_id}")
def admin_delete_plan(plan_id: int, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)) -> dict:
    _require_super_admin(current_user)
    plan = db.get(SubscriptionPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan introuvable.")
    # Si des entreprises l'utilisent, on désactive au lieu de supprimer.
    in_use = db.scalar(select(CompanySubscription).where(CompanySubscription.plan_code == plan.code))
    if in_use:
        plan.is_active = False
        db.commit()
        return {"deleted": False, "deactivated": True, "reason": "Plan utilisé par des entreprises — désactivé."}
    db.delete(plan); db.commit()
    return {"deleted": True}


class PromoUpsert(BaseModel):
    code: str
    description: str = ""
    percent_off: int = 0
    is_active: bool = True
    starts_at: str | None = None
    ends_at: str | None = None
    plan_code: str = ""
    max_redemptions: int = 0


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


@router.get("/admin/subscription/promotions")
def admin_list_promos(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    _require_super_admin(current_user)
    promos = db.scalars(select(Promotion).order_by(Promotion.id.desc())).all()
    return [subs.promo_to_dict(p) for p in promos]


@router.post("/admin/subscription/promotions")
def admin_create_promo(payload: PromoUpsert, db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)) -> dict:
    _require_super_admin(current_user)
    code = payload.code.strip().upper()
    if not code:
        raise HTTPException(400, "Code promo requis.")
    if db.scalar(select(Promotion).where(Promotion.code == code)):
        raise HTTPException(409, "Ce code promo existe déjà.")
    promo = Promotion(
        code=code, description=payload.description,
        percent_off=max(0, min(100, payload.percent_off)), is_active=payload.is_active,
        starts_at=_parse_dt(payload.starts_at), ends_at=_parse_dt(payload.ends_at),
        plan_code=payload.plan_code.strip().lower(), max_redemptions=max(0, payload.max_redemptions),
    )
    db.add(promo); db.commit(); db.refresh(promo)
    return subs.promo_to_dict(promo)


@router.patch("/admin/subscription/promotions/{promo_id}")
def admin_update_promo(promo_id: int, payload: dict, db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)) -> dict:
    _require_super_admin(current_user)
    promo = db.get(Promotion, promo_id)
    if not promo:
        raise HTTPException(404, "Promotion introuvable.")
    if "description" in payload: promo.description = str(payload["description"])
    if "percent_off" in payload: promo.percent_off = max(0, min(100, int(payload["percent_off"])))
    if "is_active" in payload: promo.is_active = bool(payload["is_active"])
    if "plan_code" in payload: promo.plan_code = str(payload["plan_code"]).strip().lower()
    if "max_redemptions" in payload: promo.max_redemptions = max(0, int(payload["max_redemptions"]))
    if "starts_at" in payload: promo.starts_at = _parse_dt(payload["starts_at"])
    if "ends_at" in payload: promo.ends_at = _parse_dt(payload["ends_at"])
    db.commit(); db.refresh(promo)
    return subs.promo_to_dict(promo)


@router.delete("/admin/subscription/promotions/{promo_id}")
def admin_delete_promo(promo_id: int, db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)) -> dict:
    _require_super_admin(current_user)
    promo = db.get(Promotion, promo_id)
    if not promo:
        raise HTTPException(404, "Promotion introuvable.")
    db.delete(promo); db.commit()
    return {"deleted": True}


@router.get("/admin/subscription/companies")
def admin_list_company_subs(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[dict]:
    """Toutes les entreprises avec leur statut d'abonnement (vue live super-admin)."""
    _require_super_admin(current_user)
    companies = db.scalars(select(Company).order_by(Company.id)).all()
    out = []
    for c in companies:
        sub = db.scalar(select(CompanySubscription).where(CompanySubscription.company_id == c.id))
        status = subs.effective_status(db, c, sub)
        out.append({
            "company_id": c.id, "company_name": c.name, "company_status": c.status,
            "status": status, "plan_code": sub.plan_code if sub else "",
            "current_period_end": sub.current_period_end.isoformat() if sub and sub.current_period_end else None,
        })
    return out


@router.post("/admin/subscription/companies/{company_id}/suspend")
def admin_suspend(company_id: int, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)) -> dict:
    _require_super_admin(current_user)
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(404, "Entreprise introuvable.")
    if company_id == current_user.company_id:
        raise HTTPException(400, "Vous ne pouvez pas suspendre la plateforme elle-même.")
    company.status = "suspended"
    sub = subs.get_or_create_subscription(db, company_id)
    sub.status = "suspended"
    db.commit()
    return {"company_id": company_id, "company_status": "suspended"}


@router.post("/admin/subscription/companies/{company_id}/reactivate")
def admin_reactivate(company_id: int, db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)) -> dict:
    _require_super_admin(current_user)
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(404, "Entreprise introuvable.")
    company.status = "active"
    sub = db.scalar(select(CompanySubscription).where(CompanySubscription.company_id == company_id))
    if sub and sub.status == "suspended":
        sub.status = "active" if (sub.current_period_end and subs._aware(sub.current_period_end) > subs._now()) else "past_due"
    db.commit()
    return {"company_id": company_id, "company_status": "active"}


class GrantRequest(BaseModel):
    plan_code: str
    days: int = 30


@router.post("/admin/subscription/companies/{company_id}/grant")
def admin_grant(company_id: int, payload: GrantRequest, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)) -> dict:
    """Octroie/force un abonnement à une entreprise (offert ou paiement hors-ligne/Zola)."""
    _require_super_admin(current_user)
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(404, "Entreprise introuvable.")
    plan = _get_plan(db, payload.plan_code)
    sub = subs.get_or_create_subscription(db, company_id)
    now = subs._now()
    base = now
    if sub.current_period_end and subs._aware(sub.current_period_end) > now and sub.plan_code == plan.code:
        base = subs._aware(sub.current_period_end)
    sub.plan_code = plan.code
    sub.status = "active"
    sub.started_at = sub.started_at or now
    sub.current_period_end = base + timedelta(days=max(1, payload.days))
    if company.status == "suspended":
        company.status = "active"
    db.commit()
    return {"company_id": company_id, "status": "active",
            "current_period_end": sub.current_period_end.isoformat()}
