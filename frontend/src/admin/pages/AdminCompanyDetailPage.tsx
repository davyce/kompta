import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { AlertTriangle, ArrowLeft, Building2, FileText, ShieldCheck, Users, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../../services/api";
import { compactMoney } from "../../utils/format";

function DetailCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Building2 }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
      <Icon size={18} className="text-indigo-600 dark:text-indigo-300" />
      <p className="mt-3 text-2xl font-black text-slate-900 dark:text-white">{value}</p>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-white/40">{label}</p>
    </div>
  );
}

function accountStatusLabel(status: string, tr: TFunction) {
  if (status === "active") return tr("admin.subscriptions.status.active");
  if (status === "suspended") return tr("admin.subscriptions.status.suspendedUpper");
  return status;
}

export function AdminCompanyDetailPage() {
  const { t: tr } = useTranslation();
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
      <button onClick={() => navigate("/admin/companies")} className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-slate-900 dark:text-indigo-300 dark:hover:text-white">
        <ArrowLeft size={17} />
        {tr("admin.companies.back")}
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-500">{tr("admin.companies.tenantDetail")}</p>
            <h1 className="mt-1 text-3xl font-black text-slate-900 dark:text-white">{data?.company.name ?? tr("common.loading")}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-white/60">{data?.company.legal_name} · {data?.company.industry} · {data?.company.country}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-right text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
            <p className="text-2xl font-black">{data?.company.teras_score ?? "..."}</p>
            <p className="text-[10px] font-bold uppercase">{tr("admin.companies.terasScore")}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <DetailCard label={tr("admin.companies.users")} value={data?.stats.users_count ?? "..."} icon={Users} />
        <DetailCard label={tr("admin.companies.invoices")} value={data?.stats.invoices ?? "..."} icon={FileText} />
        <DetailCard label={tr("admin.companies.posRevenue")} value={compactMoney(data?.stats.sales_total ?? 0)} icon={Wallet} />
        <DetailCard label={tr("admin.companies.setup")} value={`${data?.company.completion_score ?? 0}%`} icon={ShieldCheck} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <h2 className="font-black text-slate-900 dark:text-white">{tr("admin.companies.users")}</h2>
          <div className="mt-4 space-y-2">
            {data?.users.map((user) => (
              <article key={user.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{user.full_name}</p>
                  <p className="text-xs text-slate-500 dark:text-white/50">{user.email} · {tr(`roles.${user.role}`, { defaultValue: user.role })}</p>
                </div>
                <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-600/20 dark:text-indigo-200">{accountStatusLabel(user.account_status, tr)}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <h2 className="font-black text-slate-900 dark:text-white">{tr("admin.companies.terasAlerts")}</h2>
          <div className="mt-4 space-y-2">
            {data?.alerts.length ? data.alerts.map((alert) => (
              <article key={alert.id} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
                <span className={`grid h-10 w-10 place-items-center rounded-lg ${alert.severity === "high" ? "bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200" : "bg-indigo-50 text-indigo-700 dark:bg-indigo-600/20 dark:text-indigo-200"}`}>
                  <AlertTriangle size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-900 dark:text-white">{alert.title}</p>
                  <p className="text-xs text-slate-500 dark:text-white/50">{alert.module} · {alert.status}</p>
                </div>
              </article>
            )) : <p className="py-6 text-center text-sm text-slate-400 dark:text-white/40">{tr("admin.companies.noActiveAlerts")}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
