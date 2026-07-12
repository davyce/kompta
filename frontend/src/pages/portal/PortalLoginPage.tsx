import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Lock, User } from "lucide-react";

import { usePortalAuth } from "../../contexts/PortalAuthContext";
import { PortalApiError } from "../../services/portalApi";

export function PortalLoginPage() {
  const { t } = useTranslation();
  const { login } = usePortalAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(identifier.trim(), password.trim());
      navigate("/portal");
    } catch (err) {
      if (err instanceof PortalApiError) {
        setError(t("portal.loginError"));
      } else {
        setError(t("portal.loginError"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f5f7fb] px-4 dark:bg-[#0b1210]">
      <div className="w-full max-w-sm rounded-2xl border border-black/5 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-[#111a17]">
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          {t("portal.freeBadge")}
        </span>
        <h1 className="mt-3 text-xl font-bold text-[#17211f] dark:text-white">{t("portal.loginTitle")}</h1>
        <p className="mt-1 text-sm text-[#717182] dark:text-white/60">{t("portal.loginSubtitle")}</p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#17211f] dark:text-white">
            {t("portal.identifier")}
            <div className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
              <User size={16} className="text-[#717182]" />
              <input
                type="text"
                required
                autoComplete="username"
                placeholder={t("portal.identifierPlaceholder")}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full bg-transparent text-sm outline-none dark:text-white"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#17211f] dark:text-white">
            {t("portal.password")}
            <div className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
              <Lock size={16} className="text-[#717182]" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent text-sm outline-none dark:text-white"
              />
            </div>
          </label>

          {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {t("portal.loginButton")}
          </button>
        </form>

        <div className="mt-6 rounded-xl border border-black/5 bg-black/[0.02] p-4 text-sm text-[#717182] dark:border-white/10 dark:bg-white/5 dark:text-white/60">
          <p className="font-semibold text-[#17211f] dark:text-white">{t("portal.noAccountTitle")}</p>
          <p className="mt-1">{t("portal.noAccountBody")}</p>
        </div>
      </div>
    </div>
  );
}
