import { useQuery } from "@tanstack/react-query";
import { Building2, Eye, Search, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../../services/api";

function AdminPill({ children, tone = "violet" }: { children: ReactNode; tone?: "violet" | "emerald" | "amber" | "rose" }) {
  const tones = {
    violet: "bg-violet-500/15 text-violet-200 border-violet-400/20",
    emerald: "bg-emerald-500/15 text-emerald-200 border-emerald-400/20",
    amber: "bg-amber-500/15 text-amber-200 border-amber-400/20",
    rose: "bg-rose-500/15 text-rose-200 border-rose-400/20",
  };
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export function AdminCompaniesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const companies = useQuery({ queryKey: ["adminCompanies"], queryFn: api.adminCompanies });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (companies.data ?? []).filter((company) => {
      if (!q) return true;
      return `${company.name} ${company.legal_name} ${company.industry} ${company.country}`.toLowerCase().includes(q);
    });
  }, [companies.data, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-violet-400">Tenants</p>
          <h1 className="text-3xl font-black">Entreprises clientes</h1>
          <p className="mt-1 text-sm text-white/60">Vue cross-tenant des organisations, scores TERAS et activation.</p>
        </div>
        <AdminPill tone="emerald">{filtered.length} entreprise(s)</AdminPill>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
        <Search size={18} className="text-white/40" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher nom, secteur, pays..."
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((company) => (
          <article key={company.id} className="rounded-xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 font-black">
                  {company.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-black">{company.name}</h2>
                  <p className="truncate text-xs font-semibold text-white/50">{company.legal_name || company.industry}</p>
                </div>
              </div>
              <button
                onClick={() => navigate(`/admin/companies/${company.id}`)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Voir entreprise"
              >
                <Eye size={17} />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-white/5 p-3">
                <Users size={16} className="text-violet-300" />
                <p className="mt-2 text-lg font-black">{company.users_count}</p>
                <p className="text-[10px] font-bold uppercase text-white/40">Users</p>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <Building2 size={16} className="text-fuchsia-300" />
                <p className="mt-2 text-lg font-black">{company.employees_count}</p>
                <p className="text-[10px] font-bold uppercase text-white/40">Employes</p>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <ShieldCheck size={16} className="text-emerald-300" />
                <p className="mt-2 text-lg font-black">{company.teras_score}</p>
                <p className="text-[10px] font-bold uppercase text-white/40">TERAS</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <AdminPill>{company.industry || "Services"}</AdminPill>
              <AdminPill tone={company.completion_score >= 80 ? "emerald" : "amber"}>{company.completion_score}% setup</AdminPill>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
