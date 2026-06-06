import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api.routes_audit import router as audit_router
from app.api.routes_auth import router as auth_router
from app.api.routes_budget import router as budget_router
from app.api.routes_clients import router as clients_router
from app.api.routes_extra import router as extra_router
from app.api.routes_features import router as features_router
from app.api.routes_fiscal import router as fiscal_router
from app.api.routes_pos import router as pos_router
from app.api.routes_safe_mode import router as safe_mode_router
from app.api.routes_investments import router as investments_router
from app.api.routes_payments import router as payments_router
from app.api.routes_subscriptions import router as subscriptions_router
from app.api.routes_transactions import router as transactions_router
from app.api.routes_legislation import router as legislation_router
from app.api.routes_admin_analytics import router as admin_analytics_router
from app.api.routes_accounting import router as accounting_router
from app.api.routes_accounting_reports import router as accounting_reports_router
from app.api.routes_groups import router as groups_router
from app.api.routes_groups_g2 import router as groups_g2_router
from app.api.routes_groups_g3 import router as groups_g3_router
from app.api.routes_groups_g4 import router as groups_g4_router
from app.api.routes_groups_g5 import router as groups_g5_router
import os

from app.core.config import get_settings
from app.db.init_db import create_tables, seed_demo_data
from app.db.session import SessionLocal

settings = get_settings()

# ── Logging structuré ──────────────────────────────────────────────────────
_LOG_LEVEL = logging.DEBUG if settings.environment.strip().lower() in {"local", "dev", "development"} else logging.INFO
logging.basicConfig(
    level=_LOG_LEVEL,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger("kompta")


def _env_flag(name: str) -> bool | None:
    raw = os.getenv(name)
    if raw is None:
        return None
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}


def _should_seed_demo() -> bool:
    explicit = _env_flag("SEED_DEMO")
    if explicit is True:
        return settings.environment.strip().lower() not in {"prod", "production", "staging"}
    return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()

    # ── Blocage sécurité au démarrage ──────────────────────────────────────
    _env = settings.environment.strip().lower()
    _is_prod = _env in {"prod", "production", "staging"}
    _PLACEHOLDER_SECRETS = {"dev-kompta-secret", "change-me-in-production", "secret", "changeme", ""}
    if _is_prod and settings.secret_key in _PLACEHOLDER_SECRETS:
        raise RuntimeError(
            "KOMPTA refuse de démarrer en production avec un SECRET_KEY par défaut. "
            "Définissez une valeur aléatoire forte (≥ 32 caractères) dans votre fichier .env."
        )
    if _is_prod and os.getenv("SUPER_ADMIN_PASSWORD", "super2026") == "super2026":
        raise RuntimeError(
            "KOMPTA refuse de démarrer en production avec le mot de passe super-admin par défaut. "
            "Définissez SUPER_ADMIN_PASSWORD dans votre fichier .env."
        )
    if _is_prod and _env_flag("SEED_DEMO") is True:
        raise RuntimeError(
            "KOMPTA refuse de démarrer en production avec SEED_DEMO=true. "
            "Retirez ou désactivez cette variable en production."
        )
    # Super-admin plateforme : TOUJOURS garanti (même en production sur base vierge).
    try:
        from app.db.init_db import seed_platform_admin
        with SessionLocal() as db:
            seed_platform_admin(db)
        logger.info("Super-admin plateforme : OK")
    except Exception:
        logger.exception("Seed super-admin échoué")
    # Plans d'abonnement par défaut (idempotent : seulement si la table est vide).
    try:
        from app.services.subscriptions import seed_default_plans
        with SessionLocal() as db:
            seed_default_plans(db)
        logger.info("Plans d'abonnement : OK")
    except Exception:
        logger.exception("Seed plans d'abonnement échoué")
    # Données de DÉMO (société fictive) : jamais automatiques.
    # Activer explicitement avec SEED_DEMO=true dans un environnement local isolé.
    if _should_seed_demo():
        with SessionLocal() as db:
            seed_demo_data(db)
    # Migration Float → centimes entiers (idempotente — ne touche que les 0 ou NULL).
    try:
        from app.db.migrate_cents import run_cents_migration
        run_cents_migration()
        logger.info("Cents migration : OK")
    except Exception:
        logger.exception("Cents migration échouée")

    # Plan comptable : garantir un plan SYSCOHADA-lite pour chaque société existante.
    try:
        from app.models import Company
        from app.services.accounting import seed_chart_of_accounts
        with SessionLocal() as db:
            for company in db.query(Company).all():
                seed_chart_of_accounts(db, company.id)
            db.commit()
    except Exception:
        logger.exception("Seed du plan comptable échoué")
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="API locale KOMPTA: ERP intelligent, RH, finance, POS, chat, paie et TERAS.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Rate limiting global (slowapi) ────────────────────────────────────────────
# Sécurité : limite par utilisateur (ou IP) — protège contre brute-force, spam,
# scraping. Décorer les routes sensibles avec @limiter.limit("Xspeed").
from app.core.rate_limit import limiter as _limiter  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402
from slowapi.middleware import SlowAPIMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

app.state.limiter = _limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):  # noqa: ARG001
    return JSONResponse(
        status_code=429,
        content={"detail": "Trop de requêtes. Réessayez dans quelques secondes."},
    )


# ── Garde de cloisonnement : membre_groupe → routes entreprise interdites ─────
# Les utilisateurs avec le rôle membre_groupe n'ont accès qu'aux routes
# /groups/*, /auth/* et /payments/config. Toutes les autres routes entreprise
# (produits, factures, employés, comptabilité…) leur sont interdites.
@app.middleware("http")
async def groupe_member_scope_guard(request: Request, call_next):
    path = request.url.path
    # Laisser passer les routes publiques et groupe
    _ALLOWED_PREFIXES = (
        f"{settings.api_prefix}/auth/",
        f"{settings.api_prefix}/auth",
        f"{settings.api_prefix}/groups",   # /groups et /groups/* (membres, chat, cotisations…)
        f"{settings.api_prefix}/health",
        f"{settings.api_prefix}/payments/config",
    )
    if any(path.startswith(p) for p in _ALLOWED_PREFIXES):
        return await call_next(request)

    # Vérifier si c'est un membre_groupe
    from app.core.security import decode_access_token as _dec
    # Extraire le token (header Bearer ou cookie)
    token: str | None = None
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1]
    if not token:
        token = request.cookies.get(settings.auth_cookie_name)
    if token:
        payload = _dec(token)
        if payload and payload.get("role") == "membre_groupe":
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=403,
                content={"detail": "Accès réservé aux membres de l'entreprise"},
            )

    return await call_next(request)


# ── Enforcement d'abonnement : une entreprise SUSPENDUE est bloquée ──────────
# Si Company.status == "suspended" (décidé par le super-admin pour non-paiement),
# toutes les routes métier renvoient 402 Payment Required. Restent accessibles :
# l'auth, l'abonnement (pour payer et se réactiver), l'admin, les paiements, et
# le profil entreprise (pour voir son propre statut).
@app.middleware("http")
async def subscription_suspension_guard(request: Request, call_next):
    path = request.url.path
    _EXEMPT_PREFIXES = (
        f"{settings.api_prefix}/auth",
        f"{settings.api_prefix}/health",
        f"{settings.api_prefix}/subscription",   # voir les plans, payer, confirmer
        f"{settings.api_prefix}/admin",          # super-admin gère
        f"{settings.api_prefix}/payments",        # traitement paiement + webhooks
        f"{settings.api_prefix}/company/profile",  # voir son propre statut
    )
    # On ne garde que les routes API métier ; tout le reste passe.
    if not path.startswith(settings.api_prefix) or any(path.startswith(p) for p in _EXEMPT_PREFIXES):
        return await call_next(request)

    from app.core.security import decode_access_token as _dec
    token: str | None = None
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1]
    if not token:
        token = request.cookies.get(settings.auth_cookie_name)
    if token:
        payload = _dec(token)
        # Le super-admin n'est jamais bloqué.
        if payload and payload.get("role") != "super_admin":
            company_id = payload.get("company_id")
            if company_id:
                from sqlalchemy import select as _select
                from app.models import Company as _Company
                with SessionLocal() as _db:
                    status_val = _db.scalar(_select(_Company.status).where(_Company.id == int(company_id)))
                if status_val == "suspended":
                    from fastapi.responses import JSONResponse
                    return JSONResponse(
                        status_code=402,
                        content={
                            "detail": "Abonnement suspendu : l'accès est bloqué jusqu'au règlement. "
                                      "Rendez-vous dans Paramètres → Abonnement pour régulariser.",
                            "code": "subscription_suspended",
                        },
                    )
    return await call_next(request)


_IS_PROD = settings.environment.strip().lower() in {"prod", "production"}
# CSP : 'unsafe-inline' toléré pour les pages HTML internes (contrats, reçus) qui
# embarquent du style/script inline ; l'API JSON n'est pas impactée.
_CSP = (
    "default-src 'self'; "
    "img-src 'self' data: blob: https:; "
    "style-src 'self' 'unsafe-inline'; "
    "script-src 'self' 'unsafe-inline'; "
    "connect-src 'self' https: wss: ws:; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "object-src 'none'"
)


@app.middleware("http")
async def security_and_logging(request: Request, call_next):
    """En-têtes de sécurité HTTP + journalisation (méthode, chemin, statut, durée)."""
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        elapsed = (time.perf_counter() - start) * 1000
        logger.exception("%s %s → 500 (%.1f ms)", request.method, request.url.path, elapsed)
        raise
    # ── En-têtes de sécurité (OWASP) ──
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = _CSP
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(self), camera=()"
    if _IS_PROD:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    elapsed = (time.perf_counter() - start) * 1000
    log = logger.warning if response.status_code >= 500 else logger.info
    log("%s %s → %s (%.1f ms)", request.method, request.url.path, response.status_code, elapsed)
    return response


app.include_router(router, prefix=settings.api_prefix)
app.include_router(audit_router, prefix=settings.api_prefix)
app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(budget_router, prefix=settings.api_prefix)
app.include_router(clients_router, prefix=settings.api_prefix)
app.include_router(extra_router, prefix=settings.api_prefix)
app.include_router(features_router, prefix=settings.api_prefix)
app.include_router(fiscal_router, prefix=settings.api_prefix)
app.include_router(pos_router, prefix=settings.api_prefix)
app.include_router(safe_mode_router, prefix=settings.api_prefix)
app.include_router(investments_router, prefix=settings.api_prefix)
app.include_router(payments_router, prefix=settings.api_prefix)
app.include_router(subscriptions_router, prefix=settings.api_prefix)
app.include_router(transactions_router, prefix=settings.api_prefix)
app.include_router(legislation_router, prefix=settings.api_prefix)
app.include_router(admin_analytics_router, prefix=settings.api_prefix)
app.include_router(accounting_router, prefix=settings.api_prefix)
app.include_router(accounting_reports_router, prefix=settings.api_prefix)
app.include_router(groups_router, prefix=settings.api_prefix)
app.include_router(groups_g2_router, prefix=settings.api_prefix)
app.include_router(groups_g3_router, prefix=settings.api_prefix)
app.include_router(groups_g4_router, prefix=settings.api_prefix)
app.include_router(groups_g5_router, prefix=settings.api_prefix)


@app.get("/")
def root() -> dict[str, str]:
    return {"name": settings.app_name, "docs": "/docs", "health": f"{settings.api_prefix}/health"}
