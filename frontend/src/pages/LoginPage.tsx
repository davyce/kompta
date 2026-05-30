import { Building2, KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { TextInput } from "../components/FormField";
import { LimuleAvatar, LimuleIcon } from "../components/LimuleAvatar";
import { useAuth } from "../app/AuthContext";
import { api } from "../services/api";

export function LoginPage() {
  const { login, registerCompany } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register" | "reset" | "reset_confirm">("login");
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetResult, setResetResult] = useState<{ message?: string; reset_token?: string; note?: string } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [email, setEmail] = useState("admin@kompta.local");
  const [password, setPassword] = useState("kompta123");
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
      const response = await login(email, password);
      if (response.user.role === "super_admin") {
        navigate("/admin");
        return;
      }
      navigate(response.must_change_password ? "/activation" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible");
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
      setError(err instanceof Error ? err.message : "Erreur");
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
      alert("✅ " + result.message);
      setMode("login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
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
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creation impossible");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-canvas">
      <div className="grid min-h-dvh lg:grid-cols-[1.05fr_0.95fr]">
        {/* ── Colonne gauche : panel marketing ────────────────────────── */}
        <section className="hidden lg:flex flex-col justify-between bg-ink p-10 text-white">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-emerald-600 font-black text-white text-lg">
              K
            </div>
            <div>
              <p className="text-xl font-black">KOMPTA</p>
              <p className="text-sm text-white/60">Propulsé par Limule · ERP intelligent</p>
            </div>
          </div>

          {/* Hero */}
          <div className="my-10 max-w-xl space-y-8">
            <div>
              <p className="text-sm font-semibold uppercase text-emerald-200">Gestion entreprise, terrain et conformité</p>
              <h1 className="mt-4 text-4xl font-black leading-tight xl:text-5xl">
                Un cockpit unique pour piloter l'activité.
              </h1>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["RH + Paie", "Dossiers, bulletins, validations"],
                ["POS + Stock", "Scan, panier, étiquettes QR"],
                ["TERAS", "Alertes, score, actions"],
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
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Votre Grand Sage</p>
                <p className="text-lg font-black text-white">Limule</p>
                <p className="text-xs text-white/55">IA · Analyse · Rédaction · Conformité</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-white/40">
            <LimuleIcon size={16} className="opacity-50" />
            Version locale de développement
          </div>
        </section>

        {/* ── Colonne droite : formulaire ─────────────────────────────── */}
        <section className="flex items-center justify-center p-6">
          <form
            onSubmit={mode === "login" ? onSubmit : mode === "reset" ? onRequestReset : mode === "reset_confirm" ? onConfirmReset : onRegister}
            className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-6 shadow-soft"
          >
            <div className="mb-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                {mode === "login" ? <KeyRound size={22} /> : mode === "reset" || mode === "reset_confirm" ? <ShieldCheck size={22} /> : <UserPlus size={22} />}
              </div>
              <h2 className="text-2xl font-black text-ink">
                {mode === "login" ? "Connexion" : mode === "reset" ? "Réinitialiser le mot de passe" : mode === "reset_confirm" ? "Nouveau mot de passe" : "Créer une entreprise"}
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                {mode === "login"
                  ? "Connectez-vous ou créez votre espace entreprise."
                  : mode === "reset"
                  ? "Saisissez votre email ou téléphone pour recevoir un token de réinitialisation."
                  : mode === "reset_confirm"
                  ? "Copiez le token et définissez votre nouveau mot de passe."
                  : "Crée l'entreprise et le compte admin du PDG/DG en une seule étape."}
              </p>
              <div className="mt-4 grid grid-cols-2 rounded-lg bg-stone-100 p-1">
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className={`rounded-md px-3 py-2 text-sm font-bold transition ${mode === "login" ? "bg-white text-ink shadow-sm" : "text-stone-500"}`}
                >
                  Connexion
                </button>
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className={`rounded-md px-3 py-2 text-sm font-bold transition ${mode === "register" ? "bg-white text-ink shadow-sm" : "text-stone-500"}`}
                >
                  Nouvelle entreprise
                </button>
              </div>
            </div>
            <div className="space-y-4">
              {mode === "login" ? (
                <>
                  <TextInput label="Email ou téléphone" value={email} onChange={(event) => setEmail(event.target.value)} />
                  <TextInput
                    label="Mot de passe"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => { setMode("reset"); setError(""); }}
                    className="text-xs text-emerald-600 hover:underline"
                  >
                    Mot de passe oublié ?
                  </button>
                </>
              ) : mode === "reset" ? (
                <>
                  <TextInput
                    label="Email ou téléphone"
                    value={resetIdentifier}
                    onChange={(e) => setResetIdentifier(e.target.value)}
                  />
                  <button type="button" onClick={() => setMode("login")} className="text-xs text-stone-400 hover:underline">
                    ← Retour à la connexion
                  </button>
                </>
              ) : mode === "reset_confirm" ? (
                <>
                  {resetResult?.reset_token && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                      <p className="font-bold mb-1">🔑 Token de réinitialisation :</p>
                      <code className="break-all font-mono text-[11px]">{resetResult.reset_token}</code>
                      <p className="mt-1 opacity-70">{resetResult.note}</p>
                    </div>
                  )}
                  <TextInput
                    label="Token de réinitialisation"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                  />
                  <TextInput
                    label="Nouveau mot de passe"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button type="button" onClick={() => setMode("login")} className="text-xs text-stone-400 hover:underline">
                    ← Retour à la connexion
                  </button>
                </>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextInput
                      label="Nom entreprise"
                      value={registration.company_name}
                      onChange={(event) => setRegistration({ ...registration, company_name: event.target.value })}
                    />
                    <TextInput
                      label="Raison sociale"
                      value={registration.legal_name}
                      onChange={(event) => setRegistration({ ...registration, legal_name: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextInput
                      label="Activité"
                      value={registration.industry}
                      onChange={(event) => setRegistration({ ...registration, industry: event.target.value })}
                    />
                    <TextInput
                      label="Pays"
                      value={registration.country}
                      onChange={(event) => setRegistration({ ...registration, country: event.target.value })}
                    />
                  </div>
                  <TextInput
                    label="Nom du PDG / DG"
                    value={registration.admin_full_name}
                    onChange={(event) => setRegistration({ ...registration, admin_full_name: event.target.value })}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextInput
                      label="Email admin"
                      value={registration.admin_email}
                      onChange={(event) => setRegistration({ ...registration, admin_email: event.target.value })}
                    />
                    <TextInput
                      label="Téléphone admin"
                      value={registration.admin_phone}
                      onChange={(event) => setRegistration({ ...registration, admin_phone: event.target.value })}
                    />
                  </div>
                  <TextInput
                    label="Mot de passe admin"
                    type="password"
                    value={registration.password}
                    onChange={(event) => setRegistration({ ...registration, password: event.target.value })}
                  />
                </>
              )}
              {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
              <button
                disabled={loading || resetLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {(loading || resetLoading) ? (
                  <LimuleAvatar state="thinking" size={22} />
                ) : mode === "login" ? (
                  <ShieldCheck size={18} />
                ) : (
                  <UserPlus size={18} />
                )}
                {(loading || resetLoading) ? "Limule vérifie…" : mode === "login" ? "Entrer dans KOMPTA" : mode === "reset" ? "Demander le token" : mode === "reset_confirm" ? "Changer le mot de passe" : "Créer et entrer"}
              </button>
            </div>
            <div className="mt-5 flex items-center gap-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
              <Building2 size={18} />
              Les nouvelles entreprises démarrent vides: à vous de créer employés, produits, documents et ventes.
            </div>
          </form>
        </section>

      </div>
    </main>
  );
}
