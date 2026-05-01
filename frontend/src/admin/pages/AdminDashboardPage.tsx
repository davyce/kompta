import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BrainCircuit, Building2, FileText, LifeBuoy, ShieldAlert, TrendingUp, Users, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { api } from "../../services/api";
import { compactMoney } from "../../utils/format";

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "violet",
  onClick,
}: {
  icon: typeof Building2;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "violet" | "fuchsia" | "emerald" | "amber" | "rose";
  onClick?: () => void;
}) {
  const toneMap = {
    violet: "from-violet-500/20 to-violet-500/5 text-violet-200 border-violet-500/30",
    fuchsia: "from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-200 border-fuchsia-500/30",
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-200 border-emerald-500/30",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-200 border-amber-500/30",
    rose: "from-rose-500/20 to-rose-500/5 text-rose-200 border-rose-500/30",
  };
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`relative overflow-hidden rounded-xl border bg-gradient-to-br p-5 text-left transition ${toneMap[tone]} ${onClick ? "hover:scale-[1.02]" : ""}`}
    >
      <Icon className="mb-3 opacity-80" size={22} />
      <p className="text-xs font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-black text-white">{value}</p>
      {hint && <p className="mt-1 text-xs opacity-70">{hint}</p>}
    </button>
  );
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const overview = useQuery({ queryKey: ["adminOverview"], queryFn: api.adminOverview });
  const tickets = useQuery({ queryKey: ["adminTickets"], queryFn: () => api.adminTickets() });
  const companies = useQuery({ queryKey: ["adminCompanies"], queryFn: api.adminCompanies });

  const data = overview.data;
  const recentTickets = tickets.data?.slice(0, 5) ?? [];
  const topCompanies = companies.data?.slice(0, 5) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-violet-400">Plateforme</p>
        <h1 className="text-3xl font-black">Vue d'ensemble globale</h1>
        <p className="mt-1 text-sm text-white/60">État temps réel de toutes les entreprises sur KOMPTA</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Building2} label="Entreprises" value={data?.companies ?? "…"} hint="Tenants actifs" tone="violet" onClick={() => navigate("/admin/companies")} />
        <StatCard icon={Users} label="Utilisateurs" value={data?.users ?? "…"} hint={`${data?.employees ?? 0} employés`} tone="fuchsia" onClick={() => navigate("/admin/users")} />
        <StatCard icon={LifeBuoy} label="Tickets ouverts" value={data?.tickets_open ?? "…"} hint={`${data?.tickets_critical ?? 0} critiques`} tone={data?.tickets_critical ? "rose" : "emerald"} onClick={() => navigate("/admin/tickets")} />
        <StatCard icon={ShieldAlert} label="Alertes TERAS" value={data?.alerts_open ?? "…"} hint="Toutes entreprises" tone="amber" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Wallet} label="CA cumulé plateforme" value={compactMoney(data?.sales_total ?? 0)} hint="POS · toutes entreprises" tone="emerald" />
        <StatCard icon={FileText} label="Factures émises" value={data?.invoices ?? "…"} tone="violet" />
        <StatCard icon={TrendingUp} label="Score moyen TERAS" value={
          companies.data?.length
            ? Math.round(companies.data.reduce((s, c) => s + c.teras_score, 0) / companies.data.length)
            : "—"
        } hint="moyenne pondérée" tone="fuchsia" />
      </div>

      <div className="rounded-xl border border-violet-400/30 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-violet-500/25 text-violet-100">
              <BrainCircuit size={22} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-violet-300">Grand Sage Limule</p>
              <h2 className="font-black">Cockpit IA pour diagnostiquer la plateforme et les tickets</h2>
              <p className="mt-1 text-sm text-white/55">Analyse les entreprises, alertes TERAS, tickets et données Limule en temps réel.</p>
            </div>
          </div>
          <button onClick={() => navigate("/admin/limule")} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-black text-white hover:bg-violet-500">
            Ouvrir Grand Sage →
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-black">Tickets récents</h2>
            <button onClick={() => navigate("/admin/tickets")} className="text-xs font-bold text-violet-300 hover:text-white">
              Voir tout →
            </button>
          </div>
          <div className="space-y-2">
            {recentTickets.length === 0 && (
              <p className="py-6 text-center text-sm text-white/40">Aucun ticket pour le moment.</p>
            )}
            {recentTickets.map((t) => {
              const priorityTone = t.priority === "critical" ? "bg-rose-500/30 text-rose-200" : t.priority === "high" ? "bg-amber-500/30 text-amber-200" : "bg-violet-500/30 text-violet-200";
              return (
                <button
                  key={t.id}
                  onClick={() => navigate(`/admin/tickets/${t.id}`)}
                  className="flex w-full items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/5 p-3 text-left hover:bg-white/10"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{t.subject}</p>
                    <p className="mt-0.5 text-xs text-white/50">
                      {t.company_name} · {t.requester_name}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${priorityTone}`}>
                      {t.priority}
                    </span>
                    <span className="text-[10px] font-bold uppercase text-white/40">{t.status}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-black">Top entreprises</h2>
            <button onClick={() => navigate("/admin/companies")} className="text-xs font-bold text-violet-300 hover:text-white">
              Voir tout →
            </button>
          </div>
          <div className="space-y-2">
            {topCompanies.length === 0 && <p className="py-6 text-center text-sm text-white/40">Aucune entreprise.</p>}
            {topCompanies.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/admin/companies/${c.id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 p-3 text-left hover:bg-white/10"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 font-black">
                    {c.name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{c.name}</p>
                    <p className="text-xs text-white/50">{c.users_count} users · {c.employees_count} employés</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-emerald-300">{c.teras_score}</p>
                  <p className="text-[10px] uppercase text-white/40">TERAS</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {(data?.tickets_critical ?? 0) > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200">
          <AlertTriangle size={20} />
          <div className="flex-1">
            <p className="font-bold">{data?.tickets_critical} ticket(s) critique(s) en attente</p>
            <p className="text-xs opacity-80">Réponse recommandée sous 4h</p>
          </div>
          <button onClick={() => navigate("/admin/tickets?priority=critical")} className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-400">
            Traiter →
          </button>
        </div>
      )}
    </div>
  );
}
