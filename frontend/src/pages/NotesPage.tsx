import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenText, Calendar, CheckCircle2, Clock, Download, FileText, Pin, PinOff,
  Plus, Save, Sparkles, Target, Trash2, X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";

import { api, type DailyNoteDto, type MeetingDto } from "../services/api";
import { LimuleIcon } from "../components/LimuleAvatar";
import type { Task } from "../types/domain";

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
function longDate(date: Date) {
  return new Intl.DateTimeFormat(i18n.language, { weekday: "long", day: "numeric", month: "long" }).format(date);
}
function shortDateLabel(iso: string) {
  return new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "short" }).format(new Date(iso));
}
function downloadNote(note: DailyNoteDto) {
  const md = `# ${note.title || "Note"} — ${shortDateLabel(note.note_date)}\n\n${note.body}\n`;
  const blob = new Blob([md], { type: "text/markdown" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `note-${note.note_date}-${note.id}.md`; a.click();
}

function parseNoteSections(body: string) {
  const sections: Array<{ title: string; items: string[] }> = [];
  let current: { title: string; items: string[] } | null = null;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("# ")) continue;
    if (line.startsWith("## ")) {
      current = { title: line.replace(/^##\s*/, ""), items: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { title: i18n.t("notes.synthese"), items: [] };
      sections.push(current);
    }
    current.items.push(line.replace(/^- \[[ x]\]\s*/i, "").replace(/^-\s*/, ""));
  }
  return sections;
}

function LimuleNotePreview({ note }: { note: DailyNoteDto | null }) {
  const { t: tr } = useTranslation();
  if (!note) return null;
  const sections = parseNoteSections(note.body).slice(0, 4);
  return (
    <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white dark:border-violet-500/30 dark:bg-[#1e2229]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-violet-100 bg-violet-50 px-5 py-4 dark:border-violet-500/20 dark:bg-violet-500/10">
        <div>
          <div className="flex items-center gap-2 text-violet-700 dark:text-violet-200">
            <Sparkles size={18} />
            <h2 className="font-black">{tr("notes.latestLimuleNote")}</h2>
          </div>
          <p className="mt-1 text-sm text-[#717182]">{note.title} · {shortDateLabel(note.note_date)}</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-violet-700 shadow-sm dark:bg-white/10 dark:text-violet-200">{tr("notes.aiJournal")}</span>
      </div>
      <div className="grid gap-3 p-4 lg:grid-cols-4">
        {sections.map((section) => (
          <div key={section.title} className="rounded-xl border border-black/[0.06] bg-[#fbfbfd] p-3 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-xs font-black uppercase tracking-wide text-violet-600">{section.title}</p>
            <div className="mt-2 space-y-1.5">
              {section.items.slice(0, 3).map((item, index) => (
                <p key={`${section.title}-${index}`} className="text-sm leading-5 text-[#17211f] dark:text-white">
                  {item.includes("_") ? item.replace(/_/g, "") : item}
                </p>
              ))}
              {!section.items.length && <p className="text-sm text-[#717182]">{tr("notes.noItems")}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Auto-generated journal entry from tasks + meetings ── */
function buildAutoEntry(date: Date, tasks: Task[], meetings: MeetingDto[]) {
  const key = dayKey(date);
  const due = tasks.filter((t) => (t.due_date?.slice(0, 10) ?? "") === key);
  const completed = due.filter((t) => t.status === "done");
  const planned = due.filter((t) => t.status !== "done");
  const urgent = planned.filter((t) => t.priority === "high");
  const focus = planned[0] ?? urgent[0];
  const dayMeetings = meetings.filter((m) => (m.start_at ?? "").slice(0, 10) === key);
  return {
    key,
    date,
    completed,
    planned,
    urgent,
    meetings: dayMeetings,
    summary:
      due.length > 0 || dayMeetings.length > 0
        ? i18n.t("notes.autoSummaryActivity", { completed: completed.length, planned: planned.length, urgent: urgent.length, meetings: dayMeetings.length })
        : i18n.t("notes.autoSummaryNone"),
    next: focus?.title ?? i18n.t("notes.nextDefault"),
  };
}

/* ── Note editor modal ────────────────────────────────────────────── */
function NoteEditor({ note, onClose, onSaved }: {
  note: DailyNoteDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t: tr } = useTranslation();
  const isEdit = note !== null;
  const [form, setForm] = useState({
    note_date: note?.note_date ?? new Date().toISOString().slice(0, 10),
    title: note?.title ?? "",
    body: note?.body ?? "",
    pinned: note?.pinned ?? false,
  });
  const create = useMutation({
    mutationFn: () => api.createNote({ note_date: form.note_date, title: form.title, body: form.body, pinned: form.pinned }),
    onSuccess: () => { onSaved(); onClose(); },
  });
  const update = useMutation({
    mutationFn: () => api.updateNote(note!.id, { title: form.title, body: form.body, pinned: form.pinned }),
    onSuccess: () => { onSaved(); onClose(); },
  });
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isEdit) update.mutate(); else create.mutate();
  }
  const pending = create.isPending || update.isPending;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit}
        className="w-full max-w-2xl rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] shadow-2xl">
        <div className="flex items-center justify-between border-b border-black/[0.05] px-5 py-4 dark:border-white/[0.05]">
          <h3 className="font-bold text-[#17211f] dark:text-white">
            {isEdit ? tr("notes.editNote") : tr("notes.newNote")}
          </h3>
          <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.04]"><X size={15} /></button>
        </div>
        <div className="space-y-3 p-5">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input type="date" required value={form.note_date} onChange={(e) => setForm({ ...form, note_date: e.target.value })}
              disabled={isEdit}
              className="rounded-lg border border-black/[0.08] dark:border-white/[0.08] dark:bg-[#252931] px-3 py-2 text-sm" />
            <button type="button" onClick={() => setForm({ ...form, pinned: !form.pinned })}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition ${form.pinned ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-200" : "border-black/[0.08] text-[#717182]"}`}>
              {form.pinned ? <Pin size={14} /> : <PinOff size={14} />}
              {form.pinned ? tr("notes.pinned") : tr("notes.pin")}
            </button>
          </div>
          <input placeholder={tr("notes.titleOptional")} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] dark:bg-[#252931] px-3 py-2 text-sm" />
          <textarea required placeholder={tr("notes.bodyPlaceholder")}
            value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={12}
            className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] dark:bg-[#252931] px-3 py-2 text-sm font-mono leading-6" />
          {(create.isError || update.isError) && (
            <p className="text-xs text-rose-600">{tr("notes.saveError")}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-black/[0.05] px-5 py-3 dark:border-white/[0.05]">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-semibold text-[#717182] hover:bg-black/[0.04]">{tr("common.cancel")}</button>
          <button type="submit" disabled={pending}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            <Save size={14} /> {pending ? tr("notes.saving") : tr("notes.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────── */
export function NotesPage() {
  const { t: tr } = useTranslation();
  const queryClient = useQueryClient();
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: api.tasks });
  const notesQuery = useQuery({ queryKey: ["notes"], queryFn: api.notes });
  const meetingsQuery = useQuery({ queryKey: ["meetings"], queryFn: api.meetings });
  const [selectedKey, setSelectedKey] = useState(() => dayKey(new Date()));
  const [editor, setEditor] = useState<{ open: boolean; note: DailyNoteDto | null }>({ open: false, note: null });

  const generate = useMutation({
    mutationFn: () => api.generateDailyNote(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
  });
  const togglePin = useMutation({
    mutationFn: (n: DailyNoteDto) => api.updateNote(n.id, { pinned: !n.pinned }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
  });
  const removeNote = useMutation({
    mutationFn: (id: number) => api.deleteNote(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
  });

  // Auto-generated 7-day journal from tasks + meetings
  const autoEntries = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      return buildAutoEntry(d, tasks.data ?? [], meetingsQuery.data ?? []);
    });
  }, [tasks.data, meetingsQuery.data]);

  const selectedAuto = autoEntries.find((e) => e.key === selectedKey) ?? autoEntries[0];
  const allNotes = notesQuery.data ?? [];
  const pinnedNotes = allNotes.filter((n) => n.pinned);
  const recentNotes = allNotes.filter((n) => !n.pinned).slice(0, 12);
  const latestLimuleNote = allNotes.find((note) => note.ai_generated) ?? null;
  const activeTasks = (tasks.data ?? []).filter((t) => t.status !== "done");
  const completedTasks = (tasks.data ?? []).filter((t) => t.status === "done");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-violet-600">{tr("notes.eyebrow")}</p>
          <h1 className="text-3xl font-extrabold text-[#17211f] dark:text-white">{tr("notes.title")}</h1>
          <p className="mt-1 text-sm text-[#717182]">{tr("notes.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 dark:bg-violet-500/15 dark:border-violet-500/30 dark:text-violet-200 hover:bg-violet-100 disabled:opacity-50">
            <LimuleIcon size={15} /> {generate.isPending ? tr("notes.limuleLoading") : tr("notes.limuleBtn")}
          </button>
          <button
            onClick={() => setEditor({ open: true, note: null })}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition">
            <Plus size={15} /> {tr("notes.newNoteBtn")}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: tr("notes.kpiMyNotes"), value: allNotes.length, icon: FileText },
          { label: tr("notes.kpiPinned"), value: pinnedNotes.length, icon: Pin },
          { label: tr("notes.kpiActiveTasks"), value: activeTasks.length, icon: Target },
          { label: tr("notes.kpiDoneTasks"), value: completedTasks.length, icon: CheckCircle2 },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-xl border border-black/[0.06] bg-white px-3 py-2 dark:border-white/10 dark:bg-[#1e2229]">
              <div className="flex items-center gap-1.5 text-xs text-[#717182]">
                <Icon size={13} />{item.label}
              </div>
              <p className="mt-1 text-lg font-black text-[#17211f] dark:text-white">{item.value}</p>
            </div>
          );
        })}
      </div>

      <LimuleNotePreview note={latestLimuleNote} />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">

        {/* LEFT — Mes notes (user-written + AI-generated) */}
        <aside className="rounded-2xl border border-black/[0.06] bg-white p-3 dark:border-white/[0.08] dark:bg-[#1e2229] h-fit">
          <div className="mb-3 flex items-center gap-2 px-2 pt-1">
            <BookOpenText size={17} className="text-violet-600" />
            <h2 className="font-bold text-[#17211f] dark:text-white">{tr("notes.myNotes")}</h2>
          </div>

          {pinnedNotes.length > 0 && (
            <>
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-600">{tr("notes.pinnedSection")}</p>
              <div className="space-y-1.5 mb-3">
                {pinnedNotes.map((n) => (
                  <NoteRow key={n.id} note={n} onSelect={() => setEditor({ open: true, note: n })}
                    onPin={() => togglePin.mutate(n)} onDelete={() => removeNote.mutate(n.id)}
                    onDownload={() => downloadNote(n)} />
                ))}
              </div>
            </>
          )}

          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#717182]">{tr("notes.recent")}</p>
          <div className="space-y-1.5">
            {notesQuery.isLoading && <p className="px-2 py-2 text-xs text-[#717182]">{tr("notes.loading")}</p>}
            {!notesQuery.isLoading && recentNotes.length === 0 && pinnedNotes.length === 0 && (
              <div className="rounded-xl border border-dashed border-black/[0.1] dark:border-white/[0.08] px-3 py-6 text-center">
                <p className="text-sm text-[#717182]">{tr("notes.noNotesYet")}</p>
                <button onClick={() => setEditor({ open: true, note: null })} className="mt-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700">{tr("notes.createFirst")}</button>
              </div>
            )}
            {recentNotes.map((n) => (
              <NoteRow key={n.id} note={n} onSelect={() => setEditor({ open: true, note: n })}
                onPin={() => togglePin.mutate(n)} onDelete={() => removeNote.mutate(n.id)}
                onDownload={() => downloadNote(n)} />
            ))}
          </div>
        </aside>

        {/* RIGHT — Limule auto-journal */}
        <section className="rounded-2xl border border-black/[0.06] bg-white dark:border-white/[0.08] dark:bg-[#1e2229]">
          <div className="border-b border-black/[0.05] px-6 py-5 dark:border-white/[0.06]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-violet-600">{tr("notes.autoJournal")}</p>
                <h2 className="mt-1 text-2xl font-black text-[#17211f] dark:text-white">{longDate(selectedAuto.date)}</h2>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {autoEntries.map((e) => (
                  <button key={e.key} onClick={() => setSelectedKey(e.key)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${selectedKey === e.key ? "bg-violet-600 text-white" : "bg-black/[0.04] text-[#717182] dark:bg-white/[0.06]"}`}>
                    {e.date.toLocaleDateString(i18n.language, { weekday: "short", day: "2-digit" })}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-5 p-6 xl:grid-cols-[1fr_320px]">
            <article className="space-y-5">
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-500/30 dark:bg-violet-500/10">
                <div className="flex items-center gap-2 text-violet-700 dark:text-violet-200">
                  <Sparkles size={18} />
                  <h3 className="font-bold">{tr("notes.daySummary")}</h3>
                </div>
                <p className="mt-3 text-sm leading-7 text-[#17211f] dark:text-white">{selectedAuto.summary}</p>
              </div>

              {selectedAuto.meetings.length > 0 && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-500/30 dark:bg-sky-500/10">
                  <div className="flex items-center gap-2 text-sky-600 dark:text-sky-300">
                    <Calendar size={17} /><h3 className="font-bold">{tr("notes.meetings")}</h3>
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedAuto.meetings.map((m) => (
                      <div key={m.id} className="rounded-lg bg-white px-3 py-2 text-sm dark:bg-sky-500/10">
                        <p className="font-semibold text-[#17211f] dark:text-white">
                          {m.start_at ? new Date(m.start_at).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }) : ""} — {m.title}
                        </p>
                        {m.tag && <p className="text-xs text-[#717182]">{m.tag}</p>}
                        {m.ai_summary && <p className="mt-1 text-xs text-[#717182] line-clamp-2">{m.ai_summary}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-black/[0.06] p-4 dark:border-white/10">
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 size={17} /><h3 className="font-bold">{tr("notes.doneSection")}</h3>
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedAuto.completed.map((task) => (
                      <p key={task.id} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">{task.title}</p>
                    ))}
                    {!selectedAuto.completed.length && <p className="text-sm text-[#717182]">{tr("notes.noTaskDone")}</p>}
                  </div>
                </div>
                <div className="rounded-xl border border-black/[0.06] p-4 dark:border-white/10">
                  <div className="flex items-center gap-2 text-violet-600">
                    <Clock size={17} /><h3 className="font-bold">{tr("notes.scheduled")}</h3>
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedAuto.planned.map((task) => (
                      <p key={task.id} className="rounded-lg bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 dark:bg-violet-500/10 dark:text-violet-300">{task.title}</p>
                    ))}
                    {!selectedAuto.planned.length && <p className="text-sm text-[#717182]">{tr("notes.nothingPlanned")}</p>}
                  </div>
                </div>
              </div>
            </article>

            <aside className="space-y-4">
              <div className="rounded-xl border border-black/[0.06] bg-[#fbfbfd] p-4 dark:border-white/10 dark:bg-white/5">
                <h3 className="font-bold text-[#17211f] dark:text-white">{tr("notes.nextAction")}</h3>
                <p className="mt-2 text-sm leading-6 text-[#717182]">{selectedAuto.next}</p>
              </div>
              <div className="rounded-xl border border-black/[0.06] bg-[#fbfbfd] p-4 dark:border-white/10 dark:bg-white/5">
                <h3 className="font-bold text-[#17211f] dark:text-white">{tr("notes.watchPoints")}</h3>
                <div className="mt-3 space-y-2">
                  {(selectedAuto.urgent.length ? selectedAuto.urgent : activeTasks.slice(0, 3)).map((task) => (
                    <p key={task.id} className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{task.title}</p>
                  ))}
                  {!activeTasks.length && <p className="text-sm text-[#717182]">{tr("notes.noWatch")}</p>}
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>

      {editor.open && (
        <NoteEditor
          note={editor.note}
          onClose={() => setEditor({ open: false, note: null })}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["notes"] })}
        />
      )}
    </div>
  );
}

/* ── Single note row ──────────────────────────────────────────────── */
function NoteRow({
  note, onSelect, onPin, onDelete, onDownload,
}: {
  note: DailyNoteDto;
  onSelect: () => void; onPin: () => void; onDelete: () => void; onDownload: () => void;
}) {
  const { t: tr } = useTranslation();
  const [showActions, setShowActions] = useState(false);
  return (
    <div
      className="group rounded-xl border border-transparent bg-[#f7f8fb] dark:bg-white/5 p-3 hover:border-violet-200 dark:hover:border-violet-500/40 transition cursor-pointer"
      onClick={onSelect}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-[#17211f] dark:text-white truncate">{note.title || tr("notes.untitled")}</p>
        <span className="text-[10px] font-bold text-[#717182] flex-shrink-0">{shortDateLabel(note.note_date)}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-[#717182]">{note.body.slice(0, 140)}</p>
      <div className={`mt-2 flex gap-1 ${showActions ? "" : "opacity-0 group-hover:opacity-100"} transition`} onClick={(e) => e.stopPropagation()}>
        <button onClick={onPin} title={note.pinned ? tr("notes.unpin") : tr("notes.pin")}
          className="grid h-6 w-6 place-items-center rounded text-[#717182] hover:bg-black/[0.04]">
          {note.pinned ? <Pin size={11} className="text-violet-600" /> : <PinOff size={11} />}
        </button>
        <button onClick={onDownload} title={tr("notes.download")}
          className="grid h-6 w-6 place-items-center rounded text-[#717182] hover:bg-black/[0.04]"><Download size={11} /></button>
        <button onClick={onDelete} title={tr("notes.delete")}
          className="grid h-6 w-6 place-items-center rounded text-rose-600 hover:bg-rose-50"><Trash2 size={11} /></button>
        {note.ai_generated && <span className="ml-auto rounded-full bg-violet-100 dark:bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-bold text-violet-700 dark:text-violet-300">Limule</span>}
      </div>
    </div>
  );
}
