import { useQuery } from "@tanstack/react-query";
import { BarChart3, Globe, TrendingUp, Users } from "lucide-react";
import { useMemo, useState } from "react";
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

const PIE_COLORS = ["#7c3aed", "#a21caf", "#0891b2", "#059669", "#d97706", "#dc2626", "#6d28d9"];

function KpiCard({ label, value, sub, icon: Icon, color = "violet" }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string;
}) {
  return (
    <div className={`rounded-xl border border-white/10 bg-gradient-to-br from-${color}-500/15 to-${color}-500/5 p-5`}>
      <Icon size={20} className={`mb-3 text-${color}-300 opacity-80`} />
      <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">{label}</p>
      <p className="mt-1 text-3xl font-black text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-white/50">{sub}</p>}
    </div>
  );
}

export function AdminAnalyticsPage() {
  const [year, setYear] = useState(new Date().getFullYear());

  const platform = useQuery({ queryKey: ["adminAnalyticsPlatform"], queryFn: api.adminAnalyticsPlatform });
  const companies = useQuery({ queryKey: ["adminCompanies"], queryFn: api.adminCompanies });
  const overview = useQuery({ queryKey: ["adminOverview"], queryFn: api.adminOverview });

  const growthData = useMemo(() => {
    const monthly = platform.data?.monthly_growth ?? [];
    return monthly.map((m: { month: string; companies: number; users: number }) => ({
      name: m.month,
      Entreprises: m.companies,
      Utilisateurs: m.users,
    }));
  }, [platform.data]);

  const sectorData = useMemo(() => {
    const sectors = platform.data?.companies_by_industry ?? [];
    return sectors.map((s: { industry: string; count: number }) => ({
      name: s.industry || "Autre",
      value: s.count,
    }));
  }, [platform.data]);

  const countryData = useMemo(() => {
    const byCountry: Record<string, number> = {};
    (companies.data ?? []).forEach((c) => {
      const k = c.country || "Autre";
      byCountry[k] = (byCountry[k] ?? 0) + 1;
    });
    return Object.entries(byCountry)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [companies.data]);

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
          <p className="text-xs font-bold uppercase tracking-wider text-violet-400">Insights</p>
          <h1 className="text-3xl font-black">Analytics plateforme</h1>
          <p className="mt-1 text-sm text-white/60">Croissance, répartition sectorielle et métriques clés.</p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 outline-none"
        >
          {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={TrendingUp} label="CA estimé MRR" value={compactMoney(overview.data?.sales_total ?? 0)} sub="toutes entreprises" color="emerald" />
        <KpiCard icon={BarChart3} label="Score TERAS moyen" value={avgTeras} sub="toutes entreprises" color="violet" />
        <KpiCard icon={Users} label="Taux onboarding" value={`${onboardingRate}%`} sub="completion ≥ 80%" color="sky" />
        <KpiCard icon={Globe} label="Pays couverts" value={countryData.length} sub="actifs sur la plateforme" color="fuchsia" />
      </div>

      {/* Growth chart */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-4 font-black">Croissance mensuelle</h2>
        {growthData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={growthData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gU" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0891b2" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0891b2" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "#1e1b4b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }}
              />
              <Area type="monotone" dataKey="Entreprises" stroke="#7c3aed" fill="url(#gE)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="Utilisateurs" stroke="#0891b2" fill="url(#gU)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[260px] items-center justify-center text-white/30">
            {platform.isLoading ? "Chargement…" : "Données non disponibles"}
          </div>
        )}
      </div>

      {/* Sector + country + teras */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Sector pie */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 font-black">Répartition sectorielle</h2>
          {sectorData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={sectorData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                    {sectorData.map((_: unknown, i: number) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1e1b4b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {sectorData.slice(0, 5).map((d: { name: string; value: number }, i: number) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-white/70 truncate">{d.name}</span>
                    </div>
                    <span className="font-bold">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-white/30 text-sm">Non disponible</div>
          )}
        </div>

        {/* Country bar */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 font-black">Distribution par pays</h2>
          {countryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={countryData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
                <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ background: "#1e1b4b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }} />
                <Bar dataKey="value" fill="#7c3aed" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-white/30 text-sm">Non disponible</div>
          )}
        </div>

        {/* TERAS distribution */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 font-black">Distribution TERAS</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={terasData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#1e1b4b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }} />
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
                  <span className="text-white/60">Score {d.name}</span>
                </div>
                <span className="font-bold">{d.value} entreprises</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
