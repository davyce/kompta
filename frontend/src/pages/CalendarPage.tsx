import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  MapPin,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { api, type MeetingDto } from "../services/api";
import type { Task } from "../types/domain";

type CalendarFilter = "all" | "meeting" | "task" | "priority";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const TAG_TONES: Record<string, string> = {
  violet: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200",
  rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
  sky: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
  amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function sameDay(a: Date, b: Date) {
  return dateKey(a) === dateKey(b);
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(date);
}

function displayLongDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}

function displayShortDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", month: "short" }).format(date);
}

function displayTime(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function exportIcs(meetings: MeetingDto[]) {
  const formatIcsDate = (iso: string) => {
    const date = new Date(iso);
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`;
  };
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KOMPTA//Agenda//FR"];
  for (const meeting of meetings) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:meeting-${meeting.id}@kompta`);
    lines.push(`DTSTAMP:${formatIcsDate(meeting.created_at)}`);
    lines.push(`DTSTART:${formatIcsDate(meeting.start_at)}`);
    lines.push(`DTEND:${formatIcsDate(meeting.end_at)}`);
    lines.push(`SUMMARY:${meeting.title.replace(/\n/g, " ")}`);
    if (meeting.location) lines.push(`LOCATION:${meeting.location}`);
    if (meeting.ai_summary) lines.push(`DESCRIPTION:${meeting.ai_summary.replace(/\n/g, "\\n")}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kompta-agenda.ics";
  link.click();
  URL.revokeObjectURL(url);
}

function buildMonthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function meetingTone(meeting: MeetingDto) {
  return TAG_TONES[meeting.tag_color] ?? TAG_TONES.emerald;
}

function taskTone(task: Task) {
  if (task.status === "done") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300";
  if (task.priority === "high") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300";
  if (task.status === "doing") return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300";
  return "border-slate-200 bg-white text-[#17211f] dark:border-white/10 dark:bg-white/5 dark:text-white";
}

function limuleSummary(tasks: Task[], meetings: MeetingDto[], dayLabel: string) {
  const done = tasks.filter((task) => task.status === "done").length;
  const open = tasks.filter((task) => task.status !== "done").length;
  const urgent = tasks.filter((task) => task.priority === "high" && task.status !== "done").length;
  if (!tasks.length && !meetings.length) {
    return `Limule n'a pas detecte d'echeance directe pour ${dayLabel}. Garde ce creneau pour traiter le backlog, les relances et les controles TERAS ouverts.`;
  }
  return `Limule resume ${dayLabel} : ${meetings.length} reunion(s), ${done} action(s) terminee(s), ${open} action(s) a suivre, ${urgent} priorite(s) haute(s).`;
}

function QuickMeetingModal({
  selectedDate,
  onClose,
  onCreated,
}: {
  selectedDate: Date;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    date: dateKey(selectedDate),
    start: "09:00",
    end: "10:00",
    tag: "Operations",
    tag_color: "violet",
    location: "",
    join_url: "",
    attendees: "",
    agenda: "",
  });

  const create = useMutation({
    mutationFn: () => {
      const startAt = new Date(`${form.date}T${form.start}:00`).toISOString();
      const endAt = new Date(`${form.date}T${form.end}:00`).toISOString();
      return api.createMeeting({
        title: form.title,
        start_at: startAt,
        end_at: endAt,
        tag: form.tag,
        tag_color: form.tag_color,
        location: form.location,
        join_url: form.join_url,
        agenda: form.agenda,
        attendees: form.attendees.split(",").map((item) => item.trim()).filter(Boolean),
      });
    },
    onSuccess: () => {
      onCreated();
      onClose();
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <form
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg rounded-2xl border border-black/[0.06] bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#1e2229]"
      >
        <div className="flex items-center justify-between border-b border-black/[0.05] px-5 py-4 dark:border-white/[0.06]">
          <div>
            <h3 className="font-bold text-[#17211f] dark:text-white">Nouvel evenement</h3>
            <p className="text-xs text-[#717182]">Ajoute une reunion directement dans le calendrier.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05] dark:hover:bg-white/[0.06]" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <input
            required
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Titre de la reunion"
            className="w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm outline-none focus:border-violet-300 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              type="date"
              required
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
              className="rounded-lg border border-black/[0.08] px-3 py-2 text-sm outline-none focus:border-violet-300 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
            />
            <input
              type="time"
              required
              value={form.start}
              onChange={(event) => setForm({ ...form, start: event.target.value })}
              className="rounded-lg border border-black/[0.08] px-3 py-2 text-sm outline-none focus:border-violet-300 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
            />
            <input
              type="time"
              required
              value={form.end}
              onChange={(event) => setForm({ ...form, end: event.target.value })}
              className="rounded-lg border border-black/[0.08] px-3 py-2 text-sm outline-none focus:border-violet-300 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={form.tag}
              onChange={(event) => setForm({ ...form, tag: event.target.value })}
              placeholder="Categorie"
              className="rounded-lg border border-black/[0.08] px-3 py-2 text-sm outline-none focus:border-violet-300 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
            />
            <select
              value={form.tag_color}
              onChange={(event) => setForm({ ...form, tag_color: event.target.value })}
              className="rounded-lg border border-black/[0.08] px-3 py-2 text-sm outline-none focus:border-violet-300 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
            >
              {Object.keys(TAG_TONES).map((key) => <option key={key} value={key}>{key}</option>)}
            </select>
          </div>
          <input
            value={form.location}
            onChange={(event) => setForm({ ...form, location: event.target.value })}
            placeholder="Lieu"
            className="w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm outline-none focus:border-violet-300 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
          />
          <input
            value={form.join_url}
            onChange={(event) => setForm({ ...form, join_url: event.target.value })}
            placeholder="Lien visio"
            className="w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm outline-none focus:border-violet-300 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
          />
          <input
            value={form.attendees}
            onChange={(event) => setForm({ ...form, attendees: event.target.value })}
            placeholder="Participants separes par virgules"
            className="w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm outline-none focus:border-violet-300 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
          />
          <textarea
            value={form.agenda}
            onChange={(event) => setForm({ ...form, agenda: event.target.value })}
            placeholder="Ordre du jour (facultatif) — ex : 1. Bilan commercial · 2. Recrutements · 3. Budget Q3"
            rows={3}
            className="w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm outline-none focus:border-violet-300 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white resize-none"
          />
          {create.isError && <p className="text-xs font-semibold text-rose-600">Impossible de creer cet evenement.</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/[0.05] px-5 py-4 dark:border-white/[0.06]">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
            Annuler
          </button>
          <button type="submit" disabled={create.isPending} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
            <Plus size={14} />
            {create.isPending ? "Creation..." : "Ajouter"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function CalendarPage() {
  const queryClient = useQueryClient();
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: api.tasks });
  const meetings = useQuery({ queryKey: ["meetings"], queryFn: api.meetings });
  const today = startOfDay(new Date());
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(() => dateKey(today));
  const [filter, setFilter] = useState<CalendarFilter>("all");
  const [showCreate, setShowCreate] = useState(false);

  const generateSummary = useMutation({
    mutationFn: (meetingId: number) => api.generateMeetingSummary(meetingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetings"] }),
  });

  const removeMeeting = useMutation({
    mutationFn: (meetingId: number) => api.deleteMeeting(meetingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetings"] }),
  });

  const convertMeetingToTasks = useMutation({
    mutationFn: async (meeting: MeetingDto) => {
      for (const point of meeting.ai_points) {
        await api.createTask({
          title: point.length > 140 ? `${point.slice(0, 137)}...` : point,
          source: `meeting:${meeting.id}`,
          due_date: meeting.start_at.slice(0, 10),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
    },
  });

  const monthDays = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks.data ?? []) {
      if (!task.due_date) continue;
      const key = task.due_date.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    return map;
  }, [tasks.data]);

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, MeetingDto[]>();
    for (const meeting of meetings.data ?? []) {
      const key = dateKey(new Date(meeting.start_at));
      map.set(key, [...(map.get(key) ?? []), meeting]);
    }
    for (const [key, rows] of map.entries()) {
      map.set(key, [...rows].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()));
    }
    return map;
  }, [meetings.data]);

  const selectedDate = useMemo(() => {
    const [year, month, day] = selectedKey.split("-").map(Number);
    return new Date(year, month - 1, day);
  }, [selectedKey]);

  const selectedTasks = tasksByDay.get(selectedKey) ?? [];
  const selectedMeetings = meetingsByDay.get(selectedKey) ?? [];
  const unscheduled = (tasks.data ?? []).filter((task) => !task.due_date && task.status !== "done").slice(0, 5);
  const monthKeys = new Set(monthDays.filter((day) => sameMonth(day, visibleMonth)).map(dateKey));
  const monthTasks = (tasks.data ?? []).filter((task) => task.due_date && monthKeys.has(task.due_date.slice(0, 10)));
  const monthMeetings = (meetings.data ?? []).filter((meeting) => monthKeys.has(dateKey(new Date(meeting.start_at))));
  const monthUrgent = monthTasks.filter((task) => task.priority === "high" && task.status !== "done");

  function moveMonth(delta: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function goToday() {
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedKey(dateKey(today));
  }

  function showMeeting() {
    return filter === "all" || filter === "meeting";
  }

  function showTask(task?: Task) {
    if (filter === "all" || filter === "task") return true;
    return filter === "priority" && task?.priority === "high" && task.status !== "done";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-violet-600">Agenda Limule</p>
          <h1 className="text-3xl font-extrabold text-[#17211f] dark:text-white">Agenda</h1>
          <p className="mt-1 text-sm text-[#717182]">Calendrier, reunions, taches, comptes-rendus et synthese journaliere.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => exportIcs(meetings.data ?? [])}
            disabled={!meetings.data?.length}
            className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm font-semibold text-[#17211f] transition hover:bg-black/[0.03] disabled:opacity-50 dark:border-white/10 dark:bg-[#1e2229] dark:text-white dark:hover:bg-white/[0.06]"
          >
            <Download size={15} />
            Export .ics
          </button>
          <button
            onClick={goToday}
            className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm font-semibold text-[#17211f] transition hover:bg-black/[0.03] dark:border-white/10 dark:bg-[#1e2229] dark:text-white dark:hover:bg-white/[0.06]"
          >
            Aujourd'hui
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
          >
            <Plus size={15} />
            Reunion
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Reunions ce mois", value: monthMeetings.length, icon: CalendarDays, tone: "text-violet-600" },
          { label: "Taches planifiees", value: monthTasks.length, icon: Target, tone: "text-emerald-600" },
          { label: "Priorites hautes", value: monthUrgent.length, icon: AlertTriangle, tone: "text-rose-600" },
          { label: "Sans date", value: unscheduled.length, icon: Clock, tone: "text-amber-600" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-black/[0.06] bg-white px-4 py-3 dark:border-white/[0.08] dark:bg-[#1e2229]">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#717182]">
                <Icon size={15} className={item.tone} />
                {item.label}
              </div>
              <p className="mt-2 text-2xl font-black text-[#17211f] dark:text-white">{item.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white dark:border-white/[0.08] dark:bg-[#1e2229]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.05] px-5 py-4 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <button
                onClick={() => moveMonth(-1)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-black/[0.08] text-[#717182] transition hover:bg-black/[0.04] dark:border-white/10 dark:hover:bg-white/[0.06]"
                aria-label="Mois precedent"
              >
                <ChevronLeft size={17} />
              </button>
              <div className="min-w-48 text-center">
                <h2 className="capitalize text-xl font-black text-[#17211f] dark:text-white">{monthLabel(visibleMonth)}</h2>
                <p className="text-xs text-[#717182]">Vue mensuelle</p>
              </div>
              <button
                onClick={() => moveMonth(1)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-black/[0.08] text-[#717182] transition hover:bg-black/[0.04] dark:border-white/10 dark:hover:bg-white/[0.06]"
                aria-label="Mois suivant"
              >
                <ChevronRight size={17} />
              </button>
            </div>

            <div className="flex flex-wrap gap-1 rounded-xl bg-[#f3f4f8] p-1 dark:bg-white/[0.05]">
              {[
                { key: "all", label: "Tout" },
                { key: "meeting", label: "Reunions" },
                { key: "task", label: "Taches" },
                { key: "priority", label: "Priorites" },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setFilter(item.key as CalendarFilter)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    filter === item.key
                      ? "bg-white text-violet-700 shadow-sm dark:bg-[#252931] dark:text-violet-200"
                      : "text-[#717182] hover:text-[#17211f] dark:hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-black/[0.05] bg-[#fbfbfd] dark:border-white/[0.06] dark:bg-white/[0.03]">
            {WEEKDAYS.map((day) => (
              <div key={day} className="px-3 py-2 text-center text-[11px] font-black uppercase tracking-wide text-[#717182]">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {monthDays.map((day) => {
              const key = dateKey(day);
              const dayTasks = tasksByDay.get(key) ?? [];
              const dayMeetings = meetingsByDay.get(key) ?? [];
              const highPriority = dayTasks.some((task) => task.priority === "high" && task.status !== "done");
              const isSelected = key === selectedKey;
              const isToday = sameDay(day, today);
              const inMonth = sameMonth(day, visibleMonth);
              const visibleTasks = dayTasks.filter(showTask);
              const visibleMeetings = showMeeting() ? dayMeetings : [];
              const visibleItems = visibleMeetings.length + visibleTasks.length;

              return (
                <button
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`min-h-32 border-b border-r border-black/[0.05] p-2 text-left transition last:border-r-0 dark:border-white/[0.05] ${
                    isSelected
                      ? "bg-violet-50 ring-2 ring-inset ring-violet-300 dark:bg-violet-500/15 dark:ring-violet-500/50"
                      : inMonth
                        ? "bg-white hover:bg-[#fbfbfd] dark:bg-[#1e2229] dark:hover:bg-white/[0.04]"
                        : "bg-[#f7f8fb] text-[#717182] dark:bg-[#171a21]"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-1">
                    <span className={`grid h-7 w-7 place-items-center rounded-full text-sm font-black ${
                      isToday
                        ? "bg-violet-600 text-white"
                        : inMonth
                          ? "text-[#17211f] dark:text-white"
                          : "text-[#9a9aa3]"
                    }`}>
                      {day.getDate()}
                    </span>
                    {highPriority ? <span className="h-2 w-2 rounded-full bg-rose-500" /> : null}
                  </div>

                  <div className="space-y-1">
                    {visibleMeetings.slice(0, 2).map((meeting) => (
                      <div key={`meeting-${meeting.id}`} className={`truncate rounded-md border px-2 py-1 text-[11px] font-bold ${meetingTone(meeting)}`}>
                        {displayTime(meeting.start_at)} · {meeting.title}
                      </div>
                    ))}
                    {visibleTasks.slice(0, 2).map((task) => (
                      <div key={`task-${task.id}`} className={`truncate rounded-md border px-2 py-1 text-[11px] font-bold ${taskTone(task)}`}>
                        {task.title}
                      </div>
                    ))}
                    {visibleItems > 4 && (
                      <p className="px-1 text-[11px] font-bold text-violet-600">+{visibleItems - 4} autres</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-500/30 dark:bg-violet-500/10">
            <div className="flex items-center gap-2 text-violet-700 dark:text-violet-200">
              <Sparkles size={18} />
              <h2 className="font-bold">Resume Limule</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#17211f] dark:text-white">
              {limuleSummary(selectedTasks, selectedMeetings, displayLongDate(selectedDate))}
            </p>
          </section>

          <section className="rounded-2xl border border-black/[0.06] bg-white dark:border-white/[0.08] dark:bg-[#1e2229]">
            <div className="flex items-start justify-between gap-3 border-b border-black/[0.05] px-5 py-4 dark:border-white/[0.06]">
              <div>
                <p className="text-xs font-bold uppercase text-[#717182]">Jour selectionne</p>
                <h2 className="mt-1 font-bold capitalize text-[#17211f] dark:text-white">{displayLongDate(selectedDate)}</h2>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="grid h-8 w-8 place-items-center rounded-lg bg-violet-600 text-white transition hover:bg-violet-700"
                aria-label="Ajouter un evenement"
              >
                <Plus size={15} />
              </button>
            </div>

            <div className="space-y-5 p-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <CalendarDays size={16} className="text-violet-600" />
                  <h3 className="font-bold text-[#17211f] dark:text-white">Reunions</h3>
                </div>
                <div className="space-y-2">
                  {selectedMeetings.map((meeting) => (
                    <article key={meeting.id} className={`rounded-xl border p-3 ${meetingTone(meeting)}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold">{meeting.title}</p>
                          <p className="mt-1 flex items-center gap-1 text-xs opacity-80">
                            <Clock size={12} />
                            {displayTime(meeting.start_at)} - {displayTime(meeting.end_at)}
                          </p>
                        </div>
                        <span className="rounded-md bg-white/60 px-2 py-0.5 text-[10px] font-bold dark:bg-white/10">{meeting.tag}</span>
                      </div>
                  {meeting.location ? (
                    <p className="mt-2 flex items-center gap-1 text-xs opacity-80">
                      <MapPin size={12} />
                      {meeting.location}
                    </p>
                  ) : null}
                      {meeting.ai_summary ? (
                        <div className="mt-3 rounded-lg bg-white/60 p-2 text-xs leading-5 dark:bg-white/10">
                          <div className="mb-1 flex items-center gap-1 font-bold">
                            <Sparkles size={12} />
                            Resume Limule
                          </div>
                          <p>{meeting.ai_summary}</p>
                          {meeting.ai_points.length > 0 ? (
                            <ul className="mt-2 space-y-1">
                              {meeting.ai_points.slice(0, 3).map((point, index) => (
                                <li key={`${meeting.id}-${index}`} className="flex gap-1">
                                  <span>•</span>
                                  <span>{point}</span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {meeting.join_url ? (
                          <a href={meeting.join_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs font-bold underline dark:bg-white/10">
                            <Video size={12} />
                            Rejoindre
                          </a>
                        ) : null}
                        <button
                          onClick={() => generateSummary.mutate(meeting.id)}
                          disabled={generateSummary.isPending}
                          className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs font-bold transition hover:bg-white disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/15"
                        >
                          <Sparkles size={12} />
                          {meeting.ai_summary ? "Regenerer" : "Resume"}
                        </button>
                        {meeting.ai_points.length > 0 ? (
                          <button
                            onClick={() => convertMeetingToTasks.mutate(meeting)}
                            disabled={convertMeetingToTasks.isPending}
                            className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs font-bold transition hover:bg-white disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/15"
                          >
                            <Target size={12} />
                            Convertir en taches
                          </button>
                        ) : null}
                        <button
                          onClick={() => removeMeeting.mutate(meeting.id)}
                          disabled={removeMeeting.isPending}
                          className="ml-auto inline-flex items-center gap-1 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:bg-white/10 dark:hover:bg-rose-500/10"
                          aria-label="Supprimer la reunion"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </article>
                  ))}
                  {!selectedMeetings.length && <p className="rounded-xl border border-dashed border-black/[0.08] px-3 py-6 text-center text-sm text-[#717182] dark:border-white/10">Aucune reunion ce jour.</p>}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Target size={16} className="text-emerald-600" />
                  <h3 className="font-bold text-[#17211f] dark:text-white">Taches</h3>
                </div>
                <div className="space-y-2">
                  {selectedTasks.map((task) => (
                    <article key={task.id} className={`rounded-xl border p-3 ${taskTone(task)}`}>
                      <div className="flex items-start gap-3">
                        {task.status === "done" ? <CheckCircle2 size={18} /> : task.status === "doing" ? <Clock size={18} /> : <Target size={18} />}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold">{task.title}</p>
                          <p className="mt-1 text-xs opacity-70">{task.assignee_name || "Non assigne"} · {task.priority}</p>
                        </div>
                      </div>
                    </article>
                  ))}
                  {!selectedTasks.length && <p className="rounded-xl border border-dashed border-black/[0.08] px-3 py-6 text-center text-sm text-[#717182] dark:border-white/10">Aucune tache planifiee ce jour.</p>}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-black/[0.06] bg-white p-4 dark:border-white/[0.08] dark:bg-[#1e2229]">
            <div className="flex items-center gap-2">
              <Users size={17} className="text-[#717182]" />
              <h2 className="font-bold text-[#17211f] dark:text-white">Taches sans date</h2>
            </div>
            <div className="mt-3 space-y-2">
              {unscheduled.map((task) => (
                <p key={task.id} className="truncate rounded-lg bg-[#f6f7fb] px-3 py-2 text-sm font-semibold text-[#17211f] dark:bg-white/5 dark:text-white">
                  {task.title}
                </p>
              ))}
              {!unscheduled.length && <p className="text-sm text-[#717182]">Aucun element en attente sans date.</p>}
            </div>
          </section>
        </aside>
      </div>

      {showCreate ? (
        <QuickMeetingModal
          selectedDate={selectedDate}
          onClose={() => setShowCreate(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["meetings"] })}
        />
      ) : null}
    </div>
  );
}
