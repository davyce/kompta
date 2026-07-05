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
    super_admin_email: str = "superadmin@kompta.io"
    super_admin_password: str = "super2026"
    super_admin_phone: str = "+242060000099"
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

    # ── Paiements : Apple In-App Purchase (StoreKit 2) ──────────────────────────
    # bundle_id de l'app iOS, utilisé pour valider que les transactions vérifiées
    # correspondent bien à notre app (défense en profondeur, en plus de la vérif JWS).
    apple_iap_bundle_id: str = ""
    # sandbox | production — seulement informatif ici (la vérif JWS ne dépend pas
    # de l'environnement ; Apple signe les deux avec les mêmes certificats racine).
    apple_iap_environment: str = "sandbox"
    # Secret partagé App Store Server Notifications V2 (optionnel, defense-in-depth
    # si Apple l'exige un jour ; la vérif principale reste la signature JWS x5c).
    apple_iap_shared_secret: str = ""

    # ── Paiements : Mobile Money (MTN MoMo) ─────────────────────────────────────
    momo_subscription_key: str = ""
    momo_subscription_key_secondary: str = ""
    momo_target_environment: str = "sandbox"
    momo_base_url: str = "https://sandbox.momodeveloper.mtn.com"
    momo_api_user: str = ""
    momo_api_key: str = ""
    momo_callback_host: str = ""
    momo_callback_secret: str = ""

    # ── Authentification : cookie de session ────────────────────────────────────
    auth_cookie_name: str = "kompta_session"
    auth_cookie_secure: bool = False
    auth_cookie_samesite: str = "lax"
    auth_cookie_domain: str = ""

    # ── URL publique de l'app (liens & logo dans les emails) ──────────────────
    public_url: str = "https://www.kompta0.com"

    # ── Connexion Google (OAuth « Se connecter avec Google ») ─────────────────
    google_client_id: str = ""

    # ── Email SMTP ────────────────────────────────────────────────────────────
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "noreply@kompta.app"
    smtp_from_name: str = "KOMPTA"
    smtp_tls: bool = True

    # ── Observabilité : Sentry (optionnel, no-op si non configuré) ────────────
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 0.1

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)

    @property
    def google_oauth_enabled(self) -> bool:
        return bool(self.google_client_id)

    @property
    def stripe_enabled(self) -> bool:
        return bool(self.stripe_secret_key)

    @property
    def momo_enabled(self) -> bool:
        return bool(self.momo_subscription_key and self.momo_api_user and self.momo_api_key)

    @property
    def apple_iap_enabled(self) -> bool:
        # La vérification JWS ne nécessite aucun secret (validation par certificat
        # Apple public) ; on garde ce flag pour permettre de désactiver la feature
        # explicitement en config si besoin (ex. bundle_id non renseigné = pas prêt).
        return bool(self.apple_iap_bundle_id)

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod", "staging", "preprod", "pre-production"}

    @property
    def effective_cookie_domain(self) -> str:
        """Domaine du cookie de session.

        En production on respecte `auth_cookie_domain` (ex. `.kompta0.com` pour
        partager la session entre sous-domaines). Hors production (local/preview),
        on force un cookie **host-only** (domaine vide) : sinon le navigateur
        rejette un cookie `Domain=.kompta0.com` servi depuis `127.0.0.1`.
        """
        return self.auth_cookie_domain if self.is_production else ""

    @property
    def effective_cookie_secure(self) -> bool:
        """En local (HTTP simple), `Secure` empêcherait l'envoi du cookie.
        Forcé à False hors production ; en production le TLS Cloudflare le permet."""
        return self.auth_cookie_secure if self.is_production else False


@lru_cache
def get_settings() -> Settings:
    return Settings()
