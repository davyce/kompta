import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Building2, FileText, ShieldCheck, Users, Wallet } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../../services/api";
import { compactMoney } from "../../utils/format";

function DetailCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Building2 }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <Icon size={18} className="text-indigo-300" />
      <p className="mt-3 text-2xl font-black">{value}</p>
      <p className="text-xs font-bold uppercase tracking-wider text-white/40">{label}</p>
    </div>
  );
}

export function AdminCompanyDetailPage() {
  const navigate = useNavigate();
  const { companyId } = useParams();
  const id = Number(companyId);
  const company = useQuery({
    queryKey: ["adminCompany", id],
    queryFn: () => api.adminCompanyDetail(id),
    enabled: Number.isFinite(id),
  });

  const data = company.data;

  return (
    <div className="space-y-6">
      <button onClick={() => navigate("/admin/companies")} className="flex items-center gap-2 text-sm font-bold text-indigo-300 hover:text-white">
        <ArrowLeft size={17} />
        Retour entreprises
      </button>

      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">Tenant detail</p>
            <h1 className="mt-1 text-3xl font-black">{data?.company.name ?? "Chargement..."}</h1>
            <p className="mt-1 text-sm text-white/60">{data?.company.legal_name} · {data?.company.industry} · {data?.company.country}</p>
          </div>
          <div className="rounded-xl bg-emerald-500/15 px-4 py-3 text-right text-emerald-200">
            <p className="text-2xl font-black">{data?.company.teras_score ?? "..."}</p>
            <p className="text-[10px] font-bold uppercase">Score TERAS</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <DetailCard label="Utilisateurs" value={data?.stats.users_count ?? "..."} icon={Users} />
        <DetailCard label="Factures" value={data?.stats.invoices ?? "..."} icon={FileText} />
        <DetailCard label="CA POS" value={compactMoney(data?.stats.sales_total ?? 0)} icon={Wallet} />
        <DetailCard label="Setup" value={`${data?.company.completion_score ?? 0}%`} icon={ShieldCheck} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="font-black">Utilisateurs</h2>
          <div className="mt-4 space-y-2">
            {data?.users.map((user) => (
              <article key={user.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 p-3">
                <div>
                  <p className="font-bold">{user.full_name}</p>
                  <p className="text-xs text-white/50">{user.email} · {user.role}</p>
                </div>
                <span className="rounded-full bg-indigo-600/20 px-2 py-1 text-xs font-bold text-indigo-200">{user.account_status}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="font-black">Alertes TERAS</h2>
          <div className="mt-4 space-y-2">
            {data?.alerts.length ? data.alerts.map((alert) => (
              <article key={alert.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 p-3">
                <span className={`grid h-10 w-10 place-items-center rounded-lg ${alert.severity === "high" ? "bg-rose-500/20 text-rose-200" : "bg-indigo-600/20 text-indigo-200"}`}>
                  <AlertTriangle size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{alert.title}</p>
                  <p className="text-xs text-white/50">{alert.module} · {alert.status}</p>
                </div>
              </article>
            )) : <p className="py-6 text-center text-sm text-white/40">Aucune alerte active.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
