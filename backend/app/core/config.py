from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Chemin ABSOLU et déterministe vers l'unique base canonique (backend/kompta.db),
# ancré au dossier backend quel que soit le répertoire de lancement.
# Évite la fragmentation : ./kompta.db relatif créait 2-3 fichiers selon le cwd.
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_DEFAULT_DB_PATH = _BACKEND_DIR / "kompta.db"


class Settings(BaseSettings):
    app_name: str = "KOMPTA"
    environment: str = "local"
    api_prefix: str = "/api"
    secret_key: str = "dev-kompta-secret"
    database_url: str = f"sqlite:///{_DEFAULT_DB_PATH}"
    cors_origins: str = "http://localhost:3001,http://127.0.0.1:3001,http://localhost:5173,http://127.0.0.1:5173"
    access_token_expire_minutes: int = 480  # 8h (réduit de 12h) ; révocable via token_version
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    deepseek_timeout_seconds: float = 30.0
    document_storage_dir: str = "storage/documents"

    # ── Limule AI provider ────────────────────────────────────────────────
    # Valeurs : deepseek | openai | ollama
    ai_provider: str = "deepseek"
    ai_model: str = ""                               # surcharge le modèle du provider
    ollama_base_url: str = "http://localhost:11434"
    openai_api_key: str = ""

    # ── Paiements : Stripe ────────────────────────────────────────────────────
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""

    # ── Paiements : Mobile Money (MTN MoMo) ─────────────────────────────────────
    momo_subscription_key: str = ""
    momo_subscription_key_secondary: str = ""
    momo_target_environment: str = "sandbox"
    momo_base_url: str = "https://sandbox.momodeveloper.mtn.com"
    momo_api_user: str = ""
    momo_api_key: str = ""
    momo_callback_host: str = ""

    # ── Authentification : cookie de session ────────────────────────────────────
    auth_cookie_name: str = "kompta_session"
    auth_cookie_secure: bool = False
    auth_cookie_samesite: str = "lax"
    auth_cookie_domain: str = ""

    # ── Email SMTP ────────────────────────────────────────────────────────────
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "noreply@kompta.app"
    smtp_from_name: str = "KOMPTA"
    smtp_tls: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)

    @property
    def stripe_enabled(self) -> bool:
        return bool(self.stripe_secret_key)

    @property
    def momo_enabled(self) -> bool:
        return bool(self.momo_subscription_key and self.momo_api_user and self.momo_api_key)

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod", "staging"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
