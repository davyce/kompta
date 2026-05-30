import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ChevronDown,
  Clock3, Edit3, Eye, FileText, Filter, Image, Lock,
  Plus, Search, ShieldCheck, Trash2, Upload, User2,
  UserPlus, Video, X,
} from "lucide-react";

import { useAuth } from "../app/AuthContext";
import { LimuleIcon } from "../components/LimuleAvatar";
import { api } from "../services/api";
import { shortDate, shortDateTime } from "../utils/format";
import type { Employee, Task } from "../types/domain";

/* ── Helpers ─────────────────────────────────────────────────────────── */
function initials(name: string) {
  return (name || "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}
const AVATAR_COLORS = [
  "bg-violet-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-sky-500", "bg-indigo-500",
];
function avatarColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function isOverdue(due: string | null | undefined, status: string) {
  if (!due || status === "done") return false;
  return new Date(due) < new Date();
}

/* ── Columns ─────────────────────────────────────────────────────────── */
type ColDef = {
  key: string;
  label: string;
  accent: string;         // top border
  badgeBg: string;        // header badge bg
  badgeText: string;      // header badge text
  headerBg: string;       // column header bg
  emptyIcon: React.ElementType;
};
const COLUMNS: ColDef[] = [
  {
    key: "todo",
    label: "À faire",
    accent: "border-t-slate-400",
    badgeBg: "bg-slate-100 dark:bg-white/10",
    badgeText: "text-slate-600 dark:text-slate-300",
    headerBg: "bg-slate-50 dark:bg-white/[0.02]",
    emptyIcon: Clock3,
  },
  {
    key: "doing",
    label: "En cours",
    accent: "border-t-blue-500",
    badgeBg: "bg-blue-50 dark:bg-blue-500/15",
    badgeText: "text-blue-700 dark:text-blue-300",
    headerBg: "bg-blue-50/60 dark:bg-blue-500/[0.04]",
    emptyIcon: ArrowRight,
  },
  {
    key: "review",
    label: "Revue",
    accent: "border-t-amber-400",
    badgeBg: "bg-amber-50 dark:bg-amber-500/15",
    badgeText: "text-amber-700 dark:text-amber-300",
    headerBg: "bg-amber-50/60 dark:bg-amber-500/[0.04]",
    emptyIcon: AlertTriangle,
  },
  {
    key: "done",
    label: "Terminé",
    accent: "border-t-emerald-500",
    badgeBg: "bg-emerald-50 dark:bg-emerald-500/15",
    badgeText: "text-emerald-700 dark:text-emerald-300",
    headerBg: "bg-emerald-50/60 dark:bg-emerald-500/[0.04]",
    emptyIcon: CheckCircle2,
  },
];

/* ── Category colors ─────────────────────────────────────────────────── */
const CAT_COLORS: Record<string, string> = {
  Production: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  Conformité: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  Vente:      "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  RH:         "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  Finance:    "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
  Tech:       "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  teras:      "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  limule:     "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  manual:     "bg-stone-100 text-stone-600 dark:bg-white/10 dark:text-stone-300",
  project_board: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
};
function catColor(cat: string) {
  return CAT_COLORS[cat] ?? "bg-stone-100 text-stone-600 dark:bg-white/10 dark:text-stone-300";
}
function catLabel(source: string) {
  const MAP: Record<string, string> = {
    teras: "TERAS", limule: "Limule", manual: "Général",
    project_board: "Projet", rh: "RH", payroll: "Paie",
  };
  return MAP[source] ?? source ?? "Général";
}

/* ── Description renderer ───────────────────────────────────────────── */
function renderDescription(text: string) {
  if (!text?.trim())
    return <p className="text-sm italic text-stone-400">Aucune description fournie.</p>;
  return (
    <div className="space-y-1.5">
      {text.split("\n").map((line, i) =>
        line.startsWith("•") ? (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-1 shrink-0 text-[9px] text-emerald-500">▸</span>
            <span className="text-sm leading-snug text-[#17211f] dark:text-stone-200">{line.slice(1).trim()}</span>
          </div>
        ) : line.trim() ? (
          <p key={i} className="text-sm leading-relaxed text-[#17211f] dark:text-stone-200">{line}</p>
        ) : <div key={i} className="h-1" />
      )}
    </div>
  );
}
function fileIsVideo(url: string) {
  return /\.(mp4|mov|webm|mpeg)$/i.test(url);
}
const API_BASE = import.meta.env.VITE_API_URL?.replace("/api", "") ?? "http://localhost:8010";

/* ── Task Detail Modal ───────────────────────────────────────────────── */
function TaskDetailModal({
  task,
  employees,
  onClose,
  onEdit,
  onAdvance,
  onProofUploaded,
}: {
  task: TaskEx;
  employees: Employee[];
  onClose: () => void;
  onEdit: (t: TaskEx) => void;
  onAdvance: (id: number, status: string) => void;
  onProofUploaded: (updated: Task) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const nextStatus: Record<string, string> = { todo: "doing", doing: "review", review: "done" };
  const canMove = Boolean(nextStatus[task.status]) && task.can_update;
  const overdue = isOverdue(task.due_date, task.status);
  const assigneeName = task.assignee_name || "Non assigné";

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setProofFile(f);
    setProofPreview(URL.createObjectURL(f));
  }

  async function submitProof() {
    if (!proofFile) return;
    setProofUploading(true);
    try {
      const updated = await api.uploadTaskProof(task.id, proofFile);
      onProofUploaded(updated);
      setProofFile(null);
      setProofPreview(null);
    } catch {
      alert("Erreur lors de l'envoi du fichier.");
    } finally {
      setProofUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1e2229]"
        style={{ maxHeight: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`shrink-0 flex items-start gap-3 px-5 py-4 border-b ${
          task.assigned_to_me
            ? "bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20"
            : "bg-stone-50 border-black/[0.05] dark:bg-white/[0.02] dark:border-white/[0.06]"
        }`}>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              {/* Statut */}
              {(() => {
                const col = COLUMNS.find((c) => c.key === task.status);
                return col ? (
                  <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${col.badgeBg} ${col.badgeText}`}>
                    {col.label}
                  </span>
                ) : null;
              })()}
              <PriorityBadge priority={task.priority} />
              {task.assigned_to_me && (
                <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">À moi</span>
              )}
              {overdue && (
                <span className="flex items-center gap-0.5 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                  <AlertTriangle size={9} /> En retard
                </span>
              )}
              {task.proof_url && (
                <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">Preuve ✓</span>
              )}
              {task.proof_required && !task.proof_url && (
                <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">Justificatif requis</span>
              )}
            </div>
            <p className="text-base font-black leading-snug text-[#17211f] dark:text-white">{task.title}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {task.can_delete && (
              <button
                onClick={() => { onClose(); onEdit(task); }}
                className="grid h-8 w-8 place-items-center rounded-xl text-stone-400 hover:bg-violet-50 hover:text-violet-600 transition"
                title="Modifier"
              >
                <Edit3 size={15} />
              </button>
            )}
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition dark:hover:bg-white/10"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Méta */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex items-center gap-2 rounded-xl border border-black/[0.05] bg-stone-50 px-3 py-2.5 dark:border-white/[0.05] dark:bg-white/[0.03]">
              <User2 size={14} className="shrink-0 text-stone-400" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Responsable</p>
                <p className="truncate text-sm font-semibold text-[#17211f] dark:text-white">{assigneeName}</p>
              </div>
            </div>
            {task.due_date && (
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                overdue ? "border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10" : "border-black/[0.05] bg-stone-50 dark:border-white/[0.05] dark:bg-white/[0.03]"
              }`}>
                <CalendarDays size={14} className={`shrink-0 ${overdue ? "text-red-400" : "text-stone-400"}`} />
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${overdue ? "text-red-400" : "text-stone-400"}`}>Échéance</p>
                  <p className={`text-sm font-semibold ${overdue ? "text-red-700" : "text-[#17211f] dark:text-white"}`}>
                    {shortDateTime(task.due_date, task.due_time)}
                  </p>
                </div>
              </div>
            )}
            {task.source && (
              <div className="flex items-center gap-2 rounded-xl border border-black/[0.05] bg-stone-50 px-3 py-2.5 dark:border-white/[0.05] dark:bg-white/[0.03]">
                <FileText size={14} className="shrink-0 text-stone-400" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Source</p>
                  <p className="text-sm font-semibold capitalize text-[#17211f] dark:text-white">{catLabel(task.source)}</p>
                </div>
              </div>
            )}
            {task.proof_required && (
              <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                task.proof_url
                  ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10"
                  : "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10"
              }`}>
                <ShieldCheck size={14} className={`shrink-0 ${task.proof_url ? "text-emerald-500" : "text-amber-500"}`} />
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${task.proof_url ? "text-emerald-500" : "text-amber-500"}`}>Justificatif</p>
                  <p className={`text-sm font-semibold ${task.proof_url ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                    {task.proof_url ? "Preuve déposée ✓" : "Obligatoire"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">Description & Consignes</p>
            <div className="rounded-xl border border-black/[0.06] bg-stone-50 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
              {renderDescription(task.description)}
            </div>
          </div>

          {/* Preuve déjà déposée */}
          {task.proof_url && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">Preuve déposée</p>
              <div className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                {fileIsVideo(task.proof_url) ? (
                  <video src={`${API_BASE}${task.proof_url}`} controls className="max-h-52 w-full object-contain" />
                ) : task.proof_url.endsWith(".pdf") ? (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <FileText size={22} className="text-emerald-600" />
                    <a href={`${API_BASE}${task.proof_url}`} target="_blank" rel="noopener noreferrer"
                      className="text-sm font-semibold text-emerald-700 hover:underline">
                      Voir le document PDF →
                    </a>
                  </div>
                ) : (
                  <img src={`${API_BASE}${task.proof_url}`} alt="Preuve" className="max-h-52 w-full object-contain" />
                )}
              </div>
            </div>
          )}

          {/* Upload */}
          {(task.assigned_to_me || task.can_update) && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">
                {task.proof_url ? "Remplacer la preuve" : task.proof_required ? "Joindre une preuve (obligatoire)" : "Joindre un fichier"}
              </p>

              {/* Prévisualisation */}
              {proofPreview && proofFile && (
                <div className="mb-3 overflow-hidden rounded-xl border border-black/[0.08] bg-stone-50 dark:border-white/[0.06]">
                  {proofFile.type.startsWith("video/") ? (
                    <video src={proofPreview} controls className="max-h-40 w-full object-contain" />
                  ) : proofFile.type === "application/pdf" ? (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <FileText size={20} className="text-stone-500" />
                      <span className="truncate text-sm font-semibold text-[#17211f] dark:text-white">{proofFile.name}</span>
                    </div>
                  ) : (
                    <img src={proofPreview} alt="Prévisualisation" className="max-h-40 w-full object-contain" />
                  )}
                </div>
              )}

              <input ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf" className="hidden" onChange={pickFile} />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-black/[0.10] bg-stone-50 py-3 text-sm font-semibold text-stone-500 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 dark:border-white/[0.08] dark:bg-white/[0.02]"
                >
                  <Image size={15} />Photo / Image
                  <span className="text-stone-300">·</span>
                  <Video size={15} />Vidéo
                  <span className="text-stone-300">·</span>
                  <FileText size={15} />PDF
                </button>
                {proofFile && (
                  <button
                    type="button"
                    onClick={submitProof}
                    disabled={proofUploading}
                    className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {proofUploading
                      ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      : <Upload size={15} />}
                    {proofUploading ? "Envoi…" : "Envoyer"}
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[10px] text-stone-400">Formats acceptés : image (JPG, PNG, GIF), vidéo (MP4, MOV, WebM) ou PDF · max 50 Mo</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex gap-2 border-t border-black/[0.05] bg-white px-5 py-3 dark:border-white/[0.06] dark:bg-[#1e2229]">
          {!task.can_update && (
            <p className="mr-auto flex items-center gap-1 text-xs font-semibold text-stone-400">
              <Lock size={12} /> Lecture seule
            </p>
          )}
          {canMove && (
            <button
              onClick={() => { onAdvance(task.id, nextStatus[task.status]); onClose(); }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
            >
              {task.status === "review"
                ? <><CheckCircle2 size={15} /> Marquer terminé</>
                : task.status === "doing"
                  ? <><ArrowRight size={15} /> Passer en Revue</>
                  : <><ArrowRight size={15} /> Démarrer</>
              }
            </button>
          )}
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-xl border border-black/[0.06] px-4 py-2.5 text-sm font-bold text-stone-600 transition hover:bg-stone-50 dark:border-white/[0.08] dark:text-white dark:hover:bg-white/5"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Priority badge ──────────────────────────────────────────────────── */
function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "high")
    return <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">Priorité haute</span>;
  if (priority === "low")
    return <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-500">Basse</span>;
  return null;
}

type TaskEx = Task & { dept?: string };

/* ══════════════════════════════════════════════════════════════════════ */
/* ── Task Card ─────────────────────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════════ */
function TaskCard({
  task, employees, onMove, onAssign, onEdit, onDelete, onView,
}: {
  task: TaskEx;
  employees: Employee[];
  onMove: (id: number, status: string) => void;
  onAssign: (id: number, name: string) => void;
  onEdit: (task: TaskEx) => void;
  onDelete: (task: TaskEx) => void;
  onView: (task: TaskEx) => void;
}) {
  const [showAssign, setShowAssign] = useState(false);
  const nextStatus: Record<string, string> = { todo: "doing", doing: "review", review: "done" };
  const cat = task.source || "manual";
  const canMove = task.id > 0 && Boolean(nextStatus[task.status]) && task.can_update;
  const locked = !task.can_update;
  const overdue = isOverdue(task.due_date, task.status);

  return (
    <div
      className={`group relative cursor-pointer rounded-2xl border bg-white transition-all hover:shadow-lg dark:bg-[#252931] ${
        task.assigned_to_me
          ? "border-emerald-300 shadow-sm ring-2 ring-emerald-100 dark:border-emerald-500/50 dark:ring-emerald-500/10"
          : locked
            ? "border-black/[0.04] opacity-70 dark:border-white/[0.04]"
            : "border-black/[0.07] hover:border-black/[0.12] dark:border-white/[0.07] dark:hover:border-white/[0.12]"
      }`}
      onClick={() => onView(task)}
    >

      {/* Top color strip pour priorité haute */}
      {task.priority === "high" && (
        <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-2xl bg-gradient-to-r from-rose-400 to-orange-400" />
      )}

      <div className="p-4">
        {/* Tags row */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${catColor(cat)}`}>
            {catLabel(cat)}
          </span>
          {task.assigned_to_me && (
            <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">À moi</span>
          )}
          <PriorityBadge priority={task.priority} />
          {locked && (
            <span className="flex items-center gap-0.5 rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-400">
              <Lock size={9} /> Lecture
            </span>
          )}
          {overdue && (
            <span className="ml-auto flex items-center gap-0.5 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
              <AlertTriangle size={9} /> Retard
            </span>
          )}
          {task.proof_required && !task.proof_url && (
            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">Justif.</span>
          )}
          {task.proof_url && (
            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">Preuve ✓</span>
          )}
        </div>

        {/* Title */}
        <p className="text-[13.5px] font-semibold leading-snug text-[#17211f] dark:text-white line-clamp-3">
          {task.title}
        </p>

        {/* Description preview */}
        {task.description?.trim() && (
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-stone-400">
            {task.description.replace(/•\s*/g, "").slice(0, 100)}
          </p>
        )}

        {/* Assignee + date + advance */}
        <div className="mt-3 flex items-center gap-2">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${avatarColor(task.assignee_name || "")}`}>
            {initials(task.assignee_name || "?")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-[#17211f] dark:text-white">
              {task.assignee_name || <span className="text-stone-400 font-normal italic">Non assigné</span>}
            </p>
            {task.due_date && (
              <p className={`text-[10px] flex items-center gap-0.5 font-medium ${overdue ? "text-red-500" : "text-stone-400"}`}>
                <CalendarDays size={9} /> {shortDateTime(task.due_date, task.due_time)}
              </p>
            )}
          </div>
          {canMove && (
            <button
              onClick={(e) => { e.stopPropagation(); onMove(task.id, nextStatus[task.status]);  }}
              className="shrink-0 flex items-center gap-1 rounded-lg border border-black/[0.07] px-2 py-1 text-[11px] font-semibold text-stone-500 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 transition dark:border-white/[0.08] dark:text-white/50"
            >
              → Avancer
            </button>
          )}
          {!canMove && task.status === "done" && (
            <span className="shrink-0 flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <CheckCircle2 size={10} /> Fait
            </span>
          )}
        </div>

        {/* Footer: actions */}
        <div className="mt-3 flex items-center border-t border-black/[0.05] pt-2.5 dark:border-white/[0.05]">
          <div className="flex items-center gap-1 ml-auto">
            {/* Voir détail */}
            <button
              onClick={(e) => { e.stopPropagation(); onView(task); }}
              className="flex items-center gap-1 rounded-lg border border-black/[0.06] px-2 py-1 text-[10px] font-semibold text-stone-500 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition"
              title="Voir le détail"
            >
              <Eye size={10} /> Voir
            </button>
            {/* Assigner */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowAssign((v) => !v); }}
                disabled={!task.can_delete}
                className="flex items-center gap-1 rounded-lg border border-black/[0.06] px-2 py-1 text-[10px] font-semibold text-stone-500 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition disabled:opacity-40"
              >
                <UserPlus size={10} /> Assigner <ChevronDown size={9} />
              </button>
              {showAssign && (
                <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-black/[0.08] bg-white shadow-xl dark:border-white/10 dark:bg-[#1e2229]">
                  <div className="p-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); onAssign(task.id, ""); setShowAssign(false); }}
                      className="w-full rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-stone-500 hover:bg-stone-50"
                    >
                      — Non assigné
                    </button>
                    {employees.map((emp) => {
                      const name = `${emp.first_name} ${emp.last_name}`.trim();
                      return (
                        <button
                          key={emp.id}
                          onClick={(e) => { e.stopPropagation(); onAssign(task.id, name); setShowAssign(false); }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-[#17211f] hover:bg-emerald-50 hover:text-emerald-700 dark:text-white dark:hover:bg-emerald-500/10"
                        >
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${avatarColor(name)}`}>
                            {initials(name)}
                          </span>
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {task.can_delete && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                  className="grid h-6 w-6 place-items-center rounded-lg border border-black/[0.06] text-stone-400 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600 transition"
                  title="Modifier"
                >
                  <Edit3 size={11} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(task); }}
                  className="grid h-6 w-6 place-items-center rounded-lg border border-black/[0.06] text-stone-400 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition"
                  title="Supprimer"
                >
                  <Trash2 size={11} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
/* ── Main page ──────────────────────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════════ */
export function ProjectsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: api.tasks });
  const employees = useQuery({ queryKey: ["employees"], queryFn: api.employees });

  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [newTaskCol, setNewTaskCol] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newPriority, setNewPriority] = useState("normal");
  const [newDueDate, setNewDueDate] = useState("");
  const [newDueTime, setNewDueTime] = useState("");
  const [selectedTask, setSelectedTask] = useState<TaskEx | null>(null);
  const [editingTask, setEditingTask] = useState<TaskEx | null>(null);
  const [editForm, setEditForm] = useState({
    title: "", description: "", assignee_name: "",
    priority: "normal", status: "todo", due_date: "", due_time: "", proof_required: false,
  });

  const canManageTasks = Boolean(
    user && (user.role.startsWith("admin") || ["rh_entreprise", "manager_entreprise", "super_admin"].includes(user.role))
  );

  /* Mutations */
  const updateTask = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Task> }) => api.updateTask(id, payload),
    onSuccess: () => { setEditingTask(null); queryClient.invalidateQueries({ queryKey: ["tasks"] }); },
  });
  const deleteTask = useMutation({
    mutationFn: api.deleteTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });
  const createTask = useMutation({
    mutationFn: (data: { title: string; status: string }) =>
      api.createTask({ title: data.title, status: data.status, assignee_name: newAssignee, priority: newPriority, due_date: newDueDate || null, due_time: newDueTime || null, source: "project_board" }),
    onSuccess: () => {
      setNewTaskCol(null); setNewTitle(""); setNewAssignee(""); setNewPriority("normal"); setNewDueDate(""); setNewDueTime("");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  function openEdit(task: TaskEx) {
    setEditingTask(task);
    setEditForm({ title: task.title, description: task.description || "", assignee_name: task.assignee_name || "", priority: task.priority || "normal", status: task.status || "todo", due_date: task.due_date || "", due_time: task.due_time || "", proof_required: Boolean(task.proof_required) });
  }
  function submitEdit() {
    if (!editingTask || !editForm.title.trim()) return;
    updateTask.mutate({ id: editingTask.id, payload: { ...editForm, due_date: editForm.due_date || null, due_time: editForm.due_time || null } });
  }
  function confirmDelete(task: TaskEx) {
    if (!window.confirm(`Supprimer "${task.title}" ?`)) return;
    deleteTask.mutate(task.id);
  }

  /* Data */
  const allTasks: TaskEx[] = (tasks.data ?? []) as TaskEx[];
  const filtered = allTasks
    .filter((t) => !search || t.title.toLowerCase().includes(search.toLowerCase()) || (t.assignee_name || "").toLowerCase().includes(search.toLowerCase()))
    .filter((t) => !priorityFilter || t.priority === priorityFilter);
  const grouped = Object.fromEntries(COLUMNS.map((col) => [col.key, filtered.filter((t) => t.status === col.key)]));

  const total = allTasks.length;
  const inProgress = allTasks.filter((t) => t.status === "doing").length;
  const inReview = allTasks.filter((t) => t.status === "review").length;
  const done = allTasks.filter((t) => t.status === "done").length;
  const late = allTasks.filter((t) => isOverdue(t.due_date, t.status)).length;

  /* ── Render ── */
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="shrink-0 pb-4">
        {/* Title row */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-sm font-semibold text-emerald-600">Projets</p>
            <h1 className="text-3xl font-black text-[#17211f] dark:text-white">Boards &amp; Projets</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 py-2 shadow-sm dark:border-white/[0.08] dark:bg-[#252931]">
              <Search size={14} className="shrink-0 text-stone-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une tâche…"
                className="w-40 bg-transparent text-sm text-[#17211f] outline-none placeholder:text-stone-400 dark:text-white"
              />
              {search && <button onClick={() => setSearch("")} className="text-stone-400 hover:text-stone-600"><X size={12} /></button>}
            </div>
            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                showFilters || priorityFilter
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-black/[0.08] bg-white text-stone-600 hover:border-emerald-200 hover:bg-emerald-50 dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
              }`}
            >
              <Filter size={14} /> Filtres
              {priorityFilter && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white">1</span>}
            </button>
            {/* Agenda */}
            <button
              onClick={() => navigate("/calendar")}
              className="flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-50 transition dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
            >
              <CalendarDays size={14} /> Agenda
            </button>
            {/* New task */}
            <button
              onClick={() => setNewTaskCol("todo")}
              disabled={!canManageTasks && !user?.employee_id}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:bg-stone-300"
            >
              <Plus size={15} /> Nouvelle tâche
            </button>
          </div>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-3 shadow-sm dark:border-white/[0.06] dark:bg-[#252931]">
            <span className="self-center text-[11px] font-bold uppercase tracking-wide text-stone-400">Priorité :</span>
            {[["", "Toutes"], ["high", "Haute"], ["normal", "Normale"], ["low", "Basse"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setPriorityFilter(val)}
                className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${
                  priorityFilter === val
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                    : "border-black/[0.07] bg-stone-50 text-stone-600 hover:border-emerald-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* KPI chips */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-3.5 py-2 shadow-sm dark:border-white/[0.06] dark:bg-[#252931]">
            <span className="text-xs font-semibold text-stone-500">{total} tâches</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-2 dark:border-blue-500/20 dark:bg-blue-500/10">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">{inProgress} en cours</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3.5 py-2 dark:border-amber-500/20 dark:bg-amber-500/10">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{inReview} en revue</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-2 dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{done} terminé</span>
          </div>
          {late > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2 dark:border-red-500/20 dark:bg-red-500/10">
              <AlertTriangle size={12} className="text-red-500" />
              <span className="text-xs font-bold text-red-700 dark:text-red-300">{late} en retard</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Kanban board ────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const cards = grouped[col.key] ?? [];
          const EmptyIcon = col.emptyIcon;
          return (
            <div
              key={col.key}
              className={`flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-black/[0.06] dark:border-white/[0.06] border-t-4 ${col.accent} bg-[#f7f8fa] dark:bg-[#13161c]`}
            >
              {/* Column header */}
              <div className={`flex shrink-0 items-center justify-between px-4 py-3 ${col.headerBg}`}>
                <div className="flex items-center gap-2">
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${col.badgeBg} ${col.badgeText}`}>
                    {col.label}
                  </span>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/[0.07] text-[11px] font-bold text-stone-600 dark:bg-white/10 dark:text-white/60">
                    {cards.length}
                  </span>
                </div>
                <button
                  onClick={() => setNewTaskCol(col.key)}
                  className="grid h-7 w-7 place-items-center rounded-lg text-stone-400 hover:bg-black/[0.07] hover:text-stone-700 transition dark:hover:bg-white/10"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Cards area */}
              <div className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">

                {/* Quick-add form */}
                {newTaskCol === col.key && (
                  <div className="rounded-2xl border-2 border-emerald-300 bg-white p-3.5 shadow-sm dark:bg-[#252931] dark:border-emerald-500/40">
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newTitle.trim()) createTask.mutate({ title: newTitle.trim(), status: col.key });
                        if (e.key === "Escape") { setNewTaskCol(null); setNewTitle(""); }
                      }}
                      placeholder="Titre de la tâche…"
                      className="w-full bg-transparent text-sm font-semibold text-[#17211f] outline-none placeholder:font-normal placeholder:text-stone-400 dark:text-white"
                    />
                    <div className="mt-3 space-y-2">
                      <select
                        value={newAssignee}
                        onChange={(e) => setNewAssignee(e.target.value)}
                        disabled={!canManageTasks}
                        className="w-full rounded-xl border border-black/[0.08] bg-stone-50 px-3 py-1.5 text-xs font-semibold text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                      >
                        <option value="">{canManageTasks ? "Responsable…" : "Assigné à moi"}</option>
                        {(employees.data ?? []).map((emp) => {
                          const name = `${emp.first_name} ${emp.last_name}`.trim();
                          return <option key={emp.id} value={name}>{name}</option>;
                        })}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={newPriority}
                          onChange={(e) => setNewPriority(e.target.value)}
                          className="rounded-xl border border-black/[0.08] bg-stone-50 px-2 py-1.5 text-xs font-semibold text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                        >
                          <option value="low">Basse</option>
                          <option value="normal">Normale</option>
                          <option value="high">Haute</option>
                        </select>
                        <input
                          type="date"
                          value={newDueDate}
                          onChange={(e) => setNewDueDate(e.target.value)}
                          className="rounded-xl border border-black/[0.08] bg-stone-50 px-2 py-1.5 text-xs outline-none dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                          placeholder="Échéance"
                        />
                      </div>
                      {newDueDate && (
                        <div className="flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-stone-50 px-2.5 py-1.5 dark:border-white/[0.08] dark:bg-[#1e2229]">
                          <Clock3 size={11} className="shrink-0 text-stone-400" />
                          <input
                            type="time"
                            value={newDueTime}
                            onChange={(e) => setNewDueTime(e.target.value)}
                            className="flex-1 bg-transparent text-xs text-[#17211f] outline-none dark:text-white"
                            placeholder="Heure (optionnel)"
                          />
                          <span className="text-[10px] text-stone-400">heure</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2.5 flex gap-2">
                      <button
                        onClick={() => { if (newTitle.trim()) createTask.mutate({ title: newTitle.trim(), status: col.key }); }}
                        disabled={createTask.isPending || !newTitle.trim()}
                        className="flex-1 rounded-xl bg-emerald-600 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40 transition"
                      >
                        {createTask.isPending ? "Ajout…" : "Ajouter"}
                      </button>
                      <button
                        onClick={() => { setNewTaskCol(null); setNewTitle(""); }}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-xl border border-black/[0.08] text-stone-400 hover:bg-stone-100 transition"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Task cards */}
                {cards.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    employees={employees.data ?? []}
                    onMove={(id, status) => updateTask.mutate({ id, payload: { status } })}
                    onAssign={(id, assignee_name) => updateTask.mutate({ id, payload: { assignee_name } })}
                    onEdit={openEdit}
                    onDelete={confirmDelete}
                    onView={(t) => setSelectedTask(t)}
                  />
                ))}

                {/* Empty state */}
                {cards.length === 0 && newTaskCol !== col.key && (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-black/[0.08] p-8 text-center dark:border-white/[0.08]">
                    <EmptyIcon size={20} className="text-stone-300" />
                    <p className="text-xs text-stone-400">Aucune tâche</p>
                    <button
                      onClick={() => setNewTaskCol(col.key)}
                      className="text-xs font-semibold text-emerald-600 hover:underline"
                    >
                      + Ajouter
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Detail modal ────────────────────────────────────────────── */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          employees={employees.data ?? []}
          onClose={() => setSelectedTask(null)}
          onEdit={(t) => { setSelectedTask(null); openEdit(t); }}
          onAdvance={(id, status) => { updateTask.mutate({ id, payload: { status } }); setSelectedTask((prev) => prev ? { ...prev, status } : prev); }}
          onProofUploaded={(updated) => {
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
            setSelectedTask((prev) => prev ? { ...prev, ...updated } : prev);
          }}
        />
      )}

      {/* ── Edit modal ──────────────────────────────────────────────── */}
      {editingTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={() => setEditingTask(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-black/[0.06] bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#1e2229]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center gap-3 border-b border-black/[0.05] px-6 py-4 dark:border-white/[0.08]">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-500/10">
                <Edit3 size={16} className="text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1">
                <p className="font-black text-[#17211f] dark:text-white">Modifier la tâche</p>
                <p className="text-xs text-stone-400">Chaque modification est tracée dans le journal d'audit.</p>
              </div>
              <button onClick={() => setEditingTask(null)} className="grid h-8 w-8 place-items-center rounded-xl text-stone-400 hover:bg-stone-100 transition dark:hover:bg-white/10">
                <X size={15} />
              </button>
            </div>

            {/* Modal body */}
            <div className="space-y-4 p-6">
              {/* Titre */}
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-stone-400">Titre *</label>
                <input
                  autoFocus
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full rounded-xl border border-black/[0.08] px-3 py-2.5 text-sm font-semibold text-[#17211f] outline-none focus:border-violet-400 transition dark:border-white/[0.08] dark:bg-white/5 dark:text-white"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-stone-400">Description / Consignes</label>
                <textarea
                  rows={3}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Instructions, consignes, contexte…"
                  className="w-full rounded-xl border border-black/[0.08] px-3 py-2.5 text-sm text-[#17211f] outline-none focus:border-violet-400 transition resize-none dark:border-white/[0.08] dark:bg-white/5 dark:text-white"
                />
              </div>

              {/* Assigné */}
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-stone-400">Responsable</label>
                <select
                  value={editForm.assignee_name}
                  onChange={(e) => setEditForm({ ...editForm, assignee_name: e.target.value })}
                  className="w-full rounded-xl border border-black/[0.08] px-3 py-2.5 text-sm text-[#17211f] outline-none focus:border-violet-400 transition dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                >
                  <option value="">— Non assigné —</option>
                  {(employees.data ?? []).map((emp) => {
                    const name = `${emp.first_name} ${emp.last_name}`.trim();
                    return <option key={emp.id} value={name}>{name}</option>;
                  })}
                </select>
              </div>

              {/* Statut / Priorité */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-stone-400">Statut</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full rounded-xl border border-black/[0.08] px-3 py-2.5 text-sm text-[#17211f] outline-none focus:border-violet-400 transition dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                  >
                    {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-stone-400">Priorité</label>
                  <select
                    value={editForm.priority}
                    onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                    className="w-full rounded-xl border border-black/[0.08] px-3 py-2.5 text-sm text-[#17211f] outline-none focus:border-violet-400 transition dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                  >
                    <option value="low">Basse</option>
                    <option value="normal">Normale</option>
                    <option value="high">Haute</option>
                  </select>
                </div>
              </div>

              {/* Échéance + Heure */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-stone-400">Échéance</label>
                  <input
                    type="date"
                    value={editForm.due_date}
                    onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                    className="w-full rounded-xl border border-black/[0.08] px-3 py-2.5 text-sm text-[#17211f] outline-none focus:border-violet-400 transition dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-stone-400">Heure <span className="normal-case font-normal">(optionnel)</span></label>
                  <div className="flex items-center gap-2 rounded-xl border border-black/[0.08] px-3 py-2.5 focus-within:border-violet-400 transition dark:border-white/[0.08] dark:bg-[#1e2229]">
                    <Clock3 size={13} className="shrink-0 text-stone-400" />
                    <input
                      type="time"
                      value={editForm.due_time}
                      onChange={(e) => setEditForm({ ...editForm, due_time: e.target.value })}
                      className="flex-1 bg-transparent text-sm text-[#17211f] outline-none dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Preuve */}
              <div
                onClick={() => setEditForm({ ...editForm, proof_required: !editForm.proof_required })}
                className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition ${
                  editForm.proof_required ? "border-amber-200 bg-amber-50" : "border-black/[0.05] bg-stone-50 dark:border-white/[0.06] dark:bg-white/[0.02]"
                }`}
              >
                <div>
                  <p className="text-sm font-bold text-[#17211f] dark:text-white">Preuve requise</p>
                  <p className="text-xs text-stone-400">Le responsable doit joindre un justificatif</p>
                </div>
                <div className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${editForm.proof_required ? "bg-amber-500" : "bg-stone-200 dark:bg-white/20"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${editForm.proof_required ? "translate-x-4" : "translate-x-0"}`} />
                </div>
              </div>

              {updateTask.error && <p className="text-sm font-semibold text-red-600">{updateTask.error.message}</p>}

              <button
                onClick={submitEdit}
                disabled={!editForm.title.trim() || updateTask.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-black text-white transition hover:bg-violet-700 disabled:opacity-40"
              >
                {updateTask.isPending ? "Enregistrement…" : "Enregistrer les modifications"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Limule FAB ────────────────────────────────────────────────── */}
      <button
        onClick={() => navigate("/assistants")}
        title="Ouvrir le studio Limule"
        className="fixed right-6 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-[#0b1f3a] shadow-lg transition hover:scale-105 hover:shadow-xl bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-6"
      >
        <LimuleIcon size={24} />
      </button>
    </div>
  );
}
