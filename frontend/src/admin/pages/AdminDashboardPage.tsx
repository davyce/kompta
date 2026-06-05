import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BrainCircuit,
  Building2,
  CheckCircle2,
  FileText,
  LifeBuoy,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
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

// ── KPI Card ──────────────────────────────────────────────────────────────────

type Tone = "indigo" | "violet" | "emerald" | "amber" | "rose" | "sky";

const TONE_MAP: Record<Tone, string> = {
  indigo:
    "bg-indigo-50 border-indigo-200 text-indigo-700 " +
    "dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:text-indigo-300",
  violet:
    "bg-violet-50 border-violet-200 text-violet-700 " +
    "dark:bg-violet-500/10 dark:border-violet-500/30 dark:text-violet-300",
  emerald:
    "bg-emerald-50 border-emerald-200 text-emerald-700 " +
    "dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300",
  amber:
    "bg-amber-50 border-indigo-200 text-indigo-700 " +
    "dark:bg-indigo-600/10 dark:border-indigo-600/30 dark:text-indigo-300",
  rose:
    "bg-rose-50 border-rose-200 text-rose-700 " +
    "dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300",
  sky:
    "bg-sky-50 border-sky-200 text-sky-700 " +
    "dark:bg-sky-500/10 dark:border-sky-500/30 dark:text-sky-300",
};

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  tone = "indigo",
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  trend?: string;
  tone?: Tone;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`relative overflow-hidden rounded-xl border p-5 text-left transition ${TONE_MAP[tone]} ${onClick ? "hover:scale-[1.02] hover:shadow-md" : "cursor-default"}`}
    >
      <Icon className="mb-3 opacity-80" size={20} />
      <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="mt-1 text-xs opacity-70">{sub}</p>}
      {trend && (
        <span className="absolute right-4 top-4 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
          {trend}
        </span>
      )}
    </button>
  );
}

// ── Pie chart colors ──────────────────────────────────────────────────────────

const PIE_COLORS = ["#6366f1", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7"];

// ── Relative time ─────────────────────────────────────────────────────────────

function relTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

// ── Activity item type ────────────────────────────────────────────────────────

type ActivityItem = {
  id: number;
  company_name: string;
  action: string;
  action_type: string;
  amount?: number | null;
  created_at: string;
};

const ACTION_BADGE: Record<string, string> = {
  invoice: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  payroll: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  employee: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  sale: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  alert: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  ticket: "bg-indigo-100 text-indigo-700 dark:bg-indigo-600/20 dark:text-indigo-300",
};

// ── Health badge ──────────────────────────────────────────────────────────────

function HealthBadge({ ok, label, latency }: { ok: boolean; label: string; latency?: number | null }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-transparent dark:bg-white/5">
      <div className="flex items-center gap-2">
        {ok ? <CheckCircle2 size={16} className="text-emerald-500 dark:text-emerald-400" /> : <XCircle size={16} className="text-rose-500 dark:text-rose-400" />}
        <span className="text-sm font-semibold text-slate-900 dark:text-white">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {latency != null && (
          <span className="text-xs text-slate-500 dark:text-white/40">{latency}ms</span>
        )}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${ok ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"}`}>
          {ok ? "OK" : "KO"}
        </span>
      </div>
    </div>
  );
}

// ── Card wrapper class shorthand ──────────────────────────────────────────────

const CARD = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none";

// ── Main page ─────────────────────────────────────────────────────────────────

export function AdminDashboardPage() {
  const navigate = useNavigate();

  const overview = useQuery({ queryKey: ["adminOverview"], queryFn: api.adminOverview, refetchInterval: 30_000 });
  const companies = useQuery({ queryKey: ["adminCompanies"], queryFn: api.adminCompanies });
  const tickets = useQuery({ queryKey: ["adminTickets"], queryFn: () => api.adminTickets(), refetchInterval: 30_000 });
  const platform = useQuery({ queryKey: ["adminAnalyticsPlatform"], queryFn: api.adminAnalyticsPlatform });
  const activity = useQuery({ queryKey: ["adminActivityFeed"], queryFn: api.adminActivityFeed, refetchInterval: 30_000 });
  const health = useQuery({ queryKey: ["adminSystemHealth"], queryFn: api.adminSystemHealth, refetchInterval: 30_000 });

  const data = overview.data;
  const recentTickets = tickets.data?.slice(0, 5) ?? [];
  const topCompanies = useMemo(
    () => (companies.data ?? []).slice(0, 5),
    [companies.data]
  );

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

  // Build pie data from platform analytics
  const pieData = useMemo(() => {
    const sectors = platform.data?.companies_by_industry ?? [];
    return sectors.map((s: { industry: string; count: number }) => ({
      name: s.industry || "Autre",
      value: s.count,
    }));
  }, [platform.data]);

  // Build growth chart data
  const growthData = useMemo(() => {
    const monthly = platform.data?.monthly_growth ?? [];
    return monthly.map((m: { month: string; companies: number; users: number }) => ({
      name: m.month,
      Entreprises: m.companies,
      Utilisateurs: m.users,
    }));
  }, [platform.data]);

  const activityFeed: ActivityItem[] = (activity.data ?? []).slice(0, 20);

  // Alertes sécurité : servicesdown ou critiques
  const hasDownService = (health.data?.services ?? []).some(s => s.status === "down");
  const hasDegradedService = (health.data?.services ?? []).some(s => s.status === "degraded");
  const criticalTickets = (data?.tickets_critical ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Bannière sécurité critique */}
      {(hasDownService || criticalTickets) && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/40 dark:bg-rose-500/10">
          <AlertTriangle size={18} className="shrink-0 text-rose-600 mt-0.5 dark:text-rose-400" />
          <div className="min-w-0">
            <p className="font-bold text-rose-700 text-sm dark:text-rose-300">Alertes critiques détectées</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {hasDownService && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                  ⬇ Service hors ligne
                </span>
              )}
              {criticalTickets && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                  🎫 {data?.tickets_critical} ticket(s) critiques
                </span>
              )}
            </div>
          </div>
          <button onClick={() => navigate("/admin/system")} className="ml-auto shrink-0 text-xs font-bold text-rose-700 hover:text-rose-900 transition dark:text-rose-300 dark:hover:text-white">
            Vérifier →
          </button>
        </div>
      )}
      {hasDegradedService && !hasDownService && (
        <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-amber-50 p-3 dark:border-indigo-600/30 dark:bg-indigo-600/10">
          <AlertTriangle size={15} className="shrink-0 text-indigo-600 dark:text-indigo-500" />
          <p className="text-sm text-indigo-700 font-medium dark:text-indigo-300">Un ou plusieurs services sont dégradés.</p>
          <button onClick={() => navigate("/admin/system")} className="ml-auto text-xs font-bold text-indigo-700 hover:text-amber-900 transition dark:text-indigo-300 dark:hover:text-white">
            Détails →
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Super-Admin · Plateforme</p>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">Vue d'ensemble globale</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-white/60">Données temps réel · toutes entreprises · {health.data?.version ?? "v1.x"}</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/50">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse dark:bg-emerald-400" />
          Uptime {health.data?.uptime_seconds != null ? `${Math.floor((health.data.uptime_seconds) / 3600)}h${Math.floor(((health.data.uptime_seconds) % 3600) / 60)}m` : "—"}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          icon={Building2}
          label="Entreprises actives"
          value={data?.companies ?? "…"}
          sub="Tenants actifs"
          tone="indigo"
          onClick={() => navigate("/admin/companies")}
        />
        <KpiCard
          icon={Users}
          label="Utilisateurs total"
          value={data?.users ?? "…"}
          sub={`${data?.employees ?? 0} employés`}
          tone="violet"
          onClick={() => navigate("/admin/users")}
        />
        <KpiCard
          icon={Wallet}
          label="CA plateforme"
          value={compactMoney(data?.sales_total ?? 0)}
          sub="POS · toutes entreprises"
          tone="emerald"
        />
        <KpiCard
          icon={LifeBuoy}
          label="Tickets ouverts"
          value={data?.tickets_open ?? "…"}
          sub={`${data?.tickets_critical ?? 0} critiques`}
          tone={(data?.tickets_critical ?? 0) > 0 ? "rose" : "emerald"}
          onClick={() => navigate("/admin/tickets")}
        />
        <KpiCard
          icon={TrendingUp}
          label="Score TERAS moyen"
          value={avgTeras || "—"}
          sub="moyenne pondérée"
          tone="sky"
        />
        <KpiCard
          icon={FileText}
          label="Taux onboarding"
          value={`${onboardingRate}%`}
          sub="completion ≥ 80%"
          tone="indigo"
          onClick={() => navigate("/admin/onboarding")}
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Growth AreaChart */}
        <div className={CARD}>
          <h2 className="mb-4 font-black text-slate-900 dark:text-white">Croissance plateforme (12 mois)</h2>
          {growthData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={growthData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gEntreprises" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.15)" />
                <XAxis dataKey="name" tick={{ fill: "rgba(100,116,139,0.7)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "rgba(100,116,139,0.7)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#ffffff", border: "1px solid rgba(100,116,139,0.2)", borderRadius: 8, color: "#0f172a" }}
                  labelStyle={{ color: "rgba(15,23,42,0.7)" }}
                />
                <Area type="monotone" dataKey="Entreprises" stroke="#6366f1" fill="url(#gEntreprises)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="Utilisateurs" stroke="#8b5cf6" fill="url(#gUsers)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[220px] items-center justify-center text-slate-400 text-sm dark:text-white/30">
              {platform.isLoading ? "Chargement…" : "Données de croissance non disponibles"}
            </div>
          )}
        </div>

        {/* PieChart by sector */}
        <div className={CARD}>
          <h2 className="mb-4 font-black text-slate-900 dark:text-white">Répartition par secteur</h2>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3}>
                    {pieData.map((_: unknown, index: number) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#ffffff", border: "1px solid rgba(100,116,139,0.2)", borderRadius: 8, color: "#0f172a" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1">
                {pieData.slice(0, 5).map((d: { name: string; value: number }, i: number) => (
                  <div key={`${d.name}-${i}`} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-slate-700 dark:text-white/70">{d.name}</span>
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-[220px] items-center justify-center text-slate-400 text-sm dark:text-white/30">
              {platform.isLoading ? "Chargement…" : "Données sectorielles non disponibles"}
            </div>
          )}
        </div>
      </div>

      {/* Activity feed + top companies */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Activity feed */}
        <div className={CARD}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-black text-slate-900 dark:text-white">Activité temps réel</h2>
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-white/40">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse dark:bg-emerald-400" />
              Live · 30s
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {activityFeed.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-400 dark:text-white/30">
                {activity.isLoading ? "Chargement…" : "Aucune activité récente"}
              </p>
            )}
            {activityFeed.map((item, index) => (
              <div
                key={`${item.action_type}-${item.id}-${item.created_at}-${index}`}
                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5"
              >
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 text-xs font-black text-white">
                  {(item.company_name || "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-800 dark:text-white/80">{item.company_name}</p>
                  <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${ACTION_BADGE[item.action_type] ?? "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-white/60"}`}>
                      {item.action_type}
                    </span>
                    <span className="truncate text-[10px] text-slate-500 dark:text-white/50">{item.action}</span>
                  </div>
                  {item.amount != null && (
                    <p className="mt-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-300">{compactMoney(item.amount)}</p>
                  )}
                </div>
                <span className="shrink-0 text-[10px] text-slate-400 dark:text-white/30">{relTime(item.created_at)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 companies table */}
        <div className={CARD}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-black text-slate-900 dark:text-white">Top 5 entreprises</h2>
            <button onClick={() => navigate("/admin/companies")} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition dark:text-indigo-400 dark:hover:text-white">
              Voir tout →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 dark:border-white/10 dark:text-white/30">
                <tr>
                  <th className="pb-2">Entreprise</th>
                  <th className="pb-2">Users</th>
                  <th className="pb-2 w-24">TERAS</th>
                  <th className="pb-2">Secteur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {topCompanies.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400 dark:text-white/30">Aucune entreprise.</td>
                  </tr>
                )}
                {topCompanies.map((c) => {
                  const terasColor = c.teras_score >= 80 ? "bg-emerald-500" : c.teras_score >= 50 ? "bg-indigo-600" : "bg-rose-500";
                  return (
                    <tr
                      key={c.id}
                      className="cursor-pointer hover:bg-slate-50 transition dark:hover:bg-white/5"
                      onClick={() => navigate(`/admin/companies/${c.id}`)}
                    >
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-2">
                          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-indigo-700 text-[10px] font-black text-white">
                            {c.name[0]}
                          </div>
                          <span className="font-bold text-slate-900 dark:text-white/90 truncate max-w-[100px]">{c.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-slate-600 dark:text-white/60">{c.users_count}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden dark:bg-white/10">
                            <div
                              className={`h-full rounded-full ${terasColor}`}
                              style={{ width: `${Math.min(c.teras_score, 100)}%` }}
                            />
                          </div>
                          <span className="font-black text-slate-900 dark:text-white">{c.teras_score}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-slate-500 dark:text-white/50 truncate max-w-[80px]">{c.industry || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* System health */}
      <div className={CARD}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-black text-slate-900 dark:text-white">Santé du système</h2>
          <button onClick={() => navigate("/admin/system")} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition dark:text-indigo-400 dark:hover:text-white">
            Détails →
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <HealthBadge
            ok={(health.data?.services ?? []).find(s => s.name === "database")?.status === "healthy"}
            label="Base de données"
            latency={(health.data?.services ?? []).find(s => s.name === "database")?.latency_ms ?? undefined}
          />
          <HealthBadge
            ok={(health.data?.services ?? []).find(s => s.name === "limule")?.status === "healthy"}
            label="Limule AI"
            latency={(health.data?.services ?? []).find(s => s.name === "limule")?.latency_ms ?? undefined}
          />
          <HealthBadge
            ok={(health.data?.services ?? []).find(s => s.name === "storage")?.status === "healthy"}
            label="Stockage fichiers"
          />
        </div>
      </div>

      {/* Limule CTA */}
      <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-5 dark:border-indigo-500/30 dark:from-indigo-600/15 dark:to-violet-600/10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/25 dark:text-indigo-200">
              <BrainCircuit size={22} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Grand Sage Limule</p>
              <h2 className="font-black text-slate-900 dark:text-white">Cockpit IA pour diagnostiquer la plateforme</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-white/55">Analyse les entreprises, alertes TERAS, tickets et données en temps réel.</p>
            </div>
          </div>
          <button
            onClick={() => navigate("/admin/limule")}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white hover:bg-indigo-700 transition dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            Ouvrir Grand Sage →
          </button>
        </div>
      </div>

      {/* Critical alert banner */}
      {(data?.tickets_critical ?? 0) > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          <AlertTriangle size={20} />
          <div className="flex-1">
            <p className="font-bold">{data?.tickets_critical} ticket(s) critique(s) en attente</p>
            <p className="text-xs opacity-80">Réponse recommandée sous 4h</p>
          </div>
          <button
            onClick={() => navigate("/admin/tickets?priority=critical")}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 transition dark:bg-rose-500 dark:hover:bg-rose-400"
          >
            Traiter →
          </button>
        </div>
      )}

      {/* Recent tickets */}
      <div className={CARD}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-black text-slate-900 dark:text-white">Tickets récents</h2>
          <button onClick={() => navigate("/admin/tickets")} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition dark:text-indigo-400 dark:hover:text-white">
            Voir tout →
          </button>
        </div>
        <div className="space-y-2">
          {recentTickets.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400 dark:text-white/40">
              {tickets.isLoading ? "Chargement…" : "Aucun ticket pour le moment."}
            </p>
          )}
          {recentTickets.map((t) => {
            const priorityTone =
              t.priority === "critical"
                ? "bg-rose-100 text-rose-700 dark:bg-rose-500/30 dark:text-rose-200"
                : t.priority === "high"
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-600/30 dark:text-indigo-200"
                  : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/70";
            return (
              <button
                key={t.id}
                onClick={() => navigate(`/admin/tickets/${t.id}`)}
                className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left hover:bg-slate-100 transition dark:border-white/5 dark:bg-white/5 dark:hover:bg-white/10"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{t.subject}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-white/50">{t.company_name} · {t.requester_name}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${priorityTone}`}>
                    {t.priority}
                  </span>
                  <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-white/40">{t.status}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
