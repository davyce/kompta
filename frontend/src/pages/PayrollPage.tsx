import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import {
  AlertCircle, AlertTriangle, ArrowRight, Calendar, CheckCircle2,
  ChevronRight, Clock, Download, Edit2, FileText, Loader2,
  Plus, Send, Users, Wallet, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import i18n from "../i18n";
import { api } from "../services/api";
import type { EmployeePayrollOverride, Payslip } from "../types/domain";
import { money, compactMoney } from "../utils/format";
import { useCurrency } from "../contexts/CurrencyContext";
import { LimuleIcon } from "../components/LimuleAvatar";
import { useToast } from "../components/ToastProvider";

/* ── helpers ───────────────────────────────────────────────────── */
function openBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_COLORS = [
  "bg-emerald-500","bg-violet-500","bg-sky-500",
  "bg-amber-500","bg-rose-500","bg-indigo-500",
];
function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const MONTH_KEYS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;
const MONTHS = MONTH_KEYS.map((_, index) => {
  const name = new Intl.DateTimeFormat("fr", { month: "long" }).format(new Date(2024, index, 1));
  return name.charAt(0).toUpperCase() + name.slice(1);
});
const MONTH_KEY_BY_FR = MONTHS.reduce<Record<string, (typeof MONTH_KEYS)[number]>>((acc, month, index) => {
  acc[month] = MONTH_KEYS[index]!;
  return acc;
}, {});

function monthName(index: number, tr: TFunction) {
  return tr(`payroll.months.${MONTH_KEYS[index]}`);
}

function displayPeriod(period: string, tr: TFunction) {
  const [month, ...rest] = period.split(" ");
  const key = MONTH_KEY_BY_FR[month];
  return key ? `${tr(`payroll.months.${key}`)} ${rest.join(" ")}` : period;
}

function payrollDate(value: string | null, tr: TFunction) {
  if (!value) return tr("payroll.date.notDefined");
  return new Intl.DateTimeFormat(i18n.language, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

type Tab = "variables" | "bulletins" | "teras" | "historique" | "reversements";

/* ── sub-components ────────────────────────────────────────────── */
function KpiCard({ label, value, sub, icon: Icon, accent = "emerald" }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; accent?: "emerald" | "amber" | "sky" | "rose";
}) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    amber:   "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
    sky:     "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
    rose:    "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
  };
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#717182]">{label}</p>
          <p className="mt-1.5 text-2xl font-extrabold text-[#17211f] dark:text-white leading-none">{value}</p>
          {sub && <p className="mt-1 text-xs text-[#717182]">{sub}</p>}
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors[accent]}`}>
          <Icon size={20} />
        </span>
      </div>
    </div>
  );
}

/* ── Bulletin card ─────────────────────────────────────────────── */
function BulletinCard({
  slip, onDownload, onUpdateStatus,
}: {
  slip: Payslip;
  onDownload: (id: number) => void;
  onUpdateStatus: (id: number, status: string) => void;
}) {
  const { t: tr } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isReady = slip.payout_status === "ready";
  const isDone = slip.payout_status === "paid";
  const isMissing = !slip.payout_destination || slip.payout_status === "missing_destination";

  return (
    <div className={`rounded-xl border bg-white dark:bg-[#1e2229] overflow-hidden transition-all ${
      isDone ? "border-emerald-200 dark:border-emerald-500/30"
      : isMissing ? "border-amber-200 dark:border-amber-500/30"
      : "border-black/[0.06] dark:border-white/[0.06]"
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(slip.employee_name)}`}>
          {initials(slip.employee_name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#17211f] dark:text-white truncate">{slip.employee_name}</p>
          <p className="text-xs text-[#717182]">{tr("payroll.bulletin.reference")} {slip.reference}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-extrabold text-emerald-600">{money(slip.net_pay)}</p>
          <p className="text-[10px] text-[#717182]">{tr("payroll.bulletin.netLabel")}</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? tr("common.collapse") : tr("common.expand")}
          aria-expanded={expanded}
          className="text-[#717182] hover:text-emerald-600 transition"
        >
          <ChevronRight size={16} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
          isDone ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
          : isMissing ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
          : isReady ? "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400"
          : "bg-stone-100 text-[#717182]"
        }`}>
          {isDone ? <CheckCircle2 size={9} /> : isMissing ? <AlertCircle size={9} /> : <Clock size={9} />}
          {isDone
            ? tr("payroll.payoutStatus.paid")
            : isMissing
              ? tr("payroll.payoutStatus.missingDestination")
              : isReady
                ? tr("payroll.payoutStatus.ready")
                : tr("payroll.payoutStatus.pending")}
        </span>
        {slip.payout_destination && (
          <span className="text-[10px] text-[#717182] truncate max-w-[180px]">
            {slip.payout_method || "—"} · {slip.payout_destination}
          </span>
        )}
      </div>

      {/* Expanded breakdown */}
      {expanded && (
        <div className="border-t border-black/[0.04] dark:border-white/[0.04] px-4 py-3 space-y-1.5 text-sm bg-black/[0.01] dark:bg-white/[0.01]">
          <div className="flex justify-between text-[#717182]">
            <span>{tr("payroll.bulletin.baseSalary")}</span>
            <span className="font-medium text-[#17211f] dark:text-white">{money(slip.gross_pay - (slip.overtime_pay||0) - (slip.bonus||0) + (slip.absence_deduction||0))}</span>
          </div>
          {(slip.overtime_pay || 0) > 0 && (
            <div className="flex justify-between text-[#717182]">
              <span>{tr("payroll.bulletin.overtime")}</span>
              <span className="text-sky-600">+{money(slip.overtime_pay)}</span>
            </div>
          )}
          {(slip.bonus || 0) > 0 && (
            <div className="flex justify-between text-[#717182]">
              <span>{tr("payroll.bulletin.bonus")}</span>
              <span className="text-sky-600">+{money(slip.bonus)}</span>
            </div>
          )}
          {(slip.absence_deduction || 0) > 0 && (
            <div className="flex justify-between text-[#717182]">
              <span>{tr("payroll.bulletin.absenceDeduction")}</span>
              <span className="text-rose-500">-{money(slip.absence_deduction)}</span>
            </div>
          )}
          <div className="flex justify-between font-medium text-[#17211f] dark:text-white pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
            <span>{tr("payroll.bulletin.grossSalary")}</span>
            <span>{money(slip.gross_pay)}</span>
          </div>
          <div className="flex justify-between text-[#717182]">
            <span>{tr("payroll.bulletin.cnss")}</span>
            <span className="text-rose-500">-{money((slip.cnss_employee_cents ?? 0) / 100)}</span>
          </div>
          <div className="flex justify-between text-[#717182]">
            <span>IRPP</span>
            <span className="text-rose-500">-{money((slip.irpp_cents ?? 0) / 100)}</span>
          </div>
          <div className="flex justify-between font-extrabold text-emerald-700 dark:text-emerald-400 pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
            <span>{tr("payroll.bulletin.netToPay")}</span>
            <span>{money(slip.net_pay)}</span>
          </div>
          <div className="pt-1.5 mt-1 border-t border-dashed border-black/[0.06] dark:border-white/[0.06] space-y-1 text-[11px] text-[#a0a0ab]">
            <div className="flex justify-between">
              <span>CNSS patronale (info)</span>
              <span>{money((slip.cnss_employer_cents ?? 0) / 100)}</span>
            </div>
            <div className="flex justify-between">
              <span>Allocations familiales (info)</span>
              <span>{money((slip.family_allowance_cents ?? 0) / 100)}</span>
            </div>
            <div className="flex justify-between">
              <span>Accidents du travail (info)</span>
              <span>{money((slip.work_accident_cents ?? 0) / 100)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Action row */}
      <div className="flex gap-2 px-4 py-3 border-t border-black/[0.04] dark:border-white/[0.04]">
        <button
          onClick={() => onDownload(slip.id)}
          className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition"
        >
          <Download size={11} /> PDF
        </button>
        {!isDone && (
          <button
            onClick={() => onUpdateStatus(slip.id, "paid")}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition"
          >
            <CheckCircle2 size={11} /> {tr("payroll.bulletin.markPaid")}
          </button>
        )}
        {isDone && (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle2 size={12} /> {tr("payroll.bulletin.paymentDone")}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Reversements CNSS / DGI ──────────────────────────────────────
   Les cotisations retenues sur les salaires (CNSS + IRPP) s'accumulent au
   fil des cycles de paie comme une dette (comptes 431/447) tant qu'elles
   n'ont pas été effectivement reversées à la CNSS/DGI. Ce panneau affiche
   la dette courante et permet d'enregistrer un reversement réel. */
function PayrollTaxRemittancesPanel({ taxLiabilitiesQ, remitTaxMut, tr }: {
  taxLiabilitiesQ: { data?: { cnss_due: number; state_tax_due: number }; isLoading: boolean };
  remitTaxMut: { mutate: (p: { code: "431" | "447"; amount: number; payment_method: string }) => void; isPending: boolean };
  tr: TFunction;
}) {
  const [remitCode, setRemitCode] = useState<"431" | "447" | null>(null);
  const [remitAmount, setRemitAmount] = useState<string>("");
  const [remitMethod, setRemitMethod] = useState("bank");

  const cnssDue = taxLiabilitiesQ.data?.cnss_due ?? 0;
  const stateDue = taxLiabilitiesQ.data?.state_tax_due ?? 0;

  function openRemit(code: "431" | "447", due: number) {
    setRemitCode(code);
    setRemitAmount(String(due));
  }

  function confirmRemit() {
    if (!remitCode) return;
    const amount = Number(remitAmount);
    if (!amount || amount <= 0) return;
    remitTaxMut.mutate({ code: remitCode, amount, payment_method: remitMethod });
    setRemitCode(null);
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-5 space-y-4">
      <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
        {tr("payroll.remittances.explainer")}
      </div>

      {[
        { code: "431" as const, label: tr("payroll.remittances.cnssTitle"), due: cnssDue },
        { code: "447" as const, label: tr("payroll.remittances.stateTitle"), due: stateDue },
      ].map(({ code, label, due }) => (
        <div key={code} className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[#17211f] dark:text-white">{label}</p>
            <p className="text-xs text-[#717182] mt-0.5">{tr("payroll.remittances.dueLabel")}</p>
          </div>
          <div className="flex items-center gap-3">
            <p className={`text-xl font-extrabold ${due > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {taxLiabilitiesQ.isLoading ? "…" : money(due)}
            </p>
            <button
              onClick={() => openRemit(code, due)}
              disabled={due <= 0}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 text-xs font-bold text-white transition"
            >
              <Wallet size={12} /> {tr("payroll.remittances.remitButton")}
            </button>
          </div>
        </div>
      ))}

      {remitCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRemitCode(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1e2229] p-5 shadow-2xl space-y-3">
            <h3 className="font-bold text-[#17211f] dark:text-white">
              {remitCode === "431" ? tr("payroll.remittances.cnssTitle") : tr("payroll.remittances.stateTitle")}
            </h3>
            <label className="block text-xs font-bold uppercase tracking-wide text-[#717182]">
              {tr("payroll.remittances.amountLabel")}
              <input
                type="number" min={0} value={remitAmount} onChange={(e) => setRemitAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wide text-[#717182]">
              {tr("payroll.remittances.methodLabel")}
              <select
                value={remitMethod} onChange={(e) => setRemitMethod(e.target.value)}
                className="mt-1 w-full rounded-lg border border-black/10 dark:border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500"
              >
                <option value="bank">{tr("payroll.remittances.methodBank")}</option>
                <option value="cash">{tr("payroll.remittances.methodCash")}</option>
                <option value="mobile_money">{tr("payroll.remittances.methodMobileMoney")}</option>
              </select>
            </label>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setRemitCode(null)} className="flex-1 rounded-lg border border-black/10 dark:border-white/10 px-3 py-2 text-sm font-semibold text-[#17211f] dark:text-white">
                {tr("common.cancel")}
              </button>
              <button
                onClick={confirmRemit}
                disabled={remitTaxMut.isPending}
                className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {tr("payroll.remittances.confirmButton")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
export function PayrollPage() {
  const { t: tr } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  useCurrency();

  /* ── Period state ── */
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [year, setYear]   = useState(now.getFullYear());
  const period = `${MONTHS[month]} ${year}`;

  /* ── Tab state ── */
  const [activeTab, setActiveTab] = useState<Tab>("variables");

  /* ── Overrides (variables saisies par l'utilisateur) ── */
  const [overrides, setOverrides] = useState<Record<number, { overtime_hours: number; bonus: number; absence_days: number }>>({});

  /* ── UI state ── */
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [showNewCycleConfirm, setShowNewCycleConfirm] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null);
  const [limuleRunning, setLimuleRunning] = useState(false);
  const [limuleResult, setLimuleResult] = useState<string | null>(null);

  /* ── Queries ── */
  const runsQ      = useQuery({ queryKey: ["payrollRuns"], queryFn: api.payrollRuns });
  const accountsQ  = useQuery({ queryKey: ["paymentAccounts"], queryFn: api.paymentAccounts });
  const employeesQ = useQuery({ queryKey: ["employees"], queryFn: api.employees });
  const taxLiabilitiesQ = useQuery({ queryKey: ["payrollTaxLiabilities"], queryFn: api.payrollTaxLiabilities });

  const payrollAccounts = useMemo(
    () => (accountsQ.data ?? []).filter((a) => a.enabled && a.use_for_payroll),
    [accountsQ.data],
  );

  useEffect(() => {
    if (paymentAccountId !== null) return;
    const def = payrollAccounts.find((a) => a.is_default_payroll) ?? payrollAccounts[0];
    if (def) setPaymentAccountId(def.id);
  }, [paymentAccountId, payrollAccounts]);

  /* Current run = first run matching current period */
  const currentRun = useMemo(
    () => runsQ.data?.find((r) => r.period === period) ?? runsQ.data?.[0] ?? null,
    [runsQ.data, period],
  );

  /* Active employees */
  const activeEmployees = useMemo(
    () => (employeesQ.data ?? []).filter((e) => e.account_status !== "inactive" && e.status === "active"),
    [employeesQ.data],
  );

  /* Projected mass salariale with overrides */
  const projected = useMemo(() => {
    const HOURS = 173; const DAYS = 26; const OT_RATE = 1.5;
    return activeEmployees.reduce((sum, emp) => {
      const ov = overrides[emp.id] ?? { overtime_hours: 0, bonus: 0, absence_days: 0 };
      const base = emp.salary || 0;
      const ot   = (base / HOURS) * ov.overtime_hours * OT_RATE;
      const abs  = (base / DAYS) * ov.absence_days;
      return sum + base + ov.bonus + ot - abs;
    }, 0);
  }, [activeEmployees, overrides]);

  /* ── Mutations ── */
  const createMut = useMutation({
    mutationFn: api.createPayrollRun,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payrollRuns"] });
      setLaunchError(null);
      setShowNewCycleConfirm(false);
      setActiveTab("bulletins");
    },
    onError: (e: Error) => setLaunchError(e.message),
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.updatePayrollRunStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payrollRuns"] }),
  });

  const updateSlipMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof api.updatePayslip>[1] }) =>
      api.updatePayslip(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payrollRuns"] }),
  });

  function handleGenerate() {
    if (activeEmployees.length === 0) {
      setLaunchError(tr("payroll.errors.noActiveEmployee"));
      return;
    }
    const ovList: EmployeePayrollOverride[] = Object.entries(overrides)
      .filter(([, v]) => v.overtime_hours > 0 || v.bonus > 0 || v.absence_days > 0)
      .map(([empId, v]) => ({ employee_id: Number(empId), ...v }));
    createMut.mutate({ period, payment_account_id: paymentAccountId, overrides: ovList });
  }

  async function handleExportRun(id: number, p: string) {
    setExportingId(id);
    try { openBlob(await api.exportPayrollRun(id, "pdf"), `bulletins-${p}.pdf`); }
    finally { setExportingId(null); }
  }

  async function handleDownloadSlip(id: number) {
    try { openBlob(await api.downloadPayslip(id), `bulletin-${id}.pdf`); }
    catch { toast.error(tr("payroll.errors.downloadPdf")); }
  }

  const massPaymentMut = useMutation({
    mutationFn: async (id: number) => {
      const blob = await api.massPaymentPayrollRun(id);
      openBlob(blob, `virement-masse-${currentRun?.period ?? id}.csv`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payrollRuns"] }),
    onError: () => toast.error(tr("payroll.errors.downloadPdf")),
  });

  const remitTaxMut = useMutation({
    mutationFn: api.remitPayrollTaxLiability,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payrollTaxLiabilities"] });
      toast.success(tr("payroll.remittances.remitSuccess"));
    },
    onError: () => toast.error(tr("payroll.remittances.remitError")),
  });

  /* ── Limule analysis ── */
  async function handleLimuleAnalysis() {
    if (!currentRun || limuleRunning) return;
    setLimuleRunning(true);
    setLimuleResult(null);
    const gross = currentRun.gross_total;
    const net   = currentRun.net_total;
    const count = currentRun.payslips.length;
    const anomalies = currentRun.payslips.filter((s) => !s.payout_destination).length;
    await api.aiGenerateStream(
      {
        kind: "payroll_analysis",
        title: tr("payroll.limule.aiTitle", { period: displayPeriod(currentRun.period, tr) }),
        prompt: tr("payroll.limule.prompt", {
          period: displayPeriod(currentRun.period, tr),
          count,
          gross: gross.toLocaleString(i18n.language),
          net: net.toLocaleString(i18n.language),
          anomalies,
        }),
        context: "payroll",
      },
      (partial) => setLimuleResult(partial),
      (final, _id) => { setLimuleResult(final); setLimuleRunning(false); },
      () => { setLimuleResult(tr("payroll.errors.limuleUnavailable")); setLimuleRunning(false); },
    );
  }

  /* ── TERAS anomaly counts ── */
  const anomalyCount = currentRun?.payslips.filter((s) => !s.payout_destination || s.payout_status === "missing_destination").length ?? 0;
  const paidCount    = currentRun?.payslips.filter((s) => s.payout_status === "paid").length ?? 0;

  /* ── Tabs ── */
  const TABS: { key: Tab; tk: string; icon: React.ElementType }[] = [
    { key: "variables",    tk: "payroll.tabs.variables",    icon: Edit2 },
    { key: "bulletins",    tk: "payroll.tabs.bulletins",    icon: FileText },
    { key: "teras",        tk: "payroll.tabs.teras",        icon: AlertCircle },
    { key: "reversements", tk: "payroll.tabs.remittances",  icon: Wallet },
    { key: "historique",   tk: "payroll.tabs.history",      icon: Clock },
  ];

  /* ════════ RENDER ════════════════════════════════════════════ */
  return (
    <div className="flex h-[calc(100vh-80px)] flex-col overflow-hidden">

      {/* ── Page header ── */}
      <div className="shrink-0 border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-600">{tr("payroll.header.eyebrow")}</p>
            <h1 className="text-2xl font-extrabold text-[#17211f] dark:text-white">{tr("payroll.header.title")}</h1>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] p-1">
              <Calendar size={14} className="ml-2 text-[#717182]" />
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                aria-label={tr("payroll.header.monthLabel")}
                className="bg-transparent text-sm font-semibold text-[#17211f] dark:text-white outline-none px-1 py-1"
              >
                {MONTHS.map((m, i) => <option key={m} value={i}>{monthName(i, tr)}</option>)}
              </select>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label={tr("payroll.header.yearLabel")}
                className="bg-transparent text-sm font-semibold text-[#17211f] dark:text-white outline-none px-1 py-1"
              >
                {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {currentRun && (
              <button
                onClick={() => handleExportRun(currentRun.id, currentRun.period)}
                disabled={exportingId === currentRun.id}
                className="flex items-center gap-2 rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] px-3 py-2 text-sm font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.03] disabled:opacity-50 transition"
              >
                {exportingId === currentRun.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {tr("payroll.header.exportPdf")}
              </button>
            )}

            <button
              onClick={() => currentRun ? setShowNewCycleConfirm(true) : handleGenerate()}
              disabled={createMut.isPending}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition disabled:opacity-60"
            >
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {createMut.isPending
                ? tr("payroll.header.generating")
                : currentRun
                  ? tr("payroll.header.newCycle")
                  : tr("payroll.header.launch")}
            </button>
          </div>
        </div>
      </div>

      {/* ── Error banner ── */}
      {launchError && (
        <div className="shrink-0 mx-6 mt-4 flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1">{launchError}</span>
          <button onClick={() => setLaunchError(null)} aria-label={tr("common.close")}><X size={14} /></button>
        </div>
      )}

      {/* ── KPI row ── */}
      <div className="shrink-0 grid grid-cols-2 gap-4 px-6 py-4 lg:grid-cols-4">
        <KpiCard
          label={tr("payroll.kpi.payrollMass")} icon={Wallet} accent="emerald"
          value={currentRun ? compactMoney(currentRun.gross_total) : compactMoney(projected)}
          sub={currentRun
            ? tr("payroll.kpi.cycle", { period: displayPeriod(currentRun.period, tr) })
            : tr("payroll.kpi.employeeEstimate", { count: activeEmployees.length })}
        />
        <KpiCard
          label={tr("payroll.kpi.netToPay")} icon={Send} accent="sky"
          value={currentRun ? compactMoney(currentRun.net_total) : "—"}
          sub={currentRun
            ? tr("payroll.kpi.paidProgress", { paid: paidCount, total: currentRun.payslips.length })
            : tr("payroll.kpi.cycleNotGenerated")}
        />
        <KpiCard
          label={tr("payroll.kpi.terasAnomalies")} icon={AlertTriangle} accent={anomalyCount > 0 ? "amber" : "emerald"}
          value={String(anomalyCount)}
          sub={anomalyCount > 0 ? tr("payroll.kpi.missingDestinations") : tr("payroll.kpi.noAnomaly")}
        />
        <KpiCard
          label={tr("payroll.kpi.activeEmployees")} icon={Users} accent="sky"
          value={String(activeEmployees.length)}
          sub={tr("payroll.kpi.selectedCycle", { period: displayPeriod(period, tr) })}
        />
      </div>

      {/* ── Tabs ── */}
      <div className="shrink-0 flex items-center gap-1 px-6 border-b border-black/[0.05] dark:border-white/[0.05]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition ${
              activeTab === tab.key
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-[#717182] hover:text-[#17211f] dark:hover:text-white"
            }`}
          >
            <tab.icon size={14} />
            {tr(tab.tk)}
            {tab.key === "teras" && anomalyCount > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {anomalyCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto">

        {/* ═══════════════════════════════════════════════════════
            TAB 1 — VARIABLES
        ═══════════════════════════════════════════════════════ */}
        {activeTab === "variables" && (
          <div className="max-w-5xl mx-auto px-6 py-5 space-y-5">

            {/* Guide */}
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600">
                  <Edit2 size={15} />
                </div>
                <div>
                  <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                    {tr("payroll.variables.guideTitle", { period: displayPeriod(period, tr) })}
                  </p>
                  <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                    {tr("payroll.variables.guideBody")}
                  </p>
                </div>
              </div>
            </div>

            {/* Employee variable table */}
            {activeEmployees.length === 0 ? (
              <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Users size={36} className="text-[#d1d5db]" />
                <p className="text-sm font-semibold text-[#717182]">{tr("payroll.variables.emptyTitle")}</p>
                <p className="text-xs text-[#9ca3af] max-w-xs">
                  {tr("payroll.variables.emptyBody")}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] overflow-x-auto">
                <div className="grid grid-cols-[1fr_120px_120px_110px_80px] gap-0 min-w-[630px]">
                  {/* Column headers */}
                  <div className="col-span-5 grid grid-cols-[1fr_120px_120px_110px_80px] border-b border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02]">
                    <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-[#717182]">{tr("payroll.variables.employee")}</div>
                    <div className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-[#717182]">{tr("payroll.variables.baseSalary")}</div>
                    <div className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-sky-600">{tr("payroll.variables.overtimeHours")}</div>
                    <div className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-sky-600">{tr("payroll.variables.bonus")}</div>
                    <div className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-rose-500">{tr("payroll.variables.absenceDays")}</div>
                  </div>

                  {/* Employee rows */}
                  {activeEmployees.map((emp, idx) => {
                    const ov = overrides[emp.id] ?? { overtime_hours: 0, bonus: 0, absence_days: 0 };
                    const isModified = ov.overtime_hours > 0 || ov.bonus > 0 || ov.absence_days > 0;
                    return (
                      <div key={emp.id} className={`col-span-5 grid grid-cols-[1fr_120px_120px_110px_80px] items-center border-b border-black/[0.04] dark:border-white/[0.04] last:border-0 ${isModified ? "bg-sky-50/40 dark:bg-sky-500/5" : ""}`}>
                        {/* Name */}
                        <div className="flex items-center gap-2.5 px-4 py-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(emp.first_name + " " + emp.last_name)}`}>
                            {initials(emp.first_name + " " + emp.last_name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#17211f] dark:text-white truncate">{emp.first_name} {emp.last_name}</p>
                            <p className="text-xs text-[#717182] truncate">{emp.job_title || emp.department || "—"}</p>
                          </div>
                        </div>
                        {/* Base salary */}
                        <div className="px-3 py-3 text-sm font-semibold text-[#17211f] dark:text-white">
                          {compactMoney(emp.salary || 0)}
                        </div>
                        {/* Overtime hours */}
                        <div className="px-3 py-3">
                          <input
                            type="number" min="0" max="80" step="0.5"
                            value={ov.overtime_hours || ""}
                            placeholder="0"
                            aria-label={tr("payroll.variables.overtimeHoursFor", { name: `${emp.first_name} ${emp.last_name}` })}
                            onChange={(e) => setOverrides((prev) => ({
                              ...prev,
                              [emp.id]: { ...ov, overtime_hours: parseFloat(e.target.value) || 0 },
                            }))}
                            className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-2 py-1.5 text-sm text-center text-[#17211f] dark:text-white outline-none focus:border-sky-400 transition"
                          />
                        </div>
                        {/* Bonus */}
                        <div className="px-3 py-3">
                          <input
                            type="number" min="0" step="1000"
                            value={ov.bonus || ""}
                            placeholder="0"
                            aria-label={tr("payroll.variables.bonusFor", { name: `${emp.first_name} ${emp.last_name}` })}
                            onChange={(e) => setOverrides((prev) => ({
                              ...prev,
                              [emp.id]: { ...ov, bonus: parseFloat(e.target.value) || 0 },
                            }))}
                            className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-2 py-1.5 text-sm text-center text-[#17211f] dark:text-white outline-none focus:border-sky-400 transition"
                          />
                        </div>
                        {/* Absence days */}
                        <div className="px-3 py-3">
                          <input
                            type="number" min="0" max="26" step="1"
                            value={ov.absence_days || ""}
                            placeholder="0"
                            aria-label={tr("payroll.variables.absenceDaysFor", { name: `${emp.first_name} ${emp.last_name}` })}
                            onChange={(e) => setOverrides((prev) => ({
                              ...prev,
                              [emp.id]: { ...ov, absence_days: parseInt(e.target.value) || 0 },
                            }))}
                            className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-2 py-1.5 text-sm text-center text-[#17211f] dark:text-white outline-none focus:border-rose-400 transition"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Summary footer */}
                <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 border-t border-emerald-200/60 dark:border-emerald-500/20">
                  <div>
                    <p className="text-xs text-[#717182]">{tr("payroll.variables.estimatedGross")}</p>
                    <p className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400">{money(projected)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs text-[#717182]">
                      <p>{tr("payroll.variables.estimatedNet")}</p>
                      <p className="font-bold text-[#17211f] dark:text-white">{money(projected * 0.9)}</p>
                    </div>

                    {/* Account selector */}
                    <select
                      value={paymentAccountId ?? ""}
                      onChange={(e) => setPaymentAccountId(e.target.value ? Number(e.target.value) : null)}
                      aria-label={tr("payroll.variables.sourceAccount")}
                      className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm font-semibold text-[#17211f] dark:text-white outline-none"
                    >
                      <option value="">{tr("payroll.variables.sourceAccount")}</option>
                      {payrollAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.label} · {a.currency}</option>
                      ))}
                    </select>

                    <button
                      onClick={handleGenerate}
                      disabled={createMut.isPending || activeEmployees.length === 0}
                      className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition disabled:opacity-60"
                    >
                      {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                      {createMut.isPending ? tr("payroll.header.generating") : tr("payroll.variables.generatePayslips")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            TAB 2 — BULLETINS
        ═══════════════════════════════════════════════════════ */}
        {activeTab === "bulletins" && (
          <div className="max-w-5xl mx-auto px-6 py-5 space-y-4">

            {!currentRun ? (
              <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] flex flex-col items-center justify-center gap-4 py-16 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600">
                  <FileText size={28} />
                </div>
                <div>
                  <p className="text-base font-bold text-[#17211f] dark:text-white">
                    {tr("payroll.bulletins.emptyTitle", { period: displayPeriod(period, tr) })}
                  </p>
                  <p className="mt-1 text-sm text-[#717182]">{tr("payroll.bulletins.emptyBody")}</p>
                </div>
                <button
                  onClick={() => setActiveTab("variables")}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white transition"
                >
                  <Edit2 size={14} /> {tr("payroll.bulletins.fillVariables")}
                </button>
              </div>
            ) : (
              <>
                {/* Run header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-[#17211f] dark:text-white">
                      {tr("payroll.bulletins.runTitle", {
                        period: displayPeriod(currentRun.period, tr),
                        count: currentRun.payslips.length,
                      })}
                    </p>
                    <p className="text-xs text-[#717182]">
                      {tr("payroll.bulletins.runMeta", {
                        gross: money(currentRun.gross_total),
                        net: money(currentRun.net_total),
                        date: payrollDate(currentRun.created_at, tr),
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      currentRun.status === "validated" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                    }`}>
                      {currentRun.status === "validated" ? tr("payroll.runStatus.validated") : tr("payroll.runStatus.draft")}
                    </span>
                    {currentRun.status !== "validated" && (
                      <button
                        onClick={() => updateStatusMut.mutate({ id: currentRun.id, status: "validated" })}
                        className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition"
                      >
                        <CheckCircle2 size={12} /> {tr("payroll.bulletins.validateCycle")}
                      </button>
                    )}
                  </div>
                </div>

                {/* Bulletin cards grid */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
                  {currentRun.payslips.map((slip) => (
                    <BulletinCard
                      key={slip.id}
                      slip={slip}
                      onDownload={handleDownloadSlip}
                      onUpdateStatus={(id, status) => updateSlipMut.mutate({ id, payload: { payout_status: status } })}
                    />
                  ))}
                </div>

                {/* Mark all paid */}
                {paidCount < currentRun.payslips.length && (
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <p className="text-xs text-[#717182]">
                      {tr("payroll.bulletins.paidProgress", { paid: paidCount, total: currentRun.payslips.length })}
                    </p>
                    <button
                      onClick={() => massPaymentMut.mutate(currentRun.id)}
                      disabled={massPaymentMut.isPending}
                      className="flex items-center gap-1.5 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition disabled:opacity-60"
                    >
                      {massPaymentMut.isPending
                        ? <Loader2 size={12} className="animate-spin" />
                        : <CheckCircle2 size={12} />}
                      Générer le virement de masse
                    </button>
                  </div>
                )}

                {/* Limule analysis */}
                <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229]">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <LimuleIcon size={15} className="text-emerald-600" />
                      <h3 className="font-bold text-[#17211f] dark:text-white text-sm">{tr("payroll.limule.panelTitle")}</h3>
                    </div>
                    <button
                      onClick={handleLimuleAnalysis}
                      disabled={limuleRunning}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-50"
                    >
                      {limuleRunning ? <Loader2 size={11} className="animate-spin" /> : <LimuleIcon size={11} />}
                      {limuleRunning
                        ? tr("payroll.limule.analyzing")
                        : limuleResult
                          ? tr("payroll.limule.refresh")
                          : tr("payroll.limule.analyze")}
                    </button>
                  </div>
                  {limuleResult ? (
                    <div className="px-5 py-4">
                      <p className="text-sm leading-7 text-[#17211f] dark:text-white whitespace-pre-wrap">{limuleResult}</p>
                    </div>
                  ) : (
                    <div className="px-5 py-5 text-xs text-[#717182]">
                      {tr("payroll.limule.empty")}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            TAB 3 — TERAS
        ═══════════════════════════════════════════════════════ */}
        {activeTab === "teras" && (
          <div className="max-w-5xl mx-auto px-6 py-5 space-y-4">
            <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
                <h3 className="font-bold text-[#17211f] dark:text-white">
                  {tr("payroll.teras.title", { period: displayPeriod(period, tr) })}
                </h3>
                {anomalyCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-400">
                    <AlertCircle size={11} /> {tr("payroll.teras.anomalyCount", { count: anomalyCount })}
                  </span>
                )}
              </div>

              {!currentRun ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center px-5">
                  <AlertCircle size={28} className="text-[#d1d5db]" />
                  <p className="text-sm text-[#717182]">{tr("payroll.teras.empty")}</p>
                </div>
              ) : (
                <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                  {currentRun.payslips.map((slip) => {
                    const hasAnomaly = !slip.payout_destination || slip.payout_status === "missing_destination";
                    return (
                      <div key={slip.id} className={`flex items-start gap-3 px-5 py-4 ${hasAnomaly ? "bg-amber-50/30 dark:bg-amber-500/5" : ""}`}>
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(slip.employee_name)}`}>
                          {initials(slip.employee_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-[#17211f] dark:text-white">{slip.employee_name}</p>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              hasAnomaly
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                            }`}>
                              {hasAnomaly ? <AlertCircle size={9} /> : <CheckCircle2 size={9} />}
                              {hasAnomaly ? tr("payroll.teras.anomaly") : tr("payroll.teras.ok")}
                            </span>
                          </div>
                          <div className="mt-1 grid grid-cols-2 gap-x-6 text-xs text-[#717182]">
                            <span>{tr("payroll.teras.cnss", { amount: money(slip.deductions) })}</span>
                            <span>{tr("payroll.teras.net", { amount: money(slip.net_pay) })}</span>
                            <span className={slip.payout_destination ? "text-emerald-600" : "text-amber-600 font-semibold"}>
                              {tr("payroll.teras.payout", {
                                destination: slip.payout_destination || tr("payroll.teras.missingDestination"),
                              })}
                            </span>
                            <span>{tr("payroll.teras.method", { method: slip.payout_method || tr("payroll.teras.notDefined") })}</span>
                          </div>
                        </div>
                        {hasAnomaly && (
                          <div className="shrink-0">
                            <p className="text-[10px] text-amber-600 font-semibold max-w-[160px] text-right">
                              {tr("payroll.teras.fixHelp")}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Global status */}
              {currentRun && (
                <div className={`px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.06] ${
                  anomalyCount === 0 ? "bg-emerald-50/60 dark:bg-emerald-500/10" : "bg-amber-50/60 dark:bg-amber-500/10"
                }`}>
                  <p className={`text-xs font-bold ${anomalyCount === 0 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                    {anomalyCount === 0
                      ? tr("payroll.teras.allCompliant", { count: currentRun.payslips.length })
                      : tr("payroll.teras.needsCorrection", { count: anomalyCount })}
                  </p>
                </div>
              )}
            </div>

            {/* Compliance summary */}
            <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] overflow-hidden">
              <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
                <h3 className="font-bold text-[#17211f] dark:text-white">{tr("payroll.teras.checklistTitle")}</h3>
              </div>
              <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                {[
                  { label: tr("payroll.teras.checklist.cnss"), ok: true, note: tr("payroll.teras.checklist.cnssOk") },
                  {
                    label: tr("payroll.teras.checklist.validatedSlips"),
                    ok: currentRun?.status === "validated",
                    note: currentRun?.status === "validated"
                      ? tr("payroll.teras.checklist.cycleValidated")
                      : tr("payroll.teras.checklist.validationPending"),
                  },
                  {
                    label: tr("payroll.teras.checklist.payoutDestinations"),
                    ok: anomalyCount === 0,
                    note: anomalyCount === 0
                      ? tr("payroll.teras.checklist.allFilled")
                      : tr("payroll.teras.checklist.missingCount", { count: anomalyCount }),
                  },
                  {
                    label: tr("payroll.teras.checklist.completePeriod"),
                    ok: !!currentRun,
                    note: currentRun
                      ? tr("payroll.teras.checklist.cycleGenerated", { period: displayPeriod(currentRun.period, tr) })
                      : tr("payroll.kpi.cycleNotGenerated"),
                  },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-2">
                      {item.ok
                        ? <CheckCircle2 size={14} className="text-emerald-500" />
                        : <AlertCircle size={14} className="text-amber-500" />}
                      <span className="text-sm text-[#17211f] dark:text-white">{item.label}</span>
                    </div>
                    <span className={`text-xs font-semibold ${item.ok ? "text-emerald-600" : "text-amber-600"}`}>{item.note}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            TAB 4 — HISTORIQUE
        ═══════════════════════════════════════════════════════ */}
        {activeTab === "reversements" && <PayrollTaxRemittancesPanel taxLiabilitiesQ={taxLiabilitiesQ} remitTaxMut={remitTaxMut} tr={tr} />}

        {activeTab === "historique" && (
          <div className="max-w-5xl mx-auto px-6 py-5">
            {(runsQ.data?.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] flex flex-col items-center gap-3 py-16 text-center">
                <Clock size={28} className="text-[#d1d5db]" />
                <p className="text-sm text-[#717182]">{tr("payroll.history.empty")}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] overflow-hidden">
                <div className="border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
                  <h3 className="font-bold text-[#17211f] dark:text-white">{tr("payroll.history.title")}</h3>
                </div>
                <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                  {(runsQ.data ?? []).map((run) => {
                    const runPaid = run.payslips.filter((s) => s.payout_status === "paid").length;
                    return (
                      <div key={run.id} className="flex items-center gap-4 px-5 py-4 hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-black text-xs">
                          {displayPeriod(run.period, tr).slice(0, 3).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[#17211f] dark:text-white">{displayPeriod(run.period, tr)}</p>
                          <p className="text-xs text-[#717182]">
                            {tr("payroll.history.rowMeta", {
                              date: payrollDate(run.created_at, tr),
                              count: run.payslips.length,
                              paid: runPaid,
                              total: run.payslips.length,
                            })}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-[#17211f] dark:text-white">{compactMoney(run.net_total)}</p>
                          <p className="text-xs text-[#717182]">{tr("payroll.bulletin.netLabel")}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          run.status === "validated"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                            : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                        }`}>
                          {run.status === "validated" ? tr("payroll.runStatus.validated") : tr("payroll.runStatus.draft")}
                        </span>
                        <button
                          onClick={() => handleExportRun(run.id, run.period)}
                          disabled={exportingId === run.id}
                          className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.08] px-2.5 py-1.5 text-xs font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition disabled:opacity-50"
                        >
                          {exportingId === run.id ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                          PDF
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── New Cycle Confirm Modal ── */}
      {showNewCycleConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1e2229] border border-black/[0.08] dark:border-white/[0.08] shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600">
                <Plus size={18} />
              </div>
              <div>
                <p className="font-bold text-[#17211f] dark:text-white">
                  {tr("payroll.confirm.title", { period: displayPeriod(period, tr) })}
                </p>
                <p className="text-xs text-[#717182]">{tr("payroll.confirm.body")}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowNewCycleConfirm(false)}
                className="flex-1 rounded-xl border border-black/[0.08] dark:border-white/[0.08] py-2.5 text-sm font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition"
              >
                {tr("common.cancel")}
              </button>
              <button
                onClick={handleGenerate}
                disabled={createMut.isPending}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 text-sm font-bold text-white transition disabled:opacity-60"
              >
                {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {tr("payroll.confirm.createAnyway")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
