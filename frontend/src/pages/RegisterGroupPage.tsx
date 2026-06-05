import {
  ArrowLeft, Building2, Calendar, ChevronRight, Globe, KeyRound,
  Loader2, MapPin, MessageCircle, Sparkles, User, Users2, Vote, Wallet,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../app/AuthContext";
import { api, setToken } from "../services/api";
import { LimuleIcon } from "../components/LimuleAvatar";
import { TextInput, SelectInput } from "../components/FormField";

const GROUP_TYPES = [
  { value: "association",       label: "Association" },
  { value: "tontine",           label: "Tontine / Groupe d'épargne" },
  { value: "mutuelle",          label: "Mutuelle / Solidarité" },
  { value: "ONG",               label: "ONG / Organisation à but non lucratif" },
  { value: "église",            label: "Communauté religieuse" },
  { value: "club sportif",      label: "Club sportif" },
  { value: "syndicat",          label: "Syndicat professionnel" },
  { value: "coopérative",       label: "Coopérative" },
  { value: "groupe familial",   label: "Groupe familial / Clan" },
  { value: "comité",            label: "Comité / Bureau" },
  { value: "groupe d'amis",     label: "Groupe d'amis" },
  { value: "collectif",         label: "Collectif / Mouvement" },
  { value: "groupe scolaire",   label: "Association scolaire / Étudiante" },
  { value: "groupement agricole", label: "Groupement agricole / Paysan" },
  { value: "autre",             label: "Autre organisation" },
];

const CURRENCIES = [
  { value: "XAF", label: "XAF — Franc CFA CEMAC" },
  { value: "XOF", label: "XOF — Franc CFA UEMOA" },
  { value: "CDF", label: "CDF — Franc congolais" },
  { value: "USD", label: "USD — Dollar américain" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "NGN", label: "NGN — Naira nigérian" },
];

const COUNTRIES = [
  "Congo", "RDC", "Cameroun", "Gabon", "Sénégal", "Côte d'Ivoire",
  "Mali", "Burkina Faso", "Niger", "Togo", "Bénin", "Guinea", "Tchad",
  "Centrafrique", "France", "Belgique", "Canada", "Autre",
];

const FEATURES = [
  { key: "cotisations",   icon: Wallet,          label: "Cotisations & Caisse" },
  { key: "inventaire",    icon: Building2,       label: "Inventaire du groupe" },
  { key: "chat",          icon: MessageCircle,   label: "Chat & Messagerie" },
  { key: "votes",         icon: Vote,            label: "Votes & Décisions" },
  { key: "anniversaires", icon: Calendar,        label: "Anniversaires & Rappels" },
  { key: "ia",            icon: Sparkles,        label: "Assistant IA Limule" },
];

// Étapes : si connecté → 1..3 ; si non connecté → 0..3 (étape 0 = compte)
type Step = 0 | 1 | 2 | 3;

export function RegisterGroupPage() {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  // Si l'utilisateur n'est pas connecté, on commence à l'étape 0 (création de compte)
  const [step, setStep] = useState<Step>(token ? 1 : 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Compte utilisateur (étape 0 — non connecté seulement)
  const [account, setAccount] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: "",
    password_confirm: "",
  });

  // Infos groupe
  const [form, setForm] = useState({
    name: "",
    type: "association",
    description: "",
    country: "Congo",
    city: "",
    currency: "XAF",
    features: ["cotisations", "chat", "anniversaires", "ia"] as string[],
  });

  function toggleFeature(key: string) {
    setForm(f => ({
      ...f,
      features: f.features.includes(key) ? f.features.filter(x => x !== key) : [...f.features, key],
    }));
  }

  function set(field: keyof typeof form, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function setAcc(field: keyof typeof account, value: string) {
    setAccount(a => ({ ...a, [field]: value }));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Le nom du groupe est obligatoire"); return; }
    setLoading(true);
    setError("");

    try {
      if (token) {
        // Utilisateur déjà connecté → créer le groupe directement
        const group = await api.createGroup({
          name: form.name.trim(),
          type: form.type,
          description: form.description,
          city: form.city,
          currency: form.currency,
        });
        navigate(`/groups/${group.id}/dashboard`, { replace: true });
      } else {
        // Utilisateur non connecté → inscription compte + groupe en une seule étape
        if (account.password !== account.password_confirm) {
          setError("Les mots de passe ne correspondent pas");
          setLoading(false);
          return;
        }
        const resp = await api.registerGroup({
          full_name: account.full_name.trim(),
          email: account.email.trim(),
          phone: account.phone.trim(),
          password: account.password,
          group_name: form.name.trim(),
          group_type: form.type,
          group_description: form.description,
          country: form.country,
          city: form.city,
          currency: form.currency,
        });
        // Connexion automatique avec le token reçu
        setToken(resp.access_token);
        // Extraire l'ID du groupe depuis le token ou naviguer vers la liste
        const groupId = (resp as { group_id?: number }).group_id;
        if (groupId) {
          navigate(`/groups/${groupId}/dashboard`, { replace: true });
        } else {
          navigate("/groups", { replace: true });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création");
    } finally {
      setLoading(false);
    }
  }

  const typeLabel = GROUP_TYPES.find(t => t.value === form.type)?.label ?? form.type;
  // Total étapes : 0 (compte) + 1 (identité) + 2 (localisation) + 3 (fonctionnalités)
  const totalSteps = token ? 3 : 4;
  const stepIndex = token ? step : step; // 0-based quand non connecté
  const stepLabels = token
    ? ["Identité du groupe", "Localisation & devise", "Fonctionnalités"]
    : ["Votre compte", "Identité du groupe", "Localisation & devise", "Fonctionnalités"];

  return (
    <div className="min-h-dvh bg-[#f7f8fa] dark:bg-[#0d1117] flex flex-col">

      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#111827]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(token ? "/workspace" : "/login")} className="flex items-center gap-1.5 text-sm text-[#717182] hover:text-[#17211f] dark:hover:text-white transition">
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Retour</span>
          </button>
          <div className="h-4 w-px bg-stone-200 dark:bg-[#374151]" />
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-xs font-black">G</div>
            <span className="text-sm font-black text-[#17211f] dark:text-white">Créer un groupe</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#717182]">
          <LimuleIcon size={14} />
          <span className="hidden sm:inline">KOMPTA Groupes</span>
        </div>
      </header>

      {/* Steps indicator */}
      <div className="flex items-center justify-center gap-1.5 sm:gap-2 py-4 px-4">
        {stepLabels.map((label, idx) => {
          const s = (token ? idx + 1 : idx) as Step;
          const isActive = step === s;
          const isDone = step > s;
          return (
            <div key={idx} className="flex items-center gap-1.5 sm:gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black transition ${
                isDone ? "bg-violet-600 text-white" : isActive ? "bg-violet-600 text-white ring-4 ring-violet-500/20" : "bg-stone-200 dark:bg-[#1f2937] text-[#717182]"
              }`}>
                {isDone ? "✓" : idx + 1}
              </div>
              {idx < stepLabels.length - 1 && (
                <div className={`h-px w-6 sm:w-12 transition ${isDone ? "bg-violet-600" : "bg-stone-200 dark:bg-[#1f2937]"}`} />
              )}
            </div>
          );
        })}
      </div>
      <div className="text-center -mt-1 mb-2">
        <p className="text-xs text-[#717182] font-medium">{stepLabels[token ? step - 1 : step]}</p>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-start justify-center px-4 py-4">
        <form onSubmit={handleCreate} className="w-full max-w-lg space-y-5">

          {/* ── Étape 0 : Votre compte (non connecté) ── */}
          {step === 0 && (
            <div className="rounded-2xl border border-stone-200 dark:border-[#1f2937] bg-white dark:bg-[#111827] p-6 space-y-4">
              <div>
                <h2 className="text-xl font-black text-[#17211f] dark:text-white">Votre compte</h2>
                <p className="text-sm text-[#717182] mt-0.5">Créez votre compte pour gérer vos groupes.</p>
              </div>
              <TextInput
                label="Nom complet *"
                value={account.full_name}
                onChange={e => setAcc("full_name", e.target.value)}
                placeholder="Ex : Marie-Claire Nzinga"
                required
              />
              <TextInput
                label="Email *"
                type="email"
                value={account.email}
                onChange={e => setAcc("email", e.target.value)}
                placeholder="votre@email.com"
                required
              />
              <TextInput
                label="Téléphone (optionnel)"
                type="tel"
                value={account.phone}
                onChange={e => setAcc("phone", e.target.value)}
                placeholder="+242 06 000 0000"
              />
              <TextInput
                label="Mot de passe *"
                type="password"
                value={account.password}
                onChange={e => setAcc("password", e.target.value)}
                placeholder="Minimum 8 caractères"
                required
              />
              <TextInput
                label="Confirmer le mot de passe *"
                type="password"
                value={account.password_confirm}
                onChange={e => setAcc("password_confirm", e.target.value)}
                placeholder="Répétez le mot de passe"
                required
              />
              <p className="text-xs text-[#717182]">
                Déjà un compte ?{" "}
                <Link to="/login" className="text-violet-600 hover:underline font-semibold">Se connecter</Link>
              </p>
            </div>
          )}

          {/* ── Étape 1 : Identité ── */}
          {step === 1 && (
            <div className="rounded-2xl border border-stone-200 dark:border-[#1f2937] bg-white dark:bg-[#111827] p-6 space-y-4">
              <div>
                <h2 className="text-xl font-black text-[#17211f] dark:text-white">Identité du groupe</h2>
                <p className="text-sm text-[#717182] mt-0.5">Donnez un nom et un type à votre groupe.</p>
              </div>

              <TextInput
                label="Nom du groupe *"
                value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder="Ex : Association des Femmes du Marché Central"
                required
              />

              <SelectInput label="Type de groupe *" value={form.type} onChange={e => set("type", e.target.value)}>
                {GROUP_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </SelectInput>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">Description (optionnel)</label>
                <textarea
                  value={form.description}
                  onChange={e => set("description", e.target.value)}
                  rows={3}
                  placeholder="Décrivez brièvement l'objectif et les activités de votre groupe…"
                  className="mt-1 w-full rounded-lg border border-stone-200 dark:border-[#374151] bg-white dark:bg-[#1f2937] px-3 py-2.5 text-base sm:text-sm outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-100 dark:text-white resize-none"
                />
              </div>
            </div>
          )}

          {/* ── Étape 2 : Localisation ── */}
          {step === 2 && (
            <div className="rounded-2xl border border-stone-200 dark:border-[#1f2937] bg-white dark:bg-[#111827] p-6 space-y-4">
              <div>
                <h2 className="text-xl font-black text-[#17211f] dark:text-white">Localisation & Devise</h2>
                <p className="text-sm text-[#717182] mt-0.5">Pour adapter la monnaie et le contexte fiscal.</p>
              </div>

              <SelectInput label="Pays" value={form.country} onChange={e => set("country", e.target.value)}>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </SelectInput>

              <TextInput
                label="Ville / Zone"
                value={form.city}
                onChange={e => set("city", e.target.value)}
                placeholder="Ex : Brazzaville, Plateau"
              />

              <SelectInput label="Devise du groupe" value={form.currency} onChange={e => set("currency", e.target.value)}>
                {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </SelectInput>
            </div>
          )}

          {/* ── Étape 3 : Fonctionnalités ── */}
          {step === 3 && (
            <div className="rounded-2xl border border-stone-200 dark:border-[#1f2937] bg-white dark:bg-[#111827] p-6 space-y-4">
              <div>
                <h2 className="text-xl font-black text-[#17211f] dark:text-white">Fonctionnalités</h2>
                <p className="text-sm text-[#717182] mt-0.5">Activez celles dont vous avez besoin (modifiable plus tard).</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {FEATURES.map(f => {
                  const active = form.features.includes(f.key);
                  const Icon = f.icon;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => toggleFeature(f.key)}
                      className={`flex items-center gap-2.5 rounded-xl border p-3 text-left text-sm font-semibold transition ${
                        active
                          ? "border-violet-500/50 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300"
                          : "border-stone-200 dark:border-[#374151] text-[#717182] hover:border-stone-300 dark:hover:border-[#4b5563]"
                      }`}
                    >
                      <Icon size={16} className={active ? "text-violet-600 dark:text-violet-400" : ""} />
                      <span className="leading-tight text-xs">{f.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Récap */}
              <div className="rounded-xl bg-[#f7f8fa] dark:bg-[#1f2937] p-4 space-y-2">
                <p className="text-xs font-bold text-[#717182] uppercase">Récapitulatif</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Users2 size={14} className="text-violet-500" />
                    <span className="font-bold text-[#17211f] dark:text-white">{form.name || "Nom non défini"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#717182]">
                    <Globe size={12} />
                    <span>{typeLabel} · {form.country}{form.city ? `, ${form.city}` : ""} · {form.currency}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-700 dark:text-red-400 font-medium">
              {error}
            </div>
          )}

          {/* Boutons nav */}
          <div className="flex gap-3">
            {step > (token ? 1 : 0) && (
              <button
                type="button"
                onClick={() => setStep(s => (s - 1) as Step)}
                className="flex items-center gap-2 rounded-xl border border-stone-200 dark:border-[#374151] bg-white dark:bg-[#111827] px-4 py-3 text-sm font-bold text-[#717182] hover:bg-stone-50 dark:hover:bg-[#1f2937] transition"
              >
                <ArrowLeft size={14} />
                Retour
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  // Validations par étape
                  if (step === 0) {
                    if (!account.full_name.trim()) { setError("Le nom complet est obligatoire"); return; }
                    if (!account.email.trim()) { setError("L'email est obligatoire"); return; }
                    if (account.password.length < 8) { setError("Le mot de passe doit faire au moins 8 caractères"); return; }
                    if (account.password !== account.password_confirm) { setError("Les mots de passe ne correspondent pas"); return; }
                  }
                  if (step === 1 && !form.name.trim()) { setError("Le nom du groupe est obligatoire"); return; }
                  setError("");
                  setStep(s => (s + 1) as Step);
                }}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3.5 sm:py-3 text-base sm:text-sm font-bold text-white hover:bg-violet-700 transition active:scale-[0.98]"
              >
                Continuer
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading || !form.name.trim()}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3.5 sm:py-3 text-base sm:text-sm font-bold text-white hover:bg-violet-700 transition active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={16} />}
                {loading ? "Création en cours…" : token ? "Créer le groupe" : "Créer mon compte & le groupe"}
              </button>
            )}
          </div>

          {/* Si pas connecté */}
          {!token && (
            <p className="text-center text-xs text-[#717182]">
              Déjà un compte ?{" "}
              <Link to="/login" className="text-violet-600 hover:underline font-semibold">Se connecter</Link>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
