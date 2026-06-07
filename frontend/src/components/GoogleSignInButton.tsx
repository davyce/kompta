import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../app/AuthContext";
import { api, type LoginResponse } from "../services/api";
import i18n from "../i18n";

// Google Identity Services — typage minimal
type GsiId = {
  initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
};
declare global {
  interface Window { google?: { accounts?: { id?: GsiId } } }
}

let _gsiPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (_gsiPromise) return _gsiPromise;
  _gsiPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("google_sign_in_unavailable"));
    document.head.appendChild(s);
  });
  return _gsiPromise;
}

/**
 * Bouton « Se connecter avec Google ». Ne s'affiche que si la connexion Google
 * est activée côté backend (GOOGLE_CLIENT_ID configuré).
 */
export function GoogleSignInButton({
  onSuccess,
  onError,
}: {
  onSuccess: (resp: LoginResponse) => void;
  onError: (msg: string) => void;
}) {
  const { t: tr } = useTranslation();
  const { loginWithGoogle } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await api.authConfig();
        if (cancelled || !cfg.google_enabled || !cfg.google_client_id) return;
        await loadGsi();
        const gid = window.google?.accounts?.id;
        if (cancelled || !ref.current || !gid) return;
        setEnabled(true);
        gid.initialize({
          client_id: cfg.google_client_id,
          callback: async (r: { credential: string }) => {
            try {
              onSuccess(await loginWithGoogle(r.credential));
            } catch (e) {
              onError(e instanceof Error ? e.message : tr("components.googleSignIn.errors.loginImpossible"));
            }
          },
        });
        gid.renderButton(ref.current, {
          theme: "outline",
          size: "large",
          width: 320,
          text: "signin_with",
          locale: i18n.language,
          shape: "pill",
        });
      } catch {
        /* Google non disponible → le bouton reste masqué, login classique inchangé */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!enabled) return null;
  return (
    <div className="mt-4 flex flex-col items-center gap-3">
      <div className="flex w-full items-center gap-3 text-xs text-stone-400">
        <div className="h-px flex-1 bg-stone-200 dark:bg-white/10" /> {tr("components.googleSignIn.or")}
        <div className="h-px flex-1 bg-stone-200 dark:bg-white/10" />
      </div>
      <div ref={ref} />
    </div>
  );
}
