import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Circle,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";

import { api } from "../services/api";
import type { BudgetCategoryCreateDto, BudgetSummaryDto } from "../services/api";
import { money, compactMoney } from "../utils/format";
import { useCurrency } from "../contexts/CurrencyContext";
import { useConfirm } from "../components/ConfirmProvider";

/* ── Types ────────────────────────────────────────────────────── */
type Period = "monthly" | "quarterly" | "yearly";
type CategoryType = "expense" | "income" | "investment";

/* ── Constants ────────────────────────────────────────────────── */
const PERIOD_TABS: { key: Period; tk: string }[] = [
  { key: "monthly", tk: "budget.periodMonthly" },
  { key: "quarterly", tk: "budget.periodQuarterly" },
  { key: "yearly", tk: "budget.periodYearly" },
];

const CATEGORY_TYPES: { key: CategoryType; tk: string }[] = [
  { key: "expense", tk: "budget.typeExpense" },
  { key: "income", tk: "budget.typeIncome" },
  { key: "investment", tk: "budget.typeInvestment" },
];

const DEFAULT_COLORS = [
  "#059669", "#0d9488", "#0891b2", "#7c3aed", "#db2777",
  "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#9333ea",
];

const DEFAULT_ICONS = [
  "circle", "wallet", "trending-up", "trending-down", "piggy-bank",
];

/* ── Helpers ──────────────────────────────────────────────────── */
function progressColor(pct: number, type: CategoryType): string {
  if (type === "income") return "bg-blue-500";
  if (type === "investment") return "bg-violet-500";
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-400";
  return "bg-emerald-500";
}

function typeLabel(t: CategoryType, tr: TFunction): string {
  const tk = CATEGORY_TYPES.find((c) => c.key === t)?.tk;
  return tk ? tr(tk) : t;
}

function typeBadgeClass(t: CategoryType): string {
  if (t === "income") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  if (t === "investment") return "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
}

/* ── KPI Card ─────────────────────────────────────────────────── */
function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] p-4 flex gap-3 items-start">
      <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${accent}`}>
        <Icon size={17} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[#717182] uppercase tracking-wide">{label}</p>
        <p className="mt-0.5 text-lg font-bold text-[#17211f] dark:text-white leading-tight">{value}</p>
        {sub && <p className="text-xs text-[#717182] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Category Row ─────────────────────────────────────────────── */
function CategoryRow({
  item,
  onEdit,
  onDelete,
}: {
  item: BudgetSummaryDto;
  onEdit: (item: BudgetSummaryDto) => void;
  onDelete: (item: BudgetSummaryDto) => void;
}) {
  const { t: tr } = useTranslation();
  const pct = Math.min(item.progress_pct, 100);
  const barColor = progressColor(item.progress_pct, item.category_type as CategoryType);

  return (
    <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] p-4 hover:border-emerald-400/40 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
            style={{ backgroundColor: item.color + "22", color: item.color }}
          >
            <Circle size={16} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-[#17211f] dark:text-white truncate">{item.name}</p>
            <span className={`inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${typeBadgeClass(item.category_type as CategoryType)}`}>
              {typeLabel(item.category_type as CategoryType, tr)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => onEdit(item)}
            aria-label={tr("common.edit")}
            className="grid h-7 w-7 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] hover:text-emerald-600 transition"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(item)}
            aria-label={tr("common.delete")}
            className="grid h-7 w-7 place-items-center rounded-lg text-[#717182] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-[#717182] mb-1.5">
          <span>
            {tr("budget.spent", { amount: compactMoney(item.spent) })}
          </span>
          <span className="font-medium" style={{ color: item.progress_pct >= 90 ? "#ef4444" : item.color }}>
            {item.progress_pct.toFixed(0)}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-[#717182] mt-1.5">
          <span>{tr("budget.planned")} <span className="font-semibold text-[#17211f] dark:text-white">{compactMoney(item.planned_amount)}</span></span>
          <span>
            {tr("budget.remaining")}{" "}
            <span className={`font-semibold ${item.remaining < 0 ? "text-red-500" : "text-emerald-600"}`}>
              {item.remaining >= 0 ? compactMoney(item.remaining) : `-${compactMoney(Math.abs(item.remaining))}`}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Modal ────────────────────────────────────────────────────── */
type ModalFormState = {
  name: string;
  icon: string;
  color: string;
  planned_amount: string;
  period: Period;
  category_type: CategoryType;
};

const INITIAL_FORM: ModalFormState = {
  name: "",
  icon: "circle",
  color: "#059669",
  planned_amount: "",
  period: "monthly",
  category_type: "expense",
};

function CategoryModal({
  open,
  initialData,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  initialData: ModalFormState | null;
  onClose: () => void;
  onSave: (data: BudgetCategoryCreateDto) => void;
  saving: boolean;
}) {
  const { t: tr } = useTranslation();
  const [form, setForm] = useState<ModalFormState>(initialData ?? INITIAL_FORM);

  // Keep form in sync with initialData when modal opens
  useEffect(() => {
    if (open) setForm(initialData ?? INITIAL_FORM);
  }, [open, initialData]);

  if (!open) return null;

  function set<K extends keyof ModalFormState>(key: K, value: ModalFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.planned_amount);
    if (!form.name.trim()) return;
    onSave({
      name: form.name.trim(),
      icon: form.icon,
      color: form.color,
      planned_amount: isNaN(amount) ? 0 : amount,
      period: form.period,
      category_type: form.category_type,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-[#1e2229] shadow-2xl border border-black/[0.08] dark:border-white/[0.08]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2">
            <PiggyBank size={18} className="text-emerald-600" />
            <h2 className="font-semibold text-[#17211f] dark:text-white">
              {initialData ? tr("budget.editCategory") : tr("budget.newCategory")}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={tr("common.close")}
            className="grid h-7 w-7 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
          >
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-[#717182] uppercase tracking-wide mb-1.5">
              {tr("budget.categoryName")}
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={tr("budget.namePlaceholder")}
              className="w-full rounded-lg border border-black/[0.12] dark:border-white/[0.12] bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:text-white placeholder:text-[#717182]"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-[#717182] uppercase tracking-wide mb-1.5">
              {tr("budget.type")}
            </label>
            <div className="flex gap-2">
              {CATEGORY_TYPES.map((ct) => (
                <button
                  key={ct.key}
                  type="button"
                  onClick={() => set("category_type", ct.key)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    form.category_type === ct.key
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                      : "border-black/[0.10] dark:border-white/[0.10] text-[#717182] hover:border-emerald-400/50"
                  }`}
                >
                  {tr(ct.tk)}
                </button>
              ))}
            </div>
          </div>

          {/* Planned amount */}
          <div>
            <label className="block text-xs font-semibold text-[#717182] uppercase tracking-wide mb-1.5">
              {tr("budget.plannedAmount")}
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={form.planned_amount}
              onChange={(e) => set("planned_amount", e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-black/[0.12] dark:border-white/[0.12] bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:text-white placeholder:text-[#717182]"
            />
          </div>

          {/* Period */}
          <div>
            <label className="block text-xs font-semibold text-[#717182] uppercase tracking-wide mb-1.5">
              {tr("budget.period")}
            </label>
            <div className="flex gap-2">
              {PERIOD_TABS.map((pt) => (
                <button
                  key={pt.key}
                  type="button"
                  onClick={() => set("period", pt.key)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    form.period === pt.key
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                      : "border-black/[0.10] dark:border-white/[0.10] text-[#717182] hover:border-emerald-400/50"
                  }`}
                >
                  {tr(pt.tk)}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-semibold text-[#717182] uppercase tracking-wide mb-1.5">
              {tr("budget.color")}
            </label>
            <div className="flex gap-2 flex-wrap">
              {DEFAULT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("color", c)}
                  className={`h-7 w-7 rounded-full border-2 transition ${
                    form.color === c
                      ? "border-[#17211f] dark:border-white scale-110"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                  aria-label={c}
                  aria-pressed={form.color === c}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={(e) => set("color", e.target.value)}
                className="h-7 w-7 rounded-full cursor-pointer border-2 border-black/[0.10] dark:border-white/[0.10]"
                title={tr("budget.customColor")}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-black/[0.12] dark:border-white/[0.12] py-2.5 text-sm font-medium text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition"
            >
              {tr("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition"
            >
              {saving ? tr("budget.saving") : initialData ? tr("budget.edit") : tr("budget.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────── */
export function BudgetPage() {
  const { t: tr } = useTranslation();
  useCurrency(); // subscribe so re-renders on currency change
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const [activePeriod, setActivePeriod] = useState<Period>("monthly");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<(BudgetSummaryDto & { _editId?: number }) | null>(null);

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ["budget-summary", activePeriod],
    queryFn: () => api.budgetSummary(activePeriod),
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: (payload: BudgetCategoryCreateDto) => api.createBudgetCategory(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget-summary"] });
      setModalOpen(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<BudgetCategoryCreateDto> }) =>
      api.updateBudgetCategory(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget-summary"] });
      setEditTarget(null);
      setModalOpen(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteBudgetCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budget-summary"] }),
  });

  /* ── KPI computation ─────────────────────────────────────────── */
  const expenses = summary.filter((s) => s.category_type === "expense");
  const incomes = summary.filter((s) => s.category_type === "income");

  const totalPlanned = summary.reduce((acc, s) => acc + s.planned_amount, 0);
  const totalSpent = expenses.reduce((acc, s) => acc + s.spent, 0);
  const totalIncome = incomes.reduce((acc, s) => acc + s.spent, 0);
  const usedPct = totalPlanned > 0 ? (totalSpent / totalPlanned) * 100 : 0;
  const savings = totalIncome - totalSpent;

  /* ── Pie chart data ──────────────────────────────────────────── */
  const pieData = expenses
    .filter((s) => s.planned_amount > 0)
    .map((s) => ({ name: s.name, value: s.planned_amount, color: s.color }));

  /* ── Handlers ────────────────────────────────────────────────── */
  function openCreate() {
    setEditTarget(null);
    setModalOpen(true);
  }

  function openEdit(item: BudgetSummaryDto) {
    setEditTarget(item);
    setModalOpen(true);
  }

  async function handleDelete(item: BudgetSummaryDto) {
    const ok = await confirm({
      title: tr("budget.deleteTitle"),
      message: item.name,
      confirmLabel: tr("common.delete"),
      danger: true,
    });
    if (ok) deleteMut.mutate(item.id);
  }

  function handleSave(data: BudgetCategoryCreateDto) {
    if (editTarget) {
      updateMut.mutate({ id: editTarget.id, payload: data });
    } else {
      createMut.mutate(data);
    }
  }

  const isSaving = createMut.isPending || updateMut.isPending;

  /* ── Modal initial data ──────────────────────────────────────── */
  const modalInitialData: ModalFormState | null = editTarget
    ? {
        name: editTarget.name,
        icon: editTarget.icon,
        color: editTarget.color,
        planned_amount: String(editTarget.planned_amount),
        period: editTarget.period as Period,
        category_type: editTarget.category_type as CategoryType,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#17211f] dark:text-white">{tr("budget.title")}</h1>
          <p className="text-sm text-[#717182] mt-0.5">
            {tr("budget.subtitle")}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition shadow-sm"
        >
          <Plus size={16} />
          {tr("budget.newCategoryBtn")}
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={tr("budget.kpiTotalPlanned")}
          value={compactMoney(totalPlanned)}
          sub={tr("budget.categoriesCount", { count: summary.length })}
          icon={PiggyBank}
          accent="bg-emerald-600"
        />
        <KpiCard
          label={tr("budget.kpiTotalSpent")}
          value={compactMoney(totalSpent)}
          sub={tr("budget.expenseItems", { count: expenses.length })}
          icon={TrendingDown}
          accent={usedPct >= 90 ? "bg-red-500" : "bg-amber-500"}
        />
        <KpiCard
          label={tr("budget.kpiUsedPct")}
          value={`${usedPct.toFixed(0)}%`}
          sub={totalPlanned > 0 ? tr("budget.onAmount", { amount: compactMoney(totalPlanned) }) : tr("budget.noBudgetDefined")}
          icon={Wallet}
          accent={usedPct >= 90 ? "bg-red-500" : "bg-blue-600"}
        />
        <KpiCard
          label={tr("budget.kpiSavings")}
          value={compactMoney(Math.abs(savings))}
          sub={savings >= 0 ? tr("budget.surplus") : tr("budget.overrun")}
          icon={TrendingUp}
          accent={savings >= 0 ? "bg-emerald-600" : "bg-red-500"}
        />
      </div>

      {/* Period tabs + main content */}
      <div className="flex gap-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] p-1 w-fit">
        {PERIOD_TABS.map((pt) => (
          <button
            key={pt.key}
            onClick={() => setActivePeriod(pt.key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              activePeriod === pt.key
                ? "bg-white dark:bg-[#1e2229] shadow text-[#17211f] dark:text-white"
                : "text-[#717182] hover:text-[#17211f] dark:hover:text-white"
            }`}
          >
            {tr(pt.tk)}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-6 w-6 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        </div>
      ) : summary.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/[0.10] dark:border-white/[0.10] py-16 px-6">
          <PiggyBank size={36} className="text-[#717182] mb-3" />
          <p className="font-semibold text-[#17211f] dark:text-white text-lg">{tr("budget.noCategoriesTitle")}</p>
          <p className="text-sm text-[#717182] mt-1 text-center max-w-sm">
            {tr("budget.noCategoriesDesc")}
          </p>
          <button
            onClick={openCreate}
            className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition"
          >
            <Plus size={15} />
            {tr("budget.createCategory")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Category list — 2/3 width on large */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-sm font-semibold text-[#717182] uppercase tracking-wide">
              {tr("budget.categoriesPeriod", { period: tr(PERIOD_TABS.find((p) => p.key === activePeriod)?.tk ?? "budget.periodMonthly").toLowerCase() })}
            </h2>
            {summary.map((item) => (
              <CategoryRow
                key={item.id}
                item={item}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* Pie chart — 1/3 width */}
          <div className="space-y-4">
            {pieData.length > 0 && (
              <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] p-4">
                <h2 className="text-sm font-semibold text-[#17211f] dark:text-white mb-4">
                  {tr("budget.plannedSplit")}
                </h2>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any) => [money(Number(value)), tr("budget.plannedTooltip")]}
                      contentStyle={{
                        borderRadius: "0.75rem",
                        border: "1px solid rgba(0,0,0,0.08)",
                        fontSize: "12px",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => (
                        <span className="text-xs text-[#717182]">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Summary table */}
            <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] p-4">
              <h2 className="text-sm font-semibold text-[#17211f] dark:text-white mb-3">
                {tr("budget.summary")}
              </h2>
              <div className="space-y-2">
                {summary.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate text-[#17211f] dark:text-white/80">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <span className="text-[#717182] text-xs">
                        {compactMoney(item.spent)} / {compactMoney(item.planned_amount)}
                      </span>
                      <span
                        className={`text-xs font-bold w-10 text-right ${
                          item.progress_pct >= 90
                            ? "text-red-500"
                            : item.progress_pct >= 70
                            ? "text-amber-500"
                            : "text-emerald-600"
                        }`}
                      >
                        {item.progress_pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      <CategoryModal
        open={modalOpen}
        initialData={modalInitialData}
        onClose={() => {
          setModalOpen(false);
          setEditTarget(null);
        }}
        onSave={handleSave}
        saving={isSaving}
      />
    </div>
  );
}
