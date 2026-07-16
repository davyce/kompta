import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import {
  Bell, BrainCircuit, Building2, Check, CheckCircle2, ChevronRight,
  CreditCard, FileText, Globe, Landmark, Lock, Moon, Palette, Plus, Shield,
  Save, Search, ShieldCheck, Smartphone, Sparkles, Sun, Trash2, Upload, User, UserCog, Wallet, X, Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { api } from "../services/api";
import { SubscriptionPanel } from "../components/SubscriptionPanel";
import { CollectionMethodsPanel } from "../components/CollectionMethodsPanel";
import { StripeConnectPanel } from "../components/StripeConnectPanel";
import { OpeningBalancePanel } from "../components/OpeningBalancePanel";
import { RolesSettings } from "../components/settings/RolesSettings";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../app/AuthContext";
import { useConfirm } from "../components/ConfirmProvider";
import { resetOnboardingTour } from "../components/GuidedTour";
import { resetCompanySetup } from "../components/CompanySetupWizard";
import { useCurrency, SUPPORTED_CURRENCIES } from "../contexts/CurrencyContext";
import { useLanguage } from "../contexts/LanguageContext";
import type { CurrencyCode } from "../utils/format";
import i18n from "../i18n";
import { QRCodeSVG } from "qrcode.react";

/* ── Types ────────────────────────────────────────────────────────── */
type Tab = "general" | "subscription" | "modules" | "payments" | "roles" | "security" | "notifications" | "teras" | "billing" | "audit";

const PROVIDERS = [
  { key: "zola", tk: "settingsPage.providers.zola", icon: Wallet },
  { key: "mobile_money", tk: "settingsPage.providers.mobileMoney", icon: Smartphone },
  { key: "card", tk: "settingsPage.providers.card", icon: CreditCard },
  { key: "cash", tk: "settingsPage.providers.cash", icon: Wallet },
  { key: "bank", tk: "settingsPage.providers.bank", icon: Landmark },
  { key: "paypal", tk: "settingsPage.providers.paypal", icon: CreditCard },
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
function Toggle({ on, onChange, disabled = false, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      aria-label={label}
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

const MODULE_LABELS: Record<string, { labelTk: string; descTk: string }> = {
  dashboard:    { labelTk: "settingsPage.modulesList.dashboard.label", descTk: "settingsPage.modulesList.dashboard.desc" },
  rh:           { labelTk: "settingsPage.modulesList.rh.label", descTk: "settingsPage.modulesList.rh.desc" },
  payroll:      { labelTk: "settingsPage.modulesList.payroll.label", descTk: "settingsPage.modulesList.payroll.desc" },
  accounting:   { labelTk: "settingsPage.modulesList.accounting.label", descTk: "settingsPage.modulesList.accounting.desc" },
  billing:      { labelTk: "settingsPage.modulesList.billing.label", descTk: "settingsPage.modulesList.billing.desc" },
  pos:          { labelTk: "settingsPage.modulesList.pos.label", descTk: "settingsPage.modulesList.pos.desc" },
  inventory:    { labelTk: "settingsPage.modulesList.inventory.label", descTk: "settingsPage.modulesList.inventory.desc" },
  projects:     { labelTk: "settingsPage.modulesList.projects.label", descTk: "settingsPage.modulesList.projects.desc" },
  chat:         { labelTk: "settingsPage.modulesList.chat.label", descTk: "settingsPage.modulesList.chat.desc" },
  meetings:     { labelTk: "settingsPage.modulesList.meetings.label", descTk: "settingsPage.modulesList.meetings.desc" },
  reports:      { labelTk: "settingsPage.modulesList.reports.label", descTk: "settingsPage.modulesList.reports.desc" },
  declarations: { labelTk: "settingsPage.modulesList.declarations.label", descTk: "settingsPage.modulesList.declarations.desc" },
  assistants:   { labelTk: "settingsPage.modulesList.assistants.label", descTk: "settingsPage.modulesList.assistants.desc" },
  teras:        { labelTk: "settingsPage.modulesList.teras.label", descTk: "settingsPage.modulesList.teras.desc" },
  documents:    { labelTk: "settingsPage.modulesList.documents.label", descTk: "settingsPage.modulesList.documents.desc" },
  calendar:     { labelTk: "settingsPage.modulesList.calendar.label", descTk: "settingsPage.modulesList.calendar.desc" },
  notes:        { labelTk: "settingsPage.modulesList.notes.label", descTk: "settingsPage.modulesList.notes.desc" },
  settings:     { labelTk: "settingsPage.modulesList.settings.label", descTk: "settingsPage.modulesList.settings.desc" },
};

export function SettingsPage() {
  const { t: tr } = useTranslation();
  const { theme, toggle: toggleTheme } = useTheme();
  const { user } = useAuth();
  const { currency: activeCurrency, setCurrency } = useCurrency();
  const { setLanguage } = useLanguage();
  const queryClient = useQueryClient();
  const { confirm } = useConfirm();
  const location = useLocation();
  const initialTab = (new URLSearchParams(location.search).get("tab") as Tab | null) ?? "general";
  const [tab, setTab] = useState<Tab>(initialTab);
  const isEmployeeSelfService = user?.role === "employe";

  const exchangeRates = useQuery({ queryKey: ["exchangeRates"], queryFn: api.exchangeRates });
  const updateExchangeRateMutation = useMutation({
    mutationFn: ({ currency, rate }: { currency: string; rate: number }) => api.updateExchangeRate(currency, rate),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exchangeRates"] }),
  });

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
    cnss_employee_rate: 0.04,
    cnss_employer_rate: 0.08,
    family_allowance_rate: 0.07,
    work_accident_rate: 0.02,
    is_public_sector: false,
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
      title: tr("settingsPage.confirm.deletePaymentTitle"),
      message: label,
      confirmLabel: tr("common.delete"),
      danger: true,
    });
    if (ok) deletePaymentAccount.mutate(accountId);
  }

  async function handleResetWorkspace() {
    const ok = await confirm({
      title: tr("settingsPage.confirm.resetWorkspaceTitle"),
      message: tr("settingsPage.confirm.resetWorkspaceMessage"),
      confirmLabel: tr("settingsPage.security.reset"),
      danger: true,
      requireAcknowledge: tr("settingsPage.confirm.resetWorkspaceAcknowledge"),
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
      cnss_employee_rate: d.cnss_employee_rate ?? 0.04,
      cnss_employer_rate: d.cnss_employer_rate ?? 0.08,
      family_allowance_rate: d.family_allowance_rate ?? 0.07,
      work_accident_rate: d.work_accident_rate ?? 0.02,
      is_public_sector: d.is_public_sector ?? false,
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

  /* ── Logo entreprise (image ou PDF, upload direct ou photo caméra sur mobile) ── */
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  useEffect(() => {
    if (!company.data?.has_logo) { setLogoUrl(null); return; }
    let cancelled = false;
    let objectUrl: string | null = null;
    api.companyLogoBlob().then((blob) => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setLogoUrl(objectUrl);
    });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [company.data?.id, company.data?.has_logo]);

  const uploadLogo = useMutation({
    mutationFn: (file: File) => api.uploadCompanyLogo(file),
    onSuccess: async () => {
      setLogoError(null);
      const blob = await api.companyLogoBlob();
      setLogoUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return blob ? URL.createObjectURL(blob) : null; });
      queryClient.invalidateQueries({ queryKey: ["company"] });
    },
    onError: (err: unknown) => setLogoError(err instanceof Error ? err.message : tr("settingsPage.general.logo.uploadError")),
  });

  const deleteLogo = useMutation({
    mutationFn: () => api.deleteCompanyLogo(),
    onSuccess: () => {
      setLogoUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      queryClient.invalidateQueries({ queryKey: ["company"] });
    },
  });

  function onLogoFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadLogo.mutate(file);
    e.target.value = "";
  }

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
    } catch (e) { setTwoFaError(tr("settingsPage.security.invalid2fa")); }
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
    const lines = [tr("settingsPage.billing.csvHeader")];
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
    { key: "general",       label: tr("settingsPage.tabs.general"),       icon: Building2   },
    { key: "subscription",  label: tr("settingsPage.tabs.subscription"),  icon: Sparkles    },
    { key: "modules",       label: tr("settingsPage.tabs.modules"),       icon: Zap         },
    { key: "payments",      label: tr("settingsPage.tabs.payments"),      icon: Wallet      },
    { key: "roles",         label: "Rôles & accès",                       icon: UserCog     },
    { key: "security",      label: tr("settingsPage.tabs.security"),      icon: Lock        },
    { key: "notifications", label: tr("settingsPage.tabs.notifications"), icon: Bell        },
    { key: "teras",         label: tr("settingsPage.tabs.teras"),         icon: ShieldCheck },
    { key: "billing",       label: tr("settingsPage.tabs.billing"),       icon: CreditCard  },
    { key: "audit",         label: tr("settingsPage.tabs.audit"),         icon: FileText    },
  ];
  const isCompanyManager = user?.role === "admin_entreprise" || user?.role === "manager_entreprise";
  const TABS = isEmployeeSelfService
    ? allTabs.filter((item) => ["general", "payments", "notifications", "security"].includes(item.key))
    : allTabs.filter((item) => item.key !== "roles" || isCompanyManager);

  const modulesData = modulesQ.data ?? [];
  const filteredModules = modulesData.filter((mod) => {
    const meta = MODULE_LABELS[mod.module_key];
    const label = meta ? tr(meta.labelTk) : mod.module_key;
    const desc = meta ? tr(meta.descTk) : "";
    const haystack = `${label} ${desc} ${mod.module_key}`.toLowerCase();
    return haystack.includes(moduleSearch.trim().toLowerCase());
  });
  const activeModulesCount = modulesData.filter((mod) => mod.enabled).length;
  const employeesCount = employees.data?.length ?? 0;
  const aiQueriesCount = aiHistory.data?.length ?? 0;
  const terasScore = overview.data?.kpis.teras_score ?? 0;
  const lastTerasAnalysis = useMemo(() => {
    // Approximation: last AI generation that's TERAS-related, or last alert created_at
    return new Date().toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" });
  }, []);

  return (
    <div data-tour="settings-content" className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-emerald-600">{tr("settingsPage.header.eyebrow")}</p>
        <h1 className="text-3xl font-extrabold text-[#17211f] dark:text-white">{tr("settingsPage.header.title")}</h1>
        <p className="mt-1 text-sm text-[#717182]">
          {tr("settingsPage.header.subtitle", { company: company.data?.name ?? "KOMPTA" })}
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
                <h2 className="font-bold text-[#17211f] dark:text-white">{tr("settingsPage.general.title")}</h2>
                <p className="text-sm text-[#717182]">{tr("settingsPage.general.subtitle")}</p>
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
                      <p className="text-sm font-bold text-[#17211f] dark:text-white">{tr("settingsPage.general.identityTitle")}</p>
                      <p className="text-xs text-[#717182]">{tr("settingsPage.general.identityDesc")}</p>
                    </div>
                    <button
                      disabled={updateCompany.isPending || isEmployeeSelfService}
                      className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Save size={15} /> {updateCompany.isPending ? tr("common.saving") : tr("common.save")}
                    </button>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-[220px_1fr]">
                    <div className="rounded-2xl border border-black/[0.06] bg-[#fbfbfd] p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                      {logoUrl ? (
                        <img src={logoUrl} alt={tr("settingsPage.general.logo.alt")}
                          className="h-20 w-20 rounded-2xl border border-black/[0.06] bg-white object-contain shadow-sm dark:border-white/[0.08]" />
                      ) : (
                        <div className="grid h-20 w-20 place-items-center rounded-2xl text-3xl font-black text-white shadow-sm"
                          style={{ background: companyForm.primary_color || "#059669" }}>
                          {(companyForm.name || "K")[0]}
                        </div>
                      )}
                      <p className="mt-3 font-black text-[#17211f] dark:text-white">{companyForm.name || "KOMPTA"}</p>
                      <p className="text-xs text-[#717182]">{companyForm.industry || tr("settingsPage.general.activityFallback")}</p>
                      <div className="mt-3 flex gap-2">
                        <span className="h-7 w-7 rounded-lg border border-black/10" style={{ background: companyForm.primary_color }} />
                        <span className="h-7 w-7 rounded-lg border border-black/10" style={{ background: companyForm.accent_color }} />
                      </div>
                      {!isEmployeeSelfService && (
                        <div className="mt-3 space-y-1.5">
                          <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-xs font-bold text-[#17211f] hover:bg-stone-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white">
                            <Upload size={13} />
                            {uploadLogo.isPending ? tr("common.saving") : tr("settingsPage.general.logo.upload")}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,application/pdf"
                              capture="environment"
                              className="hidden"
                              onChange={onLogoFileChange}
                              disabled={uploadLogo.isPending}
                            />
                          </label>
                          {logoUrl && (
                            <button
                              type="button"
                              onClick={() => deleteLogo.mutate()}
                              disabled={deleteLogo.isPending}
                              className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                            >
                              {tr("settingsPage.general.logo.remove")}
                            </button>
                          )}
                          {logoError && <p className="text-[11px] font-semibold text-rose-600">{logoError}</p>}
                          <p className="text-[10px] text-[#717182]">{tr("settingsPage.general.logo.hint")}</p>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {[
                        { label: tr("settingsPage.general.fields.tradeName"), key: "name", placeholder: tr("settingsPage.general.placeholders.tradeName") },
                        { label: tr("settingsPage.general.fields.legalName"), key: "legal_name", placeholder: tr("settingsPage.general.placeholders.legalName") },
                        { label: tr("settingsPage.general.fields.industry"), key: "industry", placeholder: tr("settingsPage.general.placeholders.industry") },
                        { label: tr("settingsPage.general.fields.organizationType"), key: "organization_type", placeholder: tr("settingsPage.general.placeholders.organizationType") },
                        { label: tr("settingsPage.general.fields.country"), key: "country", placeholder: tr("settingsPage.general.placeholders.country") },
                      ].map((field) => (
                        <label key={field.key} className="block text-xs font-bold uppercase text-[#717182]">
                          {field.label}
                          <input
                            value={companyForm[field.key as keyof typeof companyForm] as string}
                            onChange={(event) => setCompanyForm({ ...companyForm, [field.key]: event.target.value })}
                            placeholder={field.placeholder}
                            disabled={isEmployeeSelfService}
                            className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
                          />
                        </label>
                      ))}
                      <label className="block text-xs font-bold uppercase text-[#717182]">
                        {tr("settingsPage.general.fields.primaryColor")}
                        <input
                          type="color"
                          value={companyForm.primary_color}
                          onChange={(event) => setCompanyForm({ ...companyForm, primary_color: event.target.value })}
                          disabled={isEmployeeSelfService}
                          className="mt-1 h-11 w-full rounded-xl border border-black/[0.08] bg-white p-1 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931]"
                        />
                      </label>
                      <label className="block text-xs font-bold uppercase text-[#717182]">
                        {tr("settingsPage.general.fields.accentColor")}
                        <input
                          type="color"
                          value={companyForm.accent_color}
                          onChange={(event) => setCompanyForm({ ...companyForm, accent_color: event.target.value })}
                          disabled={isEmployeeSelfService}
                          className="mt-1 h-11 w-full rounded-xl border border-black/[0.08] bg-white p-1 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931]"
                        />
                      </label>
                      <label className="block text-xs font-bold uppercase text-[#717182] md:col-span-2">
                        {tr("settingsPage.general.fields.cashThreshold")}
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
                          {tr("settingsPage.general.cashThresholdHint")}
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* ── Mentions légales & fiscales (OHADA / CEMAC) ── */}
                  <div className="mt-5 rounded-2xl border border-black/[0.06] bg-[#fbfbfd] p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                    <p className="mb-1 text-sm font-black text-[#17211f] dark:text-white">{tr("settingsPage.general.legalTitle")}</p>
                    <p className="mb-3 text-xs text-[#717182]">{tr("settingsPage.general.legalDesc")}</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <label className="block text-xs font-bold uppercase text-[#717182]">{tr("settingsPage.general.fields.legalForm")}
                        <select value={companyForm.legal_form} onChange={(e) => setCompanyForm({ ...companyForm, legal_form: e.target.value })} disabled={isEmployeeSelfService}
                          className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white">
                          <option value="">{tr("settingsPage.choose")}</option>
                          <option value="EI">{tr("settingsPage.general.legalForms.ei")}</option>
                          <option value="SARL">SARL</option>
                          <option value="SUARL">SARL unipersonnelle (SUARL)</option>
                          <option value="SA">{tr("settingsPage.general.legalForms.sa")}</option>
                          <option value="SAS">SAS</option>
                          <option value="SNC">SNC</option>
                          <option value="GIE">GIE</option>
                          <option value="Coopérative">{tr("settingsPage.general.legalForms.cooperative")}</option>
                          <option value="Association">{tr("settingsPage.general.legalForms.association")}</option>
                        </select>
                      </label>
                      {[
                        { label: "RCCM", key: "rccm", ph: "Ex : CG-BZV-01-2024-B12-00123" },
                        { label: tr("settingsPage.general.fields.taxId"), key: "niu", ph: tr("settingsPage.general.placeholders.taxId") },
                        { label: tr("settingsPage.general.fields.cnss"), key: "cnss_number", ph: tr("settingsPage.general.placeholders.cnss") },
                        { label: tr("settingsPage.general.fields.patent"), key: "patente_number", ph: tr("settingsPage.general.placeholders.patent") },
                        { label: tr("settingsPage.general.fields.shareCapital"), key: "share_capital", ph: tr("settingsPage.general.placeholders.shareCapital") },
                      ].map((f) => (
                        <label key={f.key} className="block text-xs font-bold uppercase text-[#717182]">{f.label}
                          <input value={companyForm[f.key as keyof typeof companyForm] as string} onChange={(e) => setCompanyForm({ ...companyForm, [f.key]: e.target.value })} placeholder={f.ph} disabled={isEmployeeSelfService}
                            className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                        </label>
                      ))}
                      <label className="block text-xs font-bold uppercase text-[#717182]">{tr("settingsPage.general.fields.taxRegime")}
                        <select value={companyForm.tax_regime} onChange={(e) => setCompanyForm({ ...companyForm, tax_regime: e.target.value })} disabled={isEmployeeSelfService}
                          className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white">
                          <option value="">{tr("settingsPage.choose")}</option>
                          <option value="reel">{tr("settingsPage.general.taxRegimes.real")}</option>
                          <option value="simplifie">{tr("settingsPage.general.taxRegimes.simplified")}</option>
                          <option value="forfait">{tr("settingsPage.general.taxRegimes.flat")}</option>
                        </select>
                      </label>
                      <label className="block text-xs font-bold uppercase text-[#717182]">{tr("settingsPage.general.fields.foundedDate")}
                        <input type="date" value={companyForm.founded_date} onChange={(e) => setCompanyForm({ ...companyForm, founded_date: e.target.value })} disabled={isEmployeeSelfService}
                          className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                      </label>
                    </div>
                  </div>

                  {/* ── Coordonnées ── */}
                  <div className="mt-4 rounded-2xl border border-black/[0.06] bg-[#fbfbfd] p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                    <p className="mb-3 text-sm font-black text-[#17211f] dark:text-white">{tr("settingsPage.general.contactTitle")}</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {[
                        { label: tr("settingsPage.general.fields.address"), key: "address", ph: tr("settingsPage.general.placeholders.address") },
                        { label: tr("settingsPage.general.fields.city"), key: "city", ph: tr("settingsPage.general.placeholders.city") },
                        { label: tr("settingsPage.general.fields.phone"), key: "phone", ph: "+242 06 000 0000" },
                        { label: tr("settingsPage.general.fields.email"), key: "email", ph: "contact@entreprise.cg" },
                        { label: tr("settingsPage.general.fields.website"), key: "website", ph: "https://…" },
                      ].map((f) => (
                        <label key={f.key} className="block text-xs font-bold uppercase text-[#717182]">{f.label}
                          <input value={companyForm[f.key as keyof typeof companyForm] as string} onChange={(e) => setCompanyForm({ ...companyForm, [f.key]: e.target.value })} placeholder={f.ph} disabled={isEmployeeSelfService}
                            className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* ── Représentant légal & banque ── */}
                  <div className="mt-4 rounded-2xl border border-black/[0.06] bg-[#fbfbfd] p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                    <p className="mb-3 text-sm font-black text-[#17211f] dark:text-white">{tr("settingsPage.general.representativeTitle")}</p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <label className="block text-xs font-bold uppercase text-[#717182]">{tr("settingsPage.general.fields.managerName")}
                        <input value={companyForm.manager_name} onChange={(e) => setCompanyForm({ ...companyForm, manager_name: e.target.value })} placeholder={tr("settingsPage.general.placeholders.managerName")} disabled={isEmployeeSelfService}
                          className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                      </label>
                      <label className="block text-xs font-bold uppercase text-[#717182]">{tr("settingsPage.general.fields.managerTitle")}
                        <select value={companyForm.manager_title} onChange={(e) => setCompanyForm({ ...companyForm, manager_title: e.target.value })} disabled={isEmployeeSelfService}
                          className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white">
                          <option value="">{tr("settingsPage.choose")}</option>
                          <option value="Gérant">{tr("settingsPage.general.managerTitles.manager")}</option>
                          <option value="Directeur Général">{tr("settingsPage.general.managerTitles.ceo")}</option>
                          <option value="Président">{tr("settingsPage.general.managerTitles.president")}</option>
                          <option value="PDG">PDG</option>
                          <option value="Promoteur">{tr("settingsPage.general.managerTitles.promoter")}</option>
                        </select>
                      </label>
                      {[
                        { label: tr("settingsPage.paymentFields.bank"), key: "bank_name", ph: tr("settingsPage.general.placeholders.bank") },
                        { label: tr("settingsPage.paymentFields.bankAccount"), key: "bank_account", ph: tr("settingsPage.paymentFields.accountNumber") },
                      ].map((f) => (
                        <label key={f.key} className="block text-xs font-bold uppercase text-[#717182]">{f.label}
                          <input value={companyForm[f.key as keyof typeof companyForm] as string} onChange={(e) => setCompanyForm({ ...companyForm, [f.key]: e.target.value })} placeholder={f.ph} disabled={isEmployeeSelfService}
                            className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* ── Taux de paie (CNSS, IRPP, allocations, accidents du travail) ── */}
                  <div className="mt-4 rounded-2xl border border-black/[0.06] bg-[#fbfbfd] p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                    <p className="mb-1 text-sm font-black text-[#17211f] dark:text-white">Taux de paie (OHADA / CEMAC)</p>
                    <p className="mb-3 text-xs text-[#717182]">
                      Ces taux servent au calcul des bulletins de paie. Par défaut ils reprennent les taux standards
                      (CNSS salarié 4 %, CNSS patronale 8 %, allocations familiales 7 %, accidents du travail 2 %).
                    </p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {[
                        { label: "CNSS salarié (%)", key: "cnss_employee_rate" as const },
                        { label: "CNSS patronale (%)", key: "cnss_employer_rate" as const },
                        { label: "Allocations familiales (%)", key: "family_allowance_rate" as const },
                        { label: "Accidents du travail (%)", key: "work_accident_rate" as const },
                      ].map((f) => (
                        <label key={f.key} className="block text-xs font-bold uppercase text-[#717182]">{f.label}
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={Math.round(companyForm[f.key] * 1000) / 10}
                            onChange={(e) =>
                              setCompanyForm({
                                ...companyForm,
                                [f.key]: Math.max(0, Number(e.target.value) || 0) / 100,
                              })
                            }
                            disabled={isEmployeeSelfService}
                            className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
                          />
                        </label>
                      ))}
                    </div>
                    <label className="mt-4 flex items-start gap-3 rounded-xl border border-black/[0.06] bg-white p-3 dark:border-white/[0.06] dark:bg-[#252931]">
                      <input
                        type="checkbox"
                        checked={companyForm.is_public_sector}
                        onChange={(e) => setCompanyForm({ ...companyForm, is_public_sector: e.target.checked })}
                        disabled={isEmployeeSelfService}
                        className="mt-0.5 h-4 w-4 accent-emerald-600"
                      />
                      <span>
                        <span className="block text-sm font-bold text-[#17211f] dark:text-white">Structure de l'État (administration publique)</span>
                        <span className="block text-xs text-[#717182]">
                          Dans les structures publiques, les rémunérations échappent souvent à toute retenue à la source.
                          Active cette option pour garder le détail des retenues fiscales toujours visible sur les
                          bulletins de paie et le suivi des reversements CNSS/DGI.
                        </span>
                      </span>
                    </label>
                  </div>

                  {updateCompany.isSuccess && <p className="mt-3 text-xs font-bold text-emerald-600">{tr("settingsPage.general.companySaved")}</p>}
                  {updateCompany.error && <p className="mt-3 text-xs font-bold text-red-600">{updateCompany.error.message}</p>}
                </form>

                {/* ── Taux de change (EUR/USD → XAF) ── */}
                <div className="mt-4 rounded-2xl border border-black/[0.06] bg-[#fbfbfd] p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                  <p className="mb-1 text-sm font-black text-[#17211f] dark:text-white">Taux de change (vers XAF)</p>
                  <p className="mb-3 text-xs text-[#717182]">
                    Utilisés pour convertir automatiquement les transactions/factures saisies en EUR ou USD
                    vers XAF dans les totaux et rapports. L'EUR est fixé par le traité CEMAC (655,96), l'USD est indicatif.
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {(exchangeRates.data ?? []).map((r) => (
                      <label key={r.quote_currency} className="block text-xs font-bold uppercase text-[#717182]">
                        1 {r.quote_currency} = ? XAF {r.is_override && <span className="normal-case text-emerald-600">(personnalisé)</span>}
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          defaultValue={r.rate}
                          disabled={isEmployeeSelfService}
                          onBlur={(e) => {
                            const value = Number(e.target.value);
                            if (value > 0 && value !== r.rate) {
                              updateExchangeRateMutation.mutate({ currency: r.quote_currency, rate: value });
                            }
                          }}
                          className="mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
                        />
                      </label>
                    ))}
                  </div>
                  {updateExchangeRateMutation.isSuccess && <p className="mt-3 text-xs font-bold text-emerald-600">Taux mis à jour.</p>}
                  {updateExchangeRateMutation.error && <p className="mt-3 text-xs font-bold text-red-600">{(updateExchangeRateMutation.error as Error).message}</p>}
                </div>
                <SettingRow icon={Palette} label={tr("settingsPage.general.displayTheme")} description={theme === "dark" ? tr("settingsPage.general.darkEnabled") : tr("settingsPage.general.lightEnabled")}>
                  <button onClick={toggleTheme} className="flex items-center gap-2 rounded-lg border border-black/[0.08] dark:border-white/[0.08] px-3 py-2 text-sm font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition">
                    {theme === "dark" ? <><Sun size={15}/> {tr("settingsPage.general.lightMode")}</> : <><Moon size={15}/> {tr("settingsPage.general.darkMode")}</>}
                  </button>
                </SettingRow>
                <SettingRow icon={Globe} label={tr("settings.language")} description={tr("settingsPage.general.languageDesc")}>
                  <select
                    value={localPrefs.language}
                    onChange={(e) => {
                      setPref("language", e.target.value);
                      setLanguage(e.target.value as "fr" | "en");
                    }}
                    aria-label={tr("settings.language")}
                    className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500">
                    <option value="fr">{tr("settings.french")}</option>
                    <option value="en">{tr("settings.english")}</option>
                  </select>
                </SettingRow>
                <SettingRow icon={Globe} label={tr("settingsPage.general.referenceCurrency")} description={tr("settingsPage.general.referenceCurrencyDesc")}>
                  <select
                    value={activeCurrency}
                    onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                    aria-label={tr("settingsPage.general.referenceCurrency")}
                    className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500">
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>{tr(c.labelTk, { defaultValue: c.label })}</option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow icon={User} label={tr("settingsPage.general.connectedAccount")} description={user?.email}>
                  <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">{user?.role}</span>
                </SettingRow>
                <SettingRow icon={Zap} label={tr("settingsPage.general.guidedTour")} description={tr("settingsPage.general.guidedTourDesc")}>
                  <button
                    type="button"
                    onClick={() => {
                      resetOnboardingTour();
                      window.location.reload();
                    }}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300"
                  >
                    {tr("settingsPage.general.restartTour")}
                  </button>
                </SettingRow>
                {user?.role === "admin_entreprise" && (
                  <SettingRow icon={Building2} label="Configuration de l'entreprise" description="Reprenez l'assistant de configuration pas à pas du profil de votre entreprise.">
                    <button
                      type="button"
                      onClick={() => { resetCompanySetup(); window.location.reload(); }}
                      className="rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300"
                    >
                      Lancer la configuration
                    </button>
                  </SettingRow>
                )}
              </div>
            </div>
          )}

          {/* ── ABONNEMENT ── */}
          {tab === "subscription" && (
            <div>
              <h2 className="mb-1 text-lg font-black text-[#17211f] dark:text-white">{tr("settingsPage.subscription.title")}</h2>
              <p className="mb-4 text-sm text-[#717182]">{tr("settingsPage.subscription.subtitle")}</p>
              <SubscriptionPanel />
            </div>
          )}

          {/* ── MODULES ── */}
          {tab === "modules" && (
            <div>
              <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-5">
                <h2 className="font-bold text-[#17211f] dark:text-white">{tr("settingsPage.modules.title")}</h2>
                <p className="text-sm text-[#717182]">{tr("settingsPage.modules.subtitle")}</p>
              </div>
              <div className="border-b border-black/[0.05] px-6 py-4 dark:border-white/[0.05]">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 py-2 dark:border-white/[0.08] dark:bg-[#252931]">
                    <Search size={15} className="text-[#717182]" />
                    <input
                      value={moduleSearch}
                      onChange={(event) => setModuleSearch(event.target.value)}
                      placeholder={tr("settingsPage.modules.search")}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none dark:text-white"
                    />
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    {tr("settingsPage.modules.activeCount", { active: activeModulesCount, total: modulesData.length || 0 })}
                  </span>
                  <button
                    type="button"
                    disabled={toggleModule.isPending || bulkEnabling || isEmployeeSelfService}
                    onClick={enableAllModules}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  >
                    {bulkEnabling ? tr("settingsPage.modules.enabling") : tr("settingsPage.modules.enableAll")}
                  </button>
                </div>
              </div>
              <div className="grid gap-3 p-6 sm:grid-cols-2">
                {modulesData.length === 0 && modulesQ.isLoading && (
                  <p className="col-span-2 text-sm text-[#717182]">{tr("common.loading")}</p>
                )}
                {filteredModules.map((mod) => {
                  const meta = MODULE_LABELS[mod.module_key];
                  const label = meta ? tr(meta.labelTk) : mod.module_key;
                  const desc = meta ? tr(meta.descTk) : "";
                  return (
                    <div key={mod.module_key} className={`flex items-center justify-between rounded-xl border p-4 transition ${mod.enabled ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-black/[0.06] bg-white dark:border-white/[0.06] dark:bg-[#252931]"}`}>
                      <div>
                        <p className={`font-semibold ${mod.enabled ? "text-emerald-800 dark:text-emerald-200" : "text-[#17211f] dark:text-white"}`}>{label}</p>
                        <p className="text-xs text-[#717182]">{desc}</p>
                      </div>
                      <Toggle
                        on={mod.enabled}
                        disabled={toggleModule.isPending || isEmployeeSelfService}
                        onChange={(v) => toggleModule.mutate({ key: mod.module_key, enabled: v })}
                        label={label}
                      />
                    </div>
                  );
                })}
                {!modulesQ.isLoading && filteredModules.length === 0 && (
                  <p className="col-span-2 rounded-xl border border-dashed border-black/[0.12] p-6 text-center text-sm text-[#717182] dark:border-white/[0.12]">
                    {tr("settingsPage.modules.noMatch")}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── PAIEMENTS ── */}
          {tab === "roles" && isCompanyManager && (
            <div className="p-6">
              <RolesSettings />
            </div>
          )}

          {tab === "payments" && (
            <div>
              <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-5">
                <h2 className="font-bold text-[#17211f] dark:text-white">{tr("settingsPage.payments.title")}</h2>
                <p className="text-sm text-[#717182]">{tr("settingsPage.payments.subtitle")}</p>
              </div>
              {!isEmployeeSelfService && (
                <div className="border-b border-black/[0.05] p-6 dark:border-white/[0.05]">
                  <StripeConnectPanel />
                </div>
              )}
              {!isEmployeeSelfService && (
                <div className="border-b border-black/[0.05] p-6 dark:border-white/[0.05]">
                  <CollectionMethodsPanel />
                </div>
              )}
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
                          <h3 className="font-black">{tr("settingsPage.payments.myPayrollTitle")}</h3>
                        </div>
                        <p className="mt-1 text-sm text-[#717182]">
                          {tr("settingsPage.payments.myPayrollDesc")}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-emerald-700 shadow-sm dark:bg-white/10 dark:text-emerald-200">
                        {myPayout.data?.payout_phone || myPayout.data?.payout_account_number || myPayout.data?.payout_paypal_email ? tr("settingsPage.payments.detailsProvided") : tr("settingsPage.payments.toComplete")}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[220px_1fr]">
                      <label className="block text-xs font-bold uppercase text-[#717182]">
                        {tr("settingsPage.payments.method")}
                        <select
                          value={myPayoutForm.payout_method}
                          onChange={(event) => setMyPayoutForm({ ...myPayoutForm, payout_method: event.target.value })}
                          className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none dark:border-emerald-500/30 dark:bg-[#1e2229] dark:text-white"
                        >
                          <option value="mobile_money">{tr("settingsPage.providers.mobileMoney")}</option>
                          <option value="zola">Zola</option>
                          <option value="bank">{tr("settingsPage.providers.bank")}</option>
                          <option value="paypal">PayPal</option>
                        </select>
                      </label>
                      {myPayoutForm.payout_method === "bank" ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-xs font-bold uppercase text-[#717182]">
                            {tr("settingsPage.paymentFields.bank")}
                            <input value={myPayoutForm.payout_bank_name} onChange={(event) => setMyPayoutForm({ ...myPayoutForm, payout_bank_name: event.target.value })} placeholder={tr("settingsPage.payments.placeholders.bankName")} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none dark:border-emerald-500/30 dark:bg-[#1e2229] dark:text-white" />
                          </label>
                          <label className="block text-xs font-bold uppercase text-[#717182]">
                            {tr("settingsPage.paymentFields.accountNumber")}
                            <input value={myPayoutForm.payout_account_number} onChange={(event) => setMyPayoutForm({ ...myPayoutForm, payout_account_number: event.target.value })} placeholder={tr("settingsPage.paymentFields.bankAccount")} className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none dark:border-emerald-500/30 dark:bg-[#1e2229] dark:text-white" />
                          </label>
                        </div>
                      ) : myPayoutForm.payout_method === "paypal" ? (
                        <label className="block text-xs font-bold uppercase text-[#717182]">
                          {tr("settingsPage.paymentFields.paypalEmail")}
                          <input type="email" value={myPayoutForm.payout_paypal_email} onChange={(event) => setMyPayoutForm({ ...myPayoutForm, payout_paypal_email: event.target.value })} placeholder="monpaypal@email.com" className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none dark:border-emerald-500/30 dark:bg-[#1e2229] dark:text-white" />
                        </label>
                      ) : (
                        <label className="block text-xs font-bold uppercase text-[#717182]">
                          {tr("settingsPage.paymentFields.mobileNumber")}
                          <input value={myPayoutForm.payout_phone} onChange={(event) => setMyPayoutForm({ ...myPayoutForm, payout_phone: event.target.value })} placeholder="+242 06..." className="mt-1 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm normal-case text-[#17211f] outline-none dark:border-emerald-500/30 dark:bg-[#1e2229] dark:text-white" />
                        </label>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button disabled={updateMyPayout.isPending || myPayout.isLoading} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60">
                        {updateMyPayout.isPending ? tr("settingsPage.payments.confirming") : tr("settingsPage.payments.confirmPayroll")}
                      </button>
                      {updateMyPayout.isSuccess && <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{tr("settingsPage.payments.payrollConfirmed")}</span>}
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
                      {tr("settingsPage.payments.noneConfigured")}
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
                              <p className="text-sm text-[#717182]">{tr(provider.tk)} · {account.account_name || tr("settingsPage.payments.companyAccount")}</p>
                              <p className="mt-1 text-xs font-semibold text-[#717182]">
                                {account.masked_identifier || account.bank_name || account.currency}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {account.is_default_pos && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{tr("settingsPage.payments.defaultPos")}</span>}
                            {account.is_default_payroll && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">{tr("settingsPage.payments.defaultPayroll")}</span>}
                            {!account.enabled && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-500">{tr("settingsPage.disabled")}</span>}
                          </div>
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                          <button onClick={() => startPaymentEdit(account)} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-xs font-bold hover:bg-violet-50 dark:border-white/[0.08] dark:bg-white/[0.04]">
                            {tr("common.edit")}
                          </button>
                          <button onClick={() => updatePaymentAccount.mutate({ id: account.id, payload: { enabled: !account.enabled } })} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-xs font-bold hover:bg-black/[0.04] dark:border-white/[0.08] dark:bg-white/[0.04]">
                            {account.enabled ? tr("settingsPage.disable") : tr("settingsPage.enable")}
                          </button>
                          <button onClick={() => updatePaymentAccount.mutate({ id: account.id, payload: { use_for_pos: true, is_default_pos: true } })} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-xs font-bold hover:bg-emerald-50 dark:border-white/[0.08] dark:bg-white/[0.04]">
                            {tr("settingsPage.payments.setDefaultPos")}
                          </button>
                          <button onClick={() => updatePaymentAccount.mutate({ id: account.id, payload: { use_for_payroll: true, is_default_payroll: true } })} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-xs font-bold hover:bg-sky-50 dark:border-white/[0.08] dark:bg-white/[0.04]">
                            {tr("settingsPage.payments.setDefaultPayroll")}
                          </button>
                          <button onClick={() => updatePaymentAccount.mutate({ id: account.id, payload: { use_for_pos: !account.use_for_pos, use_for_payroll: !account.use_for_payroll } })} className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-xs font-bold hover:bg-black/[0.04] dark:border-white/[0.08] dark:bg-white/[0.04]">
                            {tr("settingsPage.payments.toggleUses")}
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
                              <h4 className="font-black text-[#17211f] dark:text-white">{tr("settingsPage.payments.editAccount")}</h4>
                              <button type="button" onClick={() => setEditingPaymentId(null)} className="text-xs font-bold text-[#717182] hover:text-[#17211f] dark:hover:text-white">{tr("common.close")}</button>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <label className="text-xs font-bold uppercase text-[#717182]">
                                {tr("settingsPage.paymentFields.label")}
                                <input value={paymentDraft.label} onChange={(event) => setPaymentDraft({ ...paymentDraft, label: event.target.value })} className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                              </label>
                              <label className="text-xs font-bold uppercase text-[#717182]">
                                {tr("settingsPage.paymentFields.holder")}
                                <input value={paymentDraft.account_name} onChange={(event) => setPaymentDraft({ ...paymentDraft, account_name: event.target.value })} className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                              </label>
                              <label className="text-xs font-bold uppercase text-[#717182]">
                                {tr("settingsPage.paymentFields.phoneOrId")}
                                <input value={paymentDraft.phone_number} onChange={(event) => setPaymentDraft({ ...paymentDraft, phone_number: event.target.value })} className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                              </label>
                              <label className="text-xs font-bold uppercase text-[#717182]">
                                {tr("settingsPage.paymentFields.bank")}
                                <input value={paymentDraft.bank_name} onChange={(event) => setPaymentDraft({ ...paymentDraft, bank_name: event.target.value })} className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                              </label>
                              <label className="text-xs font-bold uppercase text-[#717182]">
                                {tr("settingsPage.paymentFields.accountNumber")}
                                <input value={paymentDraft.account_number} onChange={(event) => setPaymentDraft({ ...paymentDraft, account_number: event.target.value })} className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                              </label>
                              <label className="text-xs font-bold uppercase text-[#717182]">
                                {tr("settingsPage.paymentFields.paypalEmail")}
                                <input type="email" value={paymentDraft.paypal_email} onChange={(event) => setPaymentDraft({ ...paymentDraft, paypal_email: event.target.value })} className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                              </label>
                              <label className="md:col-span-2 text-xs font-bold uppercase text-[#717182]">
                                {tr("settingsPage.paymentFields.instructions")}
                                <textarea value={paymentDraft.instructions} onChange={(event) => setPaymentDraft({ ...paymentDraft, instructions: event.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white" />
                              </label>
                            </div>
                            <div className="mt-3 grid gap-2 text-xs font-bold text-[#17211f] dark:text-white sm:grid-cols-2 lg:grid-cols-4">
                              {[
                                ["enabled", tr("settingsPage.payments.accountActive")],
                                ["use_for_pos", tr("settingsPage.payments.usePos")],
                                ["use_for_payroll", tr("settingsPage.payments.usePayroll")],
                                ["is_default_payroll", tr("settingsPage.payments.defaultPayroll")],
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
                                {tr("common.save")}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePaymentAccount(account.id, account.label)}
                                disabled={deletePaymentAccount.isPending}
                                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-700 hover:bg-red-100 disabled:opacity-50"
                              >
                                {tr("common.delete")}
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
                    <h3 className="font-bold text-[#17211f] dark:text-white">{tr("settingsPage.payments.addAccount")}</h3>
                  </div>
                  <div className="mt-4 space-y-3">
                    <label className="block text-xs font-bold uppercase text-[#717182]">
                      {tr("settingsPage.paymentFields.type")}
                      <select value={paymentForm.provider} onChange={(e) => setPaymentForm({ ...paymentForm, provider: e.target.value })} className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white">
                        {PROVIDERS.map((p) => <option key={p.key} value={p.key}>{tr(p.tk)}</option>)}
                      </select>
                    </label>
                    <label className="block text-xs font-bold uppercase text-[#717182]">
                      {tr("settingsPage.paymentFields.label")}
                      <input required value={paymentForm.label} onChange={(e) => setPaymentForm({ ...paymentForm, label: e.target.value })} placeholder={tr("settingsPage.payments.placeholders.label")} className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" />
                    </label>
                    <label className="block text-xs font-bold uppercase text-[#717182]">
                      {tr("settingsPage.paymentFields.holder")}
                      <input value={paymentForm.account_name} onChange={(e) => setPaymentForm({ ...paymentForm, account_name: e.target.value })} placeholder={tr("settingsPage.payments.placeholders.accountName")} className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" />
                    </label>
                    {!["bank", "paypal", "cash", "card"].includes(paymentForm.provider) && (
                      <label className="block text-xs font-bold uppercase text-[#717182]">
                        {tr("settingsPage.paymentFields.phoneOrId")}
                        <input value={paymentForm.phone_number} onChange={(e) => setPaymentForm({ ...paymentForm, phone_number: e.target.value })} placeholder="+242 06..." className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" />
                      </label>
                    )}
                    {paymentForm.provider === "card" && (
                      <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
                        {tr("settingsPage.payments.cardHint")}
                      </div>
                    )}
                    {paymentForm.provider === "cash" && (
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                        {tr("settingsPage.payments.cashHint")}
                      </div>
                    )}
                    {paymentForm.provider === "bank" && (
                      <>
                        <label className="block text-xs font-bold uppercase text-[#717182]">
                          {tr("settingsPage.paymentFields.bank")}
                          <input value={paymentForm.bank_name} onChange={(e) => setPaymentForm({ ...paymentForm, bank_name: e.target.value })} placeholder={tr("settingsPage.payments.placeholders.bankName")} className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" />
                        </label>
                        <label className="block text-xs font-bold uppercase text-[#717182]">
                          {tr("settingsPage.paymentFields.bankAccount")}
                          <input value={paymentForm.account_number} onChange={(e) => setPaymentForm({ ...paymentForm, account_number: e.target.value })} placeholder={tr("settingsPage.paymentFields.accountNumber")} className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" />
                        </label>
                      </>
                    )}
                    {paymentForm.provider === "paypal" && (
                      <label className="block text-xs font-bold uppercase text-[#717182]">
                        {tr("settingsPage.paymentFields.paypalEmail")}
                        <input type="email" value={paymentForm.paypal_email} onChange={(e) => setPaymentForm({ ...paymentForm, paypal_email: e.target.value })} placeholder="payments@entreprise.com" className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" />
                      </label>
                    )}
                    <label className="block text-xs font-bold uppercase text-[#717182]">
                      {tr("settingsPage.paymentFields.internalInstructions")}
                      <textarea value={paymentForm.instructions} onChange={(e) => setPaymentForm({ ...paymentForm, instructions: e.target.value })} rows={3} placeholder={tr("settingsPage.payments.placeholders.instructions")} className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" />
                    </label>
                    <div className="grid grid-cols-1 gap-2 text-xs font-semibold text-[#17211f] dark:text-white sm:grid-cols-2">
                      <label className="flex items-center gap-2 rounded-lg border border-black/[0.06] p-2 dark:border-white/[0.06]">
                        <input type="checkbox" checked={paymentForm.use_for_pos} onChange={(e) => setPaymentForm({ ...paymentForm, use_for_pos: e.target.checked })} />
                        {tr("settingsPage.payments.cashbox")}
                      </label>
                      <label className="flex items-center gap-2 rounded-lg border border-black/[0.06] p-2 dark:border-white/[0.06]">
                        <input type="checkbox" checked={paymentForm.use_for_payroll} onChange={(e) => setPaymentForm({ ...paymentForm, use_for_payroll: e.target.checked })} />
                        {tr("settingsPage.payments.payroll")}
                      </label>
                    </div>
                    <button disabled={createPaymentAccount.isPending} className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                      {createPaymentAccount.isPending ? tr("settingsPage.payments.adding") : tr("settingsPage.payments.addAccount")}
                    </button>
                    {createPaymentAccount.error && <p className="text-xs font-semibold text-red-600">{createPaymentAccount.error.message}</p>}
                  </div>
                </form>
              </div>
              )}
              {!isEmployeeSelfService && (
                <div className="border-t border-black/[0.05] p-6 dark:border-white/[0.05]">
                  <OpeningBalancePanel paymentAccounts={paymentAccounts.data ?? []} />
                </div>
              )}
            </div>
          )}

          {/* ── SÉCURITÉ ── */}
          {tab === "security" && (
            <div>
              <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-5">
                <h2 className="font-bold text-[#17211f] dark:text-white">{tr("settingsPage.security.title")}</h2>
                <p className="text-sm text-[#717182]">{tr("settingsPage.security.subtitle")}</p>
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
                          <p className="font-semibold text-[#17211f] dark:text-white">{tr("settingsPage.security.twoFaTitle")}</p>
                          <p className="text-xs text-[#717182]">{tr("settingsPage.security.twoFaDesc")}</p>
                        </div>
                        {twoFaStep === "enabled" ? (
                          <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                            {tr("settingsPage.security.twoFaEnabled")}
                          </span>
                        ) : (
                          <span className="rounded-full bg-stone-100 dark:bg-white/10 px-3 py-1 text-xs font-semibold text-[#717182]">
                            {tr("settingsPage.disabled")}
                          </span>
                        )}
                      </div>

                      {twoFaStep === "idle" && (
                        <button
                          onClick={handle2faSetup}
                          disabled={twoFaLoading}
                          className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <ShieldCheck size={15} /> {twoFaLoading ? tr("common.loading") : tr("settingsPage.security.enable2fa")}
                        </button>
                      )}

                      {twoFaStep === "setup" && (
                        <div className="mt-4 space-y-4">
                          <p className="text-sm text-[#717182]">{tr("settingsPage.security.scanQr")}</p>
                          <div className="flex justify-center rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-white p-4 w-fit">
                            <QRCodeSVG value={twoFaQrUrl || "https://kompta.io"} size={160} />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="text"
                              value={twoFaCode}
                              onChange={(e) => setTwoFaCode(e.target.value)}
                              placeholder={tr("settingsPage.security.codePlaceholder")}
                              maxLength={6}
                              className="w-full max-w-[12rem] rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500 font-mono tracking-widest"
                            />
                            <button
                              onClick={handle2faVerify}
                              disabled={twoFaLoading || twoFaCode.length !== 6}
                              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              <Check size={14} /> {twoFaLoading ? tr("settingsPage.security.verifying") : tr("settingsPage.security.verify")}
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
                          <X size={14} /> {twoFaLoading ? tr("settingsPage.security.disabling") : tr("settingsPage.security.disable2fa")}
                        </button>
                      )}

                      {twoFaError && (
                        <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">{twoFaError}</p>
                      )}
                    </div>
                  </div>
                </div>
                <SettingRow icon={Smartphone} label={tr("settingsPage.security.sessions")} description={tr("settingsPage.security.sessionsDesc")}>
                  <span className="text-sm text-[#717182]">{user?.account_status === "active" ? tr("settingsPage.security.activeSession") : "—"}</span>
                </SettingRow>
                <SettingRow icon={Shield} label={tr("settingsPage.security.passwordPolicy")} description={tr("settingsPage.security.passwordPolicyDesc")}>
                  <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">{tr("settingsPage.active")}</span>
                </SettingRow>
                <SettingRow icon={User} label={tr("settingsPage.security.loginRole")} description={tr("settingsPage.security.loginRoleDesc")}>
                  <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">{user?.role ?? "—"}</span>
                </SettingRow>
                <SettingRow
                  icon={Trash2}
                  label={tr("settingsPage.security.resetWorkspace")}
                  description={tr("settingsPage.security.resetWorkspaceDesc")}
                >
                  <button
                    onClick={handleResetWorkspace}
                    disabled={resetWorkspace.isPending || user?.role !== "admin_entreprise"}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resetWorkspace.isPending ? tr("settingsPage.security.resetting") : tr("settingsPage.security.resetLocal")}
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
                <h2 className="font-bold text-[#17211f] dark:text-white">{tr("settingsPage.notifications.title")}</h2>
                <p className="text-sm text-[#717182]">{tr("settingsPage.notifications.subtitle")}</p>
              </div>
              <div className="px-6 py-2">
                <p className="py-3 text-xs font-bold uppercase tracking-wider text-[#717182]">{tr("settingsPage.notifications.channels")}</p>
                <SettingRow icon={Bell} label={tr("settingsPage.notifications.email")} description={tr("settingsPage.notifications.emailDesc")}>
                  <Toggle on={localPrefs.notify_email} onChange={(v) => setPref("notify_email", v)} label={tr("settingsPage.notifications.email")} />
                </SettingRow>
                <SettingRow icon={Smartphone} label={tr("settingsPage.notifications.chat")} description={tr("settingsPage.notifications.chatDesc")}>
                  <Toggle on={localPrefs.notify_chat} onChange={(v) => setPref("notify_chat", v)} label={tr("settingsPage.notifications.chat")} />
                </SettingRow>
                <p className="py-3 text-xs font-bold uppercase tracking-wider text-[#717182]">{tr("settingsPage.notifications.events")}</p>
                <SettingRow icon={ShieldCheck} label={tr("settingsPage.notifications.terasAlerts")} description={tr("settingsPage.notifications.terasAlertsDesc")}>
                  <Toggle on={localPrefs.notify_teras} onChange={(v) => setPref("notify_teras", v)} label={tr("settingsPage.notifications.terasAlerts")} />
                </SettingRow>
                <SettingRow icon={Bell} label={tr("settingsPage.notifications.payrollReminders")} description={tr("settingsPage.notifications.payrollRemindersDesc")}>
                  <Toggle on={localPrefs.notify_payroll} onChange={(v) => setPref("notify_payroll", v)} label={tr("settingsPage.notifications.payrollReminders")} />
                </SettingRow>
                <SettingRow icon={BrainCircuit} label={tr("settingsPage.notifications.digestFrequency")} description={tr("settingsPage.notifications.digestDesc")}>
                  <select
                    value={localPrefs.digest_frequency}
                    onChange={(e) => setPref("digest_frequency", e.target.value)}
                    aria-label={tr("settingsPage.notifications.digestFrequency")}
                    className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm">
                    <option value="off">{tr("settingsPage.disabled")}</option>
                    <option value="daily">{tr("settingsPage.notifications.daily")}</option>
                    <option value="weekly">{tr("settingsPage.notifications.weekly")}</option>
                  </select>
                </SettingRow>
                {updatePrefs.isPending && <p className="pb-4 text-xs text-[#717182]">{tr("common.saving")}</p>}
                {updatePrefs.isSuccess && <p className="pb-4 text-xs text-emerald-600">{tr("settingsPage.notifications.saved")}</p>}
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
                    <p className="text-sm text-[#717182]">{tr("settingsPage.teras.subtitle")}</p>
                  </div>
                  <span className="ml-auto rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">{tr("settingsPage.teras.connected")}</span>
                </div>
              </div>
              <div className="px-6 py-2">
                <div className="my-4 rounded-xl bg-gradient-to-br from-emerald-600/20 to-emerald-700/10 dark:from-emerald-600/30 dark:to-emerald-700/20 p-5">
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{tr("settingsPage.teras.currentScore")}</p>
                  <p className="text-4xl font-extrabold text-emerald-800 dark:text-emerald-200">{terasScore} <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">/ 100</span></p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/40 dark:bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all" style={{ width: `${terasScore}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400">{tr("settingsPage.teras.lastAnalysis", { date: lastTerasAnalysis })}</p>
                </div>
                <SettingRow icon={Bell} label={tr("settingsPage.teras.receiveAlerts")} description={tr("settingsPage.teras.receiveAlertsDesc")}>
                  <Toggle on={localPrefs.notify_teras} onChange={(v) => setPref("notify_teras", v)} label={tr("settingsPage.teras.receiveAlerts")} />
                </SettingRow>
                <div className="py-4">
                  <button
                    onClick={() => runTerasAnalysis.mutate()}
                    disabled={runTerasAnalysis.isPending}
                    className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50">
                    {runTerasAnalysis.isPending ? tr("settingsPage.teras.analyzing") : tr("settingsPage.teras.runNow")}
                  </button>
                  {runTerasAnalysis.isSuccess && <p className="mt-2 text-xs text-emerald-600">{tr("settingsPage.teras.done")}</p>}
                </div>
              </div>
            </div>
          )}

          {/* ── FACTURATION ── */}
          {tab === "billing" && (
            <div>
              <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-5">
                <h2 className="font-bold text-[#17211f] dark:text-white">{tr("settingsPage.billing.title")}</h2>
                <p className="text-sm text-[#717182]">{tr("settingsPage.billing.subtitle")}</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-emerald-200">{tr("settingsPage.billing.currentPlan")}</p>
                      <p className="text-2xl font-extrabold">KOMPTA Local</p>
                      <p className="text-sm text-emerald-200">{tr("settingsPage.billing.activeEmployees", { count: employeesCount })}</p>
                    </div>
                    <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-bold">{tr("settingsPage.active")}</span>
                  </div>
                </div>
                {[
                  { label: tr("settingsPage.billing.employees"),          used: employeesCount,         max: 100 },
                  { label: tr("settingsPage.billing.issuedInvoices"),   used: myInvoices.data?.length ?? 0, max: 1000 },
                  { label: tr("settingsPage.billing.limuleQueries"),   used: aiQueriesCount,         max: 1000 },
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
                    {tr("settingsPage.billing.downloadCsv")}
                  </button>
                  <a
                    href="mailto:contact@kompta.io?subject=Mise%20%C3%A0%20niveau%20KOMPTA"
                    className="flex-1 min-w-[200px] rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition text-center">
                    {tr("settingsPage.billing.contactUpgrade")}
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* ── AUDIT TRAIL ── */}
          {tab === "audit" && (
            <div>
              <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-5">
                <h2 className="font-bold text-[#17211f] dark:text-white">{tr("settingsPage.audit.title")}</h2>
                <p className="text-sm text-[#717182]">{tr("settingsPage.audit.subtitle")}</p>
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
                    {tr("settingsPage.audit.empty")}
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
                        {log.actor && <span>{tr("settingsPage.audit.by")} <strong>{log.actor}</strong></span>}
                        {log.employee && <span> · {tr("settingsPage.audit.employee", { name: log.employee })}</span>}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs text-[#717182]">
                      {new Date(log.created_at).toLocaleDateString(i18n.language, {
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
