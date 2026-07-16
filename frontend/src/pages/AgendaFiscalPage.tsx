import { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, CheckCircle2, Clock, AlertTriangle, CalendarDays, X } from "lucide-react";
import type { FiscalDeadlineDto } from "../services/api";
import { api } from "../services/api";

type FilterType = "all" | "upcoming" | "done" | "overdue";

const TAX_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  TVA:   { label: "TVA",   color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  IS:    { label: "IS",    color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  CNSS:  { label: "CNSS",  color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  IRPP:  { label: "IRPP",  color: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
  autre: { label: "Autre", color: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300" },
};

function taxBadge(taxType: string) {
  const cfg = TAX_TYPE_CONFIG[taxType.toUpperCase()] ?? TAX_TYPE_CONFIG.autre;
  const label = cfg === TAX_TYPE_CONFIG.autre ? i18n.t("fiscal.taxOther") : cfg.label;
  return <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${cfg.color}`}>{label}</span>;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const d   = new Date(dateStr);
  return Math.ceil((d.getTime() - now.setHours(0, 0, 0, 0)) / 86400000);
}

function isOverdue(item: FiscalDeadlineDto): boolean {
  return item.status !== "done" && daysUntil(item.due_date) < 0;
}

function isUrgent(item: FiscalDeadlineDto): boolean {
  const d = daysUntil(item.due_date);
  return item.status !== "done" && d >= 0 && d < 7;
}

interface AddFormData {
  title: string;
  due_date: string;
  tax_type: string;
  recurrence: string;
  description: string;
}

const EMPTY_FORM: AddFormData = {
  title: "",
  due_date: "",
  tax_type: "TVA",
  recurrence: "monthly",
  description: "",
};

function CalendarMini({ deadlines, year, month }: {
  deadlines: FiscalDeadlineDto[];
  year: number;
  month: number; // 0-indexed
}) {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7; // Mon-first

  const dayMap: Record<number, FiscalDeadlineDto[]> = {};
  for (const d of deadlines) {
    const dt = new Date(d.due_date);
    if (dt.getFullYear() === year && dt.getMonth() === month) {
      const day = dt.getDate();
      dayMap[day] = [...(dayMap[day] ?? []), d];
    }
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-4 dark:border-white/[0.08] dark:bg-[#1e2229]">
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays size={15} className="text-emerald-600" />
        <span className="text-sm font-semibold text-[#17211f] dark:text-white">
          {new Date(year, month, 1).toLocaleDateString(i18n.language, { month: "long", year: "numeric" })}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-px text-center">
        {Array.from({ length: 7 }, (_, wi) => new Date(2024, 0, 1 + wi).toLocaleDateString(i18n.language, { weekday: "short" }).slice(0, 2)).map((d, wi) => (
          <div key={wi} className="py-1 text-[10px] font-bold uppercase text-[#717182] dark:text-white/40">{d}</div>
        ))}
        {cells.map((day, i) => {
          const items = day ? (dayMap[day] ?? []) : [];
          const hasDone    = items.some((x) => x.status === "done");
          const hasOverdue = items.some((x) => isOverdue(x));
          const hasUrgent  = items.some((x) => isUrgent(x));
          const hasPending = items.some((x) => x.status !== "done");

          let dot = "";
          if (hasOverdue)      dot = "bg-red-500";
          else if (hasUrgent)  dot = "bg-amber-500";
          else if (hasDone && !hasPending) dot = "bg-emerald-500";
          else if (hasPending) dot = "bg-blue-500";

          const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();

          return (
            <div
              key={i}
              className={`relative flex h-8 w-full flex-col items-center justify-center rounded text-xs ${
                !day ? "" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.04] cursor-default"
              } ${isToday ? "ring-1 ring-emerald-500 font-bold" : ""}`}
            >
              {day && (
                <>
                  <span className={`text-[11px] ${isToday ? "text-emerald-600 dark:text-emerald-400" : "text-[#17211f] dark:text-white/80"}`}>
                    {day}
                  </span>
                  {dot && <span className={`absolute bottom-0.5 h-1 w-1 rounded-full ${dot}`} />}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AgendaFiscalPage() {
  const { t: tr } = useTranslation();
  const qc = useQueryClient();
  const [filter, setFilter]     = useState<FilterType>("all");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]          = useState<AddFormData>(EMPTY_FORM);

  const today     = new Date();
  const calYear   = today.getFullYear();
  const calMonth  = today.getMonth();

  const deadlinesQ = useQuery({
    queryKey: ["fiscal-deadlines"],
    queryFn: () => api.fiscalDeadlines(),
  });

  const generateMut = useMutation({
    mutationFn: api.generateFiscalDeadlines,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fiscal-deadlines"] }),
  });

  const createMut = useMutation({
    mutationFn: (payload: Omit<FiscalDeadlineDto, "id" | "created_at">) =>
      api.createFiscalDeadline(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal-deadlines"] });
      setShowModal(false);
      setForm(EMPTY_FORM);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<FiscalDeadlineDto> }) =>
      api.updateFiscalDeadline(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fiscal-deadlines"] }),
  });

  const allDeadlines = deadlinesQ.data ?? [];

  const filtered = allDeadlines.filter((d) => {
    if (filter === "all")      return true;
    if (filter === "done")     return d.status === "done";
    if (filter === "overdue")  return isOverdue(d);
    if (filter === "upcoming") return d.status !== "done" && !isOverdue(d);
    return true;
  }).sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMut.mutate({
      title: form.title,
      due_date: form.due_date,
      tax_type: form.tax_type,
      recurrence: form.recurrence,
      description: form.description,
      status: "pending",
      reminder_days: 7,
    });
  }

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: "all",      label: tr("fiscal.filterAll") },
    { key: "upcoming", label: tr("fiscal.filterUpcoming") },
    { key: "done",     label: tr("fiscal.filterDone") },
    { key: "overdue",  label: tr("fiscal.filterOverdue") },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-[#17211f] dark:text-white">{tr("fiscal.title")}</h1>
          <p className="text-sm text-[#717182] dark:text-white/50">{tr("fiscal.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => generateMut.mutate()}
            disabled={generateMut.isPending}
            className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-sm font-semibold text-[#17211f] hover:bg-[#f5f5fa] transition dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white disabled:opacity-50"
          >
            <RefreshCw size={14} className={generateMut.isPending ? "animate-spin" : ""} />
            {tr("fiscal.generateAnnual")}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 transition"
          >
            <Plus size={15} />
            {tr("fiscal.addDeadline")}
          </button>
        </div>
      </div>

      {/* Filters + Calendar side by side */}
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        {/* Left: list */}
        <div className="space-y-4">
          {/* Filter tabs */}
          <div className="flex gap-1 rounded-xl border border-black/[0.06] bg-white p-1 dark:border-white/[0.08] dark:bg-[#1e2229]">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                  filter === f.key
                    ? "bg-emerald-600 text-white"
                    : "text-[#717182] hover:bg-black/[0.04] dark:text-white/50 dark:hover:bg-white/[0.04]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* List */}
          {deadlinesQ.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.04]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-black/[0.06] bg-white py-16 text-center dark:border-white/[0.08] dark:bg-[#1e2229]">
              <CalendarDays size={32} className="mx-auto mb-3 text-[#717182] dark:text-white/30" />
              <p className="text-sm text-[#717182] dark:text-white/40">{tr("fiscal.noDeadlines")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => {
                const days     = daysUntil(item.due_date);
                const overdue  = isOverdue(item);
                const urgent   = isUrgent(item);
                const done     = item.status === "done";

                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 rounded-xl border bg-white p-4 transition dark:bg-[#1e2229] ${
                      overdue
                        ? "border-red-200 dark:border-red-900/50"
                        : urgent
                        ? "border-amber-200 dark:border-amber-900/50"
                        : done
                        ? "border-emerald-100 dark:border-emerald-900/30 opacity-70"
                        : "border-black/[0.06] dark:border-white/[0.08]"
                    }`}
                  >
                    <button
                      onClick={() => updateMut.mutate({ id: item.id, payload: { status: done ? "pending" : "done" } })}
                      className={`mt-0.5 shrink-0 transition ${done ? "text-emerald-500" : "text-[#717182] hover:text-emerald-500 dark:text-white/40"}`}
                      title={done ? tr("fiscal.markPending") : tr("fiscal.markDone")}
                      aria-label={done ? tr("fiscal.markPending") : tr("fiscal.markDone")}
                      aria-pressed={done}
                    >
                      <CheckCircle2 size={20} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-semibold ${done ? "line-through text-[#717182] dark:text-white/40" : "text-[#17211f] dark:text-white"}`}>
                          {item.title}
                        </span>
                        {taxBadge(item.tax_type)}
                        {overdue && (
                          <span className="flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                            <AlertTriangle size={10} /> {tr("fiscal.overdue")}
                          </span>
                        )}
                        {urgent && !overdue && (
                          <span className="flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                            <Clock size={10} /> {tr("fiscal.daysShort", { days })}
                          </span>
                        )}
                        {done && (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                            {tr("fiscal.done")}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[#717182] dark:text-white/40">
                        {tr("fiscal.dueLabel", { date: new Date(item.due_date).toLocaleDateString(i18n.language) })}
                        {item.recurrence && item.recurrence !== "none" && ` · ${item.recurrence}`}
                        {item.description && ` · ${item.description}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: calendar */}
        <CalendarMini deadlines={allDeadlines} year={calYear} month={calMonth} />
      </div>

      {/* Add deadline modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            className="absolute inset-0 bg-black/40"
            onClick={() => { setShowModal(false); setForm(EMPTY_FORM); }}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-black/[0.06] bg-white p-6 shadow-2xl dark:border-white/[0.08] dark:bg-[#1e2229]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-[#17211f] dark:text-white">{tr("fiscal.modalTitle")}</h2>
              <button
                onClick={() => { setShowModal(false); setForm(EMPTY_FORM); }}
                aria-label={tr("common.close")}
                className="grid h-8 w-8 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05] dark:text-white/50 dark:hover:bg-white/[0.06]"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#717182] dark:text-white/50">{tr("fiscal.fTitle")}</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={tr("fiscal.titlePlaceholder")}
                  className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-white/[0.08] dark:bg-[#111318] dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#717182] dark:text-white/50">{tr("fiscal.dueDate")}</label>
                  <input
                    type="date"
                    required
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-white/[0.08] dark:bg-[#111318] dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#717182] dark:text-white/50">{tr("fiscal.taxType")}</label>
                  <select
                    value={form.tax_type}
                    onChange={(e) => setForm({ ...form, tax_type: e.target.value })}
                    className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-white/[0.08] dark:bg-[#111318] dark:text-white"
                  >
                    <option value="TVA">TVA</option>
                    <option value="IS">IS</option>
                    <option value="CNSS">CNSS</option>
                    <option value="IRPP">IRPP</option>
                    <option value="autre">{tr("fiscal.taxOther")}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#717182] dark:text-white/50">{tr("fiscal.recurrence")}</label>
                <select
                  value={form.recurrence}
                  onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
                  className="w-full rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-white/[0.08] dark:bg-[#111318] dark:text-white"
                >
                  <option value="none">{tr("fiscal.recNone")}</option>
                  <option value="monthly">{tr("fiscal.recMonthly")}</option>
                  <option value="quarterly">{tr("fiscal.recQuarterly")}</option>
                  <option value="annual">{tr("fiscal.recAnnual")}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#717182] dark:text-white/50">{tr("fiscal.description")}</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder={tr("fiscal.descPlaceholder")}
                  className="w-full resize-none rounded-lg border border-black/[0.08] bg-[#f7f8fa] px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-white/[0.08] dark:bg-[#111318] dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setForm(EMPTY_FORM); }}
                  className="rounded-lg border border-black/[0.08] px-4 py-2 text-sm font-semibold text-[#17211f] hover:bg-[#f5f5fa] dark:border-white/[0.08] dark:text-white dark:hover:bg-white/[0.06]"
                >
                  {tr("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={createMut.isPending}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {createMut.isPending ? tr("fiscal.saving") : tr("fiscal.add")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
