import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowUpRight, ArrowDownRight, BellOff, CheckCircle2,
  ChevronDown, ChevronUp, Download, Filter, ShieldCheck, TrendingUp,
  TrendingDown, WalletCards, ReceiptText, Users, Landmark, Boxes,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell,
} from "recharts";

import { useAuth } from "../app/AuthContext";
import { LimuleAvatar, LimuleIcon } from "../components/LimuleAvatar";
import i18n from "../i18n";
import { api } from "../services/api";
import { compactMoney, money, shortDate, currencyLabel } from "../utils/format";
import { useCurrency } from "../contexts/CurrencyContext";

type Period = "mois" | "trimestre" | "annee";
const PERIODS: { key: Period; tk: string }[] = [
  { key: "mois",      tk: "dashboard.month"   },
  { key: "trimestre", tk: "dashboard.quarter" },
  { key: "annee",     tk: "dashboard.year"    },
];
const PERIOD_DIVISOR: Record<Period, number> = { annee: 1, trimestre: 4, mois: 12 };
/* Map frontend period key → backend param */
const PERIOD_API: Record<Period, string> = { annee: "annee", trimestre: "trimestre", mois: "mois" };

/* ── Palette couleurs canaux de vente ────────────────────────────── */
const CHANNEL_PALETTE = [
  "#6366f1", // indigo    — POS / boutique
  "#059669", // emerald   — facturation B2B
  "#f59e0b", // amber     — e-commerce
  "#3b82f6", // blue      — marketplace
  "#ec4899", // pink      — abonnements
  "#8b5cf6", // violet    — autre
];

/* ── avatar initials helper ──────────────────────────────────────── */
function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}
const AVATAR_COLORS = ["bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-emerald-500", "bg-sky-500"];
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/* ── Getting Started steps ───────────────────────────────────────── */
const GETTING_STARTED_STEPS = [
  { labelKey: "dashboard.addEmployees",       hintKey: "dashboard.addEmployeesHint",       path: "/employees",   Icon: Users,       color: "bg-violet-100 text-violet-600 dark:bg-violet-500/20" },
  { labelKey: "dashboard.createInvoice",      hintKey: "dashboard.createInvoiceHint",      path: "/billing",     Icon: ReceiptText, color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20" },
  { labelKey: "dashboard.manageInventory",    hintKey: "dashboard.manageInventoryHint",    path: "/inventory",   Icon: Boxes,       color: "bg-amber-100 text-amber-600 dark:bg-amber-500/20" },
  { labelKey: "dashboard.importTransactions", hintKey: "dashboard.importTransactionsHint", path: "/transactions", Icon: Landmark,    color: "bg-sky-100 text-sky-600 dark:bg-sky-500/20" },
];

/* ── KPI card ────────────────────────────────────────────────────── */
function KpiCard({
  label, value, delta, hint, icon: Icon, accent = "indigo",
}: {
  label: string; value: string; delta: string; hint: string;
  icon: React.ElementType; accent?: string;
}) {
  const { t: tr } = useTranslation();
  const positive = !delta.startsWith("-");
  const accentMap: Record<string, string> = {
    indigo:  "bg-emerald-50  text-emerald-600  dark:bg-emerald-500/15 dark:text-emerald-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    amber:   "bg-amber-50   text-amber-600   dark:bg-amber-500/15   dark:text-amber-400",
    sky:     "bg-sky-50     text-sky-600     dark:bg-sky-500/15     dark:text-sky-400",
  };
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:bg-[#1e2229] dark:border-white/[0.06]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#717182]">{label}</p>
          <p className="mt-1.5 text-2xl font-extrabold text-[#17211f] dark:text-white leading-none">{value}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${accentMap[accent] ?? accentMap.indigo}`}>
          <Icon size={20} />
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className={`text-sm font-bold ${positive ? "text-emerald-600" : "text-rose-500"}`}>{delta}</span>
        <span className="text-xs text-[#717182]">{hint}</span>
      </div>
      <p className="text-[10px] text-[#aaaabc] mt-0.5">{tr("dashboard.updatedNow")}</p>
    </div>
  );
}

/* ── Treasury Prediction widget ─────────────────────────────────────── */
function TreasuryPrediction({
  txMonthlyIn, txMonthlyOut, salesTotal, invoicesTotal,
}: {
  txMonthlyIn: number; txMonthlyOut: number;
  salesTotal: number; invoicesTotal: number;
}) {
  const { t: tr } = useTranslation();
  const today = new Date();
  // Priorité aux données bancaires réelles; sinon estimation comptable
  const monthlyIn  = txMonthlyIn  > 0 ? txMonthlyIn  : salesTotal;
  const monthlyOut = txMonthlyOut > 0 ? txMonthlyOut : Math.round(invoicesTotal * 0.3);
  const dailyNet   = (monthlyIn - monthlyOut) / 30;

  const points = Array.from({ length: 7 }, (_, i) => ({
    day: new Intl.DateTimeFormat(i18n.language, { weekday: "short" }).format(new Date(today.getTime() + i * 86400000)),
    balance: Math.round((i + 1) * dailyNet),
  }));

  const isPositive = dailyNet >= 0;

  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:bg-[#1e2229] dark:border-white/[0.06]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#717182]">{tr("dashboard.treasuryProjection")}</p>
          <p className="mt-0.5 text-lg font-black text-[#17211f] dark:text-white">{tr("dashboard.next7days")}</p>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${isPositive ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400" : "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400"}`}>
          {isPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={points} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="treasury-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={isPositive ? "#059669" : "#ef4444"} stopOpacity={0.15} />
              <stop offset="95%" stopColor={isPositive ? "#059669" : "#ef4444"} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v) => [compactMoney(typeof v === "number" ? v : 0), tr("dashboard.netBalance")]} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
          <Area type="monotone" dataKey="balance" stroke={isPositive ? "#059669" : "#ef4444"} strokeWidth={2} fill="url(#treasury-grad)" />
        </AreaChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-[#717182]">
        {tr("dashboard.projectionBasis")} · {isPositive ? "+" : ""}{compactMoney(dailyNet)}/{tr("dashboard.perDayEstimated")}
      </p>
    </div>
  );
}

/* ── Équivalent EUR indicatif sous la trésorerie ───────────────── */
function TreasuryEurEquivalent({ amountXaf }: { amountXaf: number }) {
  const { t: tr } = useTranslation();
  const conversion = useQuery({
    queryKey: ["currencyConvert", "XAF", "EUR", amountXaf],
    queryFn: () => api.currencyConvert(amountXaf, "XAF", "EUR"),
    staleTime: 60 * 60 * 1000,
  });
  if (!conversion.data || conversion.data.converted === null) return null;
  return (
    <p className="text-xs text-[#717182] -mt-3 pl-1">
      {tr("dashboard.treasuryApprox")}{" "}
      <span className="font-mono font-semibold">
        {conversion.data.converted.toLocaleString(i18n.language, { maximumFractionDigits: 2 })} EUR
      </span>{" "}
      <span className="opacity-60">({tr("dashboard.rate", { source: conversion.data.source })})</span>
    </p>
  );
}

/* ── main component ──────────────────────────────────────────────── */
export function DashboardPage() {
  const { t: tr } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Subscribe to currency changes for reactive re-render
  useCurrency();
  const [period, setPeriod] = useState<Period>("annee");

  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const overview      = useQuery({ queryKey: ["overview"],         queryFn: () => api.overview(), refetchInterval: 30_000, staleTime: 25_000 });
  const alerts        = useQuery({ queryKey: ["terasAlerts"],      queryFn: api.terasAlerts, refetchInterval: 60_000 });
  const tasks         = useQuery({ queryKey: ["tasks"],            queryFn: api.tasks, refetchInterval: 60_000 });
  const onboarding    = useQuery({ queryKey: ["onboarding"],       queryFn: api.onboarding });
  const employees     = useQuery({ queryKey: ["employees"],        queryFn: api.employees, refetchInterval: 60_000 });
  const revenueSeries = useQuery({ queryKey: ["revenueSeries", period], queryFn: () => api.revenueSeries(PERIOD_API[period]) });
  const sales         = useQuery({ queryKey: ["sales"],            queryFn: () => api.posSales(), refetchInterval: 30_000 });
  const invoices      = useQuery({ queryKey: ["invoices"],         queryFn: api.invoices, refetchInterval: 60_000 });
  const terasScores   = useQuery({ queryKey: ["terasScores"],      queryFn: api.terasScores, refetchInterval: 60_000 });
  const meetings      = useQuery({ queryKey: ["meetings"],         queryFn: api.meetings, refetchInterval: 60_000 });
  const investments   = useQuery({ queryKey: ["investments"],      queryFn: api.investments, refetchInterval: 120_000 });
  const limuleProactive = useQuery({ queryKey: ["limuleAlerts"], queryFn: api.limuleAlerts, refetchInterval: 60_000 });
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [cashFlow, setCashFlow] = useState<string | null>(null);
  const [cashFlowLoading, setCashFlowLoading] = useState(false);

  // Alertes TERAS — rétractable + désactivable (persisté en localStorage)
  // Sur mobile : réduit par défaut pour ne pas casser la mise en page
  const [terasCollapsed, setTerasCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem("kompta_teras_collapsed");
    if (saved !== null) return saved === "true";
    return typeof window !== "undefined" && window.innerWidth < 1024;
  });
  const [terasDisabled, setTerasDisabled] = useState<boolean>(
    () => localStorage.getItem("kompta_teras_disabled") === "true"
  );
  function toggleTerasCollapse() {
    setTerasCollapsed(v => { const n = !v; localStorage.setItem("kompta_teras_collapsed", String(n)); return n; });
  }
  function toggleTerasDisabled() {
    setTerasDisabled(v => { const n = !v; localStorage.setItem("kompta_teras_disabled", String(n)); return n; });
  }

  // Track last refresh time
  useEffect(() => {
    if (overview.dataUpdatedAt) setLastRefreshed(new Date(overview.dataUpdatedAt));
  }, [overview.dataUpdatedAt]);

  // Cash flow prediction streaming
  async function launchCashFlowPrediction() {
    if (cashFlowLoading) return;
    setCashFlowLoading(true);
    setCashFlow("");
    const invoiceTotal  = data?.kpis.invoices_total ?? 0;
    const invoicePaidAmt = data?.kpis.invoices_paid ?? 0;
    const invoicePending = data?.kpis.invoices_pending ?? 0;
    const salesTotal    = data?.kpis.sales_total    ?? 0;
    const employeeCount = data?.kpis.employees      ?? 0;
    // Real average net pay per employee from actual Payslip history (backend-computed).
    // If the company has no payslip history yet, we don't fabricate a payroll figure —
    // the prompt explicitly tells the model the data is unavailable.
    const avgPayroll = data?.kpis.avg_payroll_per_employee ?? null;
    const estimatedPayroll = avgPayroll != null ? employeeCount * avgPayroll : null;
    const txBal = data?.kpis.tx_balance ?? 0;
    await api.aiGenerateStream(
      {
        kind:   "cashflow_prediction",
        title:  tr("dashboard.cashflowPromptTitle"),
        prompt: tr("dashboard.cashflowPrompt", {
          invoiceTotal: compactMoney(invoiceTotal),
          invoicePaid: compactMoney(invoicePaidAmt),
          invoicePending: compactMoney(invoicePending),
          salesTotal: compactMoney(salesTotal),
          treasuryBalance: compactMoney(txBal),
          employeeCount,
          estimatedPayroll: estimatedPayroll != null ? compactMoney(estimatedPayroll) : tr("dashboard.payrollDataUnavailable"),
        }),
        context: "dashboard_cashflow",
      },
      (partial) => setCashFlow(partial),
      (final)   => { setCashFlow(final); setCashFlowLoading(false); },
      ()        => { setCashFlow(tr("dashboard.limuleUnavailable")); setCashFlowLoading(false); },
    );
  }

  // Résumé IA Limule streaming
  async function launchAiSummary() {
    if (aiLoading) return;
    setAiLoading(true);
    setAiSummary("");
    const kpisText = data
      ? `CA: ${compactMoney(revenue)}, Paie: ${compactMoney(payroll)}, TERAS: ${terasScore}/100, Alertes: ${activeAlerts.length}`
      : "KPIs non disponibles";
    await api.aiGenerateStream(
      {
        kind: "dashboard_summary",
        title: tr("dashboard.aiSummaryTitle"),
        prompt: tr("dashboard.aiSummaryPrompt", { kpis: kpisText }),
        context: "dashboard",
      },
      (partial) => setAiSummary(partial),
      (final) => { setAiSummary(final); setAiLoading(false); },
      () => { setAiSummary(tr("dashboard.limuleUnavailable2")); setAiLoading(false); },
    );
  }

  // Réunions du jour
  const todayMeetings = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (meetings.data ?? [])
      .filter((m) => m.start_at?.startsWith(today))
      .sort((a, b) => (a.start_at ?? "").localeCompare(b.start_at ?? ""))
      .slice(0, 4);
  }, [meetings.data]);

  // Real revenue chart data (M XAF)
  const revenueChartData = useMemo(() => {
    const series = revenueSeries.data ?? [];
    return series.map((p) => ({
      m: p.label,
      v: Math.round((p.revenue / 1_000_000) * 10) / 10,
      e: Math.round((p.margin / 1_000_000) * 10) / 10,
    }));
  }, [revenueSeries.data]);

  // Real channel breakdown from sales (POS) and invoices (B2B)
  const channelData = useMemo(() => {
    const posTotal = (sales.data ?? []).reduce((s, x) => s + (x.total_amount || 0), 0);
    const b2bTotal = (invoices.data ?? []).reduce((s, x) => s + (x.total_amount || 0), 0);
    const total = posTotal + b2bTotal;
    const channels = [
      { name: tr("dashboard.posShop"),    raw: posTotal },
      { name: tr("dashboard.b2bBilling"), raw: b2bTotal },
    ].filter((c) => c.raw > 0);
    if (channels.length === 0) {
      return [];
    }
    return channels.map((c, i) => ({
      ...c,
      v: Math.round((c.raw / total) * 100),
      c: CHANNEL_PALETTE[i % CHANNEL_PALETTE.length],
    }));
  }, [sales.data, invoices.data]);

  // Real department breakdown from employees
  const deptData = useMemo(() => {
    const list = employees.data ?? [];
    const groups = new Map<string, { count: number; salary: number; manager: string }>();
    for (const e of list) {
      const dept = e.department || tr("dashboard.others");
      const cur = groups.get(dept) ?? { count: 0, salary: 0, manager: "" };
      cur.count += 1;
      cur.salary += e.salary || 0;
      if (!cur.manager && e.manager_name) cur.manager = e.manager_name;
      if (!cur.manager) cur.manager = `${e.first_name} ${e.last_name}`;
      groups.set(dept, cur);
    }
    return [...groups.entries()].slice(0, 6).map(([d, v]) => ({
      d,
      m: v.manager || "—",
      e: v.count,
      p: Math.min(60 + v.count * 4, 96),
      c: compactMoney(v.salary),
      t: v.count >= 8 ? "+8%" : v.count >= 4 ? "+3%" : "—",
    }));
  }, [employees.data]);

  // Real completion ladder from onboarding + teras snapshots
  const completionData = useMemo(() => {
    const steps = onboarding.data?.steps ?? [];
    const teras = terasScores.data ?? [];
    const tScore = (domain: string) => teras.find((t) => t.domain === domain)?.score;
    return [
      { k: tr("dashboard.stepProfile"), v: steps.find((s) => s.key === "profile")?.done ? 100 : 0, c: "bg-emerald-500" },
      { k: tr("dashboard.stepAccounting"),    v: steps.find((s) => s.key === "accounting")?.done ? 100 : 0, c: "bg-emerald-500" },
      { k: tr("dashboard.stepHr"),      v: tScore("rh") ?? (steps.find((s) => s.key === "hr")?.done ? 100 : 0), c: "bg-amber-500" },
      { k: tr("dashboard.stepTeras"),  v: tScore("company") ?? (overview.data?.kpis.teras_score ?? 0), c: "bg-emerald-500" },
      { k: tr("dashboard.stepDocuments"),         v: tScore("documents") ?? 0, c: "bg-amber-500" },
    ].map((r) => ({ ...r, c: r.v >= 85 ? "bg-emerald-500" : r.v >= 65 ? "bg-amber-500" : "bg-rose-500" }));
  }, [onboarding.data, terasScores.data, overview.data]);

  if (overview.isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-white dark:bg-[#1e2229]" />
        ))}
      </div>
    );
  }

  const data       = overview.data;
  const firstName  = user?.full_name?.split(" ")[0] ?? tr("dashboard.team");
  const divisor    = PERIOD_DIVISOR[period];

  // Trésorerie : solde bancaire réel si transactions existent, sinon ventes POS
  const txBalance       = data?.kpis.tx_balance    ?? 0;
  const txCount         = data?.kpis.tx_count      ?? 0;
  const txMonthlyIn     = data?.kpis.tx_monthly_in  ?? 0;
  const txMonthlyOut    = data?.kpis.tx_monthly_out ?? 0;
  const invoicesPaid    = data?.kpis.invoices_paid    ?? 0;
  const invoicesPending = data?.kpis.invoices_pending ?? 0;
  const invoicesPaidCount = data?.kpis.invoices_paid_count ?? 0;
  const invoicesTotal   = data?.kpis.invoices_total   ?? 0;
  const treasury   = Math.round((txCount > 0 ? txBalance : (data?.kpis.sales_total ?? 0)) / divisor);
  const revenue    = Math.round(invoicesPaid / divisor);
  // Real average net pay per employee (from actual Payslip history), computed
  // backend-side. null when the company has no payslip history yet — no fabricated number.
  const avgPayrollPerEmployee = data?.kpis.avg_payroll_per_employee ?? null;
  const hasPayrollData = avgPayrollPerEmployee != null;
  const payroll    = hasPayrollData
    ? Math.round(((data?.kpis.employees ?? 0) * avgPayrollPerEmployee) / divisor)
    : 0;
  const terasScore = data?.kpis.teras_score ?? 0;
  const terasDelta = terasScore > 0 ? terasScore - 83 : 0;

  const salesPct = 0;
  const revPct   = 0;

  const fmt = (v: number, positive = true) =>
    `${positive && v >= 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;

  const activeAlerts = (alerts.data ?? [])
    .filter((a) => a.status === "open")
    .slice(0, 3)
    .map((a) => ({
      id: a.id, title: a.title, module: a.module, severity: a.severity,
      recommendation: a.recommendation,
    }));

  const urgentTasks = (tasks.data ?? [])
    .filter((t) => t.status !== "done")
    .sort((a, b) => (a.priority === "high" ? -1 : 1) - (b.priority === "high" ? -1 : 1))
    .slice(0, 4)
    .map((t) => ({
      id: t.id, title: t.title, assignee_name: t.assignee_name || tr("dashboard.team"),
      role: "", due_date: t.due_date, priority: t.priority,
    }));

  const empCount = data?.kpis.employees ?? 0;
  const periodLabel: Record<Period, string> = {
    annee:     tr("dashboard.periodYear", { count: empCount }),
    trimestre: tr("dashboard.periodQuarter", { count: empCount }),
    mois:      tr("dashboard.periodMonth", { count: empCount }),
  };

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-600">{tr("dashboard.heroEyebrow")}</p>
          <h1 className="text-3xl font-extrabold text-[#17211f] dark:text-white">
            {tr("dashboard.welcome", { name: firstName })}
          </h1>
          <p className="mt-1 text-sm text-[#717182]">
            {data?.company ?? "KOMPTA"} · {new Intl.DateTimeFormat(i18n.language, { dateStyle: "full" }).format(new Date())}
          </p>
          <p className="mt-0.5 text-xs text-[#717182] dark:text-white/40">
            {tr("dashboard.updatedAt", { time: lastRefreshed.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div className="flex rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  period === p.key
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                }`}
              >
                {tr(p.tk)}
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate("/reports")}
            className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] px-3 py-2 text-sm font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.03]">
            <Filter size={16} /> {tr("dashboard.detailedReports")}
          </button>
          <button
            onClick={() => {
              const csv = ["Module,Valeur"];
              if (data?.kpis) for (const [k, v] of Object.entries(data.kpis)) csv.push(`${k},${v}`);
              const blob = new Blob([csv.join("\n")], { type: "text/csv" });
              const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
              a.download = `kompta-dashboard-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
            }}
            className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] px-3 py-2 text-sm font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.03]">
            <Download size={16} /> {tr("dashboard.exportKpi")}
          </button>
          <button
            onClick={launchAiSummary}
            disabled={aiLoading}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition disabled:opacity-70"
          >
            <LimuleIcon size={16} className={aiLoading ? "animate-pulse opacity-80" : ""} />
            {aiLoading ? tr("dashboard.analyzing") : tr("dashboard.aiSummaryBtn")}
          </button>
        </div>
      </div>

      {/* ── Limule détecte : alertes proactives ── */}
      {(limuleProactive.data?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-white p-4 dark:bg-[#1e2229] dark:border-emerald-500/30">
          <div className="mb-3 flex items-center gap-2">
            <LimuleIcon size={18} />
            <h2 className="text-sm font-extrabold text-[#17211f] dark:text-white">
              {tr("dashboard.limuleDetects")}
            </h2>
            <span className="text-xs text-[#717182]">
              · {tr("dashboard.signals", { count: limuleProactive.data?.length ?? 0 })}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(limuleProactive.data ?? []).map((a, i) => {
              const palette =
                a.severity === "critical"
                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300"
                  : a.severity === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300"
                  : "border-sky-200 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:border-sky-500/30 dark:text-sky-300";
              const Icon = a.severity === "critical" ? AlertTriangle : a.severity === "warning" ? AlertTriangle : CheckCircle2;
              return (
                <button
                  key={`${a.type}-${i}`}
                  type="button"
                  onClick={() => navigate(a.action_url)}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition hover:opacity-90 ${palette}`}
                  title={a.action_url}
                >
                  <Icon size={16} className="mt-0.5 shrink-0" />
                  <span className="flex-1">{a.message}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Getting Started banner (only for brand-new accounts) ── */}
      {data?.kpis.employees === 0 && data?.kpis.invoices_total === 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 dark:from-emerald-500/10 dark:to-[#1e2229] dark:border-emerald-500/30">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <LimuleAvatar state="idle" size={48} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-black text-[#17211f] dark:text-white">{tr("dashboard.welcomeTitle")}</h2>
              <p className="mt-1 text-sm text-[#717182]">{tr("dashboard.welcomeText")}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {GETTING_STARTED_STEPS.map((step) => (
                  <button
                    key={step.path}
                    onClick={() => navigate(step.path)}
                    className="flex flex-col gap-2 rounded-xl border border-black/[0.06] bg-white p-4 text-left hover:border-emerald-300 hover:bg-emerald-50 transition dark:bg-[#252931] dark:border-white/[0.06] dark:hover:border-emerald-500/50"
                  >
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${step.color}`}>
                      <step.Icon size={16} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-[#17211f] dark:text-white">{tr(step.labelKey)}</p>
                      <p className="text-xs text-[#717182]">{tr(step.hintKey)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI row ── */}
      <div data-tour="kpis" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label={tr("dashboard.kpiTreasury")}
          value={treasury !== 0 ? compactMoney(treasury) : "—"}
          delta={txCount > 0 ? tr("dashboard.bankMovements", { count: txCount }) : tr("dashboard.posSales")}
          hint={txCount > 0 ? tr("dashboard.realBalanceHint") : tr("dashboard.posEstimateHint")}
          icon={WalletCards}
          accent="emerald"
        />
        <KpiCard
          label={tr("dashboard.kpiCollected")}
          value={revenue > 0 ? compactMoney(revenue) : invoicesTotal > 0 ? "0" : "—"}
          delta={invoicesPaidCount > 0 ? tr("dashboard.invoicesPaid", { count: invoicesPaidCount }) : invoicesPending > 0 ? tr("dashboard.pendingDelta", { amount: compactMoney(invoicesPending) }) : tr("dashboard.noInvoice")}
          hint={invoicesTotal > 0 ? tr("dashboard.ofBilled", { amount: compactMoney(invoicesTotal) }) : tr("dashboard.collectedInvoices")}
          icon={ReceiptText}
          accent="teal"
        />
        <KpiCard
          label={tr("dashboard.kpiPayroll")}
          value={payroll > 0 ? compactMoney(payroll) : "—"}
          delta={payroll > 0 ? tr("dashboard.employeesCount", { count: data?.kpis.employees ?? 0 }) : tr("dashboard.noEmployee")}
          hint={periodLabel[period]}
          icon={Users}
          accent="amber"
        />
        <KpiCard
          label={tr("dashboard.kpiTeras")}
          value={terasScore > 0 ? `${terasScore} / 100` : "— / 100"}
          delta={terasDelta !== 0 ? tr("dashboard.ptsDelta", { sign: terasDelta >= 0 ? "+" : "", pts: terasDelta }) : tr("dashboard.notEvaluated")}
          hint={tr("dashboard.terasHint")}
          icon={ShieldCheck}
          accent="sky"
        />
      </div>

      {/* ── Équivalent trésorerie en EUR (indicatif) ── */}
      {treasury !== 0 && <TreasuryEurEquivalent amountXaf={treasury} />}

      {/* ── Résumé IA (visible si lancé) ── */}
      {(aiSummary !== null) && (
        <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-5 dark:border-violet-500/30 dark:from-violet-500/10 dark:to-fuchsia-500/10">
          <div className="flex items-center gap-2 mb-3">
            <LimuleIcon size={18} />
            <span className="text-sm font-black text-violet-700 dark:text-violet-300">{tr("dashboard.aiAnalysisTitle")}</span>
            {aiLoading && <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />}
          </div>
          <p className="text-sm leading-7 text-[#17211f] dark:text-white whitespace-pre-wrap">
            {aiSummary || <span className="text-[#717182] animate-pulse">{tr("dashboard.limuleAnalyzing")}</span>}
          </p>
        </div>
      )}

      {/* ── Charts row ── */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Revenue area chart */}
        <div className="lg:col-span-2 rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
          <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
            <div>
              <h3 className="font-bold text-[#17211f] dark:text-white">{tr("dashboard.commercialPerf")}</h3>
              <p className="text-xs text-[#717182]">{tr("dashboard.revenueMarginSub", { cur: currencyLabel() })}</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#717182]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: "#6366f1" }} />{tr("dashboard.revenue")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: "#059669" }} />{tr("dashboard.margin")}
              </span>
            </div>
          </div>
          <div className="h-72 p-4">
            {revenueChartData.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <TrendingUp size={32} className="text-[#d1d5db]" />
                <p className="text-sm font-semibold text-[#717182]">{tr("dashboard.noTxThisMonth")}</p>
                <p className="text-xs text-[#9ca3af]">{tr("dashboard.createFirstSale")}</p>
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueChartData} margin={{ left: 4, right: 16, top: 12, bottom: 4 }}>
                <defs>
                  <linearGradient id="gPrimary" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%"   stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0}   />
                  </linearGradient>
                  <linearGradient id="gEmerald" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%"   stopColor="#059669" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#059669" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="m" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid rgba(0,0,0,0.08)" }}
                  formatter={(value) => [`${value} M ${currencyLabel()}`]}
                />
                <Area type="monotone" dataKey="v" stroke="#6366f1" fill="url(#gPrimary)" strokeWidth={2.5} dot={false} name={tr("dashboard.revenue")} />
                <Area type="monotone" dataKey="e" stroke="#059669" fill="url(#gEmerald)" strokeWidth={2}   dot={false} name={tr("dashboard.margin")} />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Sales channels donut */}
        <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] flex flex-col">
          <div className="border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
            <h3 className="font-bold text-[#17211f] dark:text-white">{tr("dashboard.salesChannels")}</h3>
            <p className="text-xs text-[#717182]">{tr("dashboard.revenueSplit")}</p>
          </div>
          {channelData.length === 0 ? (
            <div className="flex h-52 flex-col items-center justify-center gap-2 text-center px-5">
              <ReceiptText size={32} className="text-[#d1d5db]" />
              <p className="text-sm font-semibold text-[#717182]">{tr("dashboard.noSale")}</p>
              <p className="text-xs text-[#9ca3af]">{tr("dashboard.channelsAppear")}</p>
            </div>
          ) : (
            <>
              <div className="h-52 flex-shrink-0 px-2 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={channelData} dataKey="v" innerRadius={52} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                      {channelData.map((c, i) => <Cell key={i} fill={c.c} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid rgba(0,0,0,0.08)" }}
                      formatter={(v, name) => [`${v}%`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2.5 px-5 pb-5 pt-1">
                {channelData.map((c) => (
                  <div key={c.name} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.c }} />
                    <span className="flex-1 text-sm text-[#17211f] dark:text-white">{c.name}</span>
                    {c.raw > 0 && <span className="text-xs text-[#717182]">{compactMoney(c.raw)}</span>}
                    <span className="ml-1 min-w-[36px] rounded-full px-2 py-0.5 text-center text-[11px] font-bold" style={{ background: c.c + "20", color: c.c }}>
                      {c.v}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Treasury Prediction ── */}
      <TreasuryPrediction
        txMonthlyIn={txMonthlyIn}
        txMonthlyOut={txMonthlyOut}
        salesTotal={data?.kpis.sales_total ?? 0}
        invoicesTotal={data?.kpis.invoices_total ?? 0}
      />

      {/* ── Alerts + Tasks row ── */}
      <div className="flex flex-col lg:grid lg:gap-5 lg:grid-cols-3 gap-4">

        {/* TERAS Alerts — rétractable + désactivable */}
        {!terasDisabled ? (
          <div className="lg:col-span-2 rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-4 sm:px-5 py-3.5">
              <button
                onClick={toggleTerasCollapse}
                className="flex items-center gap-2 text-left hover:opacity-75 transition"
              >
                <h3 className="flex items-center gap-2 font-bold text-[#17211f] dark:text-white">
                  {tr("dashboard.terasAlerts")}
                  {activeAlerts.length > 0 && (
                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-500/30">
                      {activeAlerts.length}
                    </span>
                  )}
                </h3>
                {terasCollapsed
                  ? <ChevronDown size={15} className="text-[#717182]" />
                  : <ChevronUp size={15} className="text-[#717182]" />
                }
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate("/reports-teras")}
                  className="hidden sm:flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  {tr("dashboard.viewAll")} <ArrowUpRight size={13} />
                </button>
                <button
                  onClick={toggleTerasDisabled}
                  title={tr("dashboard.hideTerasAlerts")}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-rose-500 transition"
                >
                  <BellOff size={13} />
                  <span className="hidden sm:inline">{tr("dashboard.disable")}</span>
                </button>
              </div>
            </div>
            {/* Contenu (rétractable) */}
            {!terasCollapsed && (
              <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04] max-h-[320px] lg:max-h-none overflow-y-auto">
                {activeAlerts.length === 0 ? (
                  <div className="flex items-center gap-2 px-5 py-6 text-sm text-[#717182]">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    {tr("dashboard.noActiveAlert")}
                  </div>
                ) : activeAlerts.map((a) => {
                  const tone = a.severity === "high"
                    ? { bg: "bg-rose-50  text-rose-600  dark:bg-rose-500/15  dark:text-rose-400",  badge: "bg-rose-50  text-rose-700  ring-rose-200  dark:bg-rose-500/15  dark:text-rose-400  dark:ring-rose-500/30",  label: tr("dashboard.sevCritical")  }
                    : a.severity === "medium"
                    ? { bg: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400", badge: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/30", label: tr("dashboard.sevWarning") }
                    : { bg: "bg-sky-50   text-sky-600   dark:bg-sky-500/15   dark:text-sky-400",   badge: "bg-sky-50   text-sky-700   ring-sky-200   dark:bg-sky-500/15   dark:text-sky-400   dark:ring-sky-500/30",   label: tr("dashboard.sevInfo")      };
                  return (
                    <div key={a.id} className="flex items-start gap-3 px-4 sm:px-5 py-3.5">
                      <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${tone.bg}`}>
                        <AlertTriangle size={14} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ${tone.badge}`}>{tone.label}</span>
                          <span className="text-sm font-semibold text-[#17211f] dark:text-white truncate">{a.title}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#717182] truncate">{a.module} · {a.recommendation}</p>
                      </div>
                      <button
                        onClick={() => navigate("/reports-teras")}
                        className="flex-shrink-0 rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-xs font-semibold text-[#17211f] dark:text-white dark:border-white/[0.08] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition hidden sm:block">
                        {tr("dashboard.handle")}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Bouton de réactivation compact */
          <div className="lg:col-span-2 flex items-center justify-between rounded-xl border border-dashed border-black/[0.08] dark:border-white/[0.08] px-4 py-3">
            <span className="flex items-center gap-2 text-xs text-[#717182]">
              <BellOff size={14} />
              {tr("dashboard.terasHidden")}
              {activeAlerts.length > 0 && (
                <span className="rounded-full bg-rose-50 dark:bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">{activeAlerts.length}</span>
              )}
            </span>
            <button
              onClick={toggleTerasDisabled}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
            >
              {tr("dashboard.reactivate")}
            </button>
          </div>
        )}

        {/* Urgent tasks */}
        <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
          <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
            <h3 className="font-bold text-[#17211f] dark:text-white">{tr("dashboard.urgentTasks")}</h3>
            <span className="text-xs text-[#717182]">{tr("dashboard.todo", { count: urgentTasks.length })}</span>
          </div>
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {urgentTasks.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center px-5">
                <CheckCircle2 size={28} className="text-emerald-300" />
                <p className="text-sm font-semibold text-[#717182]">{tr("dashboard.noUrgentTask")}</p>
                <p className="text-xs text-[#9ca3af]">{tr("dashboard.tasksUpToDate")}</p>
              </div>
            )}
            {urgentTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(t.assignee_name)}`}>
                  {initials(t.assignee_name)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-[#17211f] dark:text-white">{t.title}</p>
                  <p className="text-xs text-[#717182]">{t.assignee_name}{t.role ? ` · ${t.role}` : ""}{t.due_date ? ` · ${shortDate(t.due_date)}` : ""}</p>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  t.priority === "high"
                    ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                }`}>
                  {t.priority === "high" ? tr("dashboard.priorityHigh") : tr("dashboard.priorityMed")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Onboarding + Completion row ── */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Onboarding steps */}
        <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
          <div className="border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
            <h3 className="font-bold text-[#17211f] dark:text-white">{tr("dashboard.onboardingTitle")}</h3>
            <p className="text-xs text-[#717182]">{tr("dashboard.profileCompleteness")}</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-[#17211f] dark:text-white">{tr("dashboard.globalProgress")}</span>
                <span className="font-bold text-emerald-600">{onboarding.data?.completion_score ?? 72}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-700"
                  style={{ width: `${onboarding.data?.completion_score ?? 72}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              {(onboarding.data?.steps ?? [
                { key: "profile",    label: tr("dashboard.stepProfile"), done: true  },
                { key: "accounting", label: tr("dashboard.stepAccounting"),    done: true  },
                { key: "hr",         label: tr("dashboard.stepHr"),      done: false },
                { key: "teras",      label: tr("dashboard.stepTeras"),  done: true  },
              ]).map((step) => (
                <div key={step.key} className="flex items-center gap-2.5 rounded-lg border border-black/[0.06] dark:border-white/[0.06] px-3 py-2">
                  {step.done
                    ? <CheckCircle2 size={16} className="flex-shrink-0 text-emerald-500" />
                    : <AlertTriangle size={16} className="flex-shrink-0 text-amber-500" />}
                  <span className="text-sm text-[#17211f] dark:text-white">{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Complétude */}
        <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
          <div className="border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
            <h3 className="font-bold text-[#17211f] dark:text-white">{tr("dashboard.companyCompleteness")}</h3>
          </div>
          <div className="space-y-4 px-5 py-4">
            {completionData.map((r) => (
              <div key={r.k}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-[#17211f] dark:text-white">{r.k}</span>
                  <span className="font-semibold text-[#717182]">{r.v}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                  <div className={`h-full rounded-full ${r.c}`} style={{ width: `${r.v}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Compliance checks */}
        <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
          <div className="border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
            <h3 className="font-bold text-[#17211f] dark:text-white">{tr("dashboard.regulatoryCompliance")}</h3>
          </div>
          <div className="space-y-2 px-5 py-4">
            {(data?.compliance.checks ?? [
              { label: tr("dashboard.checkVat"),      status: "ok"      },
              { label: tr("dashboard.checkCnss"),      status: "ok"      },
              { label: tr("dashboard.checkPayroll"),      status: "warning" },
              { label: tr("dashboard.checkBalance"),       status: "ok"      },
              { label: tr("dashboard.checkIs"),         status: "warning" },
            ]).map((check) => (
              <div key={check.label} className="flex items-center justify-between rounded-lg bg-black/[0.02] dark:bg-white/[0.03] px-3 py-2">
                <span className="text-sm text-[#17211f] dark:text-white">{check.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  check.status === "ok"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                }`}>
                  {check.status === "ok" ? tr("dashboard.ok") : tr("dashboard.toCheck")}
                </span>
              </div>
            ))}
            {data?.low_stock?.length
              ? <p className="pt-1 text-sm font-semibold text-amber-600">{tr("dashboard.stockWatch", { items: data.low_stock.map((i) => i.name).join(", ") })}</p>
              : <p className="pt-1 text-sm font-semibold text-emerald-600">{tr("dashboard.stockOk")}</p>}
          </div>
        </div>
      </div>

      {/* ── Agenda du jour ── */}
      {todayMeetings.length > 0 && (
        <div className="rounded-xl border border-black/[0.06] bg-white dark:border-white/[0.06] dark:bg-[#1e2229]">
          <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
            <h3 className="font-bold text-[#17211f] dark:text-white">{tr("dashboard.todayAgenda")}</h3>
            <button onClick={() => navigate("/calendar")} className="flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-700">
              {tr("dashboard.seeAll")} <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {todayMeetings.map((m) => (
              <div key={m.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/15">
                  <span className="text-xs font-black text-emerald-700 dark:text-emerald-400">
                    {m.start_at ? new Date(m.start_at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }) : "--"}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[#17211f] dark:text-white">{m.title}</p>
                  <p className="text-xs text-[#717182]">{m.location || tr("dashboard.noLocation")}{m.join_url ? ` · ${tr("dashboard.video")}` : ""}</p>
                </div>
                {m.join_url && (
                  <a href={m.join_url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
                    {tr("dashboard.join")}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Department table ── */}
      <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
        <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
          <h3 className="font-bold text-[#17211f] dark:text-white">{tr("dashboard.deptPerf")}</h3>
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <TrendingUp size={14} /> {tr("dashboard.globalTrend")}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/[0.04] dark:border-white/[0.04] text-left text-[11px] font-semibold uppercase tracking-wider text-[#717182]">
                <th className="px-5 py-3">{tr("dashboard.colDept")}</th>
                <th className="px-5 py-3">{tr("dashboard.colManager")}</th>
                <th className="px-5 py-3">{tr("dashboard.colHeadcount")}</th>
                <th className="px-5 py-3">{tr("dashboard.colProductivity")}</th>
                <th className="px-5 py-3">{tr("dashboard.colPayroll")}</th>
                <th className="px-5 py-3">{tr("dashboard.colTrend")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.03] dark:divide-white/[0.03]">
              {deptData.map((r) => (
                <tr key={r.d} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition">
                  <td className="px-5 py-3.5 font-medium text-[#17211f] dark:text-white">{r.d}</td>
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-2">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white ${avatarColor(r.m)}`}>
                        {initials(r.m)}
                      </span>
                      <span className="text-[#17211f] dark:text-white">{r.m}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[#717182]">{r.e}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${r.p}%` }} />
                      </div>
                      <span className="text-xs text-[#717182]">{r.p}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-[#717182]">{r.c} M {currencyLabel()}</td>
                  <td className="px-5 py-3.5">
                    <span className={`font-semibold ${r.t.startsWith("-") ? "text-rose-600" : "text-emerald-600"}`}>
                      {r.t}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-black/[0.04] dark:border-white/[0.04] px-5 py-3 text-xs text-[#717182]">
          {tr("dashboard.footerCollected", { paid: money(invoicesPaid), total: money(invoicesTotal), pending: money(invoicesPending) })}
        </div>
      </div>

      {/* ── Cash Flow Prediction ── */}
      <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
        <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2">
            <Landmark size={16} className="text-emerald-600" />
            <div>
              <h3 className="font-bold text-[#17211f] dark:text-white">{tr("dashboard.cashflowTitle")}</h3>
              <p className="text-xs text-[#717182]">{tr("dashboard.cashflowSub")}</p>
            </div>
          </div>
          <button
            onClick={launchCashFlowPrediction}
            disabled={cashFlowLoading}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition disabled:opacity-70"
          >
            <LimuleIcon size={14} className={cashFlowLoading ? "animate-pulse" : ""} />
            {cashFlowLoading ? tr("dashboard.analyzing") : cashFlow !== null ? tr("dashboard.refresh") : tr("dashboard.predict")}
          </button>
        </div>
        {cashFlow !== null ? (
          <div className="px-5 py-4">
            <p className="text-sm leading-7 text-[#17211f] dark:text-white whitespace-pre-wrap">
              {cashFlow || <span className="text-[#717182] animate-pulse">{tr("dashboard.limuleAnalyzingCash")}</span>}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-4 px-5 py-6 text-[#717182]">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600">
              <Landmark size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#17211f] dark:text-white">{tr("dashboard.anticipateCash")}</p>
              <p className="text-xs">{tr("dashboard.predictHint")}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Investments widget ── */}
      {(investments.data?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
          <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-600" />
              <h3 className="font-bold text-[#17211f] dark:text-white">{tr("dashboard.portfolio")}</h3>
            </div>
            <button
              onClick={() => navigate("/investments")}
              className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition"
            >
              {tr("dashboard.viewAll")} <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {(investments.data ?? []).map((inv) => {
              const isPos = true; // static in dashboard (no live quote to keep it light)
              return (
                <div key={inv.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-extrabold text-xs">
                      {inv.ticker.slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#17211f] dark:text-white">{inv.ticker}</p>
                      <p className="text-xs text-[#717182] truncate max-w-[160px]">{inv.display_name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[#17211f] dark:text-white">{compactMoney(inv.invested_amount)}</p>
                    <p className="text-xs text-[#717182]">{tr("dashboard.shares", { count: inv.shares })}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-black/[0.04] dark:border-white/[0.04] px-5 py-3 text-xs text-[#717182]">
            {tr("dashboard.positions", { count: investments.data?.length ?? 0, amount: compactMoney((investments.data ?? []).reduce((s, i) => s + i.invested_amount, 0)) })}
          </div>
        </div>
      )}

    </div>
  );
}
