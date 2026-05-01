import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell, BrainCircuit, Building2, Check, CheckCircle2, ChevronRight,
  CreditCard, FileText, Globe, Landmark, Lock, Moon, Palette, Plus, Shield,
  ShieldCheck, Smartphone, Sun, Trash2, User, Wallet, Zap,
} from "lucide-react";

import { api } from "../services/api";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../app/AuthContext";

/* ── Types ────────────────────────────────────────────────────────── */
type Tab = "general" | "modules" | "payments" | "security" | "notifications" | "teras" | "billing" | "audit";

const PROVIDERS = [
  { key: "zola", label: "Zola / QR", icon: Wallet },
  { key: "mobile_money", label: "Mobile money", icon: Smartphone },
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
    <div className="flex items-center justify-between gap-4 py-4 border-b border-black/[0.04] dark:border-white/[0.04] last:border-0">
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
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("general");
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
  const [myPayoutForm, setMyPayoutForm] = useState({
    payout_method: "mobile_money",
    payout_phone: "",
    payout_bank_name: "",
    payout_account_number: "",
    payout_paypal_email: "",
  });

  const toggleModule = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => api.toggleModule(key, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["modules"] }),
  });

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
  const updateMyPayout = useMutation({
    mutationFn: () => api.updateMyEmployeePayout({ ...myPayoutForm, confirm: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myEmployeePayout"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });

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

  const allTabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "general",       label: "Général",       icon: Building2   },
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
  const employeesCount = employees.data?.length ?? 0;
  const aiQueriesCount = aiHistory.data?.length ?? 0;
  const terasScore = overview.data?.kpis.teras_score ?? 0;
  const lastTerasAnalysis = useMemo(() => {
    // Approximation: last AI generation that's TERAS-related, or last alert created_at
    return new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  }, []);

  return (
    <div className="space-y-6">
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
                <div className="py-4 border-b border-black/[0.04] dark:border-white/[0.04]">
                  <p className="mb-3 text-sm font-bold text-[#17211f] dark:text-white">Branding entreprise</p>
                  <div className="flex items-center gap-4">
                    <div className="grid h-16 w-16 place-items-center rounded-xl text-2xl font-black text-white shadow-sm"
                      style={{ background: company.data?.primary_color ?? "#059669" }}>
                      {(company.data?.name ?? "K")[0]}
                    </div>
                    <div>
                      <p className="font-bold text-[#17211f] dark:text-white">{company.data?.name ?? "—"}</p>
                      <p className="text-sm text-[#717182]">{company.data?.industry ?? "—"}</p>
                      <div className="mt-2 flex gap-2">
                        <span className="rounded-full border border-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 dark:border-emerald-500/30 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">{company.data?.primary_color ?? "—"}</span>
                        <span className="rounded-full border border-amber-300 bg-amber-50 dark:bg-amber-500/15 dark:border-amber-500/30 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-300">{company.data?.accent_color ?? "—"}</span>
                      </div>
                    </div>
                  </div>
                </div>
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
                <SettingRow icon={Globe} label="Devise" description="Devise principale CEMACE (XAF par défaut)">
                  <select disabled className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white opacity-70">
                    <option>XAF — Franc CFA BEAC</option>
                  </select>
                </SettingRow>
                <SettingRow icon={User} label="Compte connecté" description={user?.email}>
                  <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">{user?.role}</span>
                </SettingRow>
              </div>
            </div>
          )}

          {/* ── MODULES ── */}
          {tab === "modules" && (
            <div>
              <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-5">
                <h2 className="font-bold text-[#17211f] dark:text-white">Modules actifs</h2>
                <p className="text-sm text-[#717182]">Activez ou désactivez les fonctionnalités de KOMPTA pour votre entreprise</p>
              </div>
              <div className="grid gap-3 p-6 sm:grid-cols-2">
                {modulesData.length === 0 && modulesQ.isLoading && (
                  <p className="col-span-2 text-sm text-[#717182]">Chargement…</p>
                )}
                {modulesData.map((mod) => {
                  const meta = MODULE_LABELS[mod.module_key] ?? { label: mod.module_key, desc: "" };
                  return (
                    <div key={mod.module_key} className={`flex items-center justify-between rounded-xl border p-4 transition ${mod.enabled ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-black/[0.06] bg-white dark:border-white/[0.06] dark:bg-[#252931]"}`}>
                      <div>
                        <p className={`font-semibold ${mod.enabled ? "text-emerald-800 dark:text-emerald-200" : "text-[#17211f] dark:text-white"}`}>{meta.label}</p>
                        <p className="text-xs text-[#717182]">{meta.desc}</p>
                      </div>
                      <Toggle
                        on={mod.enabled}
                        disabled={toggleModule.isPending}
                        onChange={(v) => toggleModule.mutate({ key: mod.module_key, enabled: v })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── PAIEMENTS ── */}
          {tab === "payments" && (
            <div>
              <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-5">
                <h2 className="font-bold text-[#17211f] dark:text-white">Comptes de paiement</h2>
                <p className="text-sm text-[#717182]">Configurez Zola, mobile money, banque et PayPal pour la caisse et la paie.</p>
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
                        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
                    {paymentForm.provider !== "bank" && paymentForm.provider !== "paypal" && (
                      <label className="block text-xs font-bold uppercase text-[#717182]">
                        Téléphone / identifiant
                        <input value={paymentForm.phone_number} onChange={(e) => setPaymentForm({ ...paymentForm, phone_number: e.target.value })} placeholder="+242 06..." className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white" />
                      </label>
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
                    <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-[#17211f] dark:text-white">
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
                <SettingRow icon={Lock} label="Authentification à deux facteurs" description="Bientôt disponible">
                  <Toggle on={false} onChange={() => {}} disabled />
                </SettingRow>
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
                    onClick={() => {
                      if (window.confirm("Confirmer la remise à zéro de cet espace local ?")) {
                        resetWorkspace.mutate();
                      }
                    }}
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
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={exportInvoicesCsv}
                    disabled={(myInvoices.data?.length ?? 0) === 0}
                    className="flex-1 rounded-xl border border-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30 py-3 text-sm font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition disabled:opacity-50">
                    Télécharger factures (CSV)
                  </button>
                  <a
                    href="mailto:contact@kompta.io?subject=Mise%20%C3%A0%20niveau%20KOMPTA"
                    className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition text-center">
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
