from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api.routes_budget import router as budget_router
from app.api.routes_clients import router as clients_router
from app.api.routes_extra import router as extra_router
from app.api.routes_features import router as features_router
from app.api.routes_safe_mode import router as safe_mode_router
from app.api.routes_investments import router as investments_router
from app.api.routes_transactions import router as transactions_router
import os

from app.core.config import get_settings
from app.db.init_db import create_tables, seed_demo_data
from app.db.session import SessionLocal

settings = get_settings()


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


app.include_router(router, prefix=settings.api_prefix)
app.include_router(budget_router, prefix=settings.api_prefix)
app.include_router(clients_router, prefix=settings.api_prefix)
app.include_router(extra_router, prefix=settings.api_prefix)
app.include_router(features_router, prefix=settings.api_prefix)
app.include_router(safe_mode_router, prefix=settings.api_prefix)
app.include_router(investments_router, prefix=settings.api_prefix)
app.include_router(transactions_router, prefix=settings.api_prefix)


@app.get("/")
def root() -> dict[str, str]:
    return {"name": settings.app_name, "docs": "/docs", "health": f"{settings.api_prefix}/health"}
