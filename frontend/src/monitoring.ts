// Observabilité optionnelle (Sentry) — no-op si VITE_SENTRY_DSN n'est pas défini,
// donc aucun impact sur le développement local.
import * as Sentry from "@sentry/react";

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
    });
  } catch {
    // Un DSN invalide ne doit jamais empêcher l'app de démarrer.
  }
}
