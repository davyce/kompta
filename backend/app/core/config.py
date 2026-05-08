from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "KOMPTA"
    environment: str = "local"
    api_prefix: str = "/api"
    secret_key: str = "dev-kompta-secret"
    database_url: str = "sqlite:///./kompta.db"
    cors_origins: str = "http://localhost:3001,http://127.0.0.1:3001,http://localhost:5173,http://127.0.0.1:5173"
    access_token_expire_minutes: int = 720
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
