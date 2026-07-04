"""Observabilité optionnelle (Sentry).

Initialisation gated par `SENTRY_DSN` : si la variable n'est pas définie,
`init_sentry()` ne fait rien — aucun changement de comportement en dev/local.
"""

import logging

from app.core.config import get_settings

logger = logging.getLogger("kompta")


def init_sentry() -> None:
    """Initialise Sentry si `settings.sentry_dsn` est renseigné.

    No-op silencieux si le DSN est vide (dev/local par défaut). Ne lève jamais
    d'exception : un DSN invalide ne doit pas empêcher le démarrage de l'app.
    """
    settings = get_settings()
    if not settings.sentry_dsn:
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            traces_sample_rate=settings.sentry_traces_sample_rate,
            integrations=[StarletteIntegration(), FastApiIntegration()],
        )
        logger.info("Sentry initialisé (environment=%s)", settings.environment)
    except Exception:
        # Un DSN invalide/faux ou un SDK non installé ne doit jamais bloquer le démarrage.
        logger.exception("Échec d'initialisation de Sentry (ignoré, l'app démarre normalement)")
