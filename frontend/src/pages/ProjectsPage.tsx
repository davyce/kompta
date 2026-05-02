import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays, CheckCircle2, Edit3, Lock, MessageSquare, Paperclip, Plus,
  Search, Sparkles, Trash2, UserPlus, X,
} from "lucide-react";

import { useAuth } from "../app/AuthContext";
import { api } from "../services/api";
import { shortDate } from "../utils/format";
import type { Employee, Task } from "../types/domain";

/* ── helpers ──────────────────────────────────────────────────────── */
function initials(name: string) {
  return (name || "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}
const COLORS = ["bg-emerald-500","bg-violet-500","bg-amber-500","bg-rose-500","bg-sky-500","bg-emerald-500"];
function avatarColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return COLORS[h % COLORS.length];
}

/* ── Column definition ────────────────────────────────────────────── */
type ColDef = {
  key: string;
  label: string;
  tone: string;      /* badge bg color */
  textTone: string;  /* badge text color */
  borderTop: string; /* top accent */
};

const COLUMNS: ColDef[] = [
  { key: "todo",   label: "À faire",  tone: "bg-slate-100 dark:bg-white/10",    textTone: "text-slate-600 dark:text-slate-300",  borderTop: "border-t-slate-400"   },
  { key: "doing",  label: "En cours", tone: "bg-emerald-100 dark:bg-emerald-500/20",  textTone: "text-emerald-700 dark:text-emerald-300",    borderTop: "border-t-emerald-500"    },
  { key: "review", label: "Revue",    tone: "bg-amber-100 dark:bg-amber-500/20",textTone: "text-amber-700 dark:text-amber-300",  borderTop: "border-t-amber-500"   },
  { key: "done",   label: "Terminé",  tone: "bg-emerald-100 dark:bg-emerald-500/20",textTone: "text-emerald-700 dark:text-emerald-300",borderTop: "border-t-emerald-500"},
];

/* ── Extended task type (dept derived from source field) ────────── */
type TaskEx = Task & { dept?: string };

const CAT_COLORS: Record<string, string> = {
  Production: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  Conformité: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  Vente:      "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  RH:         "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  Finance:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  Tech:       "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
};
function catColor(cat: string) {
  return CAT_COLORS[cat] ?? "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/70";
}

/* ── Card component ───────────────────────────────────────────────── */
function TaskCard({
  task,
  employees,
  onMove,
  onAssign,
  onEdit,
  onDelete,
}: {
  task: TaskEx;
  employees: Employee[];
  onMove: (id: number, status: string) => void;
  onAssign: (id: number, assigneeName: string) => void;
  onEdit: (task: TaskEx) => void;
  onDelete: (task: TaskEx) => void;
}) {
  const nextStatus: Record<string, string> = { todo: "doing", doing: "review", review: "done" };
  const cat = task.dept || "Général";
  const canMove = task.id > 0 && Boolean(nextStatus[task.status]) && task.can_update;
  const locked = !task.can_update;
  return (
    <div className={`rounded-xl border p-4 shadow-sm transition dark:bg-[#252931] ${
      task.assigned_to_me
        ? "border-emerald-300 bg-emerald-50/80 ring-2 ring-emerald-100 dark:border-emerald-500/50 dark:ring-emerald-500/10"
        : locked
          ? "border-black/[0.04] bg-white opacity-75 dark:border-white/[0.05]"
          : "border-black/[0.06] bg-white hover:shadow-md dark:border-white/[0.06]"
    }`}>
      {/* Tags */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${catColor(cat)}`}>{cat}</span>
        {task.assigned_to_me && (
          <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
            À moi
          </span>
        )}
        {locked && (
          <span className="flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-500">
            <Lock size={10} /> Lecture seule
          </span>
        )}
        {task.priority === "high" && (
          <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
            Priorité haute
          </span>
        )}
      </div>
      {/* Title */}
      <p className="font-semibold leading-snug text-[#17211f] dark:text-white">{task.title}</p>
      {/* Assignee + date */}
      <div className="mt-3 flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white ${avatarColor(task.assignee_name || "")}`}>
          {initials(task.assignee_name || "?")}
        </span>
        <div>
          <p className="text-xs font-semibold text-[#17211f] dark:text-white">{task.assignee_name || "Non assigné"}</p>
          {task.due_date && (
            <p className="text-[11px] text-[#717182] flex items-center gap-1">
              <CalendarDays size={11} /> {shortDate(task.due_date)}
            </p>
          )}
        </div>
        {canMove && (
          <button
            onClick={(e) => { e.stopPropagation(); onMove(task.id, nextStatus[task.status]); }}
            className="ml-auto rounded-lg border border-black/[0.06] px-2 py-1 text-[11px] font-semibold text-[#717182] hover:border-emerald-400 hover:text-emerald-600 dark:border-white/[0.08] dark:text-white/50 dark:hover:border-emerald-500 dark:hover:text-emerald-400 transition"
          >
            → Avancer
          </button>
        )}
        {!canMove && task.status === "done" && (
          <span className="ml-auto flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700">
            <CheckCircle2 size={11} /> Fait
          </span>
        )}
      </div>
      {/* Stats */}
      <div className="mt-3 flex items-center gap-2 border-t border-black/[0.04] pt-2.5 dark:border-white/[0.04]">
        <span className="flex items-center gap-1 text-[11px] text-[#717182]"><MessageSquare size={11}/> 4</span>
        <span className="flex items-center gap-1 text-[11px] text-[#717182]"><Paperclip size={11}/> 2</span>
        {task.can_delete && (
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={(event) => { event.stopPropagation(); onEdit(task); }}
              className="grid h-7 w-7 place-items-center rounded-lg border border-black/[0.06] text-[#717182] transition hover:border-violet-300 hover:text-violet-600"
              title="Modifier"
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={(event) => { event.stopPropagation(); onDelete(task); }}
              className="grid h-7 w-7 place-items-center rounded-lg border border-black/[0.06] text-[#717182] transition hover:border-rose-300 hover:text-rose-600"
              title="Supprimer"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
        <label className="ml-auto flex items-center gap-1 rounded-lg bg-[#f6f7fb] px-2 py-1 text-[11px] font-bold text-[#717182] dark:bg-white/[0.06]">
          <UserPlus size={11} />
          <select
            value={task.assignee_name || ""}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onAssign(task.id, event.target.value)}
            disabled={!task.can_delete}
            className="max-w-[112px] bg-transparent text-[11px] outline-none"
          >
            <option value="">Assigner</option>
            {employees.map((employee) => {
              const name = `${employee.first_name} ${employee.last_name}`.trim();
              return <option key={employee.id} value={name}>{name}</option>;
            })}
          </select>
        </label>
      </div>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────────────── */
export function ProjectsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: api.tasks });
  const employees = useQuery({ queryKey: ["employees"], queryFn: api.employees });
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [newTaskCol, setNewTaskCol] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newPriority, setNewPriority] = useState("normal");
  const [newDueDate, setNewDueDate] = useState("");
  const [editingTask, setEditingTask] = useState<TaskEx | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    assignee_name: "",
    priority: "normal",
    status: "todo",
    due_date: "",
    proof_required: false,
  });

  const canManageTasks = Boolean(
    user && (user.role.startsWith("admin") || ["rh_entreprise", "manager_entreprise", "super_admin"].includes(user.role))
  );

  const updateTask = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Task> }) => api.updateTask(id, payload),
    onSuccess: () => {
      setEditingTask(null);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: api.deleteTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const createTask = useMutation({
    mutationFn: (data: { title: string; status: string }) =>
      api.createTask({
        title: data.title,
        status: data.status,
        assignee_name: newAssignee,
        priority: newPriority,
        due_date: newDueDate || null,
        source: "project_board",
      }),
    onSuccess: () => {
      setNewTaskCol(null); setNewTitle(""); setNewAssignee(""); setNewPriority("normal"); setNewDueDate("");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  function openEdit(task: TaskEx) {
    setEditingTask(task);
    setEditForm({
      title: task.title,
      description: task.description || "",
      assignee_name: task.assignee_name || "",
      priority: task.priority || "normal",
      status: task.status || "todo",
      due_date: task.due_date || "",
      proof_required: Boolean(task.proof_required),
    });
  }

  function submitEdit() {
    if (!editingTask || !editForm.title.trim()) return;
    updateTask.mutate({
      id: editingTask.id,
      payload: {
        title: editForm.title.trim(),
        description: editForm.description,
        assignee_name: editForm.assignee_name,
        priority: editForm.priority,
        status: editForm.status,
        due_date: editForm.due_date || null,
        proof_required: editForm.proof_required,
      },
    });
  }

  function confirmDelete(task: TaskEx) {
    if (!window.confirm(`Supprimer la tâche "${task.title}" ? Une trace restera dans l'audit.`)) return;
    deleteTask.mutate(task.id);
  }

  /* merge API data with demo (API takes priority) */
  const allTasks: TaskEx[] = (() => {
    return (tasks.data ?? []) as TaskEx[];
  })();

  const filtered = allTasks
    .filter((t) =>
      !search || t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.assignee_name || "").toLowerCase().includes(search.toLowerCase())
    )
    .filter((t) => !priorityFilter || t.priority === priorityFilter);

  const grouped = Object.fromEntries(
    COLUMNS.map((col) => [col.key, filtered.filter((t) => t.status === col.key)])
  );

  const total = allTasks.length;
  const inProgress = allTasks.filter((t) => t.status === "doing").length;
  const late = allTasks.filter((t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done").length;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-0 pb-4 pt-0">
        <div>
          <h1 className="text-2xl font-extrabold text-[#17211f] dark:text-white">Projets &amp; Boards</h1>
          <p className="mt-0.5 text-sm text-[#717182]">
            {total} projets actifs · {inProgress} tâches en cours · {late} en retard
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 py-2 dark:border-white/[0.08] dark:bg-[#252931]">
            <Search size={15} className="text-[#717182]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une tâche…"
              className="w-44 bg-transparent text-sm text-[#17211f] outline-none placeholder:text-[#717182] dark:text-white"
            />
          </div>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm font-semibold text-[#17211f] dark:border-white/[0.08] dark:bg-[#252931] dark:text-white hover:bg-black/[0.03]">
            <option value="">Toutes priorités</option>
            <option value="high">Haute</option>
            <option value="normal">Normale</option>
            <option value="low">Basse</option>
          </select>
          <button
            onClick={() => navigate("/calendar")}
            className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm font-semibold text-[#17211f] dark:border-white/[0.08] dark:bg-[#252931] dark:text-white hover:bg-black/[0.03]">
            <CalendarDays size={15} /> Agenda
          </button>
          <button
            onClick={() => setNewTaskCol("todo")}
            disabled={!canManageTasks && !user?.employee_id}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition disabled:bg-stone-300"
          >
            <Plus size={15} /> Nouvelle tâche
          </button>
        </div>
      </div>

      {/* ── Kanban board ── */}
      <div className="flex flex-1 gap-4 overflow-x-auto pb-4 -mx-1 px-1">
        {COLUMNS.map((col) => {
          const cards = grouped[col.key] ?? [];
          return (
            <div
              key={col.key}
              className={`flex w-72 flex-shrink-0 flex-col rounded-xl border-t-4 border border-black/[0.06] bg-[#f4f5f7] dark:bg-[#161920] dark:border-white/[0.06] ${col.borderTop}`}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${col.tone} ${col.textTone}`}>
                    {col.label}
                  </span>
                  <span className="text-sm font-bold text-[#717182]">{cards.length}</span>
                </div>
                <button
                  onClick={() => setNewTaskCol(col.key)}
                  className="grid h-7 w-7 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition"
                >
                  <Plus size={15} />
                </button>
              </div>

              {/* Cards */}
              <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-3">
                {/* Quick add */}
                {newTaskCol === col.key && (
                  <div className="rounded-xl border border-emerald-300 bg-white p-3 dark:bg-[#252931] dark:border-emerald-500/40">
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newTitle.trim()) createTask.mutate({ title: newTitle.trim(), status: col.key });
                        if (e.key === "Escape") { setNewTaskCol(null); setNewTitle(""); }
                      }}
                      placeholder="Titre de la tâche…"
                      className="w-full bg-transparent text-sm text-[#17211f] outline-none placeholder:text-[#717182] dark:text-white"
                    />
                    <div className="mt-3 grid gap-2">
                      <select
                        value={newAssignee}
                        onChange={(e) => setNewAssignee(e.target.value)}
                        disabled={!canManageTasks}
                        className="rounded-lg border border-black/[0.08] bg-white px-2 py-1.5 text-xs font-semibold text-[#17211f] dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                      >
                        <option value="">{canManageTasks ? "Responsable surprise plus tard" : "Assignée à moi automatiquement"}</option>
                        {(employees.data ?? []).map((employee) => {
                          const name = `${employee.first_name} ${employee.last_name}`.trim();
                          return <option key={employee.id} value={name}>{name}</option>;
                        })}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={newPriority}
                          onChange={(e) => setNewPriority(e.target.value)}
                          className="rounded-lg border border-black/[0.08] bg-white px-2 py-1.5 text-xs font-semibold text-[#17211f] dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                        >
                          <option value="low">Basse</option>
                          <option value="normal">Normale</option>
                          <option value="high">Haute</option>
                        </select>
                        <input
                          type="date"
                          value={newDueDate}
                          onChange={(e) => setNewDueDate(e.target.value)}
                          className="rounded-lg border border-black/[0.08] bg-white px-2 py-1.5 text-xs font-semibold text-[#17211f] dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => { if (newTitle.trim()) createTask.mutate({ title: newTitle.trim(), status: col.key }); }}
                        className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white"
                      >
                        Ajouter
                      </button>
                      <button
                        onClick={() => { setNewTaskCol(null); setNewTitle(""); }}
                        className="rounded-md border border-black/[0.08] px-2.5 py-1 text-xs text-[#717182]"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}
                {cards.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    employees={employees.data ?? []}
                    onMove={(id, status) => updateTask.mutate({ id, payload: { status } })}
                    onAssign={(id, assignee_name) => updateTask.mutate({ id, payload: { assignee_name } })}
                    onEdit={openEdit}
                    onDelete={confirmDelete}
                  />
                ))}
                {cards.length === 0 && !newTaskCol && (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-black/[0.08] p-6 text-center dark:border-white/[0.08]">
                    <p className="text-xs text-[#717182]">Aucune tâche</p>
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

      {editingTask && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-black/[0.06] bg-white p-5 shadow-2xl dark:border-white/[0.08] dark:bg-[#1e2229]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[#17211f] dark:text-white">Modifier la tâche</h2>
                <p className="text-sm text-[#717182]">Chaque modification restera visible dans le journal d'audit.</p>
              </div>
              <button onClick={() => setEditingTask(null)} className="grid h-8 w-8 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05]">
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-bold uppercase text-[#717182]">
                Titre
                <input
                  value={editForm.title}
                  onChange={(event) => setEditForm({ ...editForm, title: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case outline-none"
                />
              </label>
              <label className="block text-xs font-bold uppercase text-[#717182]">
                Description
                <textarea
                  rows={3}
                  value={editForm.description}
                  onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case outline-none"
                />
              </label>
              <label className="block text-xs font-bold uppercase text-[#717182]">
                Assignée à
                <select
                  value={editForm.assignee_name}
                  onChange={(event) => setEditForm({ ...editForm, assignee_name: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case outline-none"
                >
                  <option value="">Non assignée</option>
                  {(employees.data ?? []).map((employee) => {
                    const name = `${employee.first_name} ${employee.last_name}`.trim();
                    return <option key={employee.id} value={name}>{name}</option>;
                  })}
                </select>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block text-xs font-bold uppercase text-[#717182]">
                  Statut
                  <select
                    value={editForm.status}
                    onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case outline-none"
                  >
                    {COLUMNS.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold uppercase text-[#717182]">
                  Priorité
                  <select
                    value={editForm.priority}
                    onChange={(event) => setEditForm({ ...editForm, priority: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case outline-none"
                  >
                    <option value="low">Basse</option>
                    <option value="normal">Normale</option>
                    <option value="high">Haute</option>
                  </select>
                </label>
                <label className="block text-xs font-bold uppercase text-[#717182]">
                  Échéance
                  <input
                    type="date"
                    value={editForm.due_date}
                    onChange={(event) => setEditForm({ ...editForm, due_date: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-black/[0.08] px-3 py-2 text-sm normal-case outline-none"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2 text-sm font-semibold text-[#17211f]">
                <input
                  type="checkbox"
                  checked={editForm.proof_required}
                  onChange={(event) => setEditForm({ ...editForm, proof_required: event.target.checked })}
                />
                Preuve demandée à l'employé
              </label>
              {updateTask.error && <p className="text-sm font-semibold text-rose-600">{updateTask.error.message}</p>}
              <button
                onClick={submitEdit}
                disabled={!editForm.title.trim() || updateTask.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-3 text-sm font-black text-white transition hover:bg-violet-700 disabled:bg-stone-300"
              >
                {updateTask.isPending ? "Enregistrement..." : "Enregistrer les modifications"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Copilot FAB ── */}
      <button
        onClick={() => navigate("/assistants")}
        title="Ouvrir le studio Limule"
        className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 transition z-10">
        <Sparkles size={20} />
      </button>
    </div>
  );
}
