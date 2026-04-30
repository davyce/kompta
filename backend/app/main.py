from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.api.routes_extra import router as extra_router
from app.api.routes_features import router as features_router
from app.core.config import get_settings
from app.db.init_db import create_tables, seed_demo_data
from app.db.session import SessionLocal

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="API locale KOMPTA: ERP intelligent, RH, finance, POS, chat, paie et TERAS.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    create_tables()
    with SessionLocal() as db:
        seed_demo_data(db)


app.include_router(router, prefix=settings.api_prefix)
app.include_router(extra_router, prefix=settings.api_prefix)
app.include_router(features_router, prefix=settings.api_prefix)


@app.get("/")
def root() -> dict[str, str]:
    return {"name": settings.app_name, "docs": "/docs", "health": f"{settings.api_prefix}/health"}
