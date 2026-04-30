import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Send, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../../services/api";
import { shortDate } from "../../utils/format";

export function AdminTicketDetailPage() {
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
      <button onClick={() => navigate("/admin/tickets")} className="flex items-center gap-2 text-sm font-bold text-violet-300 hover:text-white">
        <ArrowLeft size={17} />
        Retour tickets
      </button>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-violet-400">Ticket #{data?.id ?? "..."}</p>
              <h1 className="mt-1 text-2xl font-black">{data?.subject ?? "Chargement..."}</h1>
              <p className="mt-2 text-sm text-white/60">{data?.company_name} · {data?.requester_name} · {shortDate(data?.created_at ?? null)}</p>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase text-white/70">{data?.status}</span>
          </div>

          <div className="space-y-4 py-5">
            <article className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white/70">
                <UserRound size={17} />
                Demande initiale
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-white/85">{data?.body}</p>
            </article>

            {data?.messages.map((message) => (
              <article key={message.id} className={`rounded-xl border p-4 ${message.is_staff ? "border-violet-400/20 bg-violet-500/10" : "border-white/10 bg-white/5"}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold">{message.author_name || "Support"}</p>
                  <span className="text-xs text-white/40">{shortDate(message.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-white/80">{message.body}</p>
              </article>
            ))}
          </div>

          <form onSubmit={submit} className="border-t border-white/10 pt-5">
            <label className="block">
              <span className="text-xs font-bold uppercase text-white/45">Reponse support</span>
              <textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                className="mt-2 min-h-32 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-violet-400"
                placeholder="Rediger une reponse claire, actionnable, et rassurante..."
              />
            </label>
            <button className="mt-3 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-500">
              <Send size={17} />
              Envoyer la reponse
            </button>
          </form>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-black">Triage</h2>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-bold uppercase text-white/45">Statut</span>
                <select
                  value={data?.status ?? "open"}
                  onChange={(event) => updateTicket.mutate({ status: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="open">open</option>
                  <option value="in_progress">in_progress</option>
                  <option value="resolved">resolved</option>
                  <option value="closed">closed</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-white/45">Priorite</span>
                <select
                  value={data?.priority ?? "medium"}
                  onChange={(event) => updateTicket.mutate({ priority: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-white/45">Categorie</span>
                <select
                  value={data?.category ?? "general"}
                  onChange={(event) => updateTicket.mutate({ category: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="general">general</option>
                  <option value="technical">technical</option>
                  <option value="billing">billing</option>
                  <option value="feature">feature</option>
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-emerald-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} />
              <h2 className="font-black">Assistant support</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-emerald-100/80">
              Reponse recommandee: confirmer la prise en charge, demander le contexte exact, proposer une action immediate, puis passer le ticket en in_progress.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
