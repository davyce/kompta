import { useQuery } from "@tanstack/react-query";
import { BarChart3, Globe, TrendingUp, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "../../services/api";
import { compactMoney } from "../../utils/format";

const PIE_COLORS = ["#6366f1", "#8b5cf6", "#0891b2", "#059669", "#d97706", "#dc2626", "#4f46e5"];
const CHART_GRID = "rgba(100,116,139,0.18)";
const CHART_TICK = "#64748b";
const TOOLTIP_STYLE = {
  background: "#ffffff",
  border: "1px solid rgba(15,23,42,0.12)",
  borderRadius: 8,
  color: "#0f172a",
  boxShadow: "0 14px 40px rgba(15,23,42,0.12)",
};
const KPI_TONES: Record<string, { card: string; icon: string }> = {
  emerald: {
    card: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    icon: "text-emerald-600 dark:text-emerald-300",
  },
  violet: {
    card: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
    icon: "text-violet-600 dark:text-violet-300",
  },
  sky: {
    card: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
    icon: "text-sky-600 dark:text-sky-300",
  },
  fuchsia: {
    card: "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300",
    icon: "text-indigo-600 dark:text-indigo-300",
  },
};

function KpiCard({ label, value, sub, icon: Icon, color = "violet" }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string;
}) {
  const tone = KPI_TONES[color] ?? KPI_TONES.violet;
  return (
    <div className={`rounded-xl border p-5 ${tone.card}`}>
      <Icon size={20} className={`mb-3 opacity-80 ${tone.icon}`} />
      <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-950 dark:text-white">{value}</p>
      {sub && <p className="mt-1 text-xs opacity-70">{sub}</p>}
    </div>
  );
}

export function AdminAnalyticsPage() {
  const { t: tr } = useTranslation();
  const [year, setYear] = useState(new Date().getFullYear());

  const platform = useQuery({ queryKey: ["adminAnalyticsPlatform"], queryFn: api.adminAnalyticsPlatform });
  const companies = useQuery({ queryKey: ["adminCompanies"], queryFn: api.adminCompanies });
  const trends = useQuery({ queryKey: ["adminAnalyticsTrends"], queryFn: () => api.adminAnalyticsTrends(90) });

  const trendsData = useMemo(() => {
    return (trends.data?.points ?? []).map((p) => ({
      name: new Date(p.date).toLocaleDateString(undefined, { day: "2-digit", month: "short" }),
      companies: p.companies_total,
      active: p.companies_active_30d,
      mrr: p.mrr_cents / 100,
    }));
  }, [trends.data]);

  const planData = useMemo(() => {
    return platform.data?.companies_by_plan ?? [];
  }, [platform.data]);

  const growthData = useMemo(() => {
    const monthly = platform.data?.monthly_growth ?? [];
    return monthly.map((m: { month: string; companies: number; users: number }) => ({
      name: m.month,
      companies: m.companies,
      users: m.users,
    }));
  }, [platform.data]);

  const sectorData = useMemo(() => {
    const sectors = platform.data?.companies_by_industry ?? [];
    return sectors.map((s: { industry: string; count: number }) => ({
      name: s.industry || tr("admin.analytics.other"),
      value: s.count,
    }));
  }, [platform.data, tr]);

  const countryData = useMemo(() => {
    const byCountry: Record<string, number> = {};
    (companies.data ?? []).forEach((c) => {
      const k = c.country || tr("admin.analytics.other");
      byCountry[k] = (byCountry[k] ?? 0) + 1;
    });
    return Object.entries(byCountry)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [companies.data, tr]);

  const terasData = useMemo(() => {
    const list = companies.data ?? [];
    const buckets = { "<50": 0, "50-79": 0, "80-100": 0 };
    list.forEach((c) => {
      if (c.teras_score < 50) buckets["<50"]++;
      else if (c.teras_score < 80) buckets["50-79"]++;
      else buckets["80-100"]++;
    });
    return [
      { name: "< 50", value: buckets["<50"], fill: "#ef4444" },
      { name: "50–79", value: buckets["50-79"], fill: "#f59e0b" },
      { name: "80–100", value: buckets["80-100"], fill: "#10b981" },
    ];
  }, [companies.data]);

  const avgTeras = useMemo(() => {
    const list = companies.data ?? [];
    if (!list.length) return 0;
    return Math.round(list.reduce((s, c) => s + c.teras_score, 0) / list.length);
  }, [companies.data]);

  const onboardingRate = useMemo(() => {
    const list = companies.data ?? [];
    if (!list.length) return 0;
    return Math.round((list.filter((c) => c.completion_score >= 80).length / list.length) * 100);
  }, [companies.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">{tr("admin.analytics.eyebrow")}</p>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">{tr("admin.analytics.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-white/60">{tr("admin.analytics.subtitle")}</p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none dark:border-white/10 dark:bg-white/5 dark:text-white/80"
        >
          {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={TrendingUp} label={tr("admin.analytics.kpiMrr")} value={compactMoney((platform.data?.mrr_cents ?? 0) / 100)} sub={tr("admin.analytics.allCompanies")} color="emerald" />
        <KpiCard icon={BarChart3} label={tr("admin.analytics.kpiAvgTeras")} value={avgTeras} sub={tr("admin.analytics.allCompanies")} color="violet" />
        <KpiCard icon={Users} label={tr("admin.analytics.kpiOnboarding")} value={`${onboardingRate}%`} sub={tr("admin.analytics.completion80")} color="sky" />
        <KpiCard icon={Globe} label={tr("admin.analytics.kpiCountries")} value={countryData.length} sub={tr("admin.analytics.activeOnPlatform")} color="fuchsia" />
      </div>

      {/* Growth chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none">
        <h2 className="mb-4 font-black text-slate-900 dark:text-white">{tr("admin.analytics.monthlyGrowth")}</h2>
        {growthData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={growthData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gU" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0891b2" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0891b2" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="name" tick={{ fill: CHART_TICK, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CHART_TICK, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
              />
              <Area type="monotone" dataKey="companies" name={tr("admin.analytics.companies")} stroke="#6366f1" fill="url(#gE)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="users" name={tr("admin.analytics.users")} stroke="#0891b2" fill="url(#gU)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[260px] items-center justify-center text-slate-400 dark:text-white/30">
            {platform.isLoading ? tr("common.loading") : tr("admin.analytics.noData")}
          </div>
        )}
      </div>

      {/* Tendances réelles (90 derniers jours, snapshots journaliers persistés) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none">
        <h2 className="mb-1 font-black text-slate-900 dark:text-white">{tr("admin.analytics.trendsTitle")}</h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-white/50">{tr("admin.analytics.trendsSubtitle")}</p>
        {trendsData.length > 1 ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trendsData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gMrr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="name" tick={{ fill: CHART_TICK, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CHART_TICK, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="mrr" name={tr("admin.analytics.kpiMrr")} stroke="#059669" fill="url(#gMrr)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="active" name={tr("admin.analytics.activeCompanies")} stroke="#6366f1" fillOpacity={0} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[240px] items-center justify-center text-center text-sm text-slate-400 dark:text-white/30">
            {trends.isLoading ? tr("common.loading") : tr("admin.analytics.trendsAccumulating")}
          </div>
        )}
      </div>

      {/* Répartition par plan d'abonnement */}
      {planData.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none">
          <h2 className="mb-4 font-black text-slate-900 dark:text-white">{tr("admin.analytics.planBreakdown")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {planData.map((p, i) => (
              <div key={p.plan_code} className="rounded-lg border border-slate-100 p-3 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-white/50">{p.plan_code}</span>
                </div>
                <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{p.count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sector + country + teras */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Sector pie */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none">
          <h2 className="mb-4 font-black text-slate-900 dark:text-white">{tr("admin.analytics.sectorBreakdown")}</h2>
          {sectorData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={sectorData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                    {sectorData.map((_: unknown, i: number) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {sectorData.slice(0, 5).map((d: { name: string; value: number }, i: number) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-slate-600 dark:text-white/70 truncate">{d.name}</span>
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-slate-400 dark:text-white/30 text-sm">{tr("admin.analytics.unavailable")}</div>
          )}
        </div>

        {/* Country bar */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none">
          <h2 className="mb-4 font-black text-slate-900 dark:text-white">{tr("admin.analytics.countryDistribution")}</h2>
          {countryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={countryData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
                <XAxis type="number" tick={{ fill: CHART_TICK, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: CHART_TICK, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-400 dark:text-white/30 text-sm">{tr("admin.analytics.unavailable")}</div>
          )}
        </div>

        {/* TERAS distribution */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none">
          <h2 className="mb-4 font-black text-slate-900 dark:text-white">{tr("admin.analytics.terasDistribution")}</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={terasData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="name" tick={{ fill: CHART_TICK, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CHART_TICK, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {terasData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {terasData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: d.fill }} />
                  <span className="text-slate-500 dark:text-white/60">{tr("admin.analytics.scoreRange", { range: d.name })}</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-white">{tr("admin.analytics.companiesCount", { count: d.value })}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
