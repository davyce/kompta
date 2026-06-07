import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar, CheckCircle2, Clock, Plus, Sparkles, Trash2, Users, Video, X,
} from "lucide-react";

import { api, type MeetingDto } from "../services/api";

/* ── helpers ──────────────────────────────────────────────────────── */
function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}
const COLORS = ["bg-emerald-500","bg-violet-500","bg-amber-500","bg-rose-500","bg-sky-500","bg-emerald-500","bg-orange-500"];
function avatarColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return COLORS[h % COLORS.length];
}
const TAG_COLORS: Record<string, string> = {
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  rose:   "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  sky:    "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  amber:  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
};
function tagColor(name: string) {
  return TAG_COLORS[name] ?? TAG_COLORS.emerald;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
}
function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString(i18n.language, { weekday: "short", day: "2-digit" });
}
function isToday(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  return d.toDateString() === t.toDateString();
}
function isFuture(iso: string) {
  return new Date(iso) > new Date();
}

/* ── ICS export ───────────────────────────────────────────────────── */
function exportIcs(meetings: MeetingDto[]) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  };
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KOMPTA//FR"];
  for (const m of meetings) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:meeting-${m.id}@kompta`);
    lines.push(`DTSTAMP:${fmt(m.created_at)}`);
    lines.push(`DTSTART:${fmt(m.start_at)}`);
    lines.push(`DTEND:${fmt(m.end_at)}`);
    lines.push(`SUMMARY:${m.title.replace(/\n/g, " ")}`);
    if (m.location) lines.push(`LOCATION:${m.location}`);
    if (m.ai_summary) lines.push(`DESCRIPTION:${m.ai_summary.replace(/\n/g, "\\n")}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "kompta-meetings.ics"; a.click();
  URL.revokeObjectURL(url);
}

/* ── Create meeting modal ─────────────────────────────────────────── */
function CreateMeetingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t: tr } = useTranslation();
  const [form, setForm] = useState({
    title: "", date: new Date().toISOString().slice(0, 10),
    start: "10:00", end: "11:00", tag: "Direction", tag_color: "violet",
    location: "", join_url: "", attendees: "",
  });
  const create = useMutation({
    mutationFn: (payload: Parameters<typeof api.createMeeting>[0]) => api.createMeeting(payload),
    onSuccess: () => { onCreated(); onClose(); },
  });
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const start_at = new Date(`${form.date}T${form.start}:00`).toISOString();
    const end_at = new Date(`${form.date}T${form.end}:00`).toISOString();
    const attendees = form.attendees.split(",").map((s) => s.trim()).filter(Boolean);
    create.mutate({
      title: form.title, start_at, end_at,
      tag: form.tag, tag_color: form.tag_color,
      location: form.location, join_url: form.join_url, attendees,
    });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#17211f] dark:text-white">{tr("meetings.newMeeting")}</h3>
          <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.04]"><X size={15} /></button>
        </div>
        <input required placeholder={tr("meetings.title")} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] dark:bg-[#252931] px-3 py-2 text-sm" />
        <div className="grid grid-cols-3 gap-2">
          <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="col-span-3 rounded-lg border border-black/[0.08] dark:border-white/[0.08] dark:bg-[#252931] px-3 py-2 text-sm" />
          <input type="time" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })}
            className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] dark:bg-[#252931] px-3 py-2 text-sm" />
          <span className="self-center text-center text-xs text-[#717182]">→</span>
          <input type="time" required value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })}
            className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] dark:bg-[#252931] px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder={tr("meetings.tagPlaceholder")} value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })}
            className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] dark:bg-[#252931] px-3 py-2 text-sm" />
          <select value={form.tag_color} onChange={(e) => setForm({ ...form, tag_color: e.target.value })}
            className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] dark:bg-[#252931] px-3 py-2 text-sm">
            {Object.keys(TAG_COLORS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <input placeholder={tr("meetings.location")} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
          className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] dark:bg-[#252931] px-3 py-2 text-sm" />
        <input placeholder={tr("meetings.joinUrl")} value={form.join_url} onChange={(e) => setForm({ ...form, join_url: e.target.value })}
          className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] dark:bg-[#252931] px-3 py-2 text-sm" />
        <input placeholder={tr("meetings.attendees")} value={form.attendees} onChange={(e) => setForm({ ...form, attendees: e.target.value })}
          className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] dark:bg-[#252931] px-3 py-2 text-sm" />
        {create.isError && <p className="text-xs text-rose-600">{tr("meetings.createError")}</p>}
        <button type="submit" disabled={create.isPending}
          className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50">
          {create.isPending ? tr("meetings.creating") : tr("meetings.createMeeting")}
        </button>
      </form>
    </div>
  );
}

/* ── component ────────────────────────────────────────────────────── */
export function MeetingsPage() {
  const { t: tr } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const meetings = useQuery({ queryKey: ["meetings"], queryFn: api.meetings });

  const generateSummary = useMutation({
    mutationFn: (id: number) => api.generateMeetingSummary(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetings"] }),
  });
  const removeMeeting = useMutation({
    mutationFn: (id: number) => api.deleteMeeting(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      setSelectedId(null);
    },
  });
  const convertToTasks = useMutation({
    mutationFn: async (m: MeetingDto) => {
      for (const point of m.ai_points) {
        await api.createTask({
          title: point.length > 140 ? point.slice(0, 137) + "…" : point,
          source: `meeting:${m.id}`,
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const today = new Intl.DateTimeFormat(i18n.language, { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  const data = meetings.data ?? [];
  const todayMeetings = useMemo(() => data.filter((m) => isToday(m.start_at)), [data]);
  const upcoming = useMemo(() => data.filter((m) => !isToday(m.start_at) && isFuture(m.start_at)).slice(0, 6), [data]);
  const lastSummary = useMemo(() => data.filter((m) => m.ai_summary).slice(-1)[0], [data]);
  const selectedMeeting = useMemo(() => data.find((m) => m.id === selectedId) ?? null, [data, selectedId]);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-600">{tr("meetings.eyebrow")}</p>
          <h1 className="text-3xl font-extrabold text-[#17211f] dark:text-white">{tr("meetings.pageTitle")}</h1>
          <p className="mt-1 text-sm text-[#717182]">{tr("meetings.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => exportIcs(data)}
            disabled={data.length === 0}
            className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] px-3 py-2 text-sm font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.03] disabled:opacity-50">
            <Calendar size={15} /> {tr("meetings.exportIcs")}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition">
            <Plus size={15} /> {tr("meetings.propose")}
          </button>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">

        {/* Left — Today's agenda */}
        <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
          <div className="flex items-center justify-between border-b border-black/[0.05] dark:border-white/[0.05] px-5 py-4">
            <div>
              <h3 className="font-bold text-[#17211f] dark:text-white capitalize">{tr("meetings.todayLabel", { date: today })}</h3>
              <p className="text-xs text-[#717182]">{tr("meetings.meetingsPlanned", { count: todayMeetings.length })}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreate(true)}
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/30 dark:text-emerald-300 hover:bg-emerald-100 transition">
                {tr("meetings.proposeShort")}
              </button>
            </div>
          </div>

          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {meetings.isLoading && <p className="px-5 py-8 text-sm text-[#717182]">{tr("meetings.loading")}</p>}
            {!meetings.isLoading && todayMeetings.length === 0 && (
              <div className="px-5 py-12 text-center">
                <Calendar size={32} className="mx-auto text-[#717182] opacity-40" />
                <p className="mt-3 text-sm text-[#717182]">{tr("meetings.noMeetingToday")}</p>
                <button onClick={() => setShowCreate(true)} className="mt-3 text-sm font-semibold text-emerald-600 hover:text-emerald-700">{tr("meetings.scheduleMeeting")}</button>
              </div>
            )}
            {todayMeetings.map((m) => {
              const day = new Date(m.start_at);
              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className={`flex items-start gap-4 px-5 py-5 cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition ${
                    selectedId === m.id ? "bg-emerald-50 dark:bg-emerald-500/10" : ""
                  }`}
                >
                  <div className="flex w-12 flex-shrink-0 flex-col items-center rounded-xl border border-black/[0.06] bg-white dark:bg-[#252931] dark:border-white/[0.06] py-2 shadow-sm">
                    <span className="text-[11px] font-bold uppercase text-emerald-600">{day.toLocaleDateString(i18n.language, { month: "short" }).toUpperCase().slice(0, 3)}</span>
                    <span className="text-xl font-extrabold text-[#17211f] dark:text-white leading-none">{day.getDate()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-[#17211f] dark:text-white">{m.title}</h4>
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${tagColor(m.tag_color)}`}>{m.tag}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-sm text-[#717182]">
                      <Clock size={13} /> {fmtTime(m.start_at)} — {fmtTime(m.end_at)}{m.location ? ` · ${m.location}` : ""}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      {m.attendees.slice(0, 3).map((a) => (
                        <span key={a} className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white ${avatarColor(a)}`} title={a}>
                          {initials(a)}
                        </span>
                      ))}
                      {m.attendees.length > 3 && (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/[0.06] dark:bg-white/[0.08] text-[11px] font-bold text-[#717182]">+{m.attendees.length - 3}</span>
                      )}
                    </div>
                    {m.ai_summary && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                        <Sparkles size={12} /> {m.ai_summary}
                      </div>
                    )}
                  </div>
                  {m.join_url ? (
                    <a href={m.join_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                      className="flex-shrink-0 flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition">
                      <Video size={14} /> {tr("meetings.join")}
                    </a>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); generateSummary.mutate(m.id); }}
                      disabled={generateSummary.isPending}
                      className="flex-shrink-0 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 transition">
                      <Sparkles size={14} /> {tr("meetings.summary")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right — AI Summary + Upcoming */}
        <div className="space-y-4">
          {/* AI Summary panel */}
          {lastSummary ? (
            <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
              <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-5 py-4">
                <h3 className="font-bold text-[#17211f] dark:text-white">{tr("meetings.crLimule", { title: lastSummary.title })}</h3>
                <p className="text-xs text-[#717182]">{new Date(lastSummary.start_at).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
              <div className="px-5 py-4 space-y-3">
                <ul className="space-y-2">
                  {lastSummary.ai_points.slice(0, 6).map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[#17211f] dark:text-white">
                      <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0 text-emerald-500" />
                      {p}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => convertToTasks.mutate(lastSummary)}
                  disabled={convertToTasks.isPending || lastSummary.ai_points.length === 0}
                  className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 disabled:opacity-50">
                  {convertToTasks.isPending ? tr("meetings.converting") : tr("meetings.convertToTasks", { count: lastSummary.ai_points.length })}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-black/[0.1] dark:border-white/[0.08] px-5 py-8 text-center">
              <Sparkles size={28} className="mx-auto text-emerald-500" />
              <p className="mt-2 text-sm font-semibold text-[#17211f] dark:text-white">{tr("meetings.noCr")}</p>
              <p className="text-xs text-[#717182]">{tr("meetings.noCrDesc")}</p>
            </div>
          )}

          {/* Selected meeting detail */}
          {selectedMeeting && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30 px-5 py-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-bold text-emerald-800 dark:text-emerald-200">{selectedMeeting.title}</h4>
                <button onClick={() => removeMeeting.mutate(selectedMeeting.id)} disabled={removeMeeting.isPending}
                  title={tr("meetings.deleteMeeting")}
                  className="grid h-7 w-7 place-items-center rounded-lg text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-500/20 disabled:opacity-50">
                  <Trash2 size={14} />
                </button>
              </div>
              <p className="text-sm text-emerald-700 dark:text-emerald-300">{fmtTime(selectedMeeting.start_at)} — {fmtTime(selectedMeeting.end_at)}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selectedMeeting.attendees.map((a) => (
                  <span key={a} className="flex items-center gap-1 rounded-full bg-white/70 dark:bg-white/10 px-2.5 py-0.5 text-xs font-medium text-[#17211f] dark:text-white">
                    <span className={`h-2 w-2 rounded-full ${avatarColor(a)}`} />{a}
                  </span>
                ))}
              </div>
              {!selectedMeeting.ai_summary && (
                <button
                  onClick={() => generateSummary.mutate(selectedMeeting.id)}
                  disabled={generateSummary.isPending}
                  className="mt-2 w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {generateSummary.isPending ? tr("meetings.generatingLimule") : tr("meetings.generateLimuleSummary")}
                </button>
              )}
            </div>
          )}

          {/* Upcoming meetings */}
          <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
            <div className="border-b border-black/[0.05] dark:border-white/[0.05] px-5 py-4">
              <h3 className="font-bold text-[#17211f] dark:text-white">{tr("meetings.upcoming")}</h3>
            </div>
            <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
              {upcoming.length === 0 && (
                <p className="px-5 py-6 text-sm text-[#717182]">{tr("meetings.nothingUpcoming")}</p>
              )}
              {upcoming.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedId(u.id)}
                  className="flex w-full items-center gap-3 px-5 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] text-left">
                  <div className="flex w-12 flex-shrink-0 flex-col items-center">
                    <span className="text-[10px] font-bold text-[#717182] uppercase">{fmtShortDate(u.start_at)}</span>
                    <span className="text-xs text-[#717182]">{fmtTime(u.start_at)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-[#17211f] dark:text-white">{u.title}</p>
                    <p className="text-xs text-[#717182]">{u.tag}</p>
                  </div>
                  <Users size={14} className="flex-shrink-0 text-[#717182]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateMeetingModal
          onClose={() => setShowCreate(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["meetings"] })}
        />
      )}
    </div>
  );
}
