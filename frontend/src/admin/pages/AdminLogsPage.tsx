import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Download,
  LogIn,
  PlusCircle,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../../services/api";
import { shortDate } from "../../utils/format";

type LogEntry = {
  id: number;
  actor_user_id: number | null;
  actor_name: string;
  target_user_id: number | null;
  target_name: string;
  action: string;
  details: string;
  company_id: number;
  created_at: string | null;
};

const PAGE_SIZE = 50;

// ── Detect log level from action / details
function detectLevel(log: LogEntry): "info" | "warning" | "error" {
  const text = `${log.action} ${log.details}`.toLowerCase();
  if (text.includes("error") || text.includes("erreur") || text.includes("fail") || text.includes("delete") || text.includes("supprim")) return "error";
  if (text.includes("warn") || text.includes("export") || text.includes("update") || text.includes("modif")) return "warning";
  return "info";
}

// ── Detect action type icon
function detectIcon(log: LogEntry) {
  const a = log.action.toLowerCase();
  if (a.includes("login") || a.includes("connexion") || a.includes("auth")) return LogIn;
  if (a.includes("create") || a.includes("creat") || a.includes("add") || a.includes("ajout")) return PlusCircle;
  if (a.includes("delete") || a.includes("supprim") || a.includes("remov")) return Trash2;
  if (a.includes("export") || a.includes("download") || a.includes("telecharg")) return Download;
  return AlertTriangle;
}

function levelColors(level: "info" | "warning" | "error") {
  if (level === "error") return { icon: "text-rose-500 bg-rose-100 dark:text-rose-400 dark:bg-rose-500/15", badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200", dot: "bg-rose-500", line: "bg-rose-300 dark:bg-rose-500/30" };
  if (level === "warning") return { icon: "text-indigo-600 bg-indigo-100 dark:text-indigo-500 dark:bg-indigo-600/15", badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-600/20 dark:text-indigo-200", dot: "bg-indigo-500", line: "bg-indigo-300 dark:bg-indigo-600/30" };
  return { icon: "text-indigo-500 bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-500/15", badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200", dot: "bg-indigo-400", line: "bg-indigo-300 dark:bg-indigo-500/30" };
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  return shortDate(dateStr);
}

// ── Date range filter
function inDateRange(dateStr: string | null, range: "today" | "7d" | "30d" | "all"): boolean {
  if (!dateStr || range === "all") return true;
  const date = new Date(dateStr).getTime();
  const now = Date.now();
  if (range === "today") {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return date >= start.getTime();
  }
  if (range === "7d") return date >= now - 7 * 86_400_000;
  if (range === "30d") return date >= now - 30 * 86_400_000;
  return true;
}

// ── CSV export helper
function exportLogs(logs: LogEntry[], format: "json" | "csv") {
  let content: string;
  let mime: string;
  let ext: string;
  if (format === "json") {
    content = JSON.stringify(logs, null, 2);
    mime = "application/json";
    ext = "json";
  } else {
    const header = "id,actor_name,target_name,action,details,company_id,created_at";
    const rows = logs.map((l) =>
      [l.id, `"${l.actor_name}"`, `"${l.target_name}"`, `"${l.action}"`, `"${l.details.replace(/"/g, '""')}"`, l.company_id, l.created_at ?? ""].join(",")
    );
    content = [header, ...rows].join("\n");
    mime = "text/csv";
    ext = "csv";
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kompta-logs-${new Date().toISOString().slice(0, 10)}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminLogsPage() {
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<"all" | "info" | "warning" | "error">("all");
  const [dateRange, setDateRange] = useState<"today" | "7d" | "30d" | "all">("all");
  const [actorFilter, setActorFilter] = useState("");
  const [page, setPage] = useState(0);
  const spinRef = useRef<HTMLDivElement>(null);

  const logs = useQuery({
    queryKey: ["adminAuditLogs"],
    queryFn: () => api.adminAuditLogs(500),
    refetchInterval: 10_000,
  });

  // Spinner animation on refetch
  useEffect(() => {
    if (logs.isFetching && spinRef.current) {
      spinRef.current.classList.add("animate-spin");
    } else {
      spinRef.current?.classList.remove("animate-spin");
    }
  }, [logs.isFetching]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const actor = actorFilter.trim().toLowerCase();
    return (logs.data ?? []).filter((log) => {
      const level = detectLevel(log);
      if (levelFilter !== "all" && level !== levelFilter) return false;
      if (!inDateRange(log.created_at, dateRange)) return false;
      if (actor && !log.actor_name.toLowerCase().includes(actor)) return false;
      if (!q) return true;
      return `${log.actor_name} ${log.target_name} ${log.action} ${log.details}`.toLowerCase().includes(q);
    });
  }, [logs.data, search, levelFilter, dateRange, actorFilter]);

  // Reset page when filter changes
  useEffect(() => { setPage(0); }, [search, levelFilter, dateRange, actorFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Observabilité</p>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">Audit & logs</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-white/60">Journal centralisé des actions sensibles et opérations support.</p>
        </div>
        <div className="flex items-center gap-3">
          <div
            ref={spinRef}
            title="Auto-refresh 10s"
            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-indigo-500 transition-all dark:border-white/10 dark:bg-white/5 dark:text-indigo-300"
          >
            <RefreshCw size={14} />
          </div>
          <button
            onClick={() => exportLogs(filtered, "csv")}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
          >
            <Download size={14} /> CSV
          </button>
          <button
            onClick={() => exportLogs(filtered, "json")}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
          >
            <Download size={14} /> JSON
          </button>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center dark:border-white/10 dark:bg-white/5">
            <p className="text-2xl font-black text-slate-900 dark:text-white">{filtered.length}</p>
            <p className="text-[10px] font-bold uppercase text-slate-400 dark:text-white/40">événements</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/5">
          <Search size={18} className="text-slate-400 dark:text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer action, acteur, détails..."
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/35"
          />
        </div>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as typeof levelFilter)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 dark:border-white/10 dark:bg-slate-950 dark:text-white"
        >
          <option value="all">Tous niveaux</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
        </select>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 dark:border-white/10 dark:bg-slate-950 dark:text-white"
        >
          <option value="all">Toutes dates</option>
          <option value="today">Aujourd'hui</option>
          <option value="7d">7 jours</option>
          <option value="30d">30 jours</option>
        </select>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 dark:border-white/10 dark:bg-white/5">
          <Search size={14} className="text-slate-400 shrink-0 dark:text-white/40" />
          <input
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            placeholder="Acteur / entreprise..."
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/35"
          />
        </div>
      </div>

      {/* Loading */}
      {logs.isLoading && (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      )}

      {/* Timeline */}
      {!logs.isLoading && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 overflow-x-hidden dark:border-white/10 dark:bg-white/5">
          <div className="relative ml-3 space-y-0">
            {pageData.map((log, i) => {
              const level = detectLevel(log);
              const colors = levelColors(level);
              const Icon = detectIcon(log);
              const isLast = i === pageData.length - 1;
              return (
                <article key={log.id} className="relative flex gap-4 pb-4">
                  {/* Timeline line */}
                  {!isLast && (
                    <div className={`absolute left-[14px] top-8 bottom-0 w-px ${colors.line}`} />
                  )}
                  {/* Icon dot */}
                  <div className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full ${colors.icon}`}>
                    <Icon size={13} />
                  </div>
                  {/* Content */}
                  <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/5 dark:bg-white/5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${colors.badge}`}>
                          {log.action}
                        </span>
                        <span className="text-xs font-semibold text-slate-600 dark:text-white/60">
                          {log.actor_name}
                          {log.target_name ? ` → ${log.target_name}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 dark:text-white/35">
                        <span>tenant #{log.company_id}</span>
                        <span>·</span>
                        <span>{relativeTime(log.created_at)}</span>
                      </div>
                    </div>
                    {log.details && (
                      <p className="mt-1 text-xs text-slate-500 leading-5 break-words dark:text-white/50">{log.details}</p>
                    )}
                  </div>
                </article>
              );
            })}
            {pageData.length === 0 && (
              <p className="py-12 text-center text-sm font-semibold text-slate-400 dark:text-white/40">Aucun log disponible.</p>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-white/10">
              <span className="text-xs font-bold text-slate-500 dark:text-white/45">
                Page {page + 1} / {totalPages} ({filtered.length} entrées)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
                >
                  Précédent
                </button>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
