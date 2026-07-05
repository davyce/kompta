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

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Company,
    CompanySubscription,
    Promotion,
    SubscriptionPlan,
    User,
)

# Statuts qui donnent un accès complet à l'app
ACTIVE_STATUSES = {"trialing", "active"}

# Essai gratuit complet à l'inscription
TRIAL_DAYS = 90
# Avertissement souple à partir de J-30 avant la fin d'essai
SOFT_WARNING_DAYS = 30


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Modules premium gateables (le reste = modules « cœur », toujours accessibles)
# Clés alignées sur la navigation / CompanyModule.
PREMIUM_MODULES = [
    "payroll", "rh", "employees", "accounting", "declarations", "fiscal",
    "assistants", "limule", "projects", "kanban", "meetings", "chat",
    "reports", "reports-teras", "teras", "investments", "groups",
]
PRO_MODULES = [
    "payroll", "rh", "employees", "accounting", "declarations", "fiscal",
    "assistants", "limule", "projects", "kanban", "meetings", "chat",
    "reports", "investments", "groups",
]
BUSINESS_MODULES = PRO_MODULES + ["reports-teras", "teras"]

# ── Plans par défaut (seedés au démarrage si la table est vide) ──────────────
DEFAULT_PLANS = [
    {
        "code": "starter", "name": "Starter", "price_cents": 0, "currency": "XAF",
        "period": "month", "trial_days": 0, "sort_order": 0,
        "description": "Pour démarrer : POS, facturation, 2 utilisateurs.",
        "features": ["POS / Caisse", "Facturation TVA", "2 utilisateurs", "Support communautaire"],
        "included_modules": [], "max_users": 2,
    },
    {
        "code": "pro", "name": "Pro", "price_cents": 1_500_000, "currency": "XAF",
        "period": "month", "trial_days": 14, "sort_order": 1,
        "description": "Pour les PME en croissance : paie, comptabilité, IA Limule.",
        "features": ["Tout Starter", "Paie CNSS/IRPP", "Comptabilité SYSCOHADA", "IA Limule", "Groupes & Organisations", "10 utilisateurs"],
        "included_modules": PRO_MODULES, "max_users": 10,
    },
    {
        "code": "business", "name": "Business", "price_cents": 4_000_000, "currency": "XAF",
        "period": "month", "trial_days": 14, "sort_order": 2,
        "description": "Pour les structures établies : groupes, TERAS, utilisateurs illimités.",
        "features": ["Tout Pro", "Groupes & Organisations", "TERAS Connect", "Utilisateurs illimités", "Support prioritaire"],
        "included_modules": BUSINESS_MODULES, "max_users": 0,
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
            included_modules=json.dumps(p.get("included_modules", []), ensure_ascii=False),
            max_users=p.get("max_users", 0),
        ))
    db.commit()


def plan_to_dict(plan: SubscriptionPlan) -> dict:
    try:
        features = json.loads(plan.features) if plan.features else []
    except Exception:
        features = []
    try:
        included_modules = json.loads(plan.included_modules) if plan.included_modules else []
    except Exception:
        included_modules = []
    return {
        "id": plan.id, "code": plan.code, "name": plan.name, "description": plan.description,
        "price_cents": plan.price_cents, "currency": plan.currency, "period": plan.period,
        "features": features, "trial_days": plan.trial_days,
        "included_modules": included_modules, "max_users": plan.max_users,
        "is_active": plan.is_active, "sort_order": plan.sort_order,
        "apple_product_id": plan.apple_product_id,
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


def mark_subscription_ended(db: Session, company_id: int, status: str = "cancelled") -> CompanySubscription:
    """Marque l'abonnement comme terminé suite à une notification externe
    (ex. Apple : EXPIRED / REFUND / DID_FAIL_TO_RENEW). N'affecte pas
    `Company.status` (une suspension manuelle reste distincte) : l'accès
    redevient simplement soumis à `effective_status` (past_due/cancelled)."""
    sub = get_or_create_subscription(db, company_id)
    sub.status = status
    db.commit()
    return sub


# ═══════════════════════════════════════════════════════════════════════════
# ESSAI GRATUIT + ENTITLEMENTS (accès par plan)
# ═══════════════════════════════════════════════════════════════════════════
def start_trial(db: Session, company_id: int, days: int = TRIAL_DAYS) -> CompanySubscription:
    """Démarre un essai gratuit complet (accès total) pour une nouvelle entreprise."""
    sub = get_or_create_subscription(db, company_id)
    now = _now()
    sub.status = "trialing"
    sub.plan_code = ""               # essai = pas de plan payant encore
    sub.started_at = sub.started_at or now
    sub.current_period_end = now + timedelta(days=days)
    sub.cancel_at_period_end = False
    db.flush()
    return sub


def is_premium_module(module_key: str) -> bool:
    return module_key in set(PREMIUM_MODULES)


def company_entitlements(db: Session, company_id: int) -> dict:
    """Droits d'accès effectifs d'une entreprise.

    - Essai en cours → accès complet (allowed_modules=None), users illimités.
    - Abonnement actif → modules du plan + max_users du plan.
    - Sinon (essai expiré / pas de plan / suspendu) → cœur seulement, verrouillé.
    `allowed_modules=None` signifie « tous les modules ». Une liste = modules
    premium autorisés (les modules cœur sont toujours accessibles)."""
    company = db.get(Company, company_id)
    sub = db.scalar(select(CompanySubscription).where(CompanySubscription.company_id == company_id))
    eff = effective_status(db, company, sub) if company else "none"
    now = _now()
    period_end = _aware(sub.current_period_end) if (sub and sub.current_period_end) else None
    days_left = max(0, (period_end - now).days) if period_end else 0

    is_trial = bool(sub and sub.status == "trialing" and eff == "trialing")
    if is_trial:
        return {
            "status": "trialing", "plan_code": "", "trialing": True,
            "trial_days_left": days_left, "soft_warning": days_left <= SOFT_WARNING_DAYS,
            "period_end": period_end.isoformat() if period_end else None,
            "allowed_modules": None, "max_users": 0, "locked": False,
        }

    if eff in ACTIVE_STATUSES and sub and sub.plan_code:
        plan = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.code == sub.plan_code))
        mods: list[str] = []
        max_u = 0
        if plan:
            try:
                mods = json.loads(plan.included_modules) if plan.included_modules else []
            except Exception:
                mods = []
            max_u = plan.max_users
        return {
            "status": eff, "plan_code": sub.plan_code, "trialing": False,
            "trial_days_left": 0, "soft_warning": False,
            "period_end": period_end.isoformat() if period_end else None,
            "allowed_modules": mods, "max_users": max_u, "locked": False,
        }

    # Essai expiré / aucun plan / suspendu → cœur seulement
    return {
        "status": eff, "plan_code": (sub.plan_code if sub else ""), "trialing": False,
        "trial_days_left": 0, "soft_warning": False,
        "period_end": period_end.isoformat() if period_end else None,
        "allowed_modules": [], "max_users": 1, "locked": True,
    }


def module_allowed(entitlements: dict, module_key: str) -> bool:
    allowed = entitlements.get("allowed_modules")
    if allowed is None:               # essai → tout
        return True
    if not is_premium_module(module_key):
        return True                   # module cœur → toujours
    return module_key in allowed


def active_user_count(db: Session, company_id: int) -> int:
    return db.scalar(
        select(func.count()).select_from(User).where(
            User.company_id == company_id, User.is_active == True  # noqa: E712
        )
    ) or 0


def can_add_user(db: Session, company_id: int) -> bool:
    ent = company_entitlements(db, company_id)
    if ent["max_users"] == 0:         # illimité (essai ou plan Business)
        return True
    return active_user_count(db, company_id) < ent["max_users"]
