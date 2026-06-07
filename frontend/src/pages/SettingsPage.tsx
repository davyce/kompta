import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import {
  Bell, BrainCircuit, Building2, Check, CheckCircle2, ChevronRight,
  CreditCard, FileText, Globe, Landmark, Lock, Moon, Palette, Plus, Shield,
  Save, Search, ShieldCheck, Smartphone, Sparkles, Sun, Trash2, User, Wallet, X, Zap,
} from "lucide-react";

import { api } from "../services/api";
import { SubscriptionPanel } from "../components/SubscriptionPanel";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../app/AuthContext";
import { useConfirm } from "../components/ConfirmProvider";
import { resetOnboardingTour } from "../components/GuidedTour";
import { useCurrency, SUPPORTED_CURRENCIES } from "../contexts/CurrencyContext";
import type { CurrencyCode } from "../utils/format";
import { QRCodeSVG } from "qrcode.react";

/* ── Types ────────────────────────────────────────────────────────── */
type Tab = "general" | "subscription" | "modules" | "payments" | "security" | "notifications" | "teras" | "billing" | "audit";

const PROVIDERS = [
  { key: "zola", label: "Zola / QR", icon: Wallet },
  { key: "mobile_money", label: "Mobile money", icon: Smartphone },
  { key: "card", label: "Carte / Stripe", icon: CreditCard },
  { key: "cash", label: "Espèces", icon: Wallet },
  { key: "bank", label: "Compte bancaire", icon: Landmark },
  { key: "paypal", label: "PayPal", icon: CreditCard },
];

const EMPTY_PAYMENT_FORM = {
  provider: "mobile_money",
  label: "",
  account_name: "",
  phone_number: "",
  account_number: "",
  bank_name: "",
  bank_code: "",
  paypal_email: "",
  currency: "XAF",
  instructions: "",
  enabled: true,
  use_for_pos: true,
  use_for_payroll: false,
  is_default_pos: false,
  is_default_payroll: false,
};

/* ── Toggle ───────────────────────────────────────────────────────── */
function Toggle({ on, onChange, disabled = false }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      className={`flex h-6 w-11 items-center rounded-full transition-colors ${on ? "bg-emerald-600" : "bg-black/20 dark:bg-white/20"} ${disabled ? "opacity-50" : ""}`}
    >
      <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function SettingRow({ icon: Icon, label, description, children }: {
  icon: React.ElementType; label: string; description?: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-4 border-b border-black/[0.04] dark:border-white/[0.04] last:border-0">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <Icon size={17} />
        </span>
        <div>
          <p className="font-semibold text-[#17211f] dark:text-white">{label}</p>
          {description && <p className="text-xs text-[#717182]">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

const MODULE_LABELS: Record<string, { label: string; desc: string }> = {
  dashboard:    { label: "Tableau de bord", desc: "Vue globale pilotage" },
  rh:           { label: "RH",              desc: "Dossiers et profils employés" },
  payroll:      { label: "Paie",            desc: "Bulletins & cycles paie" },
  accounting:   { label: "Comptabilité",    desc: "SYSCEMAC, journaux, bilan" },
  billing:      { label: "Facturation",     desc: "Devis, factures, encaissements" },
  pos:          { label: "POS / Caisse",    desc: "Vente directe + mobile money" },
  inventory:    { label: "Inventaire",      desc: "Stock multi-sites, QR codes" },
  projects:     { label: "Projets & boards", desc: "Kanban, milestones, budgets" },
  chat:         { label: "Chat",            desc: "Messagerie temps réel" },
  meetings:     { label: "Réunions",        desc: "Inclus dans Agenda" },
  reports:      { label: "Rapports",        desc: "Tableaux de bord analytics" },
  declarations: { label: "Déclarations",    desc: "TVA, CNSS, IS, obligations légales" },
  assistants:   { label: "Rédaction IA",    desc: "Studio Limule · emails, courriers" },
  teras:        { label: "TERAS Connect",   desc: "Score conformité IA" },
  documents:    { label: "Documents",       desc: "Bibliothèque intelligente" },
  calendar:     { label: "Agenda",          desc: "Calendrier, réunions, tâches" },
  notes:        { label: "Notes IA",        desc: "Journal & notes Limule" },
  settings:     { label: "Paramètres",      desc: "Configuration KOMPTA" },
};

export function SettingsPage() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { user } = useAuth();
  const { currency: activeCurrency, setCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const { confirm } = useConfirm();
  const location = useLocation();
  const initialTab = (new URLSearchParams(location.search).get("tab") as Tab | null) ?? "general";
  const [tab, setTab] = useState<Tab>(initialTab);
  const isEmployeeSelfService = user?.role === "employe";

  const company = useQuery({ queryKey: ["company"], queryFn: api.company });
  const modulesQ = useQuery({ queryKey: ["modules"], queryFn: api.modules });
  const prefs = useQuery({ queryKey: ["preferences"], queryFn: api.preferences });
  const employees = useQuery({ queryKey: ["employees"], queryFn: api.employees });
  const aiHistory = useQuery({ queryKey: ["aiHistory"], queryFn: () => api.aiHistory(50) });
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => api.overview() });
  const myInvoices = useQuery({ queryKey: ["invoices"], queryFn: api.invoices });
  const paymentAccounts = useQuery({ queryKey: ["paymentAccounts"], queryFn: api.paymentAccounts });
  const myPayout = useQuery({
    queryKey: ["myEmployeePayout"],
    queryFn: api.myEmployeePayout,
    enabled: Boolean(user?.employee_id),
    retry: false,
  });
  const auditLogs = useQuery({
    queryKey: ["auditLogs"],
    queryFn: () => api.auditLogs({ limit: 100 }),
    enabled: tab === "audit",
  });
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT_FORM);
  const [paymentDraft, setPaymentDraft] = useState(EMPTY_PAYMENT_FORM);
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [moduleSearch, setModuleSearch] = useState("");
  const [companyForm, setCompanyForm] = useState({
    name: "",
    legal_name: "",
    industry: "",
    organization_type: "PME",
    country: "République du Congo",
    primary_color: "#0f766e",
    accent_color: "#f59e0b",
    cash_low_threshold_cents: 5_000_000,
    // Mentions légales
    legal_form: "",
    rccm: "",
    niu: "",
    cnss_number: "",
    patente_number: "",
    tax_regime: "",
    share_capital: "",
    founded_date: "",
    address: "",
    city: "",
    phone: "",
    email: "",
    website: "",
    manager_name: "",
    manager_title: "",
    bank_name: "",
    bank_account: "",
  });
  const [myPayoutForm, setMyPayoutForm] = useState({
    payout_method: "mobile_money",
    payout_phone: "",
    payout_bank_name: "",
    payout_account_number: "",
    payout_paypal_email: "",
  });

  async function handleDeletePaymentAccount(accountId: number, label: string) {
    const ok = await confirm({
      title: "Supprimer ce compte de paiement ?",
      message: label,
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (ok) deletePaymentAccount.mutate(accountId);
  }

  async function handleResetWorkspace() {
    const ok = await confirm({
      title: "Remettre l'espace à zéro ?",
      message: "Les données métier locales seront supprimées. Le compte connecté et le canal général seront conservés.",
      confirmLabel: "Réinitialiser",
      danger: true,
      requireAcknowledge: "Je comprends que cette action supprime les données de cet espace local.",
    });
    if (ok) resetWorkspace.mutate();
  }

  const toggleModule = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => api.toggleModule(key, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["modules"] }),
  });

  const [bulkEnabling, setBulkEnabling] = useState(false);
  async function enableAllModules() {
    const disabled = (modulesQ.data ?? []).filter((mod) => !mod.enabled);
    if (!disabled.length) return;
    setBulkEnabling(true);
    try {
      await Promise.allSettled(disabled.map((mod) => api.toggleModule(mod.module_key, true)));
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["modules"] });
      setBulkEnabling(false);
    }
  }

  useEffect(() => {
    if (!company.data) return;
    const d = company.data;
    setCompanyForm({
      name: d.name || "",
      legal_name: d.legal_name || "",
      industry: d.industry || "",
      organization_type: d.organization_type || "PME",
      country: d.country || "République du Congo",
      primary_color: d.primary_color || "#0f766e",
      accent_color: d.accent_color || "#f59e0b",
      cash_low_threshold_cents: d.cash_low_threshold_cents ?? 5_000_000,
      legal_form: d.legal_form || "",
      rccm: d.rccm || "",
      niu: d.niu || "",
      cnss_number: d.cnss_number || "",
      patente_number: d.patente_number || "",
      tax_regime: d.tax_regime || "",
      share_capital: d.share_capital || "",
      founded_date: d.founded_date || "",
      address: d.address || "",
      city: d.city || "",
      phone: d.phone || "",
      email: d.email || "",
      website: d.website || "",
      manager_name: d.manager_name || "",
      manager_title: d.manager_title || "",
      bank_name: d.bank_name || "",
      bank_account: d.bank_account || "",
    });
  }, [company.data]);

  // Local prefs state synced with API
  const [localPrefs, setLocalPrefs] = useState({
    notify_email: true, notify_chat: true, notify_teras: true, notify_payroll: true,
    digest_frequency: "daily" as string, language: "fr" as string, theme: "auto" as string,
  });
  useEffect(() => {
    if (prefs.data) setLocalPrefs({
      notify_email: prefs.data.notify_email, notify_chat: prefs.data.notify_chat,
      notify_teras: prefs.data.notify_teras, notify_payroll: prefs.data.notify_payroll,
      digest_frequency: prefs.data.digest_frequency, language: prefs.data.language,
      theme: prefs.data.theme,
    });
  }, [prefs.data]);

  useEffect(() => {
    if (!myPayout.data) return;
    setMyPayoutForm({
      payout_method: myPayout.data.payout_method || "mobile_money",
      payout_phone: myPayout.data.payout_phone || myPayout.data.phone || "",
      payout_bank_name: myPayout.data.payout_bank_name || "",
      payout_account_number: myPayout.data.payout_account_number || "",
      payout_paypal_email: myPayout.data.payout_paypal_email || "",
    });
  }, [myPayout.data]);

  const updatePrefs = useMutation({
    mutationFn: (payload: Partial<typeof localPrefs>) => api.updatePreferences(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["preferences"] }),
  });
  const updateCompany = useMutation({
    mutationFn: () => api.updateCompany(companyForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  const runTerasAnalysis = useMutation({
    mutationFn: () => api.analyzeTerasCompany(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["terasAlerts"] });
      queryClient.invalidateQueries({ queryKey: ["terasScores"] });
    },
  });
  const resetWorkspace = useMutation({
    mutationFn: api.resetWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
  const createPaymentAccount = useMutation({
    mutationFn: api.createPaymentAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["paymentAccounts"] });
      setPaymentForm(EMPTY_PAYMENT_FORM);
    },
  });
  const updatePaymentAccount = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof api.updatePaymentAccount>[1] }) =>
      api.updatePaymentAccount(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["paymentAccounts"] }),
  });
  const deletePaymentAccount = useMutation({
    mutationFn: api.deletePaymentAccount,
    onSuccess: () => {
      setEditingPaymentId(null);
      queryClient.invalidateQueries({ queryKey: ["paymentAccounts"] });
    },
  });
  const updateMyPayout = useMutation({
    mutationFn: () => api.updateMyEmployeePayout({ ...myPayoutForm, confirm: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myEmployeePayout"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  /* ── 2FA state ── */
  const [twoFaStep, setTwoFaStep] = useState<"idle" | "setup" | "enabled">("idle");
  const [twoFaQrUrl, setTwoFaQrUrl] = useState("");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaError, setTwoFaError] = useState("");
  const [twoFaLoading, setTwoFaLoading] = useState(false);

  async function handle2faSetup() {
    setTwoFaLoading(true); setTwoFaError("");
    try {
      const data = await api.twoFaSetup();
      setTwoFaQrUrl(data.qr_url ?? data.provisioning_uri ?? "");
      setTwoFaStep("setup");
    } catch (e) { setTwoFaError((e as Error).message); }
    finally { setTwoFaLoading(false); }
  }

  async function handle2faVerify() {
    setTwoFaLoading(true); setTwoFaError("");
    try {
      await api.twoFaVerify(twoFaCode);
      await api.twoFaEnable();
      setTwoFaStep("enabled");
    } catch (e) { setTwoFaError("Code invalide ou expiré. Réessayez."); }
    finally { setTwoFaLoading(false); }
  }

  async function handle2faDisable() {
    setTwoFaLoading(true); setTwoFaError("");
    try {
      await api.twoFaDisable();
      setTwoFaStep("idle"); setTwoFaCode(""); setTwoFaQrUrl("");
    } catch (e) { setTwoFaError((e as Error).message); }
    finally { setTwoFaLoading(false); }
  }

  function setPref<K extends keyof typeof localPrefs>(key: K, value: typeof localPrefs[K]) {
    setLocalPrefs((p) => ({ ...p, [key]: value }));
    updatePrefs.mutate({ [key]: value } as Partial<typeof localPrefs>);
  }

  function exportInvoicesCsv() {
    const lines = ["Numéro,Client,Statut,Montant,Date émission"];
    for (const inv of myInvoices.data ?? []) {
      lines.push(`${inv.number},"${inv.customer_name}",${inv.status},${inv.total_amount},${inv.created_at}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `kompta-factures-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  function startPaymentEdit(account: NonNullable<typeof paymentAccounts.data>[number]) {
    setEditingPaymentId(account.id);
    setPaymentDraft({
      provider: account.provider,
      label: account.label,
      account_name: account.account_name,
      phone_number: account.phone_number,
      account_number: account.account_number,
      bank_name: account.bank_name,
      bank_code: account.bank_code,
      paypal_email: account.paypal_email,
      currency: account.currency || "XAF",
      instructions: account.instructions,
      enabled: account.enabled,
      use_for_pos: account.use_for_pos,
      use_for_payroll: account.use_for_payroll,
      is_default_pos: account.is_default_pos,
      is_default_payroll: account.is_default_payroll,
    });
  }

  const allTabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "general",       label: "Général",       icon: Building2   },
    { key: "subscription",  label: "Abonnement",    icon: Sparkles    },
    { key: "modules",       label: "Modules",       icon: Zap         },
    { key: "payments",      label: "Paiements",     icon: Wallet      },
    { key: "security",      label: "Sécurité",      icon: Lock        },
    { key: "notifications", label: "Notifications", icon: Bell        },
    { key: "teras",         label: "TERAS",         icon: ShieldCheck },
    { key: "billing",       label: "Facturation",   icon: CreditCard  },
    { key: "audit",         label: "Journal audit", icon: FileText    },
  ];
  const TABS = isEmployeeSelfService
    ? allTabs.filter((item) => ["general", "payments", "notifications", "security"].includes(item.key))
    : allTabs;

  const modulesData = modulesQ.data ?? [];
  const filteredModules = modulesData.filter((mod) => {
    const meta = MODULE_LABELS[mod.module_key] ?? { label: mod.module_key, desc: "" };
    const haystack = `${meta.label} ${meta.desc} ${mod.module_key}`.toLowerCase();
    return haystack.includes(moduleSearch.trim().toLowerCase());
  });
  const activeModulesCount = modulesData.filter((mod) => mod.enabled).length;
  const employeesCount = employees.data?.length ?? 0;
  const aiQueriesCount = aiHistory.data?.length ?? 0;
  const terasScore = overview.data?.kpis.teras_score ?? 0;
  const lastTerasAnalysis = useMemo(() => {
    // Approximation: last AI generation that's TERAS-related, or last alert created_at
    return new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  }, []);

  return (
    <div data-tour="settings-content" className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-emerald-600">Administration</p>
        <h1 className="text-3xl font-extrabold text-[#17211f] dark:text-white">Paramètres</h1>
        <p className="mt-1 text-sm text-[#717182]">
          {company.data?.name ?? "KOMPTA"} · Configuration de votre espace de travail
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] h-fit">
          <div className="p-2 space-y-0.5">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                    tab === t.key
                      ? "bg-emerald-600 text-white"
                      : "text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-[#17211f] dark:hover:text-white"
                  }`}
                >
                  <Icon size={16} />
                  {t.label}
                  {tab === t.key && <ChevronRight size={14} className="ml-auto" />}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229]">

          {/* ── GÉNÉRAL ── */}
          {tab === "general" && (
            <div>
              <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-5">
                <h2 className="font-bold text-[#17211f] dark:text-white">Général</h2>
                <p className="text-sm text-[#717182]">Profil entreprise, apparence et langue</p>
              </div>
              <div className="px-6 py-2">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    updateCompany.mutate();
                  }}
                  className="py-4 border-b border-black/[0.04] dark:border-white/[0.04]"
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#17211f] dark:text-white">Identité & branding entreprise</p>
                      <p className="text-xs text-[#717182]">Ces informations alimentent les factures, contrats, exports et écrans KOMPTA.</p>
                    </div>
                    <button
                      disabled={updateCompany.isPending || isEmployeeSelfService}
                      className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Save size={15} /> {updateCompany.isPending ? "Sauvegarde..." : "Sauvegarder"}
                    </button>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-[220px_1fr]">
                    <div className="rounded-2xl border border-black/[0.06] bg-[#fbfbfd] p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                      <div className="grid h-20 w-20 place-items-center rounded-2xl text-3xl font-black text-white shadow-sm"
                        style={{ background: companyForm.primary_color || "#059669" }}>
                        {(companyForm.name || "K")[0]}
                      </div>
                      <p className="mt-3 font-black text-[#17211f] dark:text-white">{companyForm.name || "KOMPTA"}</p>
                      <p className="text-xs text-[#717182]">{companyForm.industry || "Activité"}</p>
                      <div className="mt-3 flex gap-2">
                        <span className="h-7 w-7 rounded-lg border border-black/10" style={{ background: companyForm.primary_color }} />
                        <span className="h-7 w-7 rounded-lg border border-black/10" style={{ background: companyForm.accent_color }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {[
                        { label: "Nom commercial", key: "name", placeholder: "Ex : Mon Entreprise" },
                        { label: "Raison sociale", key: "legal_name", placeholder: "Ex : Mon Entreprise SARL" },
                        { label: "Activité", key: "industry", placeholder: "Ex : Commerce et services" },
                        { label: "Forme / organisation", key: "organization_type", placeholder: "Ex : PME" },
                        { label: "Pays principal", key: "country", placeholder: "Ex : République du Congo" },
                      ].map((field) => (
                        <label key={field.key} className="block text-xs font-bold uppercase text-[#717182]">
                          {field.label}
                          <input
                            value={companyForm[field.key as keyof typeof companyForm]}
                            onChange={(event) => setCompanyForm({ ...companyForm, [field.key]: event.target.value })}
                            placeholder={field.placeholder}
                            disabled={isEmployeeSelfService}
                            className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
                          />
                        </label>
                      ))}
                      <label className="block text-xs font-bold uppercase text-[#717182]">
                        Couleur principale
                        <input
                          type="color"
                          value={companyForm.primary_color}
                          onChange={(event) => setCompanyForm({ ...companyForm, primary_color: event.target.value })}
                          disabled={isEmployeeSelfService}
                          className="mt-1 h-11 w-full rounded-xl border border-black/[0.08] bg-white p-1 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931]"
                        />
                      </label>
                      <label className="block text-xs font-bold uppercase text-[#717182]">
                        Couleur accent
                        <input
                          type="color"
                          value={companyForm.accent_color}
                          onChange={(event) => setCompanyForm({ ...companyForm, accent_color: event.target.value })}
                          disabled={isEmployeeSelfService}
                          className="mt-1 h-11 w-full rounded-xl border border-black/[0.08] bg-white p-1 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931]"
                        />
                      </label>
                      <label className="block text-xs font-bold uppercase text-[#717182] md:col-span-2">
                        Seuil d'alerte trésorerie
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            value={Math.round((companyForm.cash_low_threshold_cents ?? 0) / 100)}
                            onChange={(event) =>
                              setCompanyForm({
                                ...companyForm,
                                cash_low_threshold_cents: Math.max(0, Math.round(Number(event.target.value) || 0)) * 100,
                              })
                            }
                            disabled={isEmployeeSelfService}
                            className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
                          />
                          <span className="shrink-0 text-sm font-semibold text-[#717182]">{activeCurrency}</span>
                        </div>
                        <span className="mt-1 block text-[11px] font-normal normal-case text-[#717182]">
                          Limule t'alerte quand ta trésorerie passe sous ce montant. Mets 0 pour désactiver l'alerte.
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* ── Mentions légales & fiscales (OHADA / CEMAC) ── */}
                  <div className="mt-5 rounded-2xl border border-black/[0.06] bg-[#fbfbfd] p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                    <p className="mb-1 text-sm font-black text-[#17211f] dark:text-white">⚖️ Mentions légales & fiscales</p>
                    <p className="mb-3 text-xs text-[#717182]">Ces informations attestent que l'entreprise est immatriculée et en règle. Elles apparaissent sur les factures et contrats.</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <label className="block text-xs font-bold uppercase text-[#717182]">Forme juridique
                        <select value={companyForm.legal_form} onChange={(e) => setCompanyForm({ ...companyForm, legal_form: e.target.value })} disabled={isEmployeeSelfService}
                          className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white">
                          <option value="">— Choisir —</option>
                          <option value="EI">Entreprise individuelle (EI)</option>
                          <option value="SARL">SARL</option>
                          <option value="SUARL">SARL unipersonnelle (SUARL)</option>
                          <option value="SA">Société Anonyme (SA)</option>
                          <option value="SAS">SAS</option>
                          <option value="SNC">SNC</option>
                          <option value="GIE">GIE</option>
                          <option value="Coopérative">Coopérative</option>
                          <option value="Association">Association / ONG</option>
                        </select>
                      </label>
                      {[
                        { label: "RCCM", key: "rccm", ph: "Ex : CG-BZV-01-2024-B12-00123" },
                        { label: "NIU / NIF (fiscal)", key: "niu", ph: "Identifiant fiscal unique" },
                        { label: "N° CNSS employeur", key: "cnss_number", ph: "N° d'affiliation CNSS" },
                        { label: "N° de patente", key: "patente_number", ph: "N° de patente / licence" },
                        { label: "Capital social", key: "share_capital", ph: "Ex : 1 000 000 XAF" },
                      ].map((f) => (
                        <label key={f.key} className="block text-xs font-bold uppercase text-[#717182]">{f.label}
                          <input value={companyForm[f.key as keyof typeof companyForm]} onChange={(e) => setCompanyForm({ ...companyForm, [f.key]: e.target.value })} placeholder={f.ph} disabled={isEmployeeSelfService}
                            className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                        </label>
                      ))}
                      <label className="block text-xs font-bold uppercase text-[#717182]">Régime fiscal
                        <select value={companyForm.tax_regime} onChange={(e) => setCompanyForm({ ...companyForm, tax_regime: e.target.value })} disabled={isEmployeeSelfService}
                          className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white">
                          <option value="">— Choisir —</option>
                          <option value="reel">Réel normal</option>
                          <option value="simplifie">Réel simplifié</option>
                          <option value="forfait">Forfait / micro</option>
                        </select>
                      </label>
                      <label className="block text-xs font-bold uppercase text-[#717182]">Date de création
                        <input type="date" value={companyForm.founded_date} onChange={(e) => setCompanyForm({ ...companyForm, founded_date: e.target.value })} disabled={isEmployeeSelfService}
                          className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                      </label>
                    </div>
                  </div>

                  {/* ── Coordonnées ── */}
                  <div className="mt-4 rounded-2xl border border-black/[0.06] bg-[#fbfbfd] p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                    <p className="mb-3 text-sm font-black text-[#17211f] dark:text-white">📍 Coordonnées</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {[
                        { label: "Adresse (siège social)", key: "address", ph: "Ex : 12 av. de la Paix" },
                        { label: "Ville", key: "city", ph: "Ex : Brazzaville" },
                        { label: "Téléphone", key: "phone", ph: "+242 06 000 0000" },
                        { label: "Email", key: "email", ph: "contact@entreprise.cg" },
                        { label: "Site web", key: "website", ph: "https://…" },
                      ].map((f) => (
                        <label key={f.key} className="block text-xs font-bold uppercase text-[#717182]">{f.label}
                          <input value={companyForm[f.key as keyof typeof companyForm]} onChange={(e) => setCompanyForm({ ...companyForm, [f.key]: e.target.value })} placeholder={f.ph} disabled={isEmployeeSelfService}
                            className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* ── Représentant légal & banque ── */}
                  <div className="mt-4 rounded-2xl border border-black/[0.06] bg-[#fbfbfd] p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                    <p className="mb-3 text-sm font-black text-[#17211f] dark:text-white">👤 Représentant légal & banque</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <label className="block text-xs font-bold uppercase text-[#717182]">Nom du dirigeant
                        <input value={companyForm.manager_name} onChange={(e) => setCompanyForm({ ...companyForm, manager_name: e.target.value })} placeholder="Ex : Davy Okemba" disabled={isEmployeeSelfService}
                          className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                      </label>
                      <label className="block text-xs font-bold uppercase text-[#717182]">Fonction
                        <select value={companyForm.manager_title} onChange={(e) => setCompanyForm({ ...companyForm, manager_title: e.target.value })} disabled={isEmployeeSelfService}
                          className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white">
                          <option value="">— Choisir —</option>
                          <option value="Gérant">Gérant</option>
                          <option value="Directeur Général">Directeur Général</option>
                          <option value="Président">Président</option>
                          <option value="PDG">PDG</option>
                          <option value="Promoteur">Promoteur</option>
                        </select>
                      </label>
                      {[
                        { label: "Banque", key: "bank_name", ph: "Ex : BGFIBank Congo" },
                        { label: "RIB / IBAN", key: "bank_account", ph: "Numéro de compte" },
                      ].map((f) => (
                        <label key={f.key} className="block text-xs font-bold uppercase text-[#717182]">{f.label}
                          <input value={companyForm[f.key as keyof typeof companyForm]} onChange={(e) => setCompanyForm({ ...companyForm, [f.key]: e.target.value })} placeholder={f.ph} disabled={isEmployeeSelfService}
                            className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                        </label>
                      ))}
                    </div>
                  </div>

                  {updateCompany.isSuccess && <p className="mt-3 text-xs font-bold text-emerald-600">Profil entreprise enregistré.</p>}
                  {updateCompany.error && <p className="mt-3 text-xs font-bold text-red-600">{updateCompany.error.message}</p>}
                </form>
                <SettingRow icon={Palette} label="Thème d'affichage" description={theme === "dark" ? "Mode sombre activé" : "Mode clair activé"}>
                  <button onClick={toggleTheme} className="flex items-center gap-2 rounded-lg border border-black/[0.08] dark:border-white/[0.08] px-3 py-2 text-sm font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition">
                    {theme === "dark" ? <><Sun size={15}/> Mode clair</> : <><Moon size={15}/> Mode sombre</>}
                  </button>
                </SettingRow>
                <SettingRow icon={Globe} label="Langue" description="Langue de l'interface KOMPTA">
                  <select
                    value={localPrefs.language}
                    onChange={(e) => setPref("language", e.target.value)}
                    className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500">
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </select>
                </SettingRow>
                <SettingRow icon={Globe} label="Devise de référence" description="Monnaie affichée dans toute l'interface">
                  <select
                    value={activeCurrency}
                    onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                    className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500">
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow icon={User} label="Compte connecté" description={user?.email}>
                  <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">{user?.role}</span>
                </SettingRow>
                <SettingRow icon={Zap} label="Visite guidée" description="Redécouvrir KOMPTA pas à pas">
                  <button
                    type="button"
                    onClick={() => {
                      resetOnboardingTour();
                      window.location.reload();
                    }}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300"
                  >
                    Relancer la visite guidée
                  </button>
                </SettingRow>
              </div>
            </div>
          )}

          {/* ── ABONNEMENT ── */}
          {tab === "subscription" && (
            <div>
              <h2 className="mb-1 text-lg font-black text-[#17211f] dark:text-white">Abonnement KOMPTA</h2>
              <p className="mb-4 text-sm text-[#717182]">Choisissez votre formule et payez par carte, Mobile Money ou Zola.</p>
              <SubscriptionPanel />
            </div>
          )}

          {/* ── MODULES ── */}
          {tab === "modules" && (
            <div>
              <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-5">
                <h2 className="font-bold text-[#17211f] dark:text-white">Modules actifs</h2>
                <p className="text-sm text-[#717182]">Activez ou désactivez les fonctionnalités de KOMPTA pour votre entreprise</p>
              </div>
              <div className="border-b border-black/[0.05] px-6 py-4 dark:border-white/[0.05]">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 py-2 dark:border-white/[0.08] dark:bg-[#252931]">
                    <Search size={15} className="text-[#717182]" />
                    <input
                      value={moduleSearch}
                      onChange={(event) => setModuleSearch(event.target.value)}
                      placeholder="Rechercher un module..."
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none dark:text-white"
                    />
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    {activeModulesCount}/{modulesData.length || 0} actifs
                  </span>
                  <button
                    type="button"
                    disabled={toggleModule.isPending || bulkEnabling || isEmployeeSelfService}
                    onClick={enableAllModules}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  >
                    {bulkEnabling ? "Activation…" : "Tout activer"}
                  </button>
                </div>
              </div>
              <div className="grid gap-3 p-6 sm:grid-cols-2">
                {modulesData.length === 0 && modulesQ.isLoading && (
                  <p className="col-span-2 text-sm text-[#717182]">Chargement…</p>
                )}
                {filteredModules.map((mod) => {
                  const meta = MODULE_LABELS[mod.module_key] ?? { label: mod.module_key, desc: "" };
                  return (
                    <div key={mod.module_key} className={`flex items-center justify-between rounded-xl border p-4 transition ${mod.enabled ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-black/[0.06] bg-white dark:border-white/[0.06] dark:bg-[#252931]"}`}>
                      <div>
                        <p className={`font-semibold ${mod.enabled ? "text-emerald-800 dark:text-emerald-200" : "text-[#17211f] dark:text-white"}`}>{meta.label}</p>
                        <p className="text-xs text-[#717182]">{meta.desc}</p>
                      </div>
                      <Toggle
                        on={mod.enabled}
                        disabled={toggleModule.isPending || isEmployeeSelfService}
                        onChange={(v) => toggleModule.mutate({ key: mod.module_key, enabled: v })}
                      />
                    </div>
                  );
                })}
                {!modulesQ.isLoading && filteredModules.length === 0 && (
                  <p className="col-span-2 rounded-xl border border-dashed border-black/[0.12] p-6 text-center text-sm text-[#717182] dark:border-white/[0.12]">
                    Aucun module ne correspond à cette recherche.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── PAIEMENTS ── */}
          {tab === "payments" && (
            <div>
              <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-5">
                <h2 className="font-bold text-[#17211f] dark:text-white">Comptes de paiement</h2>
                <p className="text-sm text-[#717182]">Configurez espèces, carte Stripe, Zola, mobile money, banque et PayPal pour la caisse et la paie.</p>
              </div>
              {user?.employee_id && (
                <div className="border-b border-black/[0.05] p-6 dark:border-white/[0.05]">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      updateMyPayout.mutate();
                    }}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 size={18} />
                          <h3 className="font-black">Réception de ma paie</h3>
                        </div>
                        <p className="mt-1 text-sm text-[#717182]">
                          Confirme ou modifie le compte sur lequel tu veux recevoir ton salaire.
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-emerald-700 shadow-sm dark:bg-white/10 dark:text-emerald-200">
                        {myPayout.data?.payout_phone || myPayout.data?.payout_account_number || myPayout.data?.payout_paypal_email ? "Coordonnées renseignées" : "À compléter"}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[220px_1fr]">
                      <label className="block text-xs font-bold uppercase text-[#717182]">
                        Moyen
                        <select
                          value={myPayoutForm.payout_method}
                          onChange={(event) => setMyPayoutForm({ ...myPayoutForm, payout_method: event.target.value })}
                          className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none dark:border-emerald-500/30 dark:bg-[#1e2229] dark:text-white"
                        >
                          <option value="mobile_money">Mobile money</option>
                          <option value="zola">Zola</option>
                          <option value="bank">Compte bancaire</option>
                          <option value="paypal">PayPal</option>
                        </select>
                      </label>
                      {myPayoutForm.payout_method === "bank" ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-xs font-bold uppercase text-[#717182]">
                            Banque
                            <input value={myPayoutForm.payout_bank_name} onChange={(event) => setMyPayoutForm({ ...myPayoutForm, payout_bank_name: event.target.value })} placeholder="Nom de la banque" className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none dark:border-emerald-500/30 dark:bg-[#1e2229] dark:text-white" />
                          </label>
                          <label className="block text-xs font-bold uppercase text-[#717182]">
                            Numéro de compte
                            <input value={myPayoutForm.payout_account_number} onChange={(event) => setMyPayoutForm({ ...myPayoutForm, payout_account_number: event.target.value })} placeholder="RIB / compte" className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none dark:border-emerald-500/30 dark:bg-[#1e2229] dark:text-white" />
                          </label>
                        </div>
                      ) : myPayoutForm.payout_method === "paypal" ? (
                        <label className="block text-xs font-bold uppercase text-[#717182]">
                          Email PayPal
                          <input type="email" value={myPayoutForm.payout_paypal_email} onChange={(event) => setMyPayoutForm({ ...myPayoutForm, payout_paypal_email: event.target.value })} placeholder="monpaypal@email.com" className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none dark:border-emerald-500/30 dark:bg-[#1e2229] dark:text-white" />
                        </label>
                      ) : (
                        <label className="block text-xs font-bold uppercase text-[#717182]">
                          Numéro Mobile Money / Zola
                          <input value={myPayoutForm.payout_phone} onChange={(event) => setMyPayoutForm({ ...myPayoutForm, payout_phone: event.target.value })} placeholder="+242 06..." className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none dark:border-emerald-500/30 dark:bg-[#1e2229] dark:text-white" />
                        </label>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button disabled={updateMyPayout.isPending || myPayout.isLoading} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60">
                        {updateMyPayout.isPending ? "Confirmation..." : "Confirmer pour ma paie"}
                      </button>
                      {updateMyPayout.isSuccess && <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Coordonnées paie confirmées.</span>}
                      {updateMyPayout.error && <span className="text-sm font-bold text-rose-600">{updateMyPayout.error.message}</span>}
                    </div>
                  </form>
                </div>
              )}
              {!isEmployeeSelfService && (
              <div className="grid gap-5 p-6 xl:grid-cols-[1fr_360px]">
                <div className="space-y-3">
                  {(paymentAccounts.data ?? []).length === 0 && (
                    <div className="rounded-xl border border-dashed border-black/[0.12] p-6 text-sm text-[#717182] dark:border-white/[0.12]">
                      Aucun compte configuré. Ajoutez un compte de paiement pour l'utiliser dans le POS et les cycles de paie.
                    </div>
                  )}
                  {(paymentAccounts.data ?? []).map((account) => {
                    const provider = PROVIDERS.find((p) => p.key === account.provider) ?? PROVIDERS[0];
                    const Icon = provider.icon;
                    return (
                      <article key={account.id} className="rounded-xl border border-black/[0.06] bg-[#fbfbfd] p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                              <Icon size={19} />
                            </span>
                            <div>
                              <p className="font-bold text-[#17211f] dark:text-white">{account.label}</p>
                              <p className="text-sm text-[#717182]">{provider.label} · {account.account_name || "Compte entreprise"}</p>
                              <p className="mt-1 text-xs font-semibold text-[#717182]">
                                {account.masked_identifier || account.bank_name || account.currency}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {account.is_default_pos && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Défaut caisse</span>}
                            {account.is_default_payroll && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">Défaut paie</span>}
                            {!account.enabled && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-500">Désactivé</span>}
                          </div>
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                          <button onClick={() => startPaymentEdit(account)} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-xs font-bold hover:bg-violet-50 dark:border-white/[0.08] dark:bg-white/[0.04]">
                            Modifier
                          </button>
                          <button onClick={() => updatePaymentAccount.mutate({ id: account.id, payload: { enabled: !account.enabled } })} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-xs font-bold hover:bg-black/[0.04] dark:border-white/[0.08] dark:bg-white/[0.04]">
                            {account.enabled ? "Désactiver" : "Activer"}
                          </button>
                          <button onClick={() => updatePaymentAccount.mutate({ id: account.id, payload: { use_for_pos: true, is_default_pos: true } })} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-xs font-bold hover:bg-emerald-50 dark:border-white/[0.08] dark:bg-white/[0.04]">
                            Caisse par défaut
                          </button>
                          <button onClick={() => updatePaymentAccount.mutate({ id: account.id, payload: { use_for_payroll: true, is_default_payroll: true } })} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-xs font-bold hover:bg-sky-50 dark:border-white/[0.08] dark:bg-white/[0.04]">
                            Paie par défaut
                          </button>
                          <button onClick={() => updatePaymentAccount.mutate({ id: account.id, payload: { use_for_pos: !account.use_for_pos, use_for_payroll: !account.use_for_payroll } })} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-xs font-bold hover:bg-black/[0.04] dark:border-white/[0.08] dark:bg-white/[0.04]">
                            Basculer usages
                          </button>
                        </div>
                        {editingPaymentId === account.id && (
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              updatePaymentAccount.mutate(
                                { id: account.id, payload: paymentDraft },
                                { onSuccess: () => setEditingPaymentId(null) }
                              );
                            }}
                            className="mt-4 rounded-xl border border-violet-200 bg-white p-4 dark:border-violet-500/30 dark:bg-[#1e2229]"
                          >
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <h4 className="font-black text-[#17211f] dark:text-white">Modifier le compte</h4>
                              <button type="button" onClick={() => setEditingPaymentId(null)} className="text-xs font-bold text-[#717182] hover:text-[#17211f] dark:hover:text-white">Fermer</button>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <label className="text-xs font-bold uppercase text-[#717182]">
                                Libellé
                                <input value={paymentDraft.label} onChange={(event) => setPaymentDraft({ ...paymentDraft, label: event.target.value })} className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                              </label>
                              <label className="text-xs font-bold uppercase text-[#717182]">
                                Titulaire
                                <input value={paymentDraft.account_name} onChange={(event) => setPaymentDraft({ ...paymentDraft, account_name: event.target.value })} className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                              </label>
                              <label className="text-xs font-bold uppercase text-[#717182]">
                                Téléphone / identifiant
                                <input value={paymentDraft.phone_number} onChange={(event) => setPaymentDraft({ ...paymentDraft, phone_number: event.target.value })} className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                              </label>
                              <label className="text-xs font-bold uppercase text-[#717182]">
                                Banque
                                <input value={paymentDraft.bank_name} onChange={(event) => setPaymentDraft({ ...paymentDraft, bank_name: event.target.value })} className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                              </label>
                              <label className="text-xs font-bold uppercase text-[#717182]">
                                Numéro compte
                                <input value={paymentDraft.account_number} onChange={(event) => setPaymentDraft({ ...paymentDraft, account_number: event.target.value })} className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                              </label>
                              <label className="text-xs font-bold uppercase text-[#717182]">
                                Email PayPal
                                <input type="email" value={paymentDraft.paypal_email} onChange={(event) => setPaymentDraft({ ...paymentDraft, paypal_email: event.target.value })} className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                              </label>
                              <label className="md:col-span-2 text-xs font-bold uppercase text-[#717182]">
                                Instructions
                                <textarea value={paymentDraft.instructions} onChange={(event) => setPaymentDraft({ ...paymentDraft, instructions: event.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                              </label>
                            </div>
                            <div className="mt-3 grid gap-2 text-xs font-bold text-[#17211f] dark:text-white sm:grid-cols-2 lg:grid-cols-4">
                              {[
                                ["enabled", "Compte actif"],
                                ["use_for_pos", "Utiliser caisse"],
                                ["use_for_payroll", "Utiliser paie"],
                                ["is_default_payroll", "Paie par défaut"],
                              ].map(([key, label]) => (
                                <label key={key} className="flex items-center gap-2 rounded-lg border border-black/[0.06] p-2 dark:border-white/[0.08]">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(paymentDraft[key as keyof typeof paymentDraft])}
                                    onChange={(event) => setPaymentDraft({ ...paymentDraft, [key]: event.target.checked })}
                                  />
                                  {label}
                                </label>
                              ))}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button disabled={updatePaymentAccount.isPending} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                                Enregistrer
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePaymentAccount(account.id, account.label)}
                                disabled={deletePaymentAccount.isPending}
                                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-700 hover:bg-red-100 disabled:opacity-50"
                              >
                                Supprimer
                              </button>
                            </div>
                          </form>
                        )}
                        {account.instructions && <p className="mt-3 text-xs text-[#717182]">{account.instructions}</p>}
                      </article>
                    );
                  })}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createPaymentAccount.mutate(paymentForm);
                  }}
                  className="h-fit rounded-xl border border-black/[0.06] bg-white p-4 dark:border-white/[0.06] dark:bg-[#252931]"
                >
                  <div className="flex items-center gap-2">
                    <Plus size={17} className="text-emerald-600" />
                    <h3 className="font-bold text-[#17211f] dark:text-white">Ajouter un compte</h3>
                  </div>
                  <div className="mt-4 space-y-3">
                    <label className="block text-xs font-bold uppercase text-[#717182]">
                      Type
                      <select value={paymentForm.provider} onChange={(e) => setPaymentForm({ ...paymentForm, provider: e.target.value })} className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white">
                        {PROVIDERS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                      </select>
                    </label>
                    <label className="block text-xs font-bold uppercase text-[#717182]">
                      Libellé
                      <input required value={paymentForm.label} onChange={(e) => setPaymentForm({ ...paymentForm, label: e.target.value })} placeholder="Ex : Zola Boutique Plateau" className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" />
                    </label>
                    <label className="block text-xs font-bold uppercase text-[#717182]">
                      Titulaire
                      <input value={paymentForm.account_name} onChange={(e) => setPaymentForm({ ...paymentForm, account_name: e.target.value })} placeholder="Nom du compte" className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" />
                    </label>
                    {!["bank", "paypal", "cash", "card"].includes(paymentForm.provider) && (
                      <label className="block text-xs font-bold uppercase text-[#717182]">
                        Téléphone / identifiant
                        <input value={paymentForm.phone_number} onChange={(e) => setPaymentForm({ ...paymentForm, phone_number: e.target.value })} placeholder="+242 06..." className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" />
                      </label>
                    )}
                    {paymentForm.provider === "card" && (
                      <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                        La saisie carte du POS utilise Stripe.js et les clés Stripe du backend. Le Tap to Pay sans contact nécessite une app mobile Stripe Terminal ou un lecteur Terminal.
                      </div>
                    )}
                    {paymentForm.provider === "cash" && (
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                        Utilisez ce compte pour identifier une caisse espèces précise dans le POS.
                      </div>
                    )}
                    {paymentForm.provider === "bank" && (
                      <>
                        <label className="block text-xs font-bold uppercase text-[#717182]">
                          Banque
                          <input value={paymentForm.bank_name} onChange={(e) => setPaymentForm({ ...paymentForm, bank_name: e.target.value })} placeholder="Nom banque" className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" />
                        </label>
                        <label className="block text-xs font-bold uppercase text-[#717182]">
                          RIB / compte
                          <input value={paymentForm.account_number} onChange={(e) => setPaymentForm({ ...paymentForm, account_number: e.target.value })} placeholder="Numéro compte" className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" />
                        </label>
                      </>
                    )}
                    {paymentForm.provider === "paypal" && (
                      <label className="block text-xs font-bold uppercase text-[#717182]">
                        Email PayPal
                        <input type="email" value={paymentForm.paypal_email} onChange={(e) => setPaymentForm({ ...paymentForm, paypal_email: e.target.value })} placeholder="payments@entreprise.com" className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" />
                      </label>
                    )}
                    <label className="block text-xs font-bold uppercase text-[#717182]">
                      Instructions internes
                      <textarea value={paymentForm.instructions} onChange={(e) => setPaymentForm({ ...paymentForm, instructions: e.target.value })} rows={3} placeholder="Ex : vérifier le reçu avant validation..." className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" />
                    </label>
                    <div className="grid grid-cols-1 gap-2 text-xs font-semibold text-[#17211f] dark:text-white sm:grid-cols-2">
                      <label className="flex items-center gap-2 rounded-lg border border-black/[0.06] p-2 dark:border-white/[0.06]">
                        <input type="checkbox" checked={paymentForm.use_for_pos} onChange={(e) => setPaymentForm({ ...paymentForm, use_for_pos: e.target.checked })} />
                        Caisse
                      </label>
                      <label className="flex items-center gap-2 rounded-lg border border-black/[0.06] p-2 dark:border-white/[0.06]">
                        <input type="checkbox" checked={paymentForm.use_for_payroll} onChange={(e) => setPaymentForm({ ...paymentForm, use_for_payroll: e.target.checked })} />
                        Paie
                      </label>
                    </div>
                    <button disabled={createPaymentAccount.isPending} className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                      {createPaymentAccount.isPending ? "Ajout..." : "Ajouter le compte"}
                    </button>
                    {createPaymentAccount.error && <p className="text-xs font-semibold text-red-600">{createPaymentAccount.error.message}</p>}
                  </div>
                </form>
              </div>
              )}
            </div>
          )}

          {/* ── SÉCURITÉ ── */}
          {tab === "security" && (
            <div>
              <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-5">
                <h2 className="font-bold text-[#17211f] dark:text-white">Sécurité &amp; accès</h2>
                <p className="text-sm text-[#717182]">Authentification, sessions et permissions</p>
              </div>
              <div className="px-6 py-2">
                {/* 2FA Section */}
                <div className="py-4 border-b border-black/[0.04] dark:border-white/[0.04]">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      <Shield size={17} />
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#17211f] dark:text-white">Authentification à deux facteurs (2FA)</p>
                          <p className="text-xs text-[#717182]">Sécurisez votre compte avec une application TOTP (Google Authenticator, Authy…)</p>
                        </div>
                        {twoFaStep === "enabled" ? (
                          <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                            2FA Activé ✓
                          </span>
                        ) : (
                          <span className="rounded-full bg-stone-100 dark:bg-white/10 px-3 py-1 text-xs font-semibold text-[#717182]">
                            Désactivé
                          </span>
                        )}
                      </div>

                      {twoFaStep === "idle" && (
                        <button
                          onClick={handle2faSetup}
                          disabled={twoFaLoading}
                          className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <ShieldCheck size={15} /> {twoFaLoading ? "Chargement…" : "Activer le 2FA"}
                        </button>
                      )}

                      {twoFaStep === "setup" && (
                        <div className="mt-4 space-y-4">
                          <p className="text-sm text-[#717182]">Scannez ce QR code avec votre application TOTP :</p>
                          <div className="flex justify-center rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-white p-4 w-fit">
                            <QRCodeSVG value={twoFaQrUrl || "https://kompta.io"} size={160} />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="text"
                              value={twoFaCode}
                              onChange={(e) => setTwoFaCode(e.target.value)}
                              placeholder="Code à 6 chiffres"
                              maxLength={6}
                              className="w-full max-w-[12rem] rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500 font-mono tracking-widest"
                            />
                            <button
                              onClick={handle2faVerify}
                              disabled={twoFaLoading || twoFaCode.length !== 6}
                              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              <Check size={14} /> {twoFaLoading ? "Vérif…" : "Vérifier"}
                            </button>
                          </div>
                        </div>
                      )}

                      {twoFaStep === "enabled" && (
                        <button
                          onClick={handle2faDisable}
                          disabled={twoFaLoading}
                          className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                        >
                          <X size={14} /> {twoFaLoading ? "Désactivation…" : "Désactiver le 2FA"}
                        </button>
                      )}

                      {twoFaError && (
                        <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">{twoFaError}</p>
                      )}
                    </div>
                  </div>
                </div>
                <SettingRow icon={Smartphone} label="Sessions" description="Tu peux te déconnecter depuis le menu en bas à gauche">
                  <span className="text-sm text-[#717182]">{user?.account_status === "active" ? "Session active" : "—"}</span>
                </SettingRow>
                <SettingRow icon={Shield} label="Politique de mot de passe" description="Min. 8 caractères">
                  <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">Actif</span>
                </SettingRow>
                <SettingRow icon={User} label="Rôle de connexion" description="Permissions appliquées par RBAC">
                  <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">{user?.role ?? "—"}</span>
                </SettingRow>
                <SettingRow
                  icon={Trash2}
                  label="Remettre l'espace à zéro"
                  description="Supprime employés, produits, ventes, documents, paie, tâches, notes, réunions et messages. Le compte connecté et le canal général sont conservés."
                >
                  <button
                    onClick={handleResetWorkspace}
                    disabled={resetWorkspace.isPending || user?.role !== "admin_entreprise"}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resetWorkspace.isPending ? "Reset..." : "Reset local"}
                  </button>
                </SettingRow>
                {resetWorkspace.isSuccess && (
                  <p className="pb-4 text-xs font-semibold text-emerald-600">{resetWorkspace.data.message}</p>
                )}
                {resetWorkspace.error && (
                  <p className="pb-4 text-xs font-semibold text-red-600">{resetWorkspace.error.message}</p>
                )}
              </div>
            </div>
          )}

          {/* ── NOTIFICATIONS ── */}
          {tab === "notifications" && (
            <div>
              <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-5">
                <h2 className="font-bold text-[#17211f] dark:text-white">Notifications</h2>
                <p className="text-sm text-[#717182]">Choisissez quand et comment KOMPTA vous contacte</p>
              </div>
              <div className="px-6 py-2">
                <p className="py-3 text-xs font-bold uppercase tracking-wider text-[#717182]">Canaux</p>
                <SettingRow icon={Bell} label="Notifications email" description="Alertes et résumés par e-mail">
                  <Toggle on={localPrefs.notify_email} onChange={(v) => setPref("notify_email", v)} />
                </SettingRow>
                <SettingRow icon={Smartphone} label="Notifications chat" description="Mentions @ et messages directs">
                  <Toggle on={localPrefs.notify_chat} onChange={(v) => setPref("notify_chat", v)} />
                </SettingRow>
                <p className="py-3 text-xs font-bold uppercase tracking-wider text-[#717182]">Événements</p>
                <SettingRow icon={ShieldCheck} label="Alertes TERAS" description="Nouvelles anomalies détectées">
                  <Toggle on={localPrefs.notify_teras} onChange={(v) => setPref("notify_teras", v)} />
                </SettingRow>
                <SettingRow icon={Bell} label="Rappels paie" description="Échéances et validations">
                  <Toggle on={localPrefs.notify_payroll} onChange={(v) => setPref("notify_payroll", v)} />
                </SettingRow>
                <SettingRow icon={BrainCircuit} label="Fréquence des résumés Limule" description="Digest agrégé">
                  <select
                    value={localPrefs.digest_frequency}
                    onChange={(e) => setPref("digest_frequency", e.target.value)}
                    className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm">
                    <option value="off">Désactivé</option>
                    <option value="daily">Quotidien</option>
                    <option value="weekly">Hebdomadaire</option>
                  </select>
                </SettingRow>
                {updatePrefs.isPending && <p className="pb-4 text-xs text-[#717182]">Enregistrement…</p>}
                {updatePrefs.isSuccess && <p className="pb-4 text-xs text-emerald-600">✓ Préférences enregistrées</p>}
              </div>
            </div>
          )}

          {/* ── TERAS ── */}
          {tab === "teras" && (
            <div>
              <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white"><ShieldCheck size={20} /></div>
                  <div>
                    <h2 className="font-bold text-[#17211f] dark:text-white">TERAS Connect</h2>
                    <p className="text-sm text-[#717182]">Intelligence artificielle de conformité</p>
                  </div>
                  <span className="ml-auto rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">Connecté</span>
                </div>
              </div>
              <div className="px-6 py-2">
                <div className="my-4 rounded-xl bg-gradient-to-br from-emerald-600/20 to-emerald-700/10 dark:from-emerald-600/30 dark:to-emerald-700/20 p-5">
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Score TERAS actuel</p>
                  <p className="text-4xl font-extrabold text-emerald-800 dark:text-emerald-200">{terasScore} <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">/ 100</span></p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/40 dark:bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all" style={{ width: `${terasScore}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400">Dernière analyse : {lastTerasAnalysis}</p>
                </div>
                <SettingRow icon={Bell} label="Recevoir les alertes TERAS" description="Anomalies détectées par l'analyse">
                  <Toggle on={localPrefs.notify_teras} onChange={(v) => setPref("notify_teras", v)} />
                </SettingRow>
                <div className="py-4">
                  <button
                    onClick={() => runTerasAnalysis.mutate()}
                    disabled={runTerasAnalysis.isPending}
                    className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50">
                    {runTerasAnalysis.isPending ? "Analyse en cours…" : "Lancer une analyse TERAS maintenant"}
                  </button>
                  {runTerasAnalysis.isSuccess && <p className="mt-2 text-xs text-emerald-600">✓ Analyse terminée — score actualisé</p>}
                </div>
              </div>
            </div>
          )}

          {/* ── FACTURATION ── */}
          {tab === "billing" && (
            <div>
              <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-5">
                <h2 className="font-bold text-[#17211f] dark:text-white">Facturation &amp; usage</h2>
                <p className="text-sm text-[#717182]">Plan KOMPTA local · données calculées en temps réel</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-emerald-200">Plan actuel</p>
                      <p className="text-2xl font-extrabold">KOMPTA Local</p>
                      <p className="text-sm text-emerald-200">{employeesCount} employés actifs</p>
                    </div>
                    <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-bold">Actif</span>
                  </div>
                </div>
                {[
                  { label: "Employés",          used: employeesCount,         max: 100 },
                  { label: "Factures émises",   used: myInvoices.data?.length ?? 0, max: 1000 },
                  { label: "Requêtes Limule",   used: aiQueriesCount,         max: 1000 },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-semibold text-[#17211f] dark:text-white">{item.label}</span>
                      <span className="text-[#717182]">{item.used} / {item.max}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min((item.used / item.max) * 100, 100)}%` }} />
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    onClick={exportInvoicesCsv}
                    disabled={(myInvoices.data?.length ?? 0) === 0}
                    className="flex-1 min-w-[200px] rounded-xl border border-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30 py-3 text-sm font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition disabled:opacity-50">
                    Télécharger factures (CSV)
                  </button>
                  <a
                    href="mailto:contact@kompta.io?subject=Mise%20%C3%A0%20niveau%20KOMPTA"
                    className="flex-1 min-w-[200px] rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition text-center">
                    Contacter pour mise à niveau
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* ── AUDIT TRAIL ── */}
          {tab === "audit" && (
            <div>
              <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-5">
                <h2 className="font-bold text-[#17211f] dark:text-white">Journal d'audit</h2>
                <p className="text-sm text-[#717182]">Historique des actions importantes sur votre espace KOMPTA</p>
              </div>
              <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                {auditLogs.isLoading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                  </div>
                )}
                {!auditLogs.isLoading && (auditLogs.data?.length ?? 0) === 0 && (
                  <div className="py-12 text-center text-sm text-[#717182]">
                    <FileText size={24} className="mx-auto mb-2 text-stone-300" />
                    Aucune action enregistrée.
                  </div>
                )}
                {auditLogs.data?.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 px-6 py-3">
                    <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-50 dark:bg-emerald-900/30">
                      <Shield size={13} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#17211f] dark:text-white">{log.action}</p>
                      {log.details && <p className="text-xs text-[#717182] mt-0.5">{log.details}</p>}
                      <p className="mt-0.5 text-xs text-[#717182]">
                        {log.actor && <span>Par <strong>{log.actor}</strong></span>}
                        {log.employee && <span> · Employé : {log.employee}</span>}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs text-[#717182]">
                      {new Date(log.created_at).toLocaleDateString("fr-FR", {
                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
