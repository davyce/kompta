import { useQuery } from "@tanstack/react-query";
import { Building2, CheckCircle2, FileText, MessageSquare, ShoppingCart, Users, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { api } from "../../services/api";
import { shortDate } from "../../utils/format";

type OnboardingCompany = {
  id: number;
  name: string;
  has_employees: boolean;
  has_invoices: boolean;
  has_pos: boolean;
  has_documents: boolean;
  score: number;
  last_activity: string | null;
};

type OnboardingStats = {
  companies: OnboardingCompany[];
  total: number;
  advanced: number;  // >80
  medium: number;    // 50-80
  low: number;       // <50
};

type LevelFilter = "all" | "low" | "medium" | "advanced";

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-300";
  if (score >= 50) return "text-indigo-300";
  return "text-rose-300";
}

function scoreBarColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-indigo-500";
  return "bg-rose-500";
}

function BoolBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 size={16} className="text-emerald-400" />
  ) : (
    <XCircle size={16} className="text-white/25" />
  );
}

// ── Donut chart
function ScoreDonut({ advanced, medium, low }: { advanced: number; medium: number; low: number }) {
  const total = advanced + medium + low;
  const data = [
    { name: "Avancé (>80%)", value: advanced, color: "#10b981" },
    { name: "Moyen (50-80%)", value: medium, color: "#f59e0b" },
    { name: "Faible (<50%)", value: low, color: "#f43f5e" },
  ];
  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={95}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [`${value} entreprise(s)`, String(name)]}
            contentStyle={{ background: "#1e1b4b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs font-bold text-white/60">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
            {d.name}
            {total > 0 && (
              <span className="text-white/40">({Math.round((d.value / total) * 100)}%)</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Broadcast modal trigger (opens broadcast page with pre-filled company)
function RappelButton({ company }: { company: OnboardingCompany }) {
  // Navigate to broadcast page with pre-filled company
  const handleClick = () => {
    // Store in sessionStorage so broadcast page can pick it up
    sessionStorage.setItem("broadcast_prefill", JSON.stringify({ companyId: company.id, companyName: company.name }));
    window.location.href = "/admin/broadcast";
  };
  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-600/10 px-2.5 py-1 text-xs font-bold text-indigo-200 hover:bg-indigo-600/20"
    >
      <MessageSquare size={11} /> Rappel
    </button>
  );
}

export function AdminOnboardingPage() {
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [search, setSearch] = useState("");

  const stats = useQuery<OnboardingStats>({
    queryKey: ["adminOnboarding"],
    queryFn: api.adminOnboardingStats,
  });

  const companies = stats.data?.companies ?? [];

  const advanced = stats.data?.advanced ?? companies.filter((c) => c.score >= 80).length;
  const medium = stats.data?.medium ?? companies.filter((c) => c.score >= 50 && c.score < 80).length;
  const low = stats.data?.low ?? companies.filter((c) => c.score < 50).length;
  const total = stats.data?.total ?? companies.length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (levelFilter === "advanced" && c.score < 80) return false;
      if (levelFilter === "medium" && (c.score < 50 || c.score >= 80)) return false;
      if (levelFilter === "low" && c.score >= 50) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [companies, levelFilter, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">Activation</p>
        <h1 className="text-3xl font-black">Onboarding entreprises</h1>
        <p className="mt-1 text-sm text-white/60">Suivi du taux d'adoption et des modules activés par entreprise.</p>
      </div>

      {/* KPIs + donut */}
      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        {/* KPI cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 col-span-2">
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-white/40">Total entreprises</p>
            <p className="text-4xl font-black">{total}</p>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="text-3xl font-black text-emerald-300">{advanced}</p>
            <p className="mt-1 text-xs font-bold uppercase text-emerald-200/70">Avancé &gt;80%</p>
            {total > 0 && (
              <p className="mt-1 text-xs text-emerald-300/50">{Math.round((advanced / total) * 100)}% du total</p>
            )}
          </div>
          <div className="rounded-xl border border-indigo-600/30 bg-indigo-600/10 p-4">
            <p className="text-3xl font-black text-indigo-300">{medium}</p>
            <p className="mt-1 text-xs font-bold uppercase text-indigo-200/70">Moyen 50-80%</p>
            {total > 0 && (
              <p className="mt-1 text-xs text-indigo-300/50">{Math.round((medium / total) * 100)}% du total</p>
            )}
          </div>
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-black text-rose-300">{low}</p>
                <p className="mt-1 text-xs font-bold uppercase text-rose-200/70">Faible &lt;50%</p>
              </div>
              {total > 0 && (
                <p className="text-2xl font-black text-rose-400/60">{Math.round((low / total) * 100)}%</p>
              )}
            </div>
          </div>
        </div>

        {/* Donut */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h3 className="mb-2 font-black">Répartition par niveau</h3>
          {stats.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            </div>
          ) : (
            <ScoreDonut advanced={advanced} medium={medium} low={low} />
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 flex-1 min-w-48">
          <Building2 size={15} className="text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une entreprise..."
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />
        </div>
        {(["all", "advanced", "medium", "low"] as LevelFilter[]).map((l) => (
          <button
            key={l}
            onClick={() => setLevelFilter(l)}
            className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${
              levelFilter === l
                ? "border-indigo-500 bg-indigo-600/20 text-white"
                : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {l === "all" ? "Tous" : l === "advanced" ? "Avancé" : l === "medium" ? "Moyen" : "Faible"}
          </button>
        ))}
      </div>

      {/* Table */}
      {stats.isLoading && (
        <div className="flex h-32 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>
      )}

      {!stats.isLoading && (
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-white/10 text-xs font-bold uppercase text-white/40">
                <th className="px-4 py-3 text-left">Entreprise</th>
                <th className="px-4 py-3 text-center" title="Employés"><Users size={13} className="mx-auto" /></th>
                <th className="px-4 py-3 text-center" title="Factures"><FileText size={13} className="mx-auto" /></th>
                <th className="px-4 py-3 text-center" title="POS"><ShoppingCart size={13} className="mx-auto" /></th>
                <th className="px-4 py-3 text-center" title="Documents"><FileText size={13} className="mx-auto" /></th>
                <th className="px-4 py-3 text-left">Score</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">Dernière activité</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((company) => (
                <tr key={company.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-600/20 text-indigo-200">
                        <Building2 size={13} />
                      </span>
                      <span className="font-bold">{company.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center"><BoolBadge ok={company.has_employees} /></td>
                  <td className="px-4 py-3 text-center"><BoolBadge ok={company.has_invoices} /></td>
                  <td className="px-4 py-3 text-center"><BoolBadge ok={company.has_pos} /></td>
                  <td className="px-4 py-3 text-center"><BoolBadge ok={company.has_documents} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${scoreBarColor(company.score)}`}
                          style={{ width: `${company.score}%` }}
                        />
                      </div>
                      <span className={`text-xs font-black ${scoreColor(company.score)}`}>
                        {company.score}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden text-xs text-white/40 lg:table-cell">
                    {company.last_activity ? shortDate(company.last_activity) : "–"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RappelButton company={company} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-white/35">
                    Aucune entreprise trouvée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
