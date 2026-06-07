import {
  ArrowLeft, Building2, Calendar, ChevronRight, Globe, KeyRound,
  Loader2, MapPin, MessageCircle, Sparkles, User, Users2, Vote, Wallet,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../app/AuthContext";
import { api, setToken } from "../services/api";
import { LimuleIcon } from "../components/LimuleAvatar";
import { TextInput, SelectInput } from "../components/FormField";

const GROUP_TYPES = [
  { value: "association",       tk: "registerGroup.gtAssociation" },
  { value: "tontine",           tk: "registerGroup.gtTontine" },
  { value: "mutuelle",          tk: "registerGroup.gtMutuelle" },
  { value: "ONG",               tk: "registerGroup.gtOng" },
  { value: "église",            tk: "registerGroup.gtChurch" },
  { value: "club sportif",      tk: "registerGroup.gtSport" },
  { value: "syndicat",          tk: "registerGroup.gtUnion" },
  { value: "coopérative",       tk: "registerGroup.gtCoop" },
  { value: "groupe familial",   tk: "registerGroup.gtFamily" },
  { value: "comité",            tk: "registerGroup.gtCommittee" },
  { value: "groupe d'amis",     tk: "registerGroup.gtFriends" },
  { value: "collectif",         tk: "registerGroup.gtCollective" },
  { value: "groupe scolaire",   tk: "registerGroup.gtSchool" },
  { value: "groupement agricole", tk: "registerGroup.gtAgri" },
  { value: "autre",             tk: "registerGroup.gtOther" },
];

const CURRENCIES = [
  { value: "XAF", tk: "currencies.groups.XAF" },
  { value: "XOF", tk: "currencies.groups.XOF" },
  { value: "CDF", tk: "currencies.groups.CDF" },
  { value: "USD", tk: "currencies.groups.USD" },
  { value: "EUR", tk: "currencies.groups.EUR" },
  { value: "NGN", tk: "currencies.groups.NGN" },
];

const COUNTRIES = [
  { value: "Congo", tk: "countries.congo" },
  { value: "RDC", tk: "countries.drc" },
  { value: "Cameroun", tk: "countries.cameroon" },
  { value: "Gabon", tk: "countries.gabon" },
  { value: "Sénégal", tk: "countries.senegal" },
  { value: "Côte d'Ivoire", tk: "countries.ivoryCoast" },
  { value: "Mali", tk: "countries.mali" },
  { value: "Burkina Faso", tk: "countries.burkinaFaso" },
  { value: "Niger", tk: "countries.niger" },
  { value: "Togo", tk: "countries.togo" },
  { value: "Bénin", tk: "countries.benin" },
  { value: "Guinea", tk: "countries.guinea" },
  { value: "Tchad", tk: "countries.chad" },
  { value: "Centrafrique", tk: "countries.centralAfricanRepublic" },
  { value: "France", tk: "countries.france" },
  { value: "Belgique", tk: "countries.belgium" },
  { value: "Canada", tk: "countries.canada" },
  { value: "Autre", tk: "countries.other" },
];

const FEATURES = [
  { key: "cotisations",   icon: Wallet,          tk: "registerGroup.featCotisations" },
  { key: "inventaire",    icon: Building2,       tk: "registerGroup.featInventory" },
  { key: "chat",          icon: MessageCircle,   tk: "registerGroup.featChat" },
  { key: "votes",         icon: Vote,            tk: "registerGroup.featVotes" },
  { key: "anniversaires", icon: Calendar,        tk: "registerGroup.featBirthdays" },
  { key: "ia",            icon: Sparkles,        tk: "registerGroup.featAi" },
];

function countryLabel(value: string, tr: (key: string) => string) {
  return tr(COUNTRIES.find((country) => country.value === value)?.tk ?? "countries.other");
}

// Étapes : si connecté → 1..3 ; si non connecté → 0..3 (étape 0 = compte)
type Step = 0 | 1 | 2 | 3;

export function RegisterGroupPage() {
  const { t: tr } = useTranslation();
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
    if (!form.name.trim()) { setError(tr("registerGroup.errGroupName")); return; }
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
          setError(tr("registerGroup.errPwdMismatch"));
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
      setError(err instanceof Error ? err.message : tr("registerGroup.errCreate"));
    } finally {
      setLoading(false);
    }
  }

  const typeLabel = (() => { const m = GROUP_TYPES.find(t => t.value === form.type); return m ? tr(m.tk) : form.type; })();
  // Total étapes : 0 (compte) + 1 (identité) + 2 (localisation) + 3 (fonctionnalités)
  const totalSteps = token ? 3 : 4;
  const stepIndex = token ? step : step; // 0-based quand non connecté
  const stepLabels = token
    ? [tr("registerGroup.stepIdentity"), tr("registerGroup.stepLocation"), tr("registerGroup.stepFeatures")]
    : [tr("registerGroup.stepAccount"), tr("registerGroup.stepIdentity"), tr("registerGroup.stepLocation"), tr("registerGroup.stepFeatures")];

  return (
    <div className="min-h-dvh bg-[#f7f8fa] dark:bg-[#0d1117] flex flex-col">

      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#111827]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(token ? "/workspace" : "/login")} className="flex items-center gap-1.5 text-sm text-[#717182] hover:text-[#17211f] dark:hover:text-white transition">
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">{tr("registerGroup.back")}</span>
          </button>
          <div className="h-4 w-px bg-stone-200 dark:bg-[#374151]" />
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-xs font-black">G</div>
            <span className="text-sm font-black text-[#17211f] dark:text-white">{tr("registerGroup.createGroupHeader")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#717182]">
          <LimuleIcon size={14} />
          <span className="hidden sm:inline">{tr("registerGroup.komptaGroups")}</span>
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
                <h2 className="text-xl font-black text-[#17211f] dark:text-white">{tr("registerGroup.stepAccount")}</h2>
                <p className="text-sm text-[#717182] mt-0.5">{tr("registerGroup.acctDesc")}</p>
              </div>
              <TextInput
                label={tr("registerGroup.fullName")}
                value={account.full_name}
                onChange={e => setAcc("full_name", e.target.value)}
                placeholder={tr("registerGroup.fullNamePlaceholder")}
                required
              />
              <TextInput
                label={tr("registerGroup.email")}
                type="email"
                value={account.email}
                onChange={e => setAcc("email", e.target.value)}
                placeholder={tr("registerGroup.emailPlaceholder")}
                required
              />
              <TextInput
                label={tr("registerGroup.phone")}
                type="tel"
                value={account.phone}
                onChange={e => setAcc("phone", e.target.value)}
                placeholder={tr("registerGroup.phonePlaceholder")}
              />
              <TextInput
                label={tr("registerGroup.password")}
                type="password"
                value={account.password}
                onChange={e => setAcc("password", e.target.value)}
                placeholder={tr("registerGroup.pwdPlaceholder")}
                required
              />
              <TextInput
                label={tr("registerGroup.pwdConfirm")}
                type="password"
                value={account.password_confirm}
                onChange={e => setAcc("password_confirm", e.target.value)}
                placeholder={tr("registerGroup.pwdConfirmPlaceholder")}
                required
              />
              <p className="text-xs text-[#717182]">
                {tr("registerGroup.alreadyAccount")}{" "}
                <Link to="/login" className="text-violet-600 hover:underline font-semibold">{tr("registerGroup.signIn")}</Link>
              </p>
            </div>
          )}

          {/* ── Étape 1 : Identité ── */}
          {step === 1 && (
            <div className="rounded-2xl border border-stone-200 dark:border-[#1f2937] bg-white dark:bg-[#111827] p-6 space-y-4">
              <div>
                <h2 className="text-xl font-black text-[#17211f] dark:text-white">{tr("registerGroup.stepIdentity")}</h2>
                <p className="text-sm text-[#717182] mt-0.5">{tr("registerGroup.identityDesc")}</p>
              </div>

              <TextInput
                label={tr("registerGroup.groupName")}
                value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder={tr("registerGroup.groupNamePlaceholder")}
                required
              />

              <SelectInput label={tr("registerGroup.groupType")} value={form.type} onChange={e => set("type", e.target.value)}>
                {GROUP_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{tr(t.tk)}</option>
                ))}
              </SelectInput>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-500 mb-1">{tr("registerGroup.descLabel")}</label>
                <textarea
                  value={form.description}
                  onChange={e => set("description", e.target.value)}
                  rows={3}
                  placeholder={tr("registerGroup.descPlaceholder")}
                  className="mt-1 w-full rounded-lg border border-stone-200 dark:border-[#374151] bg-white dark:bg-[#1f2937] px-3 py-2.5 text-base sm:text-sm outline-none transition focus:border-violet-600 focus:ring-2 focus:ring-violet-100 dark:text-white resize-none"
                />
              </div>
            </div>
          )}

          {/* ── Étape 2 : Localisation ── */}
          {step === 2 && (
            <div className="rounded-2xl border border-stone-200 dark:border-[#1f2937] bg-white dark:bg-[#111827] p-6 space-y-4">
              <div>
                <h2 className="text-xl font-black text-[#17211f] dark:text-white">{tr("registerGroup.locationTitle")}</h2>
                <p className="text-sm text-[#717182] mt-0.5">{tr("registerGroup.locationDesc")}</p>
              </div>

              <SelectInput label={tr("registerGroup.country")} value={form.country} onChange={e => set("country", e.target.value)}>
                {COUNTRIES.map(c => <option key={c.value} value={c.value}>{tr(c.tk)}</option>)}
              </SelectInput>

              <TextInput
                label={tr("registerGroup.city")}
                value={form.city}
                onChange={e => set("city", e.target.value)}
                placeholder={tr("registerGroup.cityPlaceholder")}
              />

              <SelectInput label={tr("registerGroup.currencyLabel")} value={form.currency} onChange={e => set("currency", e.target.value)}>
                {CURRENCIES.map(c => <option key={c.value} value={c.value}>{tr(c.tk)}</option>)}
              </SelectInput>
            </div>
          )}

          {/* ── Étape 3 : Fonctionnalités ── */}
          {step === 3 && (
            <div className="rounded-2xl border border-stone-200 dark:border-[#1f2937] bg-white dark:bg-[#111827] p-6 space-y-4">
              <div>
                <h2 className="text-xl font-black text-[#17211f] dark:text-white">{tr("registerGroup.stepFeatures")}</h2>
                <p className="text-sm text-[#717182] mt-0.5">{tr("registerGroup.featuresDesc")}</p>
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
                      <span className="leading-tight text-xs">{tr(f.tk)}</span>
                    </button>
                  );
                })}
              </div>

              {/* Récap */}
              <div className="rounded-xl bg-[#f7f8fa] dark:bg-[#1f2937] p-4 space-y-2">
                <p className="text-xs font-bold text-[#717182] uppercase">{tr("registerGroup.recap")}</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Users2 size={14} className="text-violet-500" />
                    <span className="font-bold text-[#17211f] dark:text-white">{form.name || tr("registerGroup.nameUndefined")}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#717182]">
                    <Globe size={12} />
                    <span>{typeLabel} · {countryLabel(form.country, tr)}{form.city ? `, ${form.city}` : ""} · {form.currency}</span>
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
                {tr("registerGroup.back")}
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  // Validations par étape
                  if (step === 0) {
                    if (!account.full_name.trim()) { setError(tr("registerGroup.errFullName")); return; }
                    if (!account.email.trim()) { setError(tr("registerGroup.errEmail")); return; }
                    if (account.password.length < 8) { setError(tr("registerGroup.errPwdLen")); return; }
                    if (account.password !== account.password_confirm) { setError(tr("registerGroup.errPwdMismatch")); return; }
                  }
                  if (step === 1 && !form.name.trim()) { setError(tr("registerGroup.errGroupName")); return; }
                  setError("");
                  setStep(s => (s + 1) as Step);
                }}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3.5 sm:py-3 text-base sm:text-sm font-bold text-white hover:bg-violet-700 transition active:scale-[0.98]"
              >
                {tr("registerGroup.continue")}
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading || !form.name.trim()}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3.5 sm:py-3 text-base sm:text-sm font-bold text-white hover:bg-violet-700 transition active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={16} />}
                {loading ? tr("registerGroup.creating") : token ? tr("registerGroup.createGroupBtn") : tr("registerGroup.createAccountGroup")}
              </button>
            )}
          </div>

          {/* Si pas connecté */}
          {!token && (
            <p className="text-center text-xs text-[#717182]">
              {tr("registerGroup.alreadyAccount")}{" "}
              <Link to="/login" className="text-violet-600 hover:underline font-semibold">{tr("registerGroup.signIn")}</Link>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
