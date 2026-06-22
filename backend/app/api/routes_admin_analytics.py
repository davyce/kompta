"""
routes_admin_analytics.py
--------------------------
Routes super-admin pour :
  - Analytics plateforme
  - Activity feed
  - Broadcast notifications
  - Impersonation
  - Reset password admin
  - Suspend / activer une entreprise
  - Feature flags
  - Health check système
  - Statistiques d'onboarding
"""

import os
import secrets
import string
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.security import create_access_token, hash_password
from app.db.session import get_db
from app.services.email import (
    send_broadcast_email,
    send_reset_password_email,
    send_test_email,
)
from app.services.readiness import build_production_preflight
from app.models import (
    AuditLog,
    BroadcastLog,
    Company,
    CompanyDocument,
    Employee,
    FeatureFlag,
    Invoice,
    Sale,
    TerasScoreSnapshot,
    User,
)

router = APIRouter(tags=["admin-analytics"])


# ─────────────────────────────────────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────────────────────────────────────

def _require_super_admin(current_user: User) -> None:
    if current_user.role != "super_admin" and not (current_user.custom_role and current_user.custom_role.scope == "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super-admin access required")


# ─────────────────────────────────────────────────────────────────────────────
# 1. ANALYTICS PLATEFORME
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/admin/analytics/platform")
def platform_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_super_admin(current_user)

    now = datetime.now(tz=timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Totaux simples
    companies_total: int = db.scalar(select(func.count(Company.id))) or 0
    users_total: int = db.scalar(select(func.count(User.id))) or 0
    new_companies_this_month: int = (
        db.scalar(
            select(func.count(Company.id)).where(Company.created_at >= first_of_month)
        )
        or 0
    )
    new_users_this_month: int = (
        db.scalar(
            select(func.count(User.id)).where(User.created_at >= first_of_month)
        )
        or 0
    )

    # Entreprises actives (au moins une invoice ou sale dans les 30 derniers jours)
    active_company_ids_invoices = db.scalars(
        select(Invoice.company_id)
        .where(Invoice.created_at >= thirty_days_ago)
        .distinct()
    ).all()
    active_company_ids_sales = db.scalars(
        select(Sale.company_id)
        .where(Sale.created_at >= thirty_days_ago)
        .distinct()
    ).all()
    companies_active_30d = len(set(active_company_ids_invoices) | set(active_company_ids_sales))

    # Revenus plateforme
    total_revenue_platform: float = (
        db.scalar(
            select(func.sum(Invoice.total_amount)).where(Invoice.status == "paid")
        )
        or 0.0
    )
    total_sales_platform: float = (
        db.scalar(select(func.sum(Sale.total_amount))) or 0.0
    )

    # Score TERAS moyen (depuis les snapshots)
    avg_teras_score: float = (
        db.scalar(select(func.avg(TerasScoreSnapshot.score))) or 0.0
    )

    # Répartition par industrie
    industry_rows = db.execute(
        select(Company.industry, func.count(Company.id).label("count"))
        .group_by(Company.industry)
        .order_by(func.count(Company.id).desc())
    ).all()
    companies_by_industry = [{"industry": row.industry, "count": row.count} for row in industry_rows]

    # Répartition par pays
    country_rows = db.execute(
        select(Company.country, func.count(Company.id).label("count"))
        .group_by(Company.country)
        .order_by(func.count(Company.id).desc())
    ).all()
    companies_by_country = [{"country": row.country, "count": row.count} for row in country_rows]

    # Croissance mensuelle (12 derniers mois)
    monthly_growth = []
    for i in range(11, -1, -1):
        month_start = (now.replace(day=1) - timedelta(days=i * 30)).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        if i == 0:
            month_end = now
        else:
            next_month = (month_start + timedelta(days=32)).replace(day=1)
            month_end = next_month

        c_count = db.scalar(
            select(func.count(Company.id)).where(
                Company.created_at >= month_start,
                Company.created_at < month_end,
            )
        ) or 0
        u_count = db.scalar(
            select(func.count(User.id)).where(
                User.created_at >= month_start,
                User.created_at < month_end,
            )
        ) or 0
        rev = db.scalar(
            select(func.sum(Invoice.total_amount)).where(
                Invoice.status == "paid",
                Invoice.created_at >= month_start,
                Invoice.created_at < month_end,
            )
        ) or 0.0

        monthly_growth.append({
            "month": month_start.strftime("%b %Y"),
            "companies": c_count,
            "users": u_count,
            "revenue": rev,
        })

    return {
        "companies_total": companies_total,
        "companies_active_30d": companies_active_30d,
        "users_total": users_total,
        "new_companies_this_month": new_companies_this_month,
        "new_users_this_month": new_users_this_month,
        "total_revenue_platform": total_revenue_platform,
        "total_sales_platform": total_sales_platform,
        "avg_teras_score": round(avg_teras_score, 1),
        "companies_by_industry": companies_by_industry,
        "companies_by_country": companies_by_country,
        "monthly_growth": monthly_growth,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. ACTIVITY FEED
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/admin/analytics/activity-feed")
def activity_feed(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_super_admin(current_user)

    events: list[dict] = []

    # Invoices
    invoices = db.execute(
        select(Invoice, Company.name.label("company_name"))
        .join(Company, Invoice.company_id == Company.id)
        .order_by(Invoice.created_at.desc())
        .limit(50)
    ).all()
    for inv, company_name in invoices:
        events.append({
            "id": inv.id,
            "type": "invoice_created",
            "company_name": company_name,
            "user_name": inv.customer_name,
            "amount": inv.total_amount,
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
        })

    # Sales
    sales = db.execute(
        select(Sale, Company.name.label("company_name"))
        .join(Company, Sale.company_id == Company.id)
        .order_by(Sale.created_at.desc())
        .limit(50)
    ).all()
    for sale, company_name in sales:
        events.append({
            "id": sale.id,
            "type": "sale_created",
            "company_name": company_name,
            "user_name": None,
            "amount": sale.total_amount,
            "created_at": sale.created_at.isoformat() if sale.created_at else None,
        })

    # Users
    users = db.execute(
        select(User, Company.name.label("company_name"))
        .join(Company, User.company_id == Company.id)
        .order_by(User.created_at.desc())
        .limit(50)
    ).all()
    for user, company_name in users:
        events.append({
            "id": user.id,
            "type": "user_created",
            "company_name": company_name,
            "user_name": user.full_name,
            "amount": None,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        })

    # Companies
    companies = db.scalars(select(Company).order_by(Company.created_at.desc()).limit(50)).all()
    for company in companies:
        events.append({
            "id": company.id,
            "type": "company_created",
            "company_name": company.name,
            "user_name": None,
            "amount": None,
            "created_at": company.created_at.isoformat() if company.created_at else None,
        })

    # Trier par created_at DESC et retourner les 50 premiers
    events.sort(key=lambda e: e["created_at"] or "", reverse=True)
    return events[:50]


# ─────────────────────────────────────────────────────────────────────────────
# 3. BROADCAST NOTIFICATIONS
# ─────────────────────────────────────────────────────────────────────────────

class BroadcastPayload(BaseModel):
    title: str
    message: str
    type: str = "info"   # info | warning | critical
    target: str = "all"  # all | company_id:123
    # Le frontend envoie historiquement `target_company_id` ; on l'accepte aussi
    # et il prime sur `target` quand il est fourni (corrige la sélection ignorée).
    target_company_id: int | None = None


@router.post("/admin/broadcast")
def broadcast_notification(
    payload: BroadcastPayload,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_super_admin(current_user)

    # Cible : `target_company_id` (frontend) prime, sinon on lit `target`.
    target = payload.target
    if payload.target_company_id is not None:
        target = f"company_id:{payload.target_company_id}"

    # Déterminer les entreprises ciblées
    if target == "all":
        target_company_ids = list(db.scalars(select(Company.id)).all())
    elif target.startswith("company_id:"):
        try:
            cid = int(target.split(":")[1])
        except (IndexError, ValueError):
            raise HTTPException(status_code=400, detail="Format target invalide. Utiliser 'all' ou 'company_id:123'")
        company = db.get(Company, cid)
        if not company:
            raise HTTPException(status_code=404, detail="Entreprise introuvable")
        target_company_ids = [cid]
    else:
        raise HTTPException(status_code=400, detail="Format target invalide. Utiliser 'all' ou 'company_id:123'")

    # Récupérer les utilisateurs actifs ciblés (max 100 pour éviter timeout)
    target_users = db.scalars(
        select(User).where(
            User.company_id.in_(target_company_ids),
            User.is_active == True,
        ).limit(100)
    ).all()
    sent_count = len(target_users)

    log = BroadcastLog(
        title=payload.title,
        message=payload.message,
        type=payload.type,
        target=target,
        sent_count=sent_count,
        sent_by_user_id=current_user.id,
    )
    db.add(log)

    # Audit
    db.add(AuditLog(
        user_id=current_user.id,
        user_name=current_user.full_name,
        action="create",
        resource_type="broadcast",
        resource_id=None,
        details=f"Broadcast '{payload.title}' envoyé à {sent_count} utilisateurs (target={target})",
        company_id=current_user.company_id,
    ))
    db.commit()

    # Notification in-app temps réel : push WebSocket à chaque entreprise ciblée
    # (les clients connectés — web/iOS/macOS — l'affichent immédiatement). La
    # persistance reste assurée par BroadcastLog, relue via GET /notifications
    # pour les utilisateurs hors-ligne au moment de l'envoi.
    background_tasks.add_task(
        _push_broadcast_realtime, list(target_company_ids),
        payload.title, payload.message, payload.type,
    )

    # Envoi emails en arrière-plan
    for user in target_users:
        if user.email:
            background_tasks.add_task(
                send_broadcast_email,
                to=user.email,
                full_name=user.full_name,
                title=payload.title,
                message=payload.message,
                msg_type=payload.type,
            )

    return {"sent_to": sent_count, "user_count": sent_count, "message": "Broadcast envoyé"}


async def _push_broadcast_realtime(company_ids: list[int], title: str, message: str, msg_type: str) -> None:
    """Pousse le broadcast en temps réel via le ConnectionManager des notifications."""
    from app.api.routes import notifier
    # `business_alert` + `severity` est le format que les clients web mappent en
    # ton (critical→error, warning→warning, info→info).
    severity = msg_type if msg_type in {"critical", "warning", "info"} else "info"
    for cid in company_ids:
        try:
            await notifier.broadcast(cid, {
                "type": "business_alert", "severity": severity,
                "title": title, "detail": message, "count": 1,
                "source": "broadcast",
            })
        except Exception:
            pass


# ─────────────────────────────────────────────────────────────────────────────
# 4. IMPERSONATION
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/admin/impersonate/{user_id}")
def impersonate_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_super_admin(current_user)

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    # Token valide 24h
    token = create_access_token(
        str(target.id),
        {
            "role": target.role,
            "company_id": target.company_id,
            "impersonated_by": current_user.id,
            "exp": int(time.time()) + 24 * 3600,
        },
    )

    # Audit
    db.add(AuditLog(
        user_id=current_user.id,
        user_name=current_user.full_name,
        action="impersonate",
        resource_type="user",
        resource_id=target.id,
        details=f"Super-admin {current_user.email} a impersonné {target.email}",
        company_id=current_user.company_id,
    ))
    db.commit()

    return {"token": token, "user_id": target.id, "user_email": target.email}


# ─────────────────────────────────────────────────────────────────────────────
# 5. RESET PASSWORD ADMIN
# ─────────────────────────────────────────────────────────────────────────────

def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


@router.post("/admin/users/{user_id}/reset-password")
def admin_reset_password(
    user_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_super_admin(current_user)

    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    temp_password = _generate_temp_password()
    target.password_hash = hash_password(temp_password)
    target.must_change_password = True
    target.token_version = int(target.token_version or 0) + 1

    db.add(AuditLog(
        user_id=current_user.id,
        user_name=current_user.full_name,
        action="update",
        resource_type="user",
        resource_id=target.id,
        details=f"Mot de passe réinitialisé par super-admin pour {target.email}",
        company_id=current_user.company_id,
    ))
    db.commit()

    # Envoi email en arrière-plan
    company = db.get(Company, target.company_id) if target.company_id else None
    company_name = company.name if company else "KOMPTA"
    background_tasks.add_task(
        send_reset_password_email,
        to=target.email,
        full_name=target.full_name,
        temp_password=temp_password,
        company_name=company_name,
    )

    return {
        "temp_password": temp_password,
        "user_id": target.id,
        "must_change_password": True,
        "message": "Mot de passe temporaire généré. L'utilisateur devra créer un nouveau mot de passe à la prochaine connexion.",
    }


# ─────────────────────────────────────────────────────────────────────────────
# 6. SUSPEND / ACTIVATE COMPANY
# ─────────────────────────────────────────────────────────────────────────────

class CompanyStatusUpdate(BaseModel):
    status: str  # active | suspended


@router.patch("/admin/companies/{company_id}/status")
def update_company_status(
    company_id: int,
    payload: CompanyStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_super_admin(current_user)

    if payload.status not in {"active", "suspended"}:
        raise HTTPException(status_code=400, detail="Statut invalide. Valeurs acceptées: active | suspended")

    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Entreprise introuvable")

    company.status = payload.status  # type: ignore[assignment]

    db.add(AuditLog(
        user_id=current_user.id,
        user_name=current_user.full_name,
        action="update",
        resource_type="company",
        resource_id=company.id,
        details=f"Statut entreprise '{company.name}' changé à '{payload.status}'",
        company_id=current_user.company_id,
    ))
    db.commit()
    db.refresh(company)

    return {
        "id": company.id,
        "name": company.name,
        "status": company.status,
        "industry": company.industry,
        "country": company.country,
        "updated_at": company.updated_at.isoformat() if company.updated_at else None,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 7. FEATURE FLAGS
# ─────────────────────────────────────────────────────────────────────────────

class FeatureFlagCreate(BaseModel):
    key: str
    value: str = ""
    description: str = ""
    enabled: bool = True


class FeatureFlagUpdate(BaseModel):
    value: str | None = None
    description: str | None = None
    enabled: bool | None = None


def _flag_to_dict(flag: FeatureFlag) -> dict:
    return {
        "id": flag.id,
        "key": flag.key,
        "value": flag.value,
        "description": flag.description,
        "enabled": flag.enabled,
        "created_at": flag.created_at.isoformat() if flag.created_at else None,
        "updated_at": flag.updated_at.isoformat() if flag.updated_at else None,
    }


@router.get("/admin/system/flags")
def list_feature_flags(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_super_admin(current_user)
    flags = db.scalars(select(FeatureFlag).order_by(FeatureFlag.key)).all()
    return [_flag_to_dict(f) for f in flags]


@router.post("/admin/system/flags")
def create_feature_flag(
    payload: FeatureFlagCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_super_admin(current_user)

    existing = db.scalar(select(FeatureFlag).where(FeatureFlag.key == payload.key))
    if existing:
        raise HTTPException(status_code=409, detail=f"Un flag avec la clé '{payload.key}' existe déjà")

    flag = FeatureFlag(
        key=payload.key,
        value=payload.value,
        description=payload.description,
        enabled=payload.enabled,
    )
    db.add(flag)
    db.commit()
    db.refresh(flag)
    return _flag_to_dict(flag)


@router.patch("/admin/system/flags/{key}")
def update_feature_flag(
    key: str,
    payload: FeatureFlagUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_super_admin(current_user)

    flag = db.scalar(select(FeatureFlag).where(FeatureFlag.key == key))
    if not flag:
        raise HTTPException(status_code=404, detail="Flag introuvable")

    if payload.value is not None:
        flag.value = payload.value
    if payload.description is not None:
        flag.description = payload.description
    if payload.enabled is not None:
        flag.enabled = payload.enabled

    db.commit()
    db.refresh(flag)
    return _flag_to_dict(flag)


@router.delete("/admin/system/flags/{key}")
def delete_feature_flag(
    key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_super_admin(current_user)

    flag = db.scalar(select(FeatureFlag).where(FeatureFlag.key == key))
    if not flag:
        raise HTTPException(status_code=404, detail="Flag introuvable")

    db.delete(flag)
    db.commit()
    return {"deleted": True, "key": key}


# ─────────────────────────────────────────────────────────────────────────────
# 8. HEALTH CHECK
# ─────────────────────────────────────────────────────────────────────────────

_START_TIME = time.time()


@router.get("/admin/system/health")
def system_health(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_super_admin(current_user)

    from app.core.config import get_settings
    settings = get_settings()

    services: list = []

    # Database
    try:
        t0 = time.monotonic()
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
        latency_ms = round((time.monotonic() - t0) * 1000, 2)
        services.append({"name": "database", "status": "healthy", "latency_ms": latency_ms, "last_check": None})
    except Exception as exc:
        services.append({"name": "database", "status": "down", "latency_ms": None, "last_check": None, "error": str(exc)})

    # Limule / AI provider
    ai_key = settings.deepseek_api_key or settings.openai_api_key
    if ai_key:
        services.append({"name": "limule", "status": "healthy", "latency_ms": None, "last_check": None})
    else:
        # Clé absente → non configuré (pas une panne, juste non activé)
        services.append({"name": "limule", "status": "not_configured", "latency_ms": None, "last_check": None,
                         "note": "Aucune clé API IA configurée"})

    # Payments — distinction configuré/test/live
    if settings.stripe_enabled:
        is_live = settings.stripe_secret_key.startswith("sk_live_")
        stripe_status = "healthy" if is_live else "test_mode"
        services.append({"name": "stripe", "status": stripe_status, "latency_ms": None, "last_check": None,
                         "note": None if is_live else "Clé test — aucun paiement réel"})
    else:
        services.append({"name": "stripe", "status": "not_configured", "latency_ms": None, "last_check": None,
                         "note": "Stripe désactivé dans la config"})

    if settings.momo_enabled:
        env = settings.momo_target_environment.lower()
        is_live = env not in {"sandbox", "test"}
        momo_status = "healthy" if is_live else "test_mode"
        services.append({"name": "momo", "status": momo_status, "latency_ms": None, "last_check": None,
                         "target_environment": settings.momo_target_environment,
                         "note": None if is_live else f"Environnement {settings.momo_target_environment} — aucun paiement réel"})
    else:
        services.append({"name": "momo", "status": "not_configured", "latency_ms": None, "last_check": None,
                         "note": "MTN MoMo désactivé dans la config"})

    # Notifications / monitoring — non configuré ≠ dégradé
    services.append({"name": "smtp", "status": "healthy" if settings.email_enabled else "not_configured",
                     "latency_ms": None, "last_check": None,
                     "note": None if settings.email_enabled else "SMTP désactivé (emails non envoyés)"})
    services.append({"name": "sentry", "status": "healthy" if os.getenv("SENTRY_DSN") else "not_configured",
                     "latency_ms": None, "last_check": None,
                     "note": None if os.getenv("SENTRY_DSN") else "SENTRY_DSN absent — erreurs non remontées"})
    services.append({"name": "uptime", "status": "healthy" if os.getenv("UPTIME_MONITOR_URL") else "not_configured",
                     "latency_ms": None, "last_check": None,
                     "note": None if os.getenv("UPTIME_MONITOR_URL") else "UPTIME_MONITOR_URL absent — aucun ping externe"})

    # Storage
    try:
        storage_dir = os.path.abspath(settings.document_storage_dir)
        if not os.path.exists(storage_dir):
            os.makedirs(storage_dir, exist_ok=True)
        stat = os.statvfs(storage_dir)
        disk_free_mb = round(stat.f_bavail * stat.f_frsize / (1024 * 1024), 2)
        disk_total_mb = round(stat.f_blocks * stat.f_frsize / (1024 * 1024), 2)
        disk_used_mb = round(disk_total_mb - disk_free_mb, 2)
        services.append({"name": "storage", "status": "healthy", "latency_ms": None, "last_check": None,
                         "disk_used_mb": disk_used_mb, "disk_free_mb": disk_free_mb})
    except Exception as exc:
        services.append({"name": "storage", "status": "degraded", "latency_ms": None, "last_check": None, "error": str(exc)})

    # Statut global : seuls "down" et "degraded" indiquent un vrai problème.
    # "not_configured" = fonctionnalité non activée (pas une panne).
    # "test_mode" = configuré en sandbox (normal hors prod).
    statuses = [s.get("status") for s in services]
    if "down" in statuses:
        overall = "down"
    elif "degraded" in statuses:
        overall = "degraded"
    elif any(s == "test_mode" for s in statuses):
        overall = "test_mode"
    else:
        overall = "healthy"

    return {
        "status": overall,
        "services": services,
        "version": "1.6.0",
        "environment": settings.environment,
        "database": settings.database_url.split("://", 1)[0],
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": round(time.time() - _START_TIME, 1),
    }


@router.get("/admin/system/preflight")
def system_preflight(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Checklist production réelle : secrets, migrations, paiements, PWA, monitoring."""
    _require_super_admin(current_user)
    return build_production_preflight(db, get_settings())


# ─────────────────────────────────────────────────────────────────────────────
# 9. STATISTIQUES ONBOARDING
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/admin/onboarding-stats")
def onboarding_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_super_admin(current_user)

    companies = db.scalars(select(Company).order_by(Company.id)).all()
    result = []

    for company in companies:
        has_employees = (
            db.scalar(
                select(func.count(Employee.id)).where(Employee.company_id == company.id)
            )
            or 0
        ) > 0

        has_invoices = (
            db.scalar(
                select(func.count(Invoice.id)).where(Invoice.company_id == company.id)
            )
            or 0
        ) > 0

        has_sales = (
            db.scalar(
                select(func.count(Sale.id)).where(Sale.company_id == company.id)
            )
            or 0
        ) > 0

        has_documents = (
            db.scalar(
                select(func.count(CompanyDocument.id)).where(
                    CompanyDocument.company_id == company.id
                )
            )
            or 0
        ) > 0

        # Score d'onboarding simple basé sur les flags
        flags = [has_employees, has_invoices, has_sales, has_documents]
        completion_score = int((sum(flags) / len(flags)) * 100)

        # Dernière activité: max(created_at) parmi invoice, sale, user
        last_invoice_at = db.scalar(
            select(func.max(Invoice.created_at)).where(Invoice.company_id == company.id)
        )
        last_sale_at = db.scalar(
            select(func.max(Sale.created_at)).where(Sale.company_id == company.id)
        )
        last_user_at = db.scalar(
            select(func.max(User.created_at)).where(User.company_id == company.id)
        )

        candidates = [t for t in [last_invoice_at, last_sale_at, last_user_at] if t is not None]
        last_activity = max(candidates).isoformat() if candidates else company.created_at.isoformat()

        result.append({
            "company_id": company.id,
            "company_name": company.name,
            "completion_score": completion_score,
            "has_employees": has_employees,
            "has_invoices": has_invoices,
            "has_sales": has_sales,
            "has_documents": has_documents,
            "last_activity": last_activity,
        })

    return result


# ─────────────────────────────────────────────────────────────────────────────
# 9. EMAIL — TEST & STATUT
# ─────────────────────────────────────────────────────────────────────────────

class TestEmailPayload(BaseModel):
    to: str


@router.post("/admin/test-email")
async def test_email(
    payload: TestEmailPayload,
    current_user: User = Depends(get_current_user),
):
    """Envoie un email de test. Super-admin uniquement."""
    _require_super_admin(current_user)

    sent = await send_test_email(payload.to)
    if sent:
        return {"sent": True, "message": f"Email de test envoyé à {payload.to}"}
    else:
        settings = get_settings()
        if not settings.email_enabled:
            return {
                "sent": False,
                "message": "Email désactivé : SMTP_HOST, SMTP_USER ou SMTP_PASSWORD manquant dans la configuration.",
            }
        return {"sent": False, "message": "Échec de l'envoi — vérifiez les logs serveur pour plus de détails."}


@router.get("/admin/email-status")
def email_status(
    current_user: User = Depends(get_current_user),
):
    """Retourne le statut de la configuration email. Super-admin uniquement. Ne retourne jamais le mot de passe."""
    _require_super_admin(current_user)

    settings = get_settings()
    return {
        "enabled": settings.email_enabled,
        "host": settings.smtp_host or None,
        "port": settings.smtp_port,
        "from": settings.smtp_from_email,
        "from_name": settings.smtp_from_name,
        "tls": settings.smtp_tls,
        "provider": "SMTP",
    }
