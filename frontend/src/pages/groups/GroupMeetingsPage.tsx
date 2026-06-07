import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Calendar, MapPin, FileText, X, Loader2, CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../services/api";
import i18n from "../../i18n";

const STATUS_TK: Record<string, string> = {
  scheduled: "groupPages.meetings.status.scheduled",
  done: "groupPages.meetings.status.done",
  cancelled: "groupPages.meetings.status.cancelled",
};

const MEETING_TYPE_TK: Record<string, string> = {
  ordinaire: "groupPages.meetings.types.regular",
  extraordinaire: "groupPages.meetings.types.extraordinary",
  bilan: "groupPages.meetings.types.review",
  election: "groupPages.meetings.types.election",
};

export function GroupMeetingsPage() {
  const { t: tr } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showMinutes, setShowMinutes] = useState<number | null>(null);
  const [minutes, setMinutes] = useState("");
  const [form, setForm] = useState({ title: "", start_datetime: "", location: "", meeting_type: "ordinaire", agenda: "" });
  const { data: group } = useQuery({ queryKey: ["group", id], queryFn: () => api.group(id) });
  const { data: meetings = [], isLoading } = useQuery({ queryKey: ["group-meetings", id], queryFn: () => api.groupMeetings(id) });

  const create = useMutation({
    mutationFn: () => api.createGroupMeeting(id, { ...form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["group-meetings", id] }); setShowAdd(false); setForm({ title: "", start_datetime: "", location: "", meeting_type: "ordinaire", agenda: "" }); },
  });
  const addMinutes = useMutation({
    mutationFn: (mid: number) => api.updateGroupMinutes(id, mid, minutes),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["group-meetings", id] }); setShowMinutes(null); setMinutes(""); },
  });

  const STATUS_STYLE: Record<string, string> = {
    scheduled: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    cancelled: "bg-rose-100 text-rose-700",
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-[#17211f] dark:text-white">{tr("groupPages.meetings.title")}</h2>
        {group?.can_manage && <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700 transition"><Plus size={15} /> {tr("groupPages.meetings.add")}</button>}
      </div>
      {isLoading ? [1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.04]" />) :
        meetings.map(m => (
          <div key={m.id} className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-[#17211f] dark:text-white">{m.title}</p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-[#717182]"><Calendar size={11} />{new Date(m.start_datetime).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" })}</span>
                  {m.location && <span className="flex items-center gap-1 text-xs text-[#717182]"><MapPin size={11} />{m.location}</span>}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[m.status] ?? "bg-gray-100 text-gray-600"}`}>{tr(STATUS_TK[m.status] ?? "groupPages.meetings.status.unknown", { defaultValue: m.status })}</span>
            </div>
            {m.minutes && <p className="text-xs text-[#717182] bg-black/[0.03] dark:bg-white/[0.04] rounded-lg p-2 whitespace-pre-wrap">{m.minutes.slice(0, 200)}{m.minutes.length > 200 ? "…" : ""}</p>}
            {m.status === "scheduled" && group?.can_manage && (
              <button onClick={() => { setShowMinutes(m.id); setMinutes(""); }} className="flex items-center gap-1 text-xs font-bold text-sky-600 hover:text-sky-700">
                <FileText size={12} /> {tr("groupPages.meetings.enterMinutes")}
              </button>
            )}
          </div>
        ))
      }
      {meetings.length === 0 && !isLoading && <p className="text-center text-sm text-[#717182] py-8">{tr("groupPages.meetings.empty")}</p>}

      {showAdd && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-black text-[#17211f] dark:text-white">{tr("groupPages.meetings.modalTitle")}</h3><button onClick={() => setShowAdd(false)}><X size={16} /></button></div>
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase text-[#717182]">{tr("groupPages.meetings.form.title")}<input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case focus:border-sky-500" /></label>
              <label className="block text-xs font-bold uppercase text-[#717182]">{tr("groupPages.meetings.form.datetime")}<input type="datetime-local" value={form.start_datetime} onChange={e => setForm(f => ({...f, start_datetime: e.target.value}))} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case" /></label>
              <label className="block text-xs font-bold uppercase text-[#717182]">{tr("groupPages.meetings.form.location")}<input value={form.location} onChange={e => setForm(f => ({...f, location: e.target.value}))} placeholder={tr("groupPages.meetings.form.locationPlaceholder")} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case" /></label>
              <label className="block text-xs font-bold uppercase text-[#717182]">{tr("groupPages.meetings.form.type")}<select value={form.meeting_type} onChange={e => setForm(f => ({...f, meeting_type: e.target.value}))} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case">{["ordinaire","extraordinaire","bilan","election"].map(t => <option key={t} value={t}>{tr(MEETING_TYPE_TK[t] ?? "groupPages.meetings.types.unknown", { defaultValue: t })}</option>)}</select></label>
              <label className="block text-xs font-bold uppercase text-[#717182]">{tr("groupPages.meetings.form.agenda")}<textarea value={form.agenda} onChange={e => setForm(f => ({...f, agenda: e.target.value}))} rows={3} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none normal-case" /></label>
            </div>
            <button disabled={!form.title || !form.start_datetime || create.isPending} onClick={() => create.mutate()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-black text-white hover:bg-sky-700 disabled:bg-stone-300 transition">
              {create.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} {tr("common.create")}
            </button>
          </div>
        </div>
      )}
      {showMinutes !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-black text-[#17211f] dark:text-white">{tr("groupPages.meetings.minutesTitle")}</h3><button onClick={() => setShowMinutes(null)}><X size={16} /></button></div>
            <textarea value={minutes} onChange={e => setMinutes(e.target.value)} placeholder={tr("groupPages.meetings.minutesPlaceholder")} rows={8} className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-3 text-sm text-[#17211f] dark:text-white outline-none normal-case focus:border-sky-500" />
            <button disabled={!minutes.trim() || addMinutes.isPending} onClick={() => addMinutes.mutate(showMinutes)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:bg-stone-300 transition">
              {addMinutes.isPending ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />} {tr("groupPages.meetings.saveMinutes")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
