import { useMemo, useState, DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Calendar, Flag, Plus, Search, Trash2, X } from "lucide-react";

import { api } from "../services/api";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import type { Task } from "../types/domain";
import { shortDate } from "../utils/format";

const COLUMNS = [
  { key: "todo", tk: "kanban.colTodo", accent: "border-t-stone-400", dot: "bg-stone-400" },
  { key: "doing", tk: "kanban.colDoing", accent: "border-t-sky-500", dot: "bg-sky-500" },
  { key: "review", tk: "kanban.colReview", accent: "border-t-amber-500", dot: "bg-amber-500" },
  { key: "done", tk: "kanban.colDone", accent: "border-t-emerald-500", dot: "bg-emerald-500" },
] as const;

const PRIORITY = {
  urgent: { tk: "kanban.priorityUrgent", cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300" },
  high: { tk: "kanban.priorityHigh", cls: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300" },
  normal: { tk: "kanban.priorityNormal", cls: "bg-stone-100 text-stone-600 dark:bg-white/10 dark:text-white/60" },
  low: { tk: "kanban.priorityLow", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
} as const;

const AVATAR_COLORS = ["bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-sky-500", "bg-fuchsia-500"];
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";
}
function isOverdue(due: string | null, status: string) {
  if (!due || status === "done") return false;
  return new Date(due) < new Date(new Date().toDateString());
}

export function KanbanPage() {
  const { t: tr } = useTranslation();
  const toast = useToast();
  const { confirm } = useConfirm();
  const queryClient = useQueryClient();
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: api.tasks });

  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("all");
  const [priority, setPriority] = useState("all");
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const tasks = tasksQuery.data ?? [];

  const assignees = useMemo(
    () => Array.from(new Set(tasks.map((t) => t.assignee_name).filter(Boolean))),
    [tasks],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      const matchSearch = !q || `${t.title} ${t.assignee_name} ${t.tags} ${t.project}`.toLowerCase().includes(q);
      const matchAssignee = assignee === "all" || t.assignee_name === assignee;
      const matchPriority = priority === "all" || t.priority === priority;
      return matchSearch && matchAssignee && matchPriority;
    });
  }, [tasks, search, assignee, priority]);

  const byColumn = useMemo(() => {
    const map: Record<string, Task[]> = { todo: [], doing: [], review: [], done: [] };
    for (const t of filtered) {
      const col = map[t.status] ? t.status : "todo";
      map[col].push(t);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.order_index - b.order_index) || (a.id - b.id));
    }
    return map;
  }, [filtered]);

  const reorder = useMutation({
    mutationFn: api.reorderTasks,
    onSuccess: (data) => queryClient.setQueryData(["tasks"], data),
  });
  const createTask = useMutation({
    mutationFn: api.createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(tr("kanban.added"));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteTask = useMutation({
    mutationFn: api.deleteTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  function onDrop(colKey: string) {
    setOverCol(null);
    if (dragId == null) return;
    const dragged = tasks.find((t) => t.id === dragId);
    setDragId(null);
    if (!dragged) return;
    // Build new ordering: append dragged to target column end
    const target = byColumn[colKey].filter((t) => t.id !== dragId);
    const reordered = [...target, dragged];
    const items = reordered.map((t, i) => ({ id: t.id, status: colKey, order_index: i }));
    // Optimistic update
    const next = tasks.map((t) => {
      const it = items.find((x) => x.id === t.id);
      return it ? { ...t, status: it.status, order_index: it.order_index } : t;
    });
    queryClient.setQueryData(["tasks"], next);
    reorder.mutate(items);
  }

  function quickAdd(colKey: string) {
    const title = newTitle.trim();
    if (!title) { setAdding(null); return; }
    createTask.mutate({ title, status: colKey, priority: "normal" });
    setNewTitle("");
    setAdding(null);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#17211f] dark:text-white">{tr("kanban.title")}</h1>
          <p className="mt-0.5 text-sm text-[#717182]">
            {tr("kanban.subtitle")} · {tr("kanban.totalTasks", { count: tasks.length })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
            <Search size={15} className="text-[#717182]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("kanban.searchPlaceholder")}
              aria-label={tr("kanban.searchPlaceholder")}
              className="w-48 bg-transparent text-sm outline-none text-[#17211f] placeholder:text-[#717182] dark:text-white"
            />
          </div>
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            aria-label={tr("kanban.filterByAssignee")}
            className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            <option value="all">{tr("kanban.allAssignees")}</option>
            {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            aria-label={tr("kanban.filterByPriority")}
            className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            <option value="all">{tr("kanban.allPriorities")}</option>
            {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{tr(v.tk)}</option>)}
          </select>
        </div>
      </div>

      {/* Board */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = byColumn[col.key] ?? [];
          return (
            <div
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); setOverCol(col.key); }}
              onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
              onDrop={() => onDrop(col.key)}
              className={`flex flex-col rounded-xl border border-t-2 ${col.accent} bg-[#f8f8fc] dark:bg-white/[0.02] border-black/[0.06] dark:border-white/[0.06] ${overCol === col.key ? "ring-2 ring-emerald-400" : ""}`}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                  <span className="text-sm font-bold text-[#17211f] dark:text-white">{tr(col.tk)}</span>
                  <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-semibold text-[#717182] dark:bg-white/10">{items.length}</span>
                </div>
              </div>

              <div className="flex-1 space-y-2 px-2 pb-2 min-h-[120px]">
                {items.map((task) => {
                  const prio = PRIORITY[(task.priority as keyof typeof PRIORITY)] ?? PRIORITY.normal;
                  const overdue = isOverdue(task.due_date, task.status);
                  const tags = (task.tags || "").split(",").map((s) => s.trim()).filter(Boolean);
                  return (
                    <div
                      key={task.id}
                      draggable={task.can_update}
                      onDragStart={() => setDragId(task.id)}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      className={`group rounded-lg border border-black/[0.06] bg-white p-3 shadow-sm transition dark:border-white/[0.08] dark:bg-[#1e2229] ${task.can_update ? "cursor-grab active:cursor-grabbing hover:border-emerald-300" : ""} ${dragId === task.id ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-[#17211f] dark:text-white">{task.title}</p>
                        {task.can_delete && (
                          <button
                            onClick={async () => { if (await confirm({ title: tr("kanban.deleteTask"), danger: true, confirmLabel: tr("common.delete") })) deleteTask.mutate(task.id); }}
                            aria-label={tr("common.delete")}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-[#717182] hover:text-rose-600 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      {tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {tags.map((tag) => (
                            <span key={tag} className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">{tag}</span>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${prio.cls}`}>
                          <Flag size={9} /> {tr(prio.tk)}
                        </span>
                        {task.due_date && (
                          <span className={`flex items-center gap-1 text-[11px] ${overdue ? "font-bold text-rose-600 dark:text-rose-400" : "text-[#717182]"}`}>
                            {overdue ? <AlertTriangle size={10} /> : <Calendar size={10} />}
                            {shortDate(task.due_date)}
                          </span>
                        )}
                        {task.project && (
                          <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">{task.project}</span>
                        )}
                        {task.assignee_name && (
                          <span className={`ml-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${avatarColor(task.assignee_name)}`} title={task.assignee_name}>
                            {initials(task.assignee_name)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {items.length === 0 && overCol !== col.key && (
                  <p className="py-6 text-center text-xs text-[#aaaabc]">{tr("kanban.noTasks")}</p>
                )}
                {overCol === col.key && (
                  <div className="rounded-lg border-2 border-dashed border-emerald-400 py-6 text-center text-xs font-semibold text-emerald-600">{tr("kanban.dropHere")}</div>
                )}

                {/* Quick add */}
                {adding === col.key ? (
                  <div className="rounded-lg border border-emerald-300 bg-white p-2 dark:bg-[#1e2229]">
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") quickAdd(col.key); if (e.key === "Escape") { setAdding(null); setNewTitle(""); } }}
                      placeholder={tr("kanban.addCardPlaceholder")}
                      aria-label={tr("kanban.addCardPlaceholder")}
                      className="w-full bg-transparent text-sm outline-none text-[#17211f] dark:text-white"
                    />
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => quickAdd(col.key)} className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700">{tr("kanban.add")}</button>
                      <button onClick={() => { setAdding(null); setNewTitle(""); }} aria-label={tr("common.cancel")} className="grid h-6 w-6 place-items-center rounded-md text-[#717182] hover:bg-black/[0.05] dark:hover:bg-white/10"><X size={13} /></button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAdding(col.key); setNewTitle(""); }}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  >
                    <Plus size={13} /> {tr("kanban.addCard")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
