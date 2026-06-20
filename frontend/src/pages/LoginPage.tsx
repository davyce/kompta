import { BarChart3, Building2, CheckCircle2, KeyRound, Lock, Receipt, ShieldCheck, Smartphone, UserPlus, Users2, Wallet } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { TextInput } from "../components/FormField";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { LimuleAvatar, LimuleIcon } from "../components/LimuleAvatar";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../app/AuthContext";
import { api } from "../services/api";

export function LoginPage() {
  const { t } = useTranslation();
  const { login, registerCompany } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register" | "reset" | "reset_confirm">("login");
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetResult, setResetResult] = useState<{ message?: string; reset_token?: string; note?: string } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registration, setRegistration] = useState({
    company_name: "",
    legal_name: "",
    industry: "Commerce et services",
    organization_type: "PME",
    country: "Congo",
    admin_full_name: "",
    admin_email: "",
    admin_phone: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      // Trim défensif : iOS et Android peuvent ajouter des espaces invisibles
      // lors du copier-coller depuis SMS / email (mot de passe temporaire).
      const response = await login(email.trim(), password.trim());
      if (response.user.role === "super_admin") {
        navigate("/admin");
        return;
      }
      if (response.must_change_password) {
        navigate("/activation");
        return;
      }
      // Workspace selector — l'utilisateur choisit ensuite l'espace
      navigate("/workspace");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function onRequestReset(event: FormEvent) {
    event.preventDefault();
    setResetLoading(true);
    try {
      const result = await api.requestPasswordReset(resetIdentifier);
      setResetResult(result);
      if (result.reset_token) {
        setResetToken(result.reset_token);
      }
      setMode("reset_confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.error"));
    } finally {
      setResetLoading(false);
    }
  }

  async function onConfirmReset(event: FormEvent) {
    event.preventDefault();
    setResetLoading(true);
    try {
      const result = await api.resetPassword(resetToken, newPassword);
      setResetResult(result);
      toast.success(result.message);
      setMode("login");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.error"));
    } finally {
      setResetLoading(false);
    }
  }

  async function onRegister(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await registerCompany(registration);
      navigate("/workspace");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.createFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-canvas">
      <div className="grid min-h-dvh lg:grid-cols-[1.05fr_0.95fr]">
        {/* ── DESKTOP — Colonne gauche : panel marketing ─────────────── */}
        <section className="hidden lg:flex flex-col justify-between bg-ink p-10 text-white">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-emerald-600 font-black text-white text-lg">
              K
            </div>
            <div>
              <p className="text-xl font-black">KOMPTA</p>
              <p className="text-sm text-white/60">{t("auth.tagline")}</p>
            </div>
          </div>

          {/* Hero */}
          <div className="my-10 max-w-xl space-y-8">
            <div>
              <p className="text-sm font-semibold uppercase text-emerald-200">{t("auth.heroEyebrow")}</p>
              <h1 className="mt-4 text-4xl font-black leading-tight xl:text-5xl">
                {t("auth.heroTitle")}
              </h1>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                [t("auth.featHrTitle"), t("auth.featHrText")],
                [t("auth.featPosTitle"), t("auth.featPosText")],
                [t("auth.featTerasTitle"), t("auth.featTerasText")],
              ].map(([title, text]) => (
                <div key={title} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="font-bold">{title}</p>
                  <p className="mt-1 text-sm text-white/60">{text}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-5 py-4">
              <LimuleAvatar state="idle" size={64} />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">{t("auth.limuleEyebrow")}</p>
                <p className="text-lg font-black text-white">Limule</p>
                <p className="text-xs text-white/55">{t("auth.limuleDesc")}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-white/40">
            <LimuleIcon size={16} className="opacity-50" />
            {t("auth.devVersion")}
          </div>
        </section>

        {/* ── Colonne droite : header mobile + formulaire + trust ────── */}
        <section className="flex flex-col lg:items-center lg:justify-center px-4 py-6 sm:px-6">
          {/* MOBILE — Hero compact (caché sur desktop) */}
          <header className="lg:hidden mb-5 flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 font-black text-white text-xl shadow-lg shadow-emerald-600/20">
              K
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-black text-ink leading-tight">KOMPTA</p>
              <p className="text-xs text-stone-500 leading-tight">{t("auth.mobileTagline")}</p>
            </div>
            <div className="ml-auto flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 border border-emerald-200">
              <LimuleIcon size={10} /> Limule
            </div>
          </header>

          <form
            onSubmit={mode === "login" ? onSubmit : mode === "reset" ? onRequestReset : mode === "reset_confirm" ? onConfirmReset : onRegister}
            className="w-full lg:max-w-md rounded-2xl lg:rounded-lg border border-stone-200 bg-white p-5 sm:p-6 shadow-soft"
          >
            <div className="mb-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                {mode === "login" ? <KeyRound size={20} /> : mode === "reset" || mode === "reset_confirm" ? <ShieldCheck size={20} /> : <UserPlus size={20} />}
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-ink">
                {mode === "login" ? t("auth.loginTitle") : mode === "reset" ? t("auth.resetTitle") : mode === "reset_confirm" ? t("auth.resetConfirmTitle") : t("auth.registerTitle")}
              </h2>
              <p className="mt-1 text-sm text-stone-500 leading-snug">
                {mode === "login"
                  ? t("auth.loginSubtitle")
                  : mode === "reset"
                  ? t("auth.resetSubtitle")
                  : mode === "reset_confirm"
                  ? t("auth.resetConfirmSubtitle")
                  : t("auth.registerSubtitle")}
              </p>
              {(mode === "login" || mode === "register") && (
                <div className="mt-4 grid grid-cols-2 rounded-xl bg-stone-100 p-1">
                  <button
                    type="button"
                    onClick={() => { setMode("login"); setError(""); }}
                    className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${mode === "login" ? "bg-white text-ink shadow-sm" : "text-stone-500 active:bg-stone-200"}`}
                  >
                    {t("auth.tabLogin")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode("register"); setError(""); }}
                    className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${mode === "register" ? "bg-white text-ink shadow-sm" : "text-stone-500 active:bg-stone-200"}`}
                  >
                    {t("auth.tabRegister")}
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-4">
              {mode === "login" ? (
                <>
                  <TextInput
                    label={t("auth.emailOrPhone")}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="email"
                  />
                  <TextInput
                    label={t("auth.password")}
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => { setMode("reset"); setError(""); }}
                    className="text-xs text-emerald-600 hover:underline"
                  >
                    {t("auth.forgotPassword")}
                  </button>
                </>
              ) : mode === "reset" ? (
                <>
                  <TextInput
                    label={t("auth.emailOrPhone")}
                    value={resetIdentifier}
                    onChange={(e) => setResetIdentifier(e.target.value)}
                  />
                  <button type="button" onClick={() => setMode("login")} className="text-xs text-stone-400 hover:underline">
                    {t("auth.backToLogin")}
                  </button>
                </>
              ) : mode === "reset_confirm" ? (
                <>
                  {resetResult?.reset_token && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                      <p className="font-bold mb-1">{t("auth.resetTokenHeading")}</p>
                      <code className="break-all font-mono text-[11px]">{resetResult.reset_token}</code>
                      <p className="mt-1 opacity-70">{resetResult.note}</p>
                    </div>
                  )}
                  <TextInput
                    label={t("auth.resetTokenLabel")}
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                  />
                  <TextInput
                    label={t("auth.newPassword")}
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setMode("login")} className="text-xs text-stone-400 hover:underline">
                    {t("auth.backToLogin")}
                  </button>
                </>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextInput
                      label={t("auth.companyName")}
                      value={registration.company_name}
                      onChange={(event) => setRegistration({ ...registration, company_name: event.target.value })}
                    />
                    <TextInput
                      label={t("auth.legalName")}
                      value={registration.legal_name}
                      onChange={(event) => setRegistration({ ...registration, legal_name: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextInput
                      label={t("auth.industry")}
                      value={registration.industry}
                      onChange={(event) => setRegistration({ ...registration, industry: event.target.value })}
                    />
                    <TextInput
                      label={t("auth.country")}
                      value={registration.country}
                      onChange={(event) => setRegistration({ ...registration, country: event.target.value })}
                    />
                  </div>
                  <TextInput
                    label={t("auth.ceoName")}
                    value={registration.admin_full_name}
                    onChange={(event) => setRegistration({ ...registration, admin_full_name: event.target.value })}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextInput
                      label={t("auth.adminEmail")}
                      value={registration.admin_email}
                      onChange={(event) => setRegistration({ ...registration, admin_email: event.target.value })}
                    />
                    <TextInput
                      label={t("auth.adminPhone")}
                      value={registration.admin_phone}
                      onChange={(event) => setRegistration({ ...registration, admin_phone: event.target.value })}
                    />
                  </div>
                  <TextInput
                    label={t("auth.adminPassword")}
                    type="password"
                    value={registration.password}
                    onChange={(event) => setRegistration({ ...registration, password: event.target.value })}
                  />
                </>
              )}
              {error ? <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">{error}</p> : null}
              <button
                disabled={loading || resetLoading}
                className="flex min-h-[52px] sm:min-h-0 w-full items-center justify-center gap-2 rounded-xl sm:rounded-lg bg-emerald-600 px-4 py-3.5 sm:py-3 text-base sm:text-sm font-bold text-white shadow-sm shadow-emerald-600/20 transition active:scale-[0.98] hover:bg-emerald-700 disabled:opacity-60 disabled:active:scale-100"
              >
                {(loading || resetLoading) ? (
                  <LimuleAvatar state="thinking" size={22} />
                ) : mode === "login" ? (
                  <ShieldCheck size={18} />
                ) : (
                  <UserPlus size={18} />
                )}
                {(loading || resetLoading) ? t("auth.verifying") : mode === "login" ? t("auth.enter") : mode === "reset" ? t("auth.requestToken") : mode === "reset_confirm" ? t("auth.changePassword") : t("auth.createEnter")}
              </button>
            </div>

            {mode === "login" && (
              <GoogleSignInButton
                onSuccess={(response) => {
                  if (response.user.role === "super_admin") { navigate("/admin"); return; }
                  if (response.must_change_password) { navigate("/activation"); return; }
                  navigate("/workspace");
                }}
                onError={(msg) => setError(msg)}
              />
            )}

            <div className="mt-5 flex items-start gap-2 rounded-lg bg-stone-50 p-3 text-xs sm:text-sm text-stone-600">
              <Building2 size={16} className="shrink-0 mt-0.5 text-stone-400" />
              <span>{t("auth.emptyHint")}</span>
            </div>
          </form>

          {/* MOBILE — Trust signals + mini-features (caché sur desktop) */}
          <div className="lg:hidden mt-6 w-full space-y-4">
            {/* Mini-features grid */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Receipt,    label: t("auth.miniInvoices"),   hint: t("auth.miniInvoicesHint"),   limule: false },
                { icon: Wallet,     label: t("auth.miniRegister"),   hint: t("auth.miniRegisterHint"),   limule: false },
                { icon: Users2,     label: t("auth.miniGroups"),     hint: t("auth.miniGroupsHint"),     limule: false },
                { icon: BarChart3,  label: t("auth.miniAccounting"), hint: t("auth.miniAccountingHint"), limule: false },
                { icon: LimuleIcon, label: t("auth.miniAi"),         hint: t("auth.miniAiHint"),         limule: true  },
                { icon: Smartphone, label: t("auth.miniMobile"),     hint: t("auth.miniMobileHint"),     limule: false },
              ].map(({ icon: Icon, label, hint, limule }) => (
                <div key={label} className="flex flex-col items-center rounded-xl border border-stone-200 bg-white p-3 text-center">
                  {limule
                    ? <LimuleIcon size={20} className="mx-auto" />
                    : <Icon size={18} className="text-emerald-600" />
                  }
                  <p className="mt-1.5 text-[11px] font-bold text-ink leading-tight">{label}</p>
                  <p className="text-[10px] text-stone-500 leading-tight">{hint}</p>
                </div>
              ))}
            </div>

            {/* Trust row */}
            <div className="flex items-center justify-around rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-[10px] text-stone-600">
              <span className="flex items-center gap-1"><Lock size={11} className="text-emerald-600" /> {t("auth.trustEncrypted")}</span>
              <span className="h-3 w-px bg-stone-300" />
              <span className="flex items-center gap-1"><ShieldCheck size={11} className="text-emerald-600" /> {t("auth.trustMultitenant")}</span>
              <span className="h-3 w-px bg-stone-300" />
              <span className="flex items-center gap-1"><CheckCircle2 size={11} className="text-emerald-600" /> SYSCOHADA</span>
            </div>

            {/* Footer */}
            <p className="text-center text-[10px] text-stone-400">
              {t("auth.footer")}
            </p>
            <p className="text-center text-[10px] text-stone-400">
              <a href="/privacy" className="hover:text-emerald-600">Confidentialité</a>
              {" · "}
              <a href="/terms" className="hover:text-emerald-600">Conditions d'utilisation</a>
            </p>
          </div>
        </section>

      </div>
    </main>
  );
}
