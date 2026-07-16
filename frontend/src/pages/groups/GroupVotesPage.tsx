import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Vote, Plus, X, Loader2, CheckCircle, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../services/api";
import i18n from "../../i18n";

const STATUS_TK: Record<string, string> = {
  open: "groupPages.votes.status.open",
  closed: "groupPages.votes.status.closed",
  cancelled: "groupPages.votes.status.cancelled",
};

export function GroupVotesPage() {
  const { t: tr } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showResults, setShowResults] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", options: ["", ""], start_datetime: "", end_datetime: "" });
  const [selectedOption, setSelectedOption] = useState("");

  const { data: group } = useQuery({ queryKey: ["group", id], queryFn: () => api.group(id) });
  const { data: votes = [], isLoading } = useQuery({ queryKey: ["group-votes", id], queryFn: () => api.groupVotes(id) });
  const { data: results } = useQuery({ queryKey: ["group-vote-results", id, showResults], queryFn: () => api.voteResults(id, showResults!), enabled: !!showResults });

  const create = useMutation({
    mutationFn: () => api.createVote(id, { title: form.title, options: form.options.filter(o => o.trim()), start_datetime: form.start_datetime, end_datetime: form.end_datetime }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["group-votes", id] }); setShowCreate(false); setForm({ title: "", options: ["",""], start_datetime: "", end_datetime: "" }); },
  });
  const respond = useMutation({
    mutationFn: ({ voteId, option }: { voteId: number; option: string }) => api.respondToVote(id, voteId, option),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["group-votes", id] }); setSelectedOption(""); },
  });

  const STATUS_STYLE: Record<string, string> = {
    open: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    closed: "bg-gray-100 text-gray-600 dark:bg-white/[0.06]",
    cancelled: "bg-rose-100 text-rose-700",
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-[#17211f] dark:text-white">{tr("groupPages.votes.title")}</h2>
        {group?.can_manage && <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-700 transition"><Plus size={15} /> {tr("groupPages.votes.add")}</button>}
      </div>
      {isLoading ? <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-amber-500" /></div> :
        votes.map(v => (
          <div key={v.id} className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-[#17211f] dark:text-white">{v.title}</p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[v.status] ?? ""}`}>{tr(STATUS_TK[v.status] ?? "groupPages.votes.status.unknown", { defaultValue: v.status })}</span>
            </div>
            <p className="text-xs text-[#717182]">{tr("groupPages.votes.endsAt", { date: new Date(v.end_datetime).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }) })}</p>
            {v.status === "open" && (
              <div className="space-y-2">
                {v.options.map(opt => (
                  <button key={opt} onClick={() => setSelectedOption(opt)}
                    className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm text-left transition ${selectedOption === opt ? "border-blue-700 bg-blue-50 dark:bg-blue-800/12 text-blue-900 dark:text-blue-400" : "border-black/[0.08] dark:border-white/[0.08] hover:border-blue-400"}`}>
                    {selectedOption === opt && <CheckCircle size={14} className="text-blue-700 shrink-0" />}
                    {opt}
                  </button>
                ))}
                {selectedOption && (
                  <button onClick={() => respond.mutate({ voteId: v.id, option: selectedOption })} disabled={respond.isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-800 py-2.5 text-sm font-black text-white hover:bg-blue-900 disabled:opacity-60 transition">
                    {respond.isPending ? <Loader2 size={14} className="animate-spin" /> : <Vote size={14} />} {tr("groupPages.votes.vote")}
                  </button>
                )}
              </div>
            )}
            <button onClick={() => setShowResults(v.id)} className="flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:text-sky-700">
              <BarChart3 size={12} /> {tr("groupPages.votes.viewResults")}
            </button>
          </div>
        ))
      }
      {votes.length === 0 && !isLoading && <p className="text-center text-sm text-[#717182] py-8">{tr("groupPages.votes.empty")}</p>}

      {/* Results modal */}
      {showResults && results && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-[#17211f] dark:text-white">{results.title}</h3><button onClick={() => setShowResults(null)} aria-label={tr("common.close")}><X size={16} /></button></div>
            <p className="text-xs text-[#717182] mb-3">{tr("groupPages.votes.voteCount", { count: results.total_votes })}</p>
            <div className="space-y-3">
              {results.results.map(r => (
                <div key={r.option}>
                  <div className="flex justify-between text-sm mb-1"><span className="font-medium">{r.option}</span><span className="font-black text-blue-800">{r.percent}%</span></div>
                  <div className="h-2 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
                    <div className="h-2 rounded-full bg-gradient-to-r from-blue-700 to-blue-800" style={{ width: `${r.percent}%` }} />
                  </div>
                  <p className="text-xs text-[#717182] mt-0.5">{tr("groupPages.votes.voteCount", { count: r.count })}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-black text-[#17211f] dark:text-white">{tr("groupPages.votes.modalTitle")}</h3><button onClick={() => setShowCreate(false)} aria-label={tr("common.close")}><X size={16} /></button></div>
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase text-[#717182]">{tr("groupPages.votes.form.question")}<input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case focus:border-amber-500" /></label>
              <div>
                <p className="text-xs font-bold uppercase text-[#717182] mb-1">{tr("groupPages.votes.form.options")}</p>
                {form.options.map((opt, i) => (
                  <input key={i} value={opt} onChange={e => { const ops = [...form.options]; ops[i] = e.target.value; setForm(f => ({...f, options: ops})); }} placeholder={tr("groupPages.votes.form.optionPlaceholder", { index: i + 1 })}
                    aria-label={tr("groupPages.votes.form.optionPlaceholder", { index: i + 1 })}
                    className="mb-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none normal-case" />
                ))}
                <button onClick={() => setForm(f => ({...f, options: [...f.options, ""]}))} className="text-xs font-bold text-amber-600 hover:text-amber-700">{tr("groupPages.votes.form.addOption")}</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-bold uppercase text-[#717182]">{tr("groupPages.votes.form.start")}<input type="datetime-local" value={form.start_datetime} onChange={e => setForm(f => ({...f, start_datetime: e.target.value}))} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none normal-case" /></label>
                <label className="block text-xs font-bold uppercase text-[#717182]">{tr("groupPages.votes.form.end")}<input type="datetime-local" value={form.end_datetime} onChange={e => setForm(f => ({...f, end_datetime: e.target.value}))} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none normal-case" /></label>
              </div>
            </div>
            <button disabled={!form.title || !form.start_datetime || !form.end_datetime || create.isPending} onClick={() => create.mutate()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-sm font-black text-white hover:bg-amber-700 disabled:bg-stone-300 transition">
              {create.isPending ? <Loader2 size={15} className="animate-spin" /> : <Vote size={15} />} {tr("common.create")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
