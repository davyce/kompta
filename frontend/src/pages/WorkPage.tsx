import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { FormEvent, useRef, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ChevronRight,
  Clock3, FileText, Filter, Image, Lock, MessageSquarePlus, PlusCircle,
  Search, ShieldCheck, Trash2, Upload, User2, X, Video,
} from "lucide-react";

import { SelectInput, TextArea, TextInput } from "../components/FormField";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { api } from "../services/api";
import i18n from "../i18n";
import type { Task } from "../types/domain";

/* ── Constantes ─────────────────────────────────────────────────────────── */
const STATUS_FLOW: Record<string, string> = { todo: "doing", doing: "done" };
const STATUS_LABEL: Record<string, string> = {
  todo: "work.status.todo",
  doing: "work.status.doing",
  done: "work.status.done",
};
const STATUS_COLOR: Record<string, string> = {
  todo: "bg-stone-100 text-stone-600",
  doing: "bg-blue-50 text-blue-700",
  done: "bg-emerald-50 text-emerald-700",
};
const PRIORITY_LABEL: Record<string, string> = {
  high: "work.priority.high",
  normal: "work.priority.normal",
  low: "work.priority.low",
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function isOverdue(due: string | null, status: string) {
  if (!due || status === "done") return false;
  return new Date(due) < new Date();
}

function labelFromMap(map: Record<string, string>, value: string, tr: TFunction) {
  return map[value] ? tr(map[value]) : value;
}

function priorityLabel(priority: string, tr: TFunction) {
  return labelFromMap(PRIORITY_LABEL, priority, tr);
}

function workDateTime(date: string | null, time?: string | null): string {
  if (!date) return "—";
  const datePart = new Intl.DateTimeFormat(i18n.language, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
  if (!time) return datePart;
  return `${datePart} · ${time.slice(0, 5)}`;
}

function renderDescription(text: string, tr: TFunction) {
  if (!text?.trim()) return <p className="text-sm italic text-stone-400">{tr("work.taskDetail.noDescription")}</p>;
  return (
    <div className="space-y-1.5">
      {text.split("\n").map((line, i) =>
        line.startsWith("•") ? (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-1 shrink-0 text-[9px] text-emerald-500">▸</span>
            <span className="text-sm leading-snug text-[#17211f]">{line.slice(1).trim()}</span>
          </div>
        ) : line.trim() ? (
          <p key={i} className="text-sm leading-relaxed text-[#17211f]">{line}</p>
        ) : <div key={i} className="h-1" />
      )}
    </div>
  );
}

function fileIsVideo(url: string) {
  return /\.(mp4|mov|webm|mpeg)$/i.test(url);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export function WorkPage() {
  const { t: tr } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { confirm } = useConfirm();
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: api.tasks });
  const channels = useQuery({ queryKey: ["channels"], queryFn: api.channels });
  const channelId = channels.data?.[0]?.id;
  const messages = useQuery({
    queryKey: ["messages", channelId],
    queryFn: () => api.messages(channelId!),
    enabled: Boolean(channelId),
  });

  /* ── Formulaire création ── */
  const [taskForm, setTaskForm] = useState({ title: "", assignee_name: "", priority: "normal", due_date: "", due_time: "" });
  const [message, setMessage] = useState("");

  /* ── Filtres / recherche ── */
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<"all" | "high" | "normal" | "low">("all");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [doneLimit, setDoneLimit] = useState(5);
  const [showFilters, setShowFilters] = useState(false);

  /* ── Modal détail ── */
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Mutations ── */
  const createTask = useMutation({
    mutationFn: api.createTask,
    onSuccess: () => {
      setTaskForm({ title: "", assignee_name: "", priority: "normal", due_date: "", due_time: "" });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const updateTask = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.updateTask(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteTask = useMutation({
    mutationFn: api.deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setSelectedTask(null);
    },
  });

  async function handleDeleteSelectedTask() {
    if (!selectedTask) return;
    const ok = await confirm({
      title: tr("work.confirmDelete.title"),
      message: selectedTask.title,
      confirmLabel: tr("common.delete"),
      danger: true,
    });
    if (ok) deleteTask.mutate(selectedTask.id);
  }

  const send = useMutation({
    mutationFn: (body: string) => api.sendMessage(channelId!, body),
    onSuccess: () => { setMessage(""); queryClient.invalidateQueries({ queryKey: ["messages", channelId] }); },
  });

  /* ── Fonctions ── */
  function submitTask(e: FormEvent) {
    e.preventDefault();
    if (!taskForm.title.trim()) return;
    createTask.mutate({
      ...taskForm,
      due_date: taskForm.due_date || null,
      due_time: taskForm.due_time || null,
    });
  }

  function submitMessage(e: FormEvent) {
    e.preventDefault();
    if (message.trim()) send.mutate(message);
  }

  function advanceTask(task: Task) {
    const next = STATUS_FLOW[task.status];
    if (next) updateTask.mutate({ id: task.id, status: next });
  }

  function pickProof(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setProofFile(f);
    const url = URL.createObjectURL(f);
    setProofPreview(url);
  }

  async function submitProof() {
    if (!proofFile || !selectedTask) return;
    setProofUploading(true);
    try {
      const updated = await api.uploadTaskProof(selectedTask.id, proofFile);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setSelectedTask(updated);
      setProofFile(null);
      setProofPreview(null);
    } catch {
      toast.error(tr("work.toast.proofUploadError"));
    } finally {
      setProofUploading(false);
    }
  }

  /* ── Données filtrées ── */
  const allTasks = tasks.data ?? [];

  const assignees = useMemo(() => {
    const names = new Set(allTasks.map((t) => t.assignee_name).filter(Boolean));
    return Array.from(names).sort();
  }, [allTasks]);

  const filtered = useMemo(() => {
    return allTasks.filter((t) => {
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterAssignee && t.assignee_name !== filterAssignee) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !(t.assignee_name ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allTasks, search, filterPriority, filterAssignee]);

  const grouped = useMemo(() => ({
    todo: filtered.filter((t) => t.status === "todo"),
    // "review" (statut du board Projets/Kanban) n'a pas de colonne dédiée ici —
    // regroupé avec "doing" plutôt qu'invisible pour éviter qu'une tâche
    // avancée depuis Projets ne disparaisse silencieusement du board perso.
    doing: filtered.filter((t) => t.status === "doing" || t.status === "review"),
    done: filtered.filter((t) => t.status === "done"),
  }), [filtered]);

  const activeFilterCount = (filterPriority !== "all" ? 1 : 0) + (filterAssignee ? 1 : 0);

  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <>
      {/* ── Modal détail tâche ────────────────────────────────────────── */}
      {selectedTask && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end bg-black/30 backdrop-blur-sm sm:items-center sm:justify-center"
          onClick={() => { setSelectedTask(null); setProofFile(null); setProofPreview(null); }}
        >
          <div
            className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "92vh" }}
          >
            {/* Header */}
            <div className={`shrink-0 flex items-start gap-3 px-5 py-4 ${
              selectedTask.assigned_to_me ? "bg-emerald-50 border-b border-emerald-100" : "bg-stone-50 border-b border-black/[0.05]"
            }`}>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLOR[selectedTask.status]}`}>
                    {labelFromMap(STATUS_LABEL, selectedTask.status, tr)}
                  </span>
                  <StatusBadge
                    label={priorityLabel(selectedTask.priority, tr)}
                    tone={selectedTask.priority === "high" ? "red" : "neutral"}
                  />
                  {selectedTask.assigned_to_me && (
                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">{tr("work.badges.assignedToMe")}</span>
                  )}
                  {isOverdue(selectedTask.due_date, selectedTask.status) && (
                    <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                      <AlertTriangle size={9} /> {tr("work.badges.overdue")}
                    </span>
                  )}
                </div>
                <p className="text-base font-black text-[#17211f] leading-snug">{selectedTask.title}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {selectedTask.can_delete && (
                  <button
                    onClick={handleDeleteSelectedTask}
                    className="grid h-8 w-8 place-items-center rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-500 transition"
                    title={tr("common.delete")}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
                <button
                  onClick={() => { setSelectedTask(null); setProofFile(null); setProofPreview(null); }}
                  className="grid h-8 w-8 place-items-center rounded-xl text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Corps */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Méta-infos */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex items-center gap-2 rounded-xl border border-black/[0.05] bg-stone-50 px-3 py-2.5">
                    <User2 size={14} className="shrink-0 text-stone-400" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{tr("work.taskDetail.assignee")}</p>
                    <p className="truncate text-sm font-semibold text-[#17211f]">{selectedTask.assignee_name || tr("work.taskDetail.unassigned")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-black/[0.05] bg-stone-50 px-3 py-2.5">
                  <Clock3 size={14} className="shrink-0 text-stone-400" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{tr("work.taskDetail.createdAt")}</p>
                    <p className="text-sm font-semibold text-[#17211f]">{workDateTime(selectedTask.created_at)}</p>
                  </div>
                </div>
                {selectedTask.due_date && (
                  <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                    isOverdue(selectedTask.due_date, selectedTask.status)
                      ? "border-red-200 bg-red-50"
                      : "border-black/[0.05] bg-stone-50"
                  }`}>
                    <CalendarDays size={14} className={`shrink-0 ${isOverdue(selectedTask.due_date, selectedTask.status) ? "text-red-400" : "text-stone-400"}`} />
                    <div>
                      <p className={`text-[10px] font-bold uppercase tracking-wide ${isOverdue(selectedTask.due_date, selectedTask.status) ? "text-red-400" : "text-stone-400"}`}>{tr("work.taskDetail.due")}</p>
                      <p className={`text-sm font-semibold ${isOverdue(selectedTask.due_date, selectedTask.status) ? "text-red-700" : "text-[#17211f]"}`}>
                        {workDateTime(selectedTask.due_date, selectedTask.due_time)}
                      </p>
                    </div>
                  </div>
                )}
                {selectedTask.source && (
                  <div className="flex items-center gap-2 rounded-xl border border-black/[0.05] bg-stone-50 px-3 py-2.5">
                    <FileText size={14} className="shrink-0 text-stone-400" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{tr("work.taskDetail.source")}</p>
                      <p className="text-sm font-semibold capitalize text-[#17211f]">{selectedTask.source}</p>
                    </div>
                  </div>
                )}
                {selectedTask.proof_required && (
                  <div className={`col-span-2 flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                    selectedTask.proof_url ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
                  }`}>
                    <ShieldCheck size={14} className={`shrink-0 ${selectedTask.proof_url ? "text-emerald-500" : "text-amber-500"}`} />
                    <div>
                      <p className={`text-[10px] font-bold uppercase tracking-wide ${selectedTask.proof_url ? "text-emerald-500" : "text-amber-500"}`}>{tr("work.proof.title")}</p>
                      <p className={`text-sm font-semibold ${selectedTask.proof_url ? "text-emerald-700" : "text-amber-700"}`}>
                        {selectedTask.proof_url ? tr("work.proof.deposited") : tr("work.proof.required")}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Consignes */}
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">{tr("work.taskDetail.instructions")}</p>
                <div className="rounded-xl border border-black/[0.06] bg-stone-50 px-4 py-3">
                  {renderDescription(selectedTask.description, tr)}
                </div>
              </div>

              {/* Preuve déjà déposée */}
              {selectedTask.proof_url && (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">{tr("work.proof.depositedTitle")}</p>
                  <div className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50">
                    {fileIsVideo(selectedTask.proof_url) ? (
                      <video
                        src={`${import.meta.env.VITE_API_URL ?? "http://localhost:8010"}${selectedTask.proof_url}`}
                        controls
                        className="max-h-56 w-full object-contain"
                      />
                    ) : selectedTask.proof_url.endsWith(".pdf") ? (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <FileText size={22} className="text-emerald-600" />
                        <a
                          href={`${import.meta.env.VITE_API_URL ?? "http://localhost:8010"}${selectedTask.proof_url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-emerald-700 hover:underline"
                        >
                          {tr("work.proof.viewPdf")}
                        </a>
                      </div>
                    ) : (
                      <img
                        src={`${import.meta.env.VITE_API_URL ?? "http://localhost:8010"}${selectedTask.proof_url}`}
                        alt={tr("work.proof.imageAlt")}
                        className="max-h-56 w-full object-contain"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Upload de preuve */}
              {(selectedTask.assigned_to_me || selectedTask.can_update) && (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">
                    {selectedTask.proof_url ? tr("work.proof.replace") : selectedTask.proof_required ? tr("work.proof.attachRequired") : tr("work.proof.attach")}
                  </p>

                  {/* Prévisualisation du fichier choisi */}
                  {proofPreview && proofFile && (
                    <div className="mb-3 overflow-hidden rounded-xl border border-black/[0.08] bg-stone-50">
                      {proofFile.type.startsWith("video/") ? (
                        <video src={proofPreview} controls className="max-h-40 w-full object-contain" />
                      ) : proofFile.type === "application/pdf" ? (
                        <div className="flex items-center gap-3 px-4 py-3">
                          <FileText size={20} className="text-stone-500" />
                          <span className="text-sm font-semibold text-[#17211f] truncate">{proofFile.name}</span>
                        </div>
                      ) : (
                        <img src={proofPreview} alt={tr("work.proof.previewAlt")} className="max-h-40 w-full object-contain" />
                      )}
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,application/pdf"
                    className="hidden"
                    onChange={pickProof}
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-black/[0.10] bg-stone-50 py-3 text-sm font-semibold text-stone-500 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600"
                    >
                      <Image size={16} />
                      {tr("work.proof.photoImage")}
                      <span className="text-stone-300">·</span>
                      <Video size={16} />
                      {tr("work.proof.video")}
                    </button>
                    {proofFile && (
                      <button
                        type="button"
                        onClick={submitProof}
                        disabled={proofUploading}
                        className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {proofUploading ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        ) : (
                          <Upload size={15} />
                        )}
                        {proofUploading ? tr("work.proof.uploading") : tr("work.proof.send")}
                      </button>
                    )}
                  </div>
                  <p className="mt-1.5 text-[10px] text-stone-400">{tr("work.proof.acceptedFormats")}</p>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="shrink-0 border-t border-black/[0.05] bg-white px-5 py-3 flex gap-2">
              {!selectedTask.can_update && (
                <p className="flex items-center gap-1 text-xs font-semibold text-stone-400 mr-auto">
                  <Lock size={12} /> {tr("work.taskDetail.readOnly")}
                </p>
              )}
              {STATUS_FLOW[selectedTask.status] && selectedTask.can_update && (
                <button
                  onClick={() => { advanceTask(selectedTask); setSelectedTask(null); }}
                  disabled={updateTask.isPending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40 transition"
                >
                  {selectedTask.status === "doing" ? <><CheckCircle2 size={15} /> {tr("work.actions.markDone")}</> : <><ArrowRight size={15} /> {tr("work.actions.start")}</>}
                </button>
              )}
              <button
                onClick={() => { setSelectedTask(null); setProofFile(null); setProofPreview(null); }}
                className="flex items-center justify-center rounded-xl border border-black/[0.06] px-4 py-2.5 text-sm font-bold text-stone-600 hover:bg-stone-50 transition"
              >
                {tr("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page ──────────────────────────────────────────────────────────── */}
      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-emerald-600">{tr("work.header.eyebrow")}</p>
          <h1 className="text-3xl font-black text-ink">{tr("work.header.title")}</h1>
        </div>

        {/* ── Barre recherche + filtres ────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          <div className="flex flex-1 min-w-[200px] items-center gap-2 rounded-xl border border-black/[0.07] bg-white px-3 py-2.5 shadow-sm">
            <Search size={14} className="shrink-0 text-stone-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("work.search.placeholder")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-stone-400 hover:text-stone-600">
                <X size={13} />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition ${
              showFilters || activeFilterCount > 0
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-black/[0.07] bg-white text-stone-600 hover:border-emerald-200 hover:bg-emerald-50"
            }`}
          >
            <Filter size={14} />
            {tr("work.filters.title")}
            {activeFilterCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Compteur global */}
          <div className="flex items-center gap-3 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-sm font-semibold text-stone-500 shadow-sm">
            <span>{tr("work.counter.todo", { count: grouped.todo.length })}</span>
            <span className="text-stone-200">·</span>
            <span className="text-blue-600">{tr("work.counter.doing", { count: grouped.doing.length })}</span>
            <span className="text-stone-200">·</span>
            <span className="text-emerald-600">{tr("work.counter.done", { count: grouped.done.length })}</span>
          </div>
        </div>

        {/* ── Filtres dépliants ──────────────────────────────────────────── */}
        {showFilters && (
          <div className="flex flex-wrap gap-3 rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{tr("work.filters.priority")}</label>
              <div className="flex gap-1.5">
                {(["all", "high", "normal", "low"] as const).map((p) => {
                  const label = p === "all" ? tr("common.all") : priorityLabel(p, tr);
                  const active = filterPriority === p;
                  return (
                    <button
                      key={p}
                      onClick={() => setFilterPriority(p)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        active ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-black/[0.07] bg-stone-50 text-stone-600 hover:border-emerald-200"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {assignees.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{tr("work.taskDetail.assignee")}</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setFilterAssignee("")}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                      !filterAssignee ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-black/[0.07] bg-stone-50 text-stone-600 hover:border-emerald-200"
                    }`}
                  >
                    {tr("common.all")}
                  </button>
                  {assignees.map((name) => (
                    <button
                      key={name}
                      onClick={() => setFilterAssignee(name === filterAssignee ? "" : name)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        filterAssignee === name ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-black/[0.07] bg-stone-50 text-stone-600 hover:border-emerald-200"
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeFilterCount > 0 && (
              <button
                onClick={() => { setFilterPriority("all"); setFilterAssignee(""); }}
                className="self-end rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition"
              >
                {tr("work.filters.reset")}
              </button>
            )}
          </div>
        )}

        {/* ── Board + Chat ──────────────────────────────────────────────── */}
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel title={tr("work.board.title")}>
            <div className="grid gap-3 md:grid-cols-3">
              {(["todo", "doing", "done"] as const).map((key) => {
                const col = grouped[key];
                const visible = key === "done" ? col.slice(0, doneLimit) : col;
                const hasMore = key === "done" && col.length > doneLimit;

                return (
                  <div key={key} className="flex flex-col rounded-xl bg-stone-50 p-3">
                    {/* En-tête colonne */}
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-bold text-[#17211f]">{labelFromMap(STATUS_LABEL, key, tr)}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_COLOR[key]}`}>
                        {col.length}
                      </span>
                    </div>

                    {/* Cartes */}
                    <div className="flex-1 space-y-2 overflow-y-auto" style={{ maxHeight: "28rem" }}>
                      {visible.map((task) => (
                        <article
                          key={task.id}
                          onClick={() => setSelectedTask(task)}
                          className={`group cursor-pointer rounded-xl border p-3 transition hover:shadow-md ${
                            task.assigned_to_me
                              ? "border-emerald-300 bg-emerald-50 hover:border-emerald-400"
                              : task.can_update
                                ? "border-black/[0.06] bg-white hover:border-emerald-200"
                                : "border-black/[0.04] bg-white opacity-70"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <p className="flex-1 text-[13px] font-semibold leading-snug text-[#17211f] line-clamp-2">
                              {task.title}
                            </p>
                            <ChevronRight size={12} className="mt-0.5 shrink-0 text-stone-300 group-hover:text-emerald-500 transition" />
                          </div>

                          {/* Assigné */}
                          {task.assignee_name && (
                            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-stone-400">
                              <User2 size={10} className="shrink-0" />
                              {task.assignee_name}
                            </p>
                          )}

                          {/* Tags */}
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            <StatusBadge
                              label={priorityLabel(task.priority, tr)}
                              tone={task.priority === "high" ? "red" : "neutral"}
                            />
                            {task.assigned_to_me && (
                              <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white">{tr("work.badges.me")}</span>
                            )}
                            {task.proof_required && !task.proof_url && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">{tr("work.badges.proofRequired")}</span>
                            )}
                            {task.proof_url && (
                              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600">{tr("work.badges.proof")}</span>
                            )}
                            {isOverdue(task.due_date, task.status) && (
                              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-600">{tr("work.badges.overdue")}</span>
                            )}
                          </div>

                          {/* Aperçu description */}
                          {task.description?.trim() && (
                            <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-stone-400">
                              {task.description.replace(/•\s*/g, "• ").slice(0, 90)}
                            </p>
                          )}

                          {/* Échéance */}
                          {task.due_date && (
                            <p className={`mt-1.5 flex items-center gap-1 text-[11px] font-semibold ${isOverdue(task.due_date, task.status) ? "text-red-500" : "text-stone-400"}`}>
                              <CalendarDays size={10} className="shrink-0" />
                              {workDateTime(task.due_date, task.due_time)}
                            </p>
                          )}

                          {/* Action rapide */}
                          {STATUS_FLOW[task.status] && task.can_update && (
                            <button
                              onClick={(e) => { e.stopPropagation(); advanceTask(task); }}
                              disabled={updateTask.isPending}
                              className="mt-2 flex items-center gap-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-800 disabled:text-stone-400"
                            >
                              {task.status === "doing" ? <><CheckCircle2 size={11} /> {tr("work.actions.done")}</> : <><ArrowRight size={11} /> {tr("work.actions.start")}</>}
                            </button>
                          )}
                        </article>
                      ))}

                      {col.length === 0 && (
                        <div className="flex flex-col items-center gap-1 py-6 text-stone-300">
                          <CheckCircle2 size={22} className="opacity-40" />
                          <p className="text-xs">{tr("work.board.emptyColumn")}</p>
                        </div>
                      )}
                    </div>

                    {/* Voir plus (colonne Terminé) */}
                    {hasMore && (
                      <button
                        onClick={() => setDoneLimit((v) => v + 10)}
                        className="mt-2 w-full rounded-lg border border-black/[0.05] bg-white py-1.5 text-xs font-semibold text-stone-500 hover:text-emerald-700 transition"
                      >
                        {tr("work.board.showMore", { count: col.length - doneLimit })}
                      </button>
                    )}
                    {key === "done" && doneLimit > 5 && col.length <= doneLimit && (
                      <button
                        onClick={() => setDoneLimit(5)}
                        className="mt-2 w-full rounded-lg border border-black/[0.05] bg-white py-1.5 text-xs font-semibold text-stone-400 hover:text-stone-600 transition"
                      >
                        {tr("work.board.collapse")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          <div className="space-y-5">
            {/* ── Nouvelle tâche ── */}
            <Panel title={tr("work.newTask.title")}>
              <form onSubmit={submitTask} className="space-y-3">
                <TextInput
                  label={tr("work.newTask.taskTitle")}
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  required
                />
                <TextInput
                  label={tr("work.taskDetail.assignee")}
                  value={taskForm.assignee_name}
                  onChange={(e) => setTaskForm({ ...taskForm, assignee_name: e.target.value })}
                />
                <SelectInput
                  label={tr("work.filters.priority")}
                  value={taskForm.priority}
                  onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                >
                  <option value="normal">{tr("work.priority.normal")}</option>
                  <option value="high">{tr("work.priority.high")}</option>
                  <option value="low">{tr("work.priority.low")}</option>
                </SelectInput>

                {/* Échéance + Heure */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-stone-400">{tr("work.taskDetail.due")}</label>
                    <div className="flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 focus-within:border-emerald-400 transition">
                      <CalendarDays size={13} className="shrink-0 text-stone-400" />
                      <input
                        type="date"
                        value={taskForm.due_date}
                        onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                        className="min-w-0 flex-1 bg-transparent text-sm text-[#17211f] outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-stone-400">{tr("work.newTask.time")}</label>
                    <div className="flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 focus-within:border-emerald-400 transition">
                      <Clock3 size={13} className="shrink-0 text-stone-400" />
                      <input
                        type="time"
                        value={taskForm.due_time}
                        onChange={(e) => setTaskForm({ ...taskForm, due_time: e.target.value })}
                        className="min-w-0 flex-1 bg-transparent text-sm text-[#17211f] outline-none"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={createTask.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white disabled:bg-stone-300 hover:bg-emerald-700 transition"
                >
                  <PlusCircle size={18} />
                  {createTask.isPending ? tr("work.newTask.adding") : tr("work.newTask.add")}
                </button>
                {createTask.error && (
                  <p className="text-sm text-red-600">{createTask.error.message}</p>
                )}
              </form>
            </Panel>

            {/* ── Chat opérations ── */}
            <Panel title={tr("work.chat.title", { channel: channels.data?.[0]?.name ?? tr("work.chat.defaultChannel") })}>
              <div className="mb-3 max-h-72 space-y-3 overflow-y-auto pr-1">
                {messages.data?.map((item) => (
                  <div key={item.id} className="rounded-xl bg-stone-50 p-3">
                    <p className="text-sm text-stone-800">{item.body}</p>
                    {item.ai_suggestion && (
                      <p className="mt-2 text-xs font-medium text-emerald-600">💡 {item.ai_suggestion}</p>
                    )}
                    {item.mentions && (
                      <p className="mt-1 text-xs text-[#717182]">@{item.mentions}</p>
                    )}
                  </div>
                ))}
                {!messages.data?.length && (
                  <p className="py-4 text-center text-sm text-stone-400">{tr("work.chat.empty")}</p>
                )}
              </div>
              <form onSubmit={submitMessage} className="space-y-3">
                <TextArea
                  label={tr("work.chat.message")}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={send.isPending || !message.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 font-semibold text-white disabled:bg-stone-300 hover:bg-stone-800 transition"
                >
                  <MessageSquarePlus size={18} />
                  {send.isPending ? tr("work.chat.sending") : tr("work.chat.send")}
                </button>
              </form>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
