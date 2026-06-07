"""subscriptions.py — Logique métier des abonnements plateforme KOMPTA.

- Plans tarifaires gérés par le super-admin.
- Promotions (codes %).
- Abonnement par entreprise : statut, période, activation après paiement.
- Le super-admin peut suspendre une entreprise (Company.status = "suspended"),
  ce qui bloque l'accès via le middleware d'enforcement.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Company,
    CompanySubscription,
    Promotion,
    SubscriptionPlan,
)

# Statuts qui donnent un accès complet à l'app
ACTIVE_STATUSES = {"trialing", "active"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Plans par défaut (seedés au démarrage si la table est vide) ──────────────
DEFAULT_PLANS = [
    {
        "code": "starter", "name": "Starter", "price_cents": 0, "currency": "XAF",
        "period": "month", "trial_days": 0, "sort_order": 0,
        "description": "Pour démarrer : POS, facturation, 2 utilisateurs.",
        "features": ["POS / Caisse", "Facturation TVA", "2 utilisateurs", "Support communautaire"],
    },
    {
        "code": "pro", "name": "Pro", "price_cents": 1_500_000, "currency": "XAF",
        "period": "month", "trial_days": 14, "sort_order": 1,
        "description": "Pour les PME en croissance : paie, comptabilité, IA Limule.",
        "features": ["Tout Starter", "Paie CNSS/IRPP", "Comptabilité SYSCOHADA", "IA Limule", "Groupes & Organisations", "10 utilisateurs"],
    },
    {
        "code": "business", "name": "Business", "price_cents": 4_000_000, "currency": "XAF",
        "period": "month", "trial_days": 14, "sort_order": 2,
        "description": "Pour les structures établies : groupes, TERAS, utilisateurs illimités.",
        "features": ["Tout Pro", "Groupes & Organisations", "TERAS Connect", "Utilisateurs illimités", "Support prioritaire"],
    },
]


def seed_default_plans(db: Session) -> None:
    """Crée les plans par défaut si aucun plan n'existe (idempotent)."""
    if db.scalar(select(SubscriptionPlan).limit(1)):
        return
    for p in DEFAULT_PLANS:
        db.add(SubscriptionPlan(
            code=p["code"], name=p["name"], description=p["description"],
            price_cents=p["price_cents"], currency=p["currency"], period=p["period"],
            trial_days=p["trial_days"], sort_order=p["sort_order"],
            features=json.dumps(p["features"], ensure_ascii=False), is_active=True,
        ))
    db.commit()


def plan_to_dict(plan: SubscriptionPlan) -> dict:
    try:
        features = json.loads(plan.features) if plan.features else []
    except Exception:
        features = []
    return {
        "id": plan.id, "code": plan.code, "name": plan.name, "description": plan.description,
        "price_cents": plan.price_cents, "currency": plan.currency, "period": plan.period,
        "features": features, "trial_days": plan.trial_days,
        "is_active": plan.is_active, "sort_order": plan.sort_order,
    }


def promo_to_dict(promo: Promotion) -> dict:
    return {
        "id": promo.id, "code": promo.code, "description": promo.description,
        "percent_off": promo.percent_off, "is_active": promo.is_active,
        "starts_at": promo.starts_at.isoformat() if promo.starts_at else None,
        "ends_at": promo.ends_at.isoformat() if promo.ends_at else None,
        "plan_code": promo.plan_code, "max_redemptions": promo.max_redemptions,
        "times_redeemed": promo.times_redeemed,
    }


def validate_promo(db: Session, code: str, plan_code: str) -> Promotion | None:
    """Retourne la promotion si elle est valide pour ce plan, sinon None."""
    if not code:
        return None
    promo = db.scalar(select(Promotion).where(Promotion.code == code.strip().upper()))
    if not promo or not promo.is_active:
        return None
    now = _now()
    if promo.starts_at and _aware(promo.starts_at) > now:
        return None
    if promo.ends_at and _aware(promo.ends_at) < now:
        return None
    if promo.plan_code and promo.plan_code != plan_code:
        return None
    if promo.max_redemptions and promo.times_redeemed >= promo.max_redemptions:
        return None
    return promo


def _aware(dt: datetime) -> datetime:
    """SQLite renvoie des datetimes naïfs : on les considère en UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def compute_price_cents(plan: SubscriptionPlan, promo: Promotion | None) -> tuple[int, int]:
    """Retourne (prix_final_cents, remise_cents)."""
    base = max(0, int(plan.price_cents or 0))
    if not promo or promo.percent_off <= 0:
        return base, 0
    discount = base * min(100, promo.percent_off) // 100
    return base - discount, discount


def get_or_create_subscription(db: Session, company_id: int) -> CompanySubscription:
    sub = db.scalar(select(CompanySubscription).where(CompanySubscription.company_id == company_id))
    if not sub:
        sub = CompanySubscription(company_id=company_id, status="none")
        db.add(sub)
        db.flush()
    return sub


def effective_status(db: Session, company: Company, sub: CompanySubscription | None) -> str:
    """Statut effectif d'accès, en tenant compte de l'expiration de période.

    Priorité : suspension manuelle (Company.status) > expiration de période > statut stocké.
    """
    if company.status == "suspended":
        return "suspended"
    if sub is None or sub.status == "none":
        return "none"
    if sub.status in ACTIVE_STATUSES and sub.current_period_end:
        if _aware(sub.current_period_end) < _now():
            return "past_due"
    return sub.status


def activate_after_payment(db: Session, company_id: int, plan: SubscriptionPlan,
                           promo_code: str = "", payment_id: int | None = None) -> CompanySubscription:
    """Active/prolonge l'abonnement après un paiement réussi."""
    sub = get_or_create_subscription(db, company_id)
    now = _now()
    # Si la période court encore, on l'étend ; sinon on repart de maintenant.
    base = now
    if sub.current_period_end and _aware(sub.current_period_end) > now and sub.plan_code == plan.code:
        base = _aware(sub.current_period_end)
    delta = timedelta(days=365) if plan.period == "year" else timedelta(days=30)
    sub.plan_code = plan.code
    sub.status = "active"
    sub.started_at = sub.started_at or now
    sub.current_period_end = base + delta
    sub.cancel_at_period_end = False
    sub.applied_promo_code = promo_code or ""
    if payment_id:
        sub.last_payment_id = payment_id
    # Réactive l'entreprise si elle était suspendue
    company = db.get(Company, company_id)
    if company and company.status == "suspended":
        company.status = "active"
    # Incrémente le compteur de promo
    if promo_code:
        promo = db.scalar(select(Promotion).where(Promotion.code == promo_code))
        if promo:
            promo.times_redeemed = (promo.times_redeemed or 0) + 1
    db.commit()
    return sub
