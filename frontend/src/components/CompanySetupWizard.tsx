import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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

function buildSteps(tr: TFunction): Step[] {
  const s = (key: string) => `companySetupWizard.steps.${key}`;
  return [
    { kind: "intro", key: "welcome", title: tr(s("welcome.title")), subtitle: tr(s("welcome.subtitle")) },

    // ── Identité ───────────────────────────────────────────────────────────
    {
      kind: "form", key: "org", title: tr(s("org.title")), subtitle: tr(s("org.subtitle")),
      fields: ["organization_type", "industry"],
      render: (d, set) => (
        <div className="space-y-4">
          <Field label={tr(s("org.orgTypeLabel"))} value={str(d.organization_type)} onChange={(v) => set({ organization_type: v })} placeholder={tr(s("org.orgTypePlaceholder"))} />
          <Field label={tr(s("org.industryLabel"))} value={str(d.industry)} onChange={(v) => set({ industry: v })} placeholder={tr(s("org.industryPlaceholder"))} />
        </div>
      ),
    },
    {
      kind: "form", key: "name", title: tr(s("name.title")), subtitle: tr(s("name.subtitle")),
      fields: ["name", "legal_name"],
      render: (d, set) => (
        <div className="space-y-4">
          <Field label={tr(s("name.commercialLabel"))} value={str(d.name)} onChange={(v) => set({ name: v })} placeholder={tr(s("name.commercialPlaceholder"))} />
          <Field label={tr(s("name.legalLabel"))} value={str(d.legal_name)} onChange={(v) => set({ legal_name: v })} placeholder={tr(s("name.legalPlaceholder"))} />
        </div>
      ),
    },
    {
      kind: "form", key: "legal_form", title: tr(s("legalForm.title")), subtitle: tr(s("legalForm.subtitle")),
      fields: ["legal_form"],
      render: (d, set) => <Field label={tr(s("legalForm.label"))} value={str(d.legal_form)} onChange={(v) => set({ legal_form: v })} placeholder={tr(s("legalForm.placeholder"))} />,
    },
    {
      kind: "form", key: "location", title: tr(s("location.title")), subtitle: tr(s("location.subtitle")),
      fields: ["country", "city"],
      render: (d, set) => (
        <div className="space-y-4">
          <Field label={tr(s("location.countryLabel"))} value={str(d.country)} onChange={(v) => set({ country: v })} placeholder={tr(s("location.countryPlaceholder"))} />
          <Field label={tr(s("location.cityLabel"))} value={str(d.city)} onChange={(v) => set({ city: v })} placeholder={tr(s("location.cityPlaceholder"))} />
        </div>
      ),
    },
    {
      kind: "form", key: "address", title: tr(s("address.title")), subtitle: tr(s("address.subtitle")),
      fields: ["address"],
      render: (d, set) => <Field label={tr(s("address.label"))} value={str(d.address)} onChange={(v) => set({ address: v })} placeholder={tr(s("address.placeholder"))} />,
    },

    // ── Mentions légales (CEMAC / OHADA) ───────────────────────────────────
    {
      kind: "form", key: "rccm", title: tr(s("rccm.title")), subtitle: tr(s("rccm.subtitle")),
      fields: ["rccm"],
      render: (d, set) => <Field label={tr(s("rccm.label"))} value={str(d.rccm)} onChange={(v) => set({ rccm: v })} placeholder={tr(s("rccm.placeholder"))} help={tr(s("rccm.help"))} />,
    },
    {
      kind: "form", key: "niu", title: tr(s("niu.title")), subtitle: tr(s("niu.subtitle")),
      fields: ["niu"],
      render: (d, set) => <Field label={tr(s("niu.label"))} value={str(d.niu)} onChange={(v) => set({ niu: v })} placeholder={tr(s("niu.placeholder"))} />,
    },
    {
      kind: "form", key: "cnss", title: tr(s("cnss.title")), subtitle: tr(s("cnss.subtitle")),
      fields: ["cnss_number"],
      render: (d, set) => <Field label={tr(s("cnss.label"))} value={str(d.cnss_number)} onChange={(v) => set({ cnss_number: v })} placeholder={tr(s("cnss.placeholder"))} />,
    },
    {
      kind: "form", key: "patente", title: tr(s("patente.title")), subtitle: tr(s("patente.subtitle")),
      fields: ["patente_number"],
      render: (d, set) => <Field label={tr(s("patente.label"))} value={str(d.patente_number)} onChange={(v) => set({ patente_number: v })} placeholder={tr(s("patente.placeholder"))} />,
    },
    {
      kind: "form", key: "tax", title: tr(s("tax.title")), subtitle: tr(s("tax.subtitle")),
      fields: ["tax_regime"],
      render: (d, set) => <Field label={tr(s("tax.label"))} value={str(d.tax_regime)} onChange={(v) => set({ tax_regime: v })} placeholder={tr(s("tax.placeholder"))} />,
    },
    {
      kind: "form", key: "capital", title: tr(s("capital.title")), subtitle: tr(s("capital.subtitle")),
      fields: ["share_capital", "founded_date"],
      render: (d, set) => (
        <div className="space-y-4">
          <Field label={tr(s("capital.capitalLabel"))} value={str(d.share_capital)} onChange={(v) => set({ share_capital: v })} placeholder={tr(s("capital.capitalPlaceholder"))} />
          <Field label={tr(s("capital.dateLabel"))} type="date" value={str(d.founded_date)} onChange={(v) => set({ founded_date: v })} />
        </div>
      ),
    },

    // ── Contact ────────────────────────────────────────────────────────────
    {
      kind: "form", key: "contact", title: tr(s("contact.title")), subtitle: tr(s("contact.subtitle")),
      fields: ["phone", "email"],
      render: (d, set) => (
        <div className="space-y-4">
          <Field label={tr(s("contact.phoneLabel"))} value={str(d.phone)} onChange={(v) => set({ phone: v })} placeholder={tr(s("contact.phonePlaceholder"))} />
          <Field label={tr(s("contact.emailLabel"))} type="email" value={str(d.email)} onChange={(v) => set({ email: v })} placeholder={tr(s("contact.emailPlaceholder"))} />
        </div>
      ),
    },
    {
      kind: "form", key: "website", title: tr(s("website.title")), subtitle: tr(s("website.subtitle")),
      fields: ["website"],
      render: (d, set) => <Field label={tr(s("website.label"))} value={str(d.website)} onChange={(v) => set({ website: v })} placeholder={tr(s("website.placeholder"))} />,
    },
    {
      kind: "form", key: "manager", title: tr(s("manager.title")), subtitle: tr(s("manager.subtitle")),
      fields: ["manager_name", "manager_title"],
      render: (d, set) => (
        <div className="space-y-4">
          <Field label={tr(s("manager.nameLabel"))} value={str(d.manager_name)} onChange={(v) => set({ manager_name: v })} placeholder={tr(s("manager.namePlaceholder"))} />
          <Field label={tr(s("manager.titleLabel"))} value={str(d.manager_title)} onChange={(v) => set({ manager_title: v })} placeholder={tr(s("manager.titlePlaceholder"))} />
        </div>
      ),
    },

    // ── Banque & trésorerie ────────────────────────────────────────────────
    {
      kind: "form", key: "bank", title: tr(s("bank.title")), subtitle: tr(s("bank.subtitle")),
      fields: ["bank_name", "bank_account"],
      render: (d, set) => (
        <div className="space-y-4">
          <Field label={tr(s("bank.bankLabel"))} value={str(d.bank_name)} onChange={(v) => set({ bank_name: v })} placeholder={tr(s("bank.bankPlaceholder"))} />
          <Field label={tr(s("bank.accountLabel"))} value={str(d.bank_account)} onChange={(v) => set({ bank_account: v })} placeholder={tr(s("bank.accountPlaceholder"))} />
        </div>
      ),
    },
    {
      kind: "form", key: "threshold", title: tr(s("threshold.title")), subtitle: tr(s("threshold.subtitle")),
      fields: ["cash_low_threshold_cents"],
      render: (d, set) => (
        <Field
          label={tr(s("threshold.label"))}
          type="number"
          value={d.cash_low_threshold_cents != null ? String(Math.round(d.cash_low_threshold_cents / 100)) : ""}
          onChange={(v) => set({ cash_low_threshold_cents: v ? Math.round(Number(v) * 100) : undefined })}
          placeholder={tr(s("threshold.placeholder"))}
          help={tr(s("threshold.help"))}
        />
      ),
    },

    // ── Marque ─────────────────────────────────────────────────────────────
    {
      kind: "form", key: "colors", title: tr(s("colors.title")), subtitle: tr(s("colors.subtitle")),
      fields: ["primary_color", "accent_color"],
      render: (d, set) => (
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-black/20">
            <span className="text-sm font-semibold text-slate-700 dark:text-white/80">{tr(s("colors.primaryLabel"))}</span>
            <input type="color" value={str(d.primary_color) || "#047857"} onChange={(e) => set({ primary_color: e.target.value })} className="h-9 w-14 cursor-pointer rounded-md border-0 bg-transparent" />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-black/20">
            <span className="text-sm font-semibold text-slate-700 dark:text-white/80">{tr(s("colors.secondaryLabel"))}</span>
            <input type="color" value={str(d.accent_color) || "#065f46"} onChange={(e) => set({ accent_color: e.target.value })} className="h-9 w-14 cursor-pointer rounded-md border-0 bg-transparent" />
          </label>
        </div>
      ),
    },
    { kind: "logo", key: "logo", title: tr(s("logo.title")), subtitle: tr(s("logo.subtitle")) },

    // ── Mise en route (CTA vers les modules) ───────────────────────────────
    { kind: "cta", key: "payments", title: tr(s("payments.title")), subtitle: tr(s("payments.subtitle")), cta: { label: tr(s("payments.ctaLabel")), route: "/settings?tab=payments" } },
    { kind: "cta", key: "employees", title: tr(s("employees.title")), subtitle: tr(s("employees.subtitle")), cta: { label: tr(s("employees.ctaLabel")), route: "/employees" } },
    { kind: "cta", key: "products", title: tr(s("products.title")), subtitle: tr(s("products.subtitle")), cta: { label: tr(s("products.ctaLabel")), route: "/inventory" } },
    { kind: "cta", key: "subscription", title: tr(s("subscription.title")), subtitle: tr(s("subscription.subtitle")), cta: { label: tr(s("subscription.ctaLabel")), route: "/settings?tab=subscription" } },

    { kind: "recap", key: "done", title: tr(s("done.title")), subtitle: tr(s("done.subtitle")) },
  ];
}

export function CompanySetupWizard({ onActiveChange }: { onActiveChange?: (active: boolean) => void }) {
  const { t: tr } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState(false);

  // Remonte l'état actif au parent (Shell) pour empêcher GuidedTour de se
  // lancer par-dessus tant que cet assistant n'est pas terminé/fermé — les
  // deux se chevauchaient visuellement sinon (bannière de configuration
  // visible derrière la bulle du tour).
  useEffect(() => { onActiveChange?.(active); }, [active, onActiveChange]);
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState<CompanyDraft>({});
  const [saving, setSaving] = useState(false);
  const [completion, setCompletion] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);

  const isCompanyAdmin = user?.role === "admin_entreprise";
  const STEPS = useMemo(() => buildSteps(tr), [tr]);

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

  const progress = useMemo(() => Math.round(((idx + 1) / STEPS.length) * 100), [idx, STEPS.length]);

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
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/70">{tr("companySetupWizard.header", { current: idx + 1, total: STEPS.length })}</p>
            <h3 className="text-lg font-black leading-tight">{step.title}</h3>
          </div>
          <button onClick={dismiss} aria-label={tr("common.close")} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/80 hover:bg-white/15"><X size={16} /></button>
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
                <Upload size={18} /> {logoName ? tr("companySetupWizard.logoImported", { name: logoName }) : tr("companySetupWizard.importLogo")}
              </button>
              <p className="mt-2 text-[11px] text-slate-400 dark:text-white/40">{tr("companySetupWizard.logoHint")}</p>
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
                <Check size={18} /><span className="text-sm font-bold">{tr("companySetupWizard.profileCompleted", { pct: completion })}</span>
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
          <button onClick={dismiss} className="text-xs font-semibold text-[#717182] hover:text-[#17211f] dark:hover:text-white">{tr("companySetupWizard.finishLater")}</button>
          <div className="flex items-center gap-2">
            {idx > 0 && (
              <button onClick={prev} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
                <ArrowLeft size={15} /> {tr("companySetupWizard.previous")}
              </button>
            )}
            <button onClick={next} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
              {isLast ? tr("companySetupWizard.finish") : tr("companySetupWizard.next")} {!isLast && <ArrowRight size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
