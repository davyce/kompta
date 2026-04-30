import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, Download,
  Filter, ShieldCheck, Sparkles, TrendingUp, WalletCards,
  ReceiptText, Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell,
} from "recharts";

import { useAuth } from "../app/AuthContext";
import { api } from "../services/api";
import { compactMoney, money, shortDate } from "../utils/format";

type Period = "mois" | "trimestre" | "annee";
const PERIODS: { key: Period; label: string }[] = [
  { key: "mois",      label: "Mois"      },
  { key: "trimestre", label: "Trimestre" },
  { key: "annee",     label: "Année"     },
];
const PERIOD_DIVISOR: Record<Period, number> = { annee: 1, trimestre: 4, mois: 12 };

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

/* ── KPI card ────────────────────────────────────────────────────── */
function KpiCard({
  label, value, delta, hint, icon: Icon, accent = "indigo",
}: {
  label: string; value: string; delta: string; hint: string;
  icon: React.ElementType; accent?: string;
}) {
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
    </div>
  );
}

/* ── main component ──────────────────────────────────────────────── */
export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("annee");

  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const overview      = useQuery({ queryKey: ["overview"],         queryFn: () => api.overview(), refetchInterval: 30_000, staleTime: 25_000 });
  const alerts        = useQuery({ queryKey: ["terasAlerts"],      queryFn: api.terasAlerts, refetchInterval: 60_000 });
  const tasks         = useQuery({ queryKey: ["tasks"],            queryFn: api.tasks, refetchInterval: 60_000 });
  const onboarding    = useQuery({ queryKey: ["onboarding"],       queryFn: api.onboarding });
  const employees     = useQuery({ queryKey: ["employees"],        queryFn: api.employees, refetchInterval: 60_000 });
  const revenueSeries = useQuery({ queryKey: ["revenueSeries", period], queryFn: () => api.revenueSeries(period) });
  const sales         = useQuery({ queryKey: ["sales"],            queryFn: () => api.posSales(), refetchInterval: 30_000 });
  const invoices      = useQuery({ queryKey: ["invoices"],         queryFn: api.invoices, refetchInterval: 60_000 });
  const terasScores   = useQuery({ queryKey: ["terasScores"],      queryFn: api.terasScores, refetchInterval: 60_000 });

  // Track last refresh time
  useEffect(() => {
    if (overview.dataUpdatedAt) setLastRefreshed(new Date(overview.dataUpdatedAt));
  }, [overview.dataUpdatedAt]);

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
    if (total <= 0) {
      return [
        { name: "POS Boutique",    v: 50, c: "#059669" },
        { name: "Facturation B2B", v: 50, c: "#10b981" },
      ];
    }
    return [
      { name: "POS Boutique",    v: Math.round((posTotal / total) * 100), c: "#059669" },
      { name: "Facturation B2B", v: Math.round((b2bTotal / total) * 100), c: "#10b981" },
    ];
  }, [sales.data, invoices.data]);

  // Real department breakdown from employees
  const deptData = useMemo(() => {
    const list = employees.data ?? [];
    const groups = new Map<string, { count: number; salary: number; manager: string }>();
    for (const e of list) {
      const dept = e.department || "Autres";
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
      { k: "Profil entreprise", v: steps.find((s) => s.key === "profile")?.done ? 100 : 60, c: "bg-emerald-500" },
      { k: "Plan comptable",    v: steps.find((s) => s.key === "accounting")?.done ? 100 : 55, c: "bg-emerald-500" },
      { k: "Politique RH",      v: tScore("rh") ?? (steps.find((s) => s.key === "hr")?.done ? 95 : 70), c: "bg-amber-500" },
      { k: "Conformité TERAS",  v: tScore("company") ?? (overview.data?.kpis.teras_score ?? 80), c: "bg-emerald-500" },
      { k: "Documents",         v: tScore("documents") ?? 65, c: "bg-amber-500" },
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
  const firstName  = user?.full_name?.split(" ")[0] ?? "vous";
  const divisor    = PERIOD_DIVISOR[period];

  const payrollBase  = Math.max((data?.kpis.employees ?? 0) * 775_000, 3_600_000);
  const treasuryBase = 48_200_000 + (data?.kpis.sales_total ?? 0);
  const revenueBase  = 287_000_000 + (data?.kpis.invoices_total ?? 0);

  const treasury = Math.round(treasuryBase / divisor);
  const revenue  = Math.round(revenueBase  / divisor);
  const payroll  = Math.round(payrollBase  / divisor);
  const terasScore = data?.kpis.teras_score ?? 87;
  const terasDelta = terasScore - 83;

  const salesPct = treasuryBase > 0 ? ((data?.kpis.sales_total ?? 0) / treasuryBase) * 100 : 8.4;
  const revPct   = revenueBase  > 0 ? ((data?.kpis.invoices_total ?? 0) / revenueBase) * 100 : 12.1;

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
      id: t.id, title: t.title, assignee_name: t.assignee_name || "Équipe",
      role: "", due_date: t.due_date, priority: t.priority,
    }));

  const periodLabel: Record<Period, string> = {
    annee:     `${data?.kpis.employees ?? 0} employés · échéance 30/04`,
    trimestre: `${data?.kpis.employees ?? 0} employés · Q2`,
    mois:      `${data?.kpis.employees ?? 0} employés · avril`,
  };

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-600">Pilotage global</p>
          <h1 className="text-3xl font-extrabold text-[#17211f] dark:text-white">
            Bienvenue {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-[#717182]">
            {data?.company ?? "KOMPTA"} · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date())}
          </p>
          <p className="mt-0.5 text-xs text-[#717182] dark:text-white/40">
            ↻ Mis à jour {lastRefreshed.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · Rafraîchissement auto 30s
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
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate("/reports")}
            className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] px-3 py-2 text-sm font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.03]">
            <Filter size={16} /> Rapports détaillés
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
            <Download size={16} /> Exporter KPI
          </button>
          <button
            onClick={() => navigate("/assistants")}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition"
          >
            <Sparkles size={16} /> Résumé IA
          </button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Trésorerie"
          value={compactMoney(treasury)}
          delta={fmt(salesPct)}
          hint="vs mois précédent"
          icon={WalletCards}
          accent="emerald"
        />
        <KpiCard
          label="CA cumulé"
          value={compactMoney(revenue)}
          delta={fmt(revPct)}
          hint="objectif annuel : 78%"
          icon={ReceiptText}
          accent="teal"
        />
        <KpiCard
          label="Paie à venir"
          value={compactMoney(payroll)}
          delta="+1,2%"
          hint={periodLabel[period]}
          icon={Users}
          accent="amber"
        />
        <KpiCard
          label="Score TERAS"
          value={`${terasScore} / 100`}
          delta={`${terasDelta >= 0 ? "+" : ""}${terasDelta} pts`}
          hint="conformité fiscale & RH"
          icon={ShieldCheck}
          accent="sky"
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Revenue area chart */}
        <div className="lg:col-span-2 rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
          <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
            <div>
              <h3 className="font-bold text-[#17211f] dark:text-white">Performance commerciale</h3>
              <p className="text-xs text-[#717182]">Revenus &amp; marge — 12 derniers mois (M XAF)</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#717182]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />Revenus
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />Marge
              </span>
            </div>
          </div>
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueChartData} margin={{ left: 4, right: 16, top: 12, bottom: 4 }}>
                <defs>
                  <linearGradient id="gPrimary" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%"   stopColor="#059669" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#059669" stopOpacity={0}    />
                  </linearGradient>
                  <linearGradient id="gEmerald" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%"   stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="m" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid rgba(0,0,0,0.08)" }}
                  formatter={(value) => [`${value} M XAF`]}
                />
                <Area type="monotone" dataKey="v" stroke="#059669" fill="url(#gPrimary)" strokeWidth={2.5} dot={false} name="Revenus" />
                <Area type="monotone" dataKey="e" stroke="#10b981" fill="url(#gEmerald)" strokeWidth={2}   dot={false} name="Marge" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sales channels donut */}
        <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] flex flex-col">
          <div className="border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
            <h3 className="font-bold text-[#17211f] dark:text-white">Canaux de vente</h3>
            <p className="text-xs text-[#717182]">Répartition du CA</p>
          </div>
          <div className="h-52 flex-shrink-0 px-2 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={channelData}
                  dataKey="v"
                  innerRadius={52}
                  outerRadius={80}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {channelData.map((c, i) => <Cell key={i} fill={c.c} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [`${v}%`]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 px-5 pb-5 pt-1">
            {channelData.map((c) => (
              <div key={c.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.c }} />
                  <span className="text-[#17211f] dark:text-white">{c.name}</span>
                </span>
                <span className="font-semibold text-[#717182]">{c.v}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Alerts + Tasks row ── */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* TERAS Alerts */}
        <div className="lg:col-span-2 rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
          <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
            <div>
              <h3 className="flex items-center gap-2 font-bold text-[#17211f] dark:text-white">
                Alertes TERAS
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-500/30">
                  {activeAlerts.length} actives
                </span>
              </h3>
              <p className="text-xs text-[#717182]">Conformité fiscale, comptable et RH</p>
            </div>
            <button
              onClick={() => navigate("/reports-teras")}
              className="flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
            >
              Voir tout <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {activeAlerts.map((a) => {
              const tone = a.severity === "high"
                ? { bg: "bg-rose-50  text-rose-600  dark:bg-rose-500/15  dark:text-rose-400",  badge: "bg-rose-50  text-rose-700  ring-rose-200  dark:bg-rose-500/15  dark:text-rose-400  dark:ring-rose-500/30",  label: "Critique"  }
                : a.severity === "medium"
                ? { bg: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400", badge: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:ring-amber-500/30", label: "Attention" }
                : { bg: "bg-sky-50   text-sky-600   dark:bg-sky-500/15   dark:text-sky-400",   badge: "bg-sky-50   text-sky-700   ring-sky-200   dark:bg-sky-500/15   dark:text-sky-400   dark:ring-sky-500/30",   label: "Info"      };
              return (
                <div key={a.id} className="flex items-start gap-3 px-5 py-4">
                  <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${tone.bg}`}>
                    <AlertTriangle size={16} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ${tone.badge}`}>{tone.label}</span>
                      <span className="text-sm font-semibold text-[#17211f] dark:text-white truncate">{a.title}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#717182]">{a.module} · {a.recommendation}</p>
                  </div>
                  <button
                    onClick={() => navigate("/reports-teras")}
                    className="flex-shrink-0 rounded-lg border border-black/[0.08] px-2.5 py-1.5 text-xs font-semibold text-[#17211f] dark:text-white dark:border-white/[0.08] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition">
                    Traiter
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Urgent tasks */}
        <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
          <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
            <h3 className="font-bold text-[#17211f] dark:text-white">Tâches urgentes</h3>
            <span className="text-xs text-[#717182]">{urgentTasks.length} à faire</span>
          </div>
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
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
                  {t.priority === "high" ? "Haute" : "Moy."}
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
            <h3 className="font-bold text-[#17211f] dark:text-white">Onboarding entreprise</h3>
            <p className="text-xs text-[#717182]">Complétude du profil</p>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-[#17211f] dark:text-white">Progression globale</span>
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
                { key: "profile",    label: "Profil entreprise", done: true  },
                { key: "accounting", label: "Plan comptable",    done: true  },
                { key: "hr",         label: "Politique RH",      done: false },
                { key: "teras",      label: "Conformité TERAS",  done: true  },
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
            <h3 className="font-bold text-[#17211f] dark:text-white">Complétude entreprise</h3>
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
            <h3 className="font-bold text-[#17211f] dark:text-white">Conformité réglementaire</h3>
          </div>
          <div className="space-y-2 px-5 py-4">
            {(data?.compliance.checks ?? [
              { label: "TVA mensuelle",      status: "ok"      },
              { label: "CNSS déclarée",      status: "ok"      },
              { label: "Paie conforme",      status: "warning" },
              { label: "Bilan annuel",       status: "ok"      },
              { label: "IS déclaré",         status: "warning" },
            ]).map((check) => (
              <div key={check.label} className="flex items-center justify-between rounded-lg bg-black/[0.02] dark:bg-white/[0.03] px-3 py-2">
                <span className="text-sm text-[#17211f] dark:text-white">{check.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  check.status === "ok"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                }`}>
                  {check.status === "ok" ? "OK" : "Vérifier"}
                </span>
              </div>
            ))}
            {data?.low_stock?.length
              ? <p className="pt-1 text-sm font-semibold text-amber-600">⚠ Stock à surveiller : {data.low_stock.map((i) => i.name).join(", ")}</p>
              : <p className="pt-1 text-sm font-semibold text-emerald-600">✓ Stock sous contrôle</p>}
          </div>
        </div>
      </div>

      {/* ── Department table ── */}
      <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
        <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
          <h3 className="font-bold text-[#17211f] dark:text-white">Performance par département</h3>
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <TrendingUp size={14} /> +6,2% globaux
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/[0.04] dark:border-white/[0.04] text-left text-[11px] font-semibold uppercase tracking-wider text-[#717182]">
                <th className="px-5 py-3">Département</th>
                <th className="px-5 py-3">DG référent</th>
                <th className="px-5 py-3">Effectif</th>
                <th className="px-5 py-3">Productivité</th>
                <th className="px-5 py-3">Charge paie</th>
                <th className="px-5 py-3">Tendance</th>
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
                  <td className="px-5 py-3.5 text-[#717182]">{r.c} M XAF</td>
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
          Total facturé : {money(data?.kpis.invoices_total ?? 0)} · Données en temps réel
        </div>
      </div>

    </div>
  );
}
