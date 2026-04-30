import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, LifeBuoy, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api } from "../../services/api";

const statuses = ["all", "open", "in_progress", "resolved", "closed"];
const priorities = ["all", "low", "medium", "high", "critical"];

function priorityClass(priority: string) {
  if (priority === "critical") return "bg-rose-500/25 text-rose-200";
  if (priority === "high") return "bg-amber-500/25 text-amber-200";
  if (priority === "medium") return "bg-violet-500/25 text-violet-200";
  return "bg-emerald-500/20 text-emerald-200";
}

export function AdminTicketsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const status = searchParams.get("status") ?? "all";
  const priority = searchParams.get("priority") ?? "all";
  const tickets = useQuery({
    queryKey: ["adminTickets", status, priority],
    queryFn: () => api.adminTickets({ status: status === "all" ? undefined : status, priority: priority === "all" ? undefined : priority }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (tickets.data ?? []).filter((ticket) => {
      if (!q) return true;
      return `${ticket.subject} ${ticket.body} ${ticket.company_name} ${ticket.requester_name}`.toLowerCase().includes(q);
    });
  }, [search, tickets.data]);

  function setFilter(key: "status" | "priority", value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-violet-400">Support</p>
          <h1 className="text-3xl font-black">Tickets de support</h1>
          <p className="mt-1 text-sm text-white/60">Priorisation, triage et reponses aux entreprises.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-200">
          <AlertTriangle size={18} />
          <span className="text-sm font-bold">{filtered.filter((ticket) => ticket.priority === "critical").length} critiques</span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <Search size={18} className="text-white/40" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher sujet, entreprise, demandeur..."
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          />
        </div>
        <select value={status} onChange={(event) => setFilter("status", event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm font-bold text-white">
          {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={priority} onChange={(event) => setFilter("priority", event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm font-bold text-white">
          {priorities.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      <div className="grid gap-3">
        {filtered.map((ticket) => (
          <button
            key={ticket.id}
            onClick={() => navigate(`/admin/tickets/${ticket.id}`)}
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10"
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-500/20 text-violet-200">
                <LifeBuoy size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-black">{ticket.subject}</p>
                <p className="mt-1 line-clamp-1 text-sm text-white/55">{ticket.body}</p>
                <p className="mt-1 text-xs font-semibold text-white/40">{ticket.company_name || "KOMPTA"} · {ticket.requester_name || "systeme"}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${priorityClass(ticket.priority)}`}>{ticket.priority}</span>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold uppercase text-white/60">{ticket.status}</span>
              <span className="rounded-full bg-fuchsia-500/15 px-2.5 py-1 text-xs font-bold uppercase text-fuchsia-200">{ticket.category}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
