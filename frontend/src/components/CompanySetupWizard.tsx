import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, Check, X, Building2, Upload } from "lucide-react";

import { useAuth } from "../app/AuthContext";
import { api } from "../services/api";
import { LimuleIcon } from "./LimuleAvatar";
import type { Company } from "../types/domain";

/**
 * Assistant de configuration post-connexion (25+ étapes).
 *
 * - S'affiche à la première connexion d'un admin d'entreprise tant que le profil
 *   n'est pas complété, et reste relançable depuis Paramètres.
 * - Chaque étape persiste ses champs via PATCH /company/profile : la progression
 *   est donc sauvegardée côté serveur (reprise possible après fermeture).
 * - Entièrement passable ("Terminer plus tard").
 */

type CompanyDraft = Partial<Company>;

type Step =
  | { kind: "intro"; key: string; title: string; subtitle: string }
  | { kind: "recap"; key: string; title: string; subtitle: string }
  | {
      kind: "form" | "logo" | "cta";
      key: string;
      title: string;
      subtitle: string;
      fields?: (keyof Company)[];
      cta?: { label: string; route: string };
      render?: (draft: CompanyDraft, set: (patch: CompanyDraft) => void) => React.ReactNode;
    };

const FORCE_KEY = "kompta_force_setup";
const DISMISS_KEY = "kompta_setup_dismissed";

/** Relance l'assistant manuellement (depuis Paramètres). */
export function resetCompanySetup() {
  try {
    localStorage.setItem(FORCE_KEY, "1");
    localStorage.removeItem(DISMISS_KEY);
  } catch { /* no-op */ }
}

function Field({
  label, value, onChange, placeholder, type = "text", help,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; help?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/50">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-400 dark:border-white/10 dark:bg-black/20 dark:text-white dark:placeholder:text-white/35"
      />
      {help && <span className="mt-1 block text-[11px] text-slate-400 dark:text-white/40">{help}</span>}
    </label>
  );
}

function str(v: unknown): string { return typeof v === "string" ? v : v == null ? "" : String(v); }

const STEPS: Step[] = [
  { kind: "intro", key: "welcome", title: "Bienvenue dans KOMPTA", subtitle: "Configurons votre entreprise en quelques étapes. Vos réponses sont enregistrées au fur et à mesure — vous pouvez vous arrêter et reprendre quand vous voulez." },

  // ── Identité ───────────────────────────────────────────────────────────
  {
    kind: "form", key: "org", title: "Type d'organisation", subtitle: "Quel type de structure gérez-vous ?",
    fields: ["organization_type", "industry"],
    render: (d, set) => (
      <div className="space-y-4">
        <Field label="Type d'organisation" value={str(d.organization_type)} onChange={(v) => set({ organization_type: v })} placeholder="PME, Association, Coopérative…" />
        <Field label="Secteur d'activité" value={str(d.industry)} onChange={(v) => set({ industry: v })} placeholder="Commerce et services" />
      </div>
    ),
  },
  {
    kind: "form", key: "name", title: "Nom de l'entreprise", subtitle: "Le nom sous lequel vous opérez.",
    fields: ["name", "legal_name"],
    render: (d, set) => (
      <div className="space-y-4">
        <Field label="Nom commercial" value={str(d.name)} onChange={(v) => set({ name: v })} placeholder="ADANSONIA" />
        <Field label="Raison sociale" value={str(d.legal_name)} onChange={(v) => set({ legal_name: v })} placeholder="ADANSONIA SARL" />
      </div>
    ),
  },
  {
    kind: "form", key: "legal_form", title: "Forme juridique", subtitle: "La forme légale de votre structure.",
    fields: ["legal_form"],
    render: (d, set) => <Field label="Forme juridique" value={str(d.legal_form)} onChange={(v) => set({ legal_form: v })} placeholder="SARL, SA, SAS, Ets, Association…" />,
  },
  {
    kind: "form", key: "location", title: "Localisation", subtitle: "Où votre entreprise est-elle établie ?",
    fields: ["country", "city"],
    render: (d, set) => (
      <div className="space-y-4">
        <Field label="Pays" value={str(d.country)} onChange={(v) => set({ country: v })} placeholder="Congo" />
        <Field label="Ville" value={str(d.city)} onChange={(v) => set({ city: v })} placeholder="Brazzaville" />
      </div>
    ),
  },
  {
    kind: "form", key: "address", title: "Adresse", subtitle: "L'adresse physique de votre siège.",
    fields: ["address"],
    render: (d, set) => <Field label="Adresse complète" value={str(d.address)} onChange={(v) => set({ address: v })} placeholder="123 Avenue de la Paix, Centre-ville" />,
  },

  // ── Mentions légales (CEMAC / OHADA) ───────────────────────────────────
  {
    kind: "form", key: "rccm", title: "Registre du commerce (RCCM)", subtitle: "Votre numéro d'immatriculation au registre du commerce.",
    fields: ["rccm"],
    render: (d, set) => <Field label="N° RCCM" value={str(d.rccm)} onChange={(v) => set({ rccm: v })} placeholder="CG-BZV-01-2024-B12-00001" help="Laissez vide si vous ne l'avez pas encore." />,
  },
  {
    kind: "form", key: "niu", title: "Identifiant fiscal (NIU)", subtitle: "Votre numéro d'identification unique fiscal.",
    fields: ["niu"],
    render: (d, set) => <Field label="N° NIU / NIF" value={str(d.niu)} onChange={(v) => set({ niu: v })} placeholder="M2024000000000A" />,
  },
  {
    kind: "form", key: "cnss", title: "Sécurité sociale (CNSS)", subtitle: "Votre numéro d'employeur auprès de la caisse sociale.",
    fields: ["cnss_number"],
    render: (d, set) => <Field label="N° CNSS" value={str(d.cnss_number)} onChange={(v) => set({ cnss_number: v })} placeholder="Numéro employeur" />,
  },
  {
    kind: "form", key: "patente", title: "Patente", subtitle: "Votre numéro de patente / licence d'activité.",
    fields: ["patente_number"],
    render: (d, set) => <Field label="N° de patente" value={str(d.patente_number)} onChange={(v) => set({ patente_number: v })} placeholder="Numéro de patente" />,
  },
  {
    kind: "form", key: "tax", title: "Régime fiscal", subtitle: "Sous quel régime votre entreprise est-elle imposée ?",
    fields: ["tax_regime"],
    render: (d, set) => <Field label="Régime fiscal" value={str(d.tax_regime)} onChange={(v) => set({ tax_regime: v })} placeholder="Réel, Forfait, TPE…" />,
  },
  {
    kind: "form", key: "capital", title: "Capital social", subtitle: "Le capital social déclaré (utile pour vos documents légaux).",
    fields: ["share_capital", "founded_date"],
    render: (d, set) => (
      <div className="space-y-4">
        <Field label="Capital social" value={str(d.share_capital)} onChange={(v) => set({ share_capital: v })} placeholder="1 000 000 FCFA" />
        <Field label="Date de création" type="date" value={str(d.founded_date)} onChange={(v) => set({ founded_date: v })} />
      </div>
    ),
  },

  // ── Contact ────────────────────────────────────────────────────────────
  {
    kind: "form", key: "contact", title: "Coordonnées", subtitle: "Comment vos clients et partenaires vous joignent.",
    fields: ["phone", "email"],
    render: (d, set) => (
      <div className="space-y-4">
        <Field label="Téléphone" value={str(d.phone)} onChange={(v) => set({ phone: v })} placeholder="+242 06 000 0000" />
        <Field label="Email" type="email" value={str(d.email)} onChange={(v) => set({ email: v })} placeholder="contact@entreprise.com" />
      </div>
    ),
  },
  {
    kind: "form", key: "website", title: "Site web", subtitle: "Votre présence en ligne (optionnel).",
    fields: ["website"],
    render: (d, set) => <Field label="Site web" value={str(d.website)} onChange={(v) => set({ website: v })} placeholder="https://entreprise.com" />,
  },
  {
    kind: "form", key: "manager", title: "Responsable", subtitle: "Le dirigeant ou gérant de l'entreprise.",
    fields: ["manager_name", "manager_title"],
    render: (d, set) => (
      <div className="space-y-4">
        <Field label="Nom du responsable" value={str(d.manager_name)} onChange={(v) => set({ manager_name: v })} placeholder="Nom complet" />
        <Field label="Fonction" value={str(d.manager_title)} onChange={(v) => set({ manager_title: v })} placeholder="Gérant, Directeur Général…" />
      </div>
    ),
  },

  // ── Banque & trésorerie ────────────────────────────────────────────────
  {
    kind: "form", key: "bank", title: "Coordonnées bancaires", subtitle: "Pour vos factures et rapprochements.",
    fields: ["bank_name", "bank_account"],
    render: (d, set) => (
      <div className="space-y-4">
        <Field label="Banque" value={str(d.bank_name)} onChange={(v) => set({ bank_name: v })} placeholder="Nom de la banque" />
        <Field label="N° de compte / IBAN" value={str(d.bank_account)} onChange={(v) => set({ bank_account: v })} placeholder="Numéro de compte" />
      </div>
    ),
  },
  {
    kind: "form", key: "threshold", title: "Alerte trésorerie", subtitle: "Limule vous alerte quand votre trésorerie passe sous ce seuil.",
    fields: ["cash_low_threshold_cents"],
    render: (d, set) => (
      <Field
        label="Seuil d'alerte (FCFA)"
        type="number"
        value={d.cash_low_threshold_cents != null ? String(Math.round(d.cash_low_threshold_cents / 100)) : ""}
        onChange={(v) => set({ cash_low_threshold_cents: v ? Math.round(Number(v) * 100) : undefined })}
        placeholder="50000"
        help="Par défaut 50 000 FCFA."
      />
    ),
  },

  // ── Marque ─────────────────────────────────────────────────────────────
  {
    kind: "form", key: "colors", title: "Couleurs de marque", subtitle: "Personnalisez l'apparence de votre espace et de vos documents.",
    fields: ["primary_color", "accent_color"],
    render: (d, set) => (
      <div className="space-y-4">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-black/20">
          <span className="text-sm font-semibold text-slate-700 dark:text-white/80">Couleur principale</span>
          <input type="color" value={str(d.primary_color) || "#047857"} onChange={(e) => set({ primary_color: e.target.value })} className="h-9 w-14 cursor-pointer rounded-md border-0 bg-transparent" />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-black/20">
          <span className="text-sm font-semibold text-slate-700 dark:text-white/80">Couleur secondaire</span>
          <input type="color" value={str(d.accent_color) || "#065f46"} onChange={(e) => set({ accent_color: e.target.value })} className="h-9 w-14 cursor-pointer rounded-md border-0 bg-transparent" />
        </label>
      </div>
    ),
  },
  { kind: "logo", key: "logo", title: "Logo de l'entreprise", subtitle: "Il apparaîtra sur vos factures, devis et rapports. (PNG, JPEG ou WebP)" },

  // ── Mise en route (CTA vers les modules) ───────────────────────────────
  { kind: "cta", key: "payments", title: "Méthodes d'encaissement", subtitle: "Configurez comment vos clients vous paient (Mobile Money, espèces, virement, carte).", cta: { label: "Configurer l'encaissement", route: "/settings?tab=payments" } },
  { kind: "cta", key: "employees", title: "Votre équipe", subtitle: "Ajoutez vos premiers employés et générez leurs accès. (Optionnel)", cta: { label: "Ajouter un employé", route: "/employees" } },
  { kind: "cta", key: "products", title: "Vos produits / services", subtitle: "Constituez votre catalogue pour la caisse et la facturation. (Optionnel)", cta: { label: "Ajouter un produit", route: "/inventory" } },
  { kind: "cta", key: "subscription", title: "Votre offre", subtitle: "Vous bénéficiez d'un essai gratuit. Découvrez les offres et les modules inclus.", cta: { label: "Voir les offres", route: "/settings?tab=subscription" } },

  { kind: "recap", key: "done", title: "Configuration prête !", subtitle: "Votre entreprise est configurée. Vous pourrez compléter ou modifier ces informations à tout moment depuis Paramètres → Entreprise." },
];

export function CompanySetupWizard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState<CompanyDraft>({});
  const [saving, setSaving] = useState(false);
  const [completion, setCompletion] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);

  const isCompanyAdmin = user?.role === "admin_entreprise";

  // Démarrage : admin d'entreprise, profil incomplet, non rejeté — ou relance forcée.
  useEffect(() => {
    if (!user || user.must_change_password || !isCompanyAdmin) return;
    let forced = false, dismissed = false;
    try {
      forced = localStorage.getItem(FORCE_KEY) === "1";
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch { /* */ }
    if (forced) { void open(); return; }
    if (dismissed) return;
    // La visite guidée (30 étapes) est désormais opt-in et ne bloque plus le
    // démarrage de cet assistant : les indices contextuels par module
    // (ModuleHint) prennent le relais pour l'aide progressive.
    void api.company().then((c) => {
      if ((c.completion_score ?? 0) < 100) { setDraft(c); setCompletion(c.completion_score ?? 0); setActive(true); }
    }).catch(() => { /* */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function open() {
    try {
      const c = await api.company();
      setDraft(c); setCompletion(c.completion_score ?? 0);
    } catch { /* */ }
    try { localStorage.removeItem(FORCE_KEY); } catch { /* */ }
    setIdx(0); setActive(true);
  }

  const step = STEPS[idx];
  const isLast = idx === STEPS.length - 1;

  function setPatch(patch: CompanyDraft) { setDraft((d) => ({ ...d, ...patch })); }

  function dismiss() {
    setActive(false);
    try { localStorage.setItem(DISMISS_KEY, "1"); localStorage.removeItem(FORCE_KEY); } catch { /* */ }
  }

  async function persistCurrent(): Promise<void> {
    if (step.kind !== "form" || !step.fields?.length) return;
    const payload: CompanyDraft = {};
    for (const f of step.fields) {
      if (draft[f] !== undefined) (payload as Record<string, unknown>)[f] = draft[f];
    }
    if (Object.keys(payload).length === 0) return;
    const updated = await api.updateCompany(payload);
    setCompletion(updated.completion_score ?? completion);
  }

  async function next() {
    if (saving) return;
    setSaving(true);
    try {
      await persistCurrent();
      if (isLast) { dismiss(); return; }
      setIdx((i) => i + 1);
    } catch { /* on garde l'étape en cas d'échec réseau */ }
    finally { setSaving(false); }
  }

  function prev() { setIdx((i) => Math.max(0, i - 1)); }

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try { await api.uploadCompanyLogo(file); setLogoName(file.name); }
    catch { /* */ }
    finally { setSaving(false); }
  }

  const progress = useMemo(() => Math.round(((idx + 1) / STEPS.length) * 100), [idx]);

  if (!active || !user || !isCompanyAdmin) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-[rgba(10,15,25,0.78)] p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-[#1a1d23]">
        {/* En-tête */}
        <div className="flex shrink-0 items-start gap-3 bg-gradient-to-br from-emerald-500 to-emerald-700 px-6 pb-5 pt-6 text-white">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15">
            {step.kind === "intro" || step.kind === "recap" ? <LimuleIcon size={26} /> : <Building2 size={24} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">Configuration · étape {idx + 1}/{STEPS.length}</p>
            <h3 className="text-lg font-black leading-tight">{step.title}</h3>
          </div>
          <button onClick={dismiss} aria-label="Fermer" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/80 hover:bg-white/15"><X size={16} /></button>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="text-sm leading-relaxed text-[#3f4a55] dark:text-white/75">{step.subtitle}</p>

          {step.kind === "form" && step.render && (
            <div className="mt-5">{step.render(draft, setPatch)}</div>
          )}

          {step.kind === "logo" && (
            <div className="mt-5">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogo} className="hidden" />
              <button onClick={() => fileRef.current?.click()} disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 px-4 py-6 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Upload size={18} /> {logoName ? `Logo importé : ${logoName}` : "Importer un logo"}
              </button>
              <p className="mt-2 text-[11px] text-slate-400 dark:text-white/40">Vous pourrez le changer plus tard dans Paramètres.</p>
            </div>
          )}

          {step.kind === "cta" && step.cta && (
            <button
              onClick={() => { dismiss(); navigate(step.cta!.route); }}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
            >
              {step.cta.label} <ArrowRight size={16} />
            </button>
          )}

          {step.kind === "recap" && (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <Check size={18} /><span className="text-sm font-bold">Profil complété à {completion}%</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-emerald-200/60 dark:bg-white/10">
                <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${completion}%` }} />
              </div>
            </div>
          )}

          {/* Barre de progression de l'assistant */}
          <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-white/10">
            <div className="h-full rounded-full bg-emerald-600 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Pied */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 px-6 py-4 dark:border-white/10">
          <button onClick={dismiss} className="text-xs font-semibold text-[#717182] hover:text-[#17211f] dark:hover:text-white">Terminer plus tard</button>
          <div className="flex items-center gap-2">
            {idx > 0 && (
              <button onClick={prev} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
                <ArrowLeft size={15} /> Précédent
              </button>
            )}
            <button onClick={next} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
              {isLast ? "Terminer" : "Suivant"} {!isLast && <ArrowRight size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
