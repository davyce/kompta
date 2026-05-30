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
from app.api.routes_transactions import router as transactions_router
from app.api.routes_legislation import router as legislation_router
from app.api.routes_admin_analytics import router as admin_analytics_router
from app.api.routes_accounting import router as accounting_router
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
    if explicit is not None:
        return explicit
    return settings.environment.strip().lower() not in {"prod", "production"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    if settings.environment.strip().lower() in {"prod", "production"} and settings.secret_key == "dev-kompta-secret":
        raise RuntimeError("SECRET_KEY must be configured before running KOMPTA in production.")
    # Local/dev/staging keep the demo tenant available. Production must opt in explicitly.
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


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Journalise chaque requête (méthode, chemin, statut, durée) et trace les erreurs."""
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        elapsed = (time.perf_counter() - start) * 1000
        logger.exception("%s %s → 500 (%.1f ms)", request.method, request.url.path, elapsed)
        raise
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
app.include_router(transactions_router, prefix=settings.api_prefix)
app.include_router(legislation_router, prefix=settings.api_prefix)
app.include_router(admin_analytics_router, prefix=settings.api_prefix)
app.include_router(accounting_router, prefix=settings.api_prefix)
app.include_router(groups_router, prefix=settings.api_prefix)
app.include_router(groups_g2_router, prefix=settings.api_prefix)
app.include_router(groups_g3_router, prefix=settings.api_prefix)
app.include_router(groups_g4_router, prefix=settings.api_prefix)
app.include_router(groups_g5_router, prefix=settings.api_prefix)


@app.get("/")
def root() -> dict[str, str]:
    return {"name": settings.app_name, "docs": "/docs", "health": f"{settings.api_prefix}/health"}
