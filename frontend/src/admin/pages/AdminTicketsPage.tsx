import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  Flag,
  LayoutList,
  LifeBuoy,
  Columns,
  MessageSquare,
  Send,
  User,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api } from "../../services/api";
import type { TicketDto } from "../../services/api";

const STATUSES = ["all", "open", "in_progress", "resolved", "closed"];
const PRIORITIES = ["all", "low", "medium", "high", "critical"];
const SORT_OPTIONS = ["date", "priority", "company"] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

const KANBAN_COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "open",        label: "Ouvert",    color: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10" },
  { key: "in_progress", label: "En cours",  color: "border-indigo-200 bg-indigo-50 dark:border-indigo-500/40 dark:bg-indigo-500/10" },
  { key: "resolved",    label: "Résolu",    color: "border-indigo-200 bg-indigo-50 dark:border-indigo-500/40 dark:bg-indigo-500/10" },
  { key: "closed",      label: "Fermé",     color: "border-slate-200 bg-slate-50 dark:border-white/20 dark:bg-white/5" },
];

const NEXT_STATUS: Record<string, string> = {
  open: "in_progress",
  in_progress: "resolved",
  resolved: "closed",
};

const PRIORITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function priorityClass(priority: string) {
  if (priority === "critical") return "bg-rose-100 text-rose-700 dark:bg-rose-500/25 dark:text-rose-200";
  if (priority === "high") return "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/25 dark:text-indigo-200";
  if (priority === "medium") return "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/25 dark:text-indigo-200";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200";
}

function priorityIcon(priority: string) {
  const cls =
    priority === "critical"
      ? "text-rose-500 dark:text-rose-400"
      : priority === "high"
      ? "text-indigo-500 dark:text-indigo-400"
      : priority === "medium"
      ? "text-indigo-500 dark:text-indigo-400"
      : "text-emerald-500 dark:text-emerald-400";
  return <Flag size={12} className={cls} />;
}

function slaInfo(createdAt: string): { label: string; cls: string } {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const hours = diffMs / 3_600_000;
  if (hours > 4) return { label: `Il y a ${Math.floor(hours)}h`, cls: "text-rose-500 dark:text-rose-400" };
  if (hours > 1) return { label: `Il y a ${Math.floor(hours)}h`, cls: "text-indigo-500 dark:text-indigo-400" };
  const mins = Math.round(diffMs / 60_000);
  return { label: `Il y a ${mins}m`, cls: "text-slate-400 dark:text-white/40" };
}

/* ── Metric card ── */
function MetricCard({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none">
      <p className={`text-3xl font-black ${cls}`}>{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-white/45">{label}</p>
    </div>
  );
}

/* ── Inline reply widget ── */
function InlineReply({ ticket, onClose }: { ticket: TicketDto; onClose: () => void }) {
  const [body, setBody] = useState("");
  const qc = useQueryClient();
  const reply = useMutation({
    mutationFn: (text: string) => api.adminReplyTicket(ticket.id, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminTickets"] });
      setBody("");
      onClose();
    },
  });
  return (
    <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/10" onClick={(e) => e.stopPropagation()}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Votre réponse au ticket..."
        rows={3}
        className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-1 focus:ring-indigo-400 dark:border-transparent dark:bg-black/20 dark:text-white dark:placeholder:text-white/35"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-700 dark:text-white/50 dark:hover:text-white">
          <X size={14} />
        </button>
        <button
          disabled={!body.trim() || reply.isPending}
          onClick={() => reply.mutate(body.trim())}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          <Send size={12} /> Envoyer
        </button>
      </div>
    </div>
  );
}

/* ── Assign dropdown (frontend only for now) ── */
function AssignDropdown({
  ticket,
}: {
  ticket: TicketDto;
}) {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["adminUsers"], queryFn: () => api.adminUsers() });
  const assign = useMutation({
    mutationFn: (userId: number) => api.adminUpdateTicket(ticket.id, { assignee_user_id: userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminTickets"] }),
  });
  return (
    <select
      value={ticket.assignee_user_id ?? ""}
      onChange={(e) => {
        e.stopPropagation();
        const v = Number(e.target.value);
        if (v) assign.mutate(v);
      }}
      onClick={(e) => e.stopPropagation()}
      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 dark:border-white/10 dark:bg-slate-900 dark:text-white/70"
    >
      <option value="">Non assigné</option>
      {(users.data ?? []).map((u) => (
        <option key={u.id} value={u.id}>
          {u.full_name}
        </option>
      ))}
    </select>
  );
}

/* ── Single ticket list row ── */
function TicketRow({
  ticket,
  onNavigate,
}: {
  ticket: TicketDto;
  onNavigate: (id: number) => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const sla = (ticket.status === "open" || ticket.status === "in_progress") ? slaInfo(ticket.created_at) : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50 transition-colors dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:hover:bg-white/8">
      <div
        className="flex flex-wrap items-center justify-between gap-4 cursor-pointer"
        onClick={() => onNavigate(ticket.id)}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
            <LifeBuoy size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-black text-slate-900 dark:text-white">{ticket.subject}</p>
            <p className="mt-1 line-clamp-1 text-sm text-slate-500 dark:text-white/55">{ticket.body}</p>
            <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-white/40">
              {ticket.company_name || "KOMPTA"} · {ticket.requester_name || "système"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sla && (
            <span className={`flex items-center gap-1 text-xs font-bold ${sla.cls}`}>
              <Clock size={12} /> {sla.label}
            </span>
          )}
          <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold uppercase ${priorityClass(ticket.priority)}`}>
            {priorityIcon(ticket.priority)} {ticket.priority}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase text-slate-600 dark:bg-white/10 dark:text-white/60">{ticket.status}</span>
          <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold uppercase text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">{ticket.category}</span>
          <AssignDropdown ticket={ticket} />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setReplyOpen((v) => !v);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
          >
            <MessageSquare size={12} /> Répondre
          </button>
          <ChevronRight size={16} className="text-slate-300 dark:text-white/30" />
        </div>
      </div>
      {replyOpen && <InlineReply ticket={ticket} onClose={() => setReplyOpen(false)} />}
    </div>
  );
}

/* ── Kanban card ── */
function KanbanCard({ ticket, onNavigate }: { ticket: TicketDto; onNavigate: (id: number) => void }) {
  const qc = useQueryClient();
  const move = useMutation({
    mutationFn: (status: string) => api.adminUpdateTicket(ticket.id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminTickets"] }),
  });
  const nextStatus = NEXT_STATUS[ticket.status];
  const sla = (ticket.status === "open" || ticket.status === "in_progress") ? slaInfo(ticket.created_at) : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 shadow-sm dark:border-white/10 dark:bg-black/25 dark:shadow-none">
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-sm font-bold leading-snug cursor-pointer text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-300"
          onClick={() => onNavigate(ticket.id)}
        >
          {ticket.subject}
        </p>
        <span className={`shrink-0 flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${priorityClass(ticket.priority)}`}>
          {priorityIcon(ticket.priority)} {ticket.priority}
        </span>
      </div>
      <p className="line-clamp-2 text-xs text-slate-500 dark:text-white/50">{ticket.body}</p>
      <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-400 dark:text-white/40">
        <span className="flex items-center gap-1"><User size={10} /> {ticket.company_name || "KOMPTA"}</span>
        {sla && <span className={`flex items-center gap-1 ${sla.cls}`}><Clock size={10} /> {sla.label}</span>}
      </div>
      {nextStatus && (
        <button
          disabled={move.isPending}
          onClick={() => move.mutate(nextStatus)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
        >
          Déplacer vers {KANBAN_COLUMNS.find((c) => c.key === nextStatus)?.label} <ChevronRight size={12} />
        </button>
      )}
    </div>
  );
}

/* ── Main page ── */
export function AdminTicketsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [sort, setSort] = useState<SortOption>("date");
  const [replyingId, setReplyingId] = useState<number | null>(null);

  const status = searchParams.get("status") ?? "all";
  const priority = searchParams.get("priority") ?? "all";

  const tickets = useQuery({
    queryKey: ["adminTickets", status, priority],
    queryFn: () =>
      api.adminTickets({
        status: status === "all" ? undefined : status,
        priority: priority === "all" ? undefined : priority,
      }),
  });

  const allTickets = tickets.data ?? [];

  // metrics
  const totalCount = allTickets.length;
  const openCount = allTickets.filter((t) => t.status === "open").length;
  const inProgressCount = allTickets.filter((t) => t.status === "in_progress").length;
  const criticalCount = allTickets.filter((t) => t.priority === "critical").length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = allTickets.filter((ticket) => {
      if (!q) return true;
      return `${ticket.subject} ${ticket.body} ${ticket.company_name} ${ticket.requester_name}`
        .toLowerCase()
        .includes(q);
    });
    if (sort === "priority") {
      result = [...result].sort((a, b) => (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0));
    } else if (sort === "company") {
      result = [...result].sort((a, b) => (a.company_name ?? "").localeCompare(b.company_name ?? ""));
    } else {
      result = [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return result;
  }, [search, allTickets, sort]);

  function setFilter(key: "status" | "priority", value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Support</p>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">Tickets de support</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-white/60">Priorisation, triage et réponses aux entreprises.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("list")}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${
              view === "list"
                ? "border-indigo-400 bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
            }`}
          >
            <LayoutList size={15} /> Liste
          </button>
          <button
            onClick={() => setView("kanban")}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${
              view === "kanban"
                ? "border-indigo-400 bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
            }`}
          >
            <Columns size={15} /> Kanban
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total" value={totalCount} cls="text-slate-900 dark:text-white" />
        <MetricCard label="Ouverts" value={openCount} cls="text-emerald-600 dark:text-emerald-300" />
        <MetricCard label="En cours" value={inProgressCount} cls="text-indigo-600 dark:text-indigo-300" />
        <MetricCard label="Critiques" value={criticalCount} cls="text-rose-600 dark:text-rose-300" />
      </div>

      {/* Filters */}
      <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/5">
          <AlertTriangle size={18} className="text-slate-400 dark:text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher sujet, entreprise, demandeur..."
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/35"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setFilter("status", e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 dark:border-white/10 dark:bg-slate-950 dark:text-white"
        >
          {STATUSES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setFilter("priority", e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 dark:border-white/10 dark:bg-slate-950 dark:text-white"
        >
          {PRIORITIES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 dark:border-white/10 dark:bg-slate-950 dark:text-white"
        >
          <option value="date">Tri: Date</option>
          <option value="priority">Tri: Priorité</option>
          <option value="company">Tri: Entreprise</option>
        </select>
      </div>

      {/* Loading */}
      {tickets.isLoading && (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      )}

      {/* List view */}
      {!tickets.isLoading && view === "list" && (
        <div className="space-y-3">
          {filtered.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              onNavigate={(id) => navigate(`/admin/tickets/${id}`)}
            />
          ))}
          {filtered.length === 0 && (
            <p className="py-12 text-center text-sm font-semibold text-slate-400 dark:text-white/40">Aucun ticket trouvé.</p>
          )}
        </div>
      )}

      {/* Kanban view */}
      {!tickets.isLoading && view === "kanban" && (
        <div className="grid gap-4 lg:grid-cols-4">
          {KANBAN_COLUMNS.map((col) => {
            const colTickets = filtered.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className={`rounded-xl border p-3 space-y-3 ${col.color}`}>
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-700 dark:text-white/80">{col.label}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500 dark:bg-white/10 dark:text-white/50">
                    {colTickets.length}
                  </span>
                </div>
                {colTickets.map((ticket) => (
                  <KanbanCard
                    key={ticket.id}
                    ticket={ticket}
                    onNavigate={(id) => navigate(`/admin/tickets/${id}`)}
                  />
                ))}
                {colTickets.length === 0 && (
                  <p className="py-6 text-center text-xs font-semibold text-slate-400 dark:text-white/25">Vide</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
