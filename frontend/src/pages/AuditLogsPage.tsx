import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Download, FileText, Search, ShieldCheck } from "lucide-react";

import { api } from "../services/api";
import type { AuditLogDto } from "../services/api";
import { exportTableToExcel } from "../utils/export";
import i18n from "../i18n";
import { useAuth } from "../app/AuthContext";

const ACTION_TONE: Record<string, { tk: string; className: string }> = {
  create:  { tk: "audit.actionCreate",    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  update:  { tk: "audit.actionUpdate", className: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  delete:  { tk: "audit.actionDelete", className: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
  login:   { tk: "audit.actionLogin",   className: "bg-stone-100 text-stone-600 dark:bg-white/10 dark:text-white/60" },
  logout:  { tk: "audit.actionLogout", className: "bg-stone-100 text-stone-600 dark:bg-white/10 dark:text-white/60" },
  export:  { tk: "audit.actionExport",      className: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  import:  { tk: "audit.actionImport",      className: "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" },
};

function actionTone(action: string, tr: TFunction) {
  const key = Object.keys(ACTION_TONE).find((k) => action.toLowerCase().startsWith(k));
  return key ? { label: tr(ACTION_TONE[key].tk), className: ACTION_TONE[key].className } : { label: action, className: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" };
}

const PAGE_SIZE = 50;

export function AuditLogsPage() {
  const { t: tr } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [allCompanies, setAllCompanies] = useState(false);

  const companies = useQuery({
    queryKey: ["auditLogs", "companies"],
    queryFn: () => api.adminCompanies(),
    enabled: isSuperAdmin,
  });
  const [companyFilter, setCompanyFilter] = useState<number | "all">("all");

  const logs = useQuery({
    queryKey: ["auditLogs", "page", allCompanies, companyFilter],
    queryFn: () => api.auditLogs({
      limit: 500,
      allCompanies: isSuperAdmin && allCompanies,
      companyId: isSuperAdmin && companyFilter !== "all" ? companyFilter : undefined,
    }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (logs.data ?? []).filter((log) => {
      const matchSearch = !q || (log.actor ?? "").toLowerCase().includes(q) || log.action.toLowerCase().includes(q) || (log.details ?? "").toLowerCase().includes(q);
      const matchAction = actionFilter === "all" || log.action.toLowerCase().startsWith(actionFilter);
      return matchSearch && matchAction;
    });
  }, [logs.data, search, actionFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function exportExcel() {
    const headers = [tr("audit.colDate"), tr("audit.colUser"), tr("audit.colAction"), tr("audit.colModule"), tr("audit.colDetails")];
    const rows = filtered.map((log): (string | number)[] => [
      log.created_at ? new Date(log.created_at).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }) : "",
      log.actor ?? "",
      log.action,
      log.employee ?? "",
      log.details ?? "",
    ]);
    exportTableToExcel(headers, rows, `audit-logs-${new Date().toISOString().slice(0, 10)}`);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-emerald-600">{tr("audit.eyebrow")}</p>
        <h1 className="text-3xl font-black text-[#17211f] dark:text-white">{tr("audit.title")}</h1>
        <p className="mt-1 text-sm text-[#717182]">
          {tr("audit.subtitle")}
        </p>
      </div>

      {/* Super-admin : vue plateforme entière */}
      {isSuperAdmin && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 px-4 py-3">
          <ShieldCheck size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <label className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            <input
              type="checkbox"
              checked={allCompanies}
              onChange={(e) => { setAllCompanies(e.target.checked); setCompanyFilter("all"); setPage(0); }}
              className="h-4 w-4 rounded accent-emerald-600"
            />
            Vue plateforme (toutes les entreprises)
          </label>
          <select
            value={companyFilter}
            onChange={(e) => { const v = e.target.value; setCompanyFilter(v === "all" ? "all" : Number(v)); setAllCompanies(false); setPage(0); }}
            className="rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-white dark:bg-[#1e2229] px-2.5 py-1.5 text-sm text-[#17211f] dark:text-white outline-none"
          >
            <option value="all">Mon entreprise</option>
            {(companies.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] px-3 py-2.5">
          <Search size={15} className="shrink-0 text-[#717182]" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder={tr("audit.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none dark:text-white"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
            className="flex-1 sm:flex-none rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none"
          >
            <option value="all">{tr("audit.allActions")}</option>
            {Object.keys(ACTION_TONE).map((k) => (
              <option key={k} value={k}>{tr(ACTION_TONE[k].tk)}</option>
            ))}
          </select>
          <button
            onClick={exportExcel}
            disabled={(logs.data?.length ?? 0) === 0}
            className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 disabled:opacity-50 transition whitespace-nowrap"
          >
            <Download size={15} />
            <span className="hidden sm:inline">{tr("audit.excel")}</span>
          </button>
        </div>
      </div>

      {/* Loading */}
      {logs.isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
        </div>
      )}

      {!logs.isLoading && paged.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-[#717182]">
          <FileText size={28} className="opacity-30" />
          <p className="text-sm">{tr("audit.noLogs")}</p>
        </div>
      )}

      {/* ── Mobile : cartes ── */}
      {!logs.isLoading && paged.length > 0 && (
        <div className="sm:hidden space-y-2">
          {paged.map((log: AuditLogDto) => {
            const tone = actionTone(log.action, tr);
            return (
              <div key={log.id} className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone.className}`}>{tone.label}</span>
                  <span className="text-[10px] text-[#717182]">
                    {new Date(log.created_at).toLocaleDateString(i18n.language, { day: "2-digit", month: "short" })}{" "}
                    {new Date(log.created_at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-50 dark:bg-emerald-500/15">
                    <ShieldCheck size={10} className="text-emerald-600 dark:text-emerald-400" />
                  </span>
                  <span className="text-sm font-semibold text-[#17211f] dark:text-white truncate">{log.actor ?? "—"}</span>
                  {log.employee && <span className="text-xs text-[#717182] truncate">· {log.employee}</span>}
                </div>
                {log.details && <p className="text-xs text-[#717182] leading-snug line-clamp-2">{log.details}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Desktop : tableau ── */}
      {!logs.isLoading && paged.length > 0 && (
        <div className="hidden sm:block rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] overflow-hidden">
          <div className="grid grid-cols-[150px_130px_120px_110px_1fr] gap-3 border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#717182]">
            <span>{tr("audit.colDate")}</span><span>{tr("audit.colUser")}</span><span>{tr("audit.colAction")}</span><span>{tr("audit.colModule")}</span><span>{tr("audit.colDetails")}</span>
          </div>
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {paged.map((log: AuditLogDto) => {
              const tone = actionTone(log.action, tr);
              return (
                <div key={log.id} className="grid grid-cols-[150px_130px_120px_110px_1fr] gap-3 items-start px-5 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition">
                  <span className="text-xs text-[#717182]">
                    {new Date(log.created_at).toLocaleDateString(i18n.language, { day: "2-digit", month: "short", year: "numeric" })}{" "}
                    <span className="opacity-60">{new Date(log.created_at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}</span>
                  </span>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-50 dark:bg-emerald-500/15">
                      <ShieldCheck size={11} className="text-emerald-600 dark:text-emerald-400" />
                    </span>
                    <span className="truncate text-sm font-medium text-[#17211f] dark:text-white">{log.actor ?? "—"}</span>
                  </span>
                  <span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone.className}`}>{tone.label}</span></span>
                  <span className="text-xs text-[#717182] truncate">{log.employee ?? "—"}</span>
                  <span className="text-xs text-[#717182] truncate">{log.details ?? "—"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] px-3 py-1.5 text-sm font-semibold disabled:opacity-40 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          >
            {tr("audit.prev")}
          </button>
          <span className="text-sm text-[#717182]">
            {tr("audit.pageInfo", { page: page + 1, total: pageCount, count: filtered.length })}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
            className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] px-3 py-1.5 text-sm font-semibold disabled:opacity-40 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
          >
            {tr("audit.next")}
          </button>
        </div>
      )}
    </div>
  );
}
