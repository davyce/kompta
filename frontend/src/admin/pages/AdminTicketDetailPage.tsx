import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { ArrowLeft, CheckCircle2, Send, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../../services/api";
import { shortDate } from "../../utils/format";

function statusLabel(status: string, tr: TFunction) {
  const labels: Record<string, string> = {
    open: tr("admin.tickets.status.open"),
    in_progress: tr("admin.tickets.status.inProgress"),
    resolved: tr("admin.tickets.status.resolved"),
    closed: tr("admin.tickets.status.closed"),
  };
  return labels[status] ?? status;
}

function priorityLabel(priority: string, tr: TFunction) {
  const labels: Record<string, string> = {
    low: tr("admin.tickets.priority.low"),
    medium: tr("admin.tickets.priority.medium"),
    high: tr("admin.tickets.priority.high"),
    critical: tr("admin.tickets.priority.critical"),
  };
  return labels[priority] ?? priority;
}

function categoryLabel(category: string, tr: TFunction) {
  const labels: Record<string, string> = {
    general: tr("admin.tickets.categories.general"),
    technical: tr("admin.tickets.categories.technical"),
    billing: tr("admin.tickets.categories.billing"),
    feature: tr("admin.tickets.categories.feature"),
  };
  return labels[category] ?? category;
}

export function AdminTicketDetailPage() {
  const { t: tr } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { ticketId } = useParams();
  const id = Number(ticketId);
  const [reply, setReply] = useState("");

  const ticket = useQuery({
    queryKey: ["adminTicket", id],
    queryFn: () => api.adminTicket(id),
    enabled: Number.isFinite(id),
  });
  const updateTicket = useMutation({
    mutationFn: (payload: { status?: string; priority?: string; category?: string }) => api.adminUpdateTicket(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminTicket", id] });
      queryClient.invalidateQueries({ queryKey: ["adminTickets"] });
    },
  });
  const replyTicket = useMutation({
    mutationFn: () => api.adminReplyTicket(id, reply),
    onSuccess: () => {
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["adminTicket", id] });
      queryClient.invalidateQueries({ queryKey: ["adminTickets"] });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (reply.trim()) {
      replyTicket.mutate();
    }
  }

  const data = ticket.data;

  return (
    <div className="space-y-6">
      <button onClick={() => navigate("/admin/tickets")} className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-slate-900 dark:text-indigo-300 dark:hover:text-white">
        <ArrowLeft size={17} />
        {tr("admin.tickets.back")}
      </button>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5 dark:border-white/10">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-500">Ticket #{data?.id ?? "..."}</p>
              <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{data?.subject ?? tr("common.loading")}</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-white/60">{data?.company_name} · {data?.requester_name} · {shortDate(data?.created_at ?? null)}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-700 dark:bg-white/10 dark:text-white/70">{data?.status ? statusLabel(data.status, tr) : "..."}</span>
          </div>

          <div className="space-y-4 py-5">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-white/70">
                <UserRound size={17} />
                {tr("admin.tickets.initialRequest")}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800 dark:text-white/85">{data?.body}</p>
            </article>

            {data?.messages.map((message) => (
              <article key={message.id} className={`rounded-xl border p-4 ${message.is_staff ? "border-indigo-200 bg-indigo-50 dark:border-indigo-500/20 dark:bg-indigo-600/10" : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5"}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{message.author_name || "Support"}</p>
                  <span className="text-xs text-slate-400 dark:text-white/40">{shortDate(message.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-white/80">{message.body}</p>
              </article>
            ))}
          </div>

          <form onSubmit={submit} className="border-t border-slate-200 pt-5 dark:border-white/10">
            <label className="block">
              <span className="text-xs font-bold uppercase text-slate-500 dark:text-white/45">{tr("admin.tickets.supportResponse")}</span>
              <textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                className="mt-2 min-h-32 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500 dark:border-white/10 dark:bg-black/20 dark:text-white dark:placeholder:text-white/30"
                placeholder={tr("admin.tickets.supportResponsePlaceholder")}
              />
            </label>
            <button
              type="submit"
              disabled={replyTicket.isPending || !reply.trim()}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-600 disabled:opacity-50"
            >
              <Send size={17} />
              {replyTicket.isPending ? tr("admin.companies.sending") : tr("admin.tickets.sendResponse")}
            </button>
          </form>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
            <h2 className="font-black text-slate-900 dark:text-white">{tr("admin.tickets.triage")}</h2>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500 dark:text-white/45">{tr("common.status")}</span>
                <select
                  value={data?.status ?? "open"}
                  onChange={(event) => updateTicket.mutate({ status: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/10 dark:bg-slate-950 dark:text-white"
                >
                  <option value="open">{tr("admin.tickets.status.open")}</option>
                  <option value="in_progress">{tr("admin.tickets.status.inProgress")}</option>
                  <option value="resolved">{tr("admin.tickets.status.resolved")}</option>
                  <option value="closed">{tr("admin.tickets.status.closed")}</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500 dark:text-white/45">{tr("admin.tickets.priorityLabel")}</span>
                <select
                  value={data?.priority ?? "medium"}
                  onChange={(event) => updateTicket.mutate({ priority: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/10 dark:bg-slate-950 dark:text-white"
                >
                  <option value="low">{priorityLabel("low", tr)}</option>
                  <option value="medium">{priorityLabel("medium", tr)}</option>
                  <option value="high">{priorityLabel("high", tr)}</option>
                  <option value="critical">{priorityLabel("critical", tr)}</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-slate-500 dark:text-white/45">{tr("admin.tickets.categoryLabel")}</span>
                <select
                  value={data?.category ?? "general"}
                  onChange={(event) => updateTicket.mutate({ category: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/10 dark:bg-slate-950 dark:text-white"
                >
                  <option value="general">{categoryLabel("general", tr)}</option>
                  <option value="technical">{categoryLabel("technical", tr)}</option>
                  <option value="billing">{categoryLabel("billing", tr)}</option>
                  <option value="feature">{categoryLabel("feature", tr)}</option>
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} />
              <h2 className="font-black">{tr("admin.tickets.supportAssistant")}</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-emerald-700 dark:text-emerald-100/80">
              {tr("admin.tickets.recommendedResponse")}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
