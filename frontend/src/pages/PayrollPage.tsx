import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, AlertTriangle, ArrowRight, Calendar, CheckCircle2,
  ChevronRight, Clock, Download, Edit2, FileText, Loader2,
  Plus, RefreshCcw, Send, Users, Wallet, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../services/api";
import type { EmployeePayrollOverride, Payslip } from "../types/domain";
import { money, compactMoney, shortDate } from "../utils/format";
import { useCurrency } from "../contexts/CurrencyContext";
import { LimuleIcon } from "../components/LimuleAvatar";

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

const MONTHS = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
];

type Tab = "variables" | "bulletins" | "teras" | "historique";

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
  slip, runPeriod, runId, onDownload, onUpdateStatus,
}: {
  slip: Payslip; runPeriod: string; runId: number;
  onDownload: (id: number) => void;
  onUpdateStatus: (id: number, status: string) => void;
}) {
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
          <p className="text-xs text-[#717182]">Réf. {slip.reference}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-extrabold text-emerald-600">{money(slip.net_pay)}</p>
          <p className="text-[10px] text-[#717182]">net</p>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-[#717182] hover:text-emerald-600 transition">
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
          {isDone ? "Payé" : isMissing ? "Destination manquante" : isReady ? "Prêt" : "En attente"}
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
            <span>Salaire de base</span>
            <span className="font-medium text-[#17211f] dark:text-white">{money(slip.gross_pay - (slip.overtime_pay||0) - (slip.bonus||0) + (slip.absence_deduction||0))}</span>
          </div>
          {(slip.overtime_pay || 0) > 0 && (
            <div className="flex justify-between text-[#717182]">
              <span>Heures supplémentaires</span>
              <span className="text-sky-600">+{money(slip.overtime_pay)}</span>
            </div>
          )}
          {(slip.bonus || 0) > 0 && (
            <div className="flex justify-between text-[#717182]">
              <span>Prime / gratification</span>
              <span className="text-sky-600">+{money(slip.bonus)}</span>
            </div>
          )}
          {(slip.absence_deduction || 0) > 0 && (
            <div className="flex justify-between text-[#717182]">
              <span>Retenue absences</span>
              <span className="text-rose-500">-{money(slip.absence_deduction)}</span>
            </div>
          )}
          <div className="flex justify-between font-medium text-[#17211f] dark:text-white pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
            <span>Salaire brut</span>
            <span>{money(slip.gross_pay)}</span>
          </div>
          <div className="flex justify-between text-[#717182]">
            <span>CNSS (10%)</span>
            <span className="text-rose-500">-{money(slip.deductions)}</span>
          </div>
          <div className="flex justify-between font-extrabold text-emerald-700 dark:text-emerald-400 pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
            <span>NET À PAYER</span>
            <span>{money(slip.net_pay)}</span>
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
            <CheckCircle2 size={11} /> Marquer payé
          </button>
        )}
        {isDone && (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle2 size={12} /> Versement effectué
          </span>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
export function PayrollPage() {
  const queryClient = useQueryClient();
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
      setLaunchError("Aucun employé actif — ajoutez des employés avant de lancer la paie.");
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
    catch { alert("Erreur téléchargement PDF"); }
  }

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
        title: `Analyse paie ${currentRun.period}`,
        prompt: `En tant que DRH expert PME Afrique centrale, donne un résumé exécutif concis (4-5 lignes) en français du cycle de paie ${currentRun.period} : ${count} employés, masse brute ${gross.toLocaleString("fr-FR")} XAF, net total ${net.toLocaleString("fr-FR")} XAF, ${anomalies} anomalie(s) de versement. Inclus : (1) Conformité CNSS/IRPP, (2) Points d'attention, (3) Recommandation pratique. Sois direct et actionnable.`,
        context: "payroll",
      },
      (partial) => setLimuleResult(partial),
      (final, _id) => { setLimuleResult(final); setLimuleRunning(false); },
      () => { setLimuleResult("Limule indisponible."); setLimuleRunning(false); },
    );
  }

  /* ── TERAS anomaly counts ── */
  const anomalyCount = currentRun?.payslips.filter((s) => !s.payout_destination || s.payout_status === "missing_destination").length ?? 0;
  const paidCount    = currentRun?.payslips.filter((s) => s.payout_status === "paid").length ?? 0;

  /* ── Tabs ── */
  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "variables",   label: "1 · Variables",  icon: Edit2 },
    { key: "bulletins",   label: "2 · Bulletins",  icon: FileText },
    { key: "teras",       label: "3 · TERAS",      icon: AlertCircle },
    { key: "historique",  label: "4 · Historique", icon: Clock },
  ];

  /* ════════ RENDER ════════════════════════════════════════════ */
  return (
    <div className="flex h-[calc(100vh-80px)] flex-col overflow-hidden">

      {/* ── Page header ── */}
      <div className="shrink-0 border-b border-black/[0.05] dark:border-white/[0.05] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-600">RH · Finance</p>
            <h1 className="text-2xl font-extrabold text-[#17211f] dark:text-white">Paie</h1>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] p-1">
              <Calendar size={14} className="ml-2 text-[#717182]" />
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="bg-transparent text-sm font-semibold text-[#17211f] dark:text-white outline-none px-1 py-1"
              >
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
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
                Exporter PDF
              </button>
            )}

            <button
              onClick={() => currentRun ? setShowNewCycleConfirm(true) : handleGenerate()}
              disabled={createMut.isPending}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition disabled:opacity-60"
            >
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {createMut.isPending ? "Génération…" : currentRun ? "Nouveau cycle" : "Lancer la paie"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Error banner ── */}
      {launchError && (
        <div className="shrink-0 mx-6 mt-4 flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1">{launchError}</span>
          <button onClick={() => setLaunchError(null)}><X size={14} /></button>
        </div>
      )}

      {/* ── KPI row ── */}
      <div className="shrink-0 grid grid-cols-2 gap-4 px-6 py-4 lg:grid-cols-4">
        <KpiCard
          label="Masse salariale" icon={Wallet} accent="emerald"
          value={currentRun ? compactMoney(currentRun.gross_total) : compactMoney(projected)}
          sub={currentRun ? `Cycle ${currentRun.period}` : `${activeEmployees.length} emp. · estimation`}
        />
        <KpiCard
          label="Net à verser" icon={Send} accent="sky"
          value={currentRun ? compactMoney(currentRun.net_total) : "—"}
          sub={currentRun ? `${paidCount}/${currentRun.payslips.length} versés` : "Cycle non généré"}
        />
        <KpiCard
          label="Anomalies TERAS" icon={AlertTriangle} accent={anomalyCount > 0 ? "amber" : "emerald"}
          value={String(anomalyCount)}
          sub={anomalyCount > 0 ? "destinations manquantes" : "Aucune anomalie"}
        />
        <KpiCard
          label="Employés actifs" icon={Users} accent="sky"
          value={String(activeEmployees.length)}
          sub={`Cycle : ${period}`}
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
            {tab.label}
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
                  <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Collecte des variables — {period}</p>
                  <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                    Saisissez les heures supplémentaires, primes et absences avant de générer les bulletins.
                    Laissez à 0 si aucune modification pour cet employé.
                  </p>
                </div>
              </div>
            </div>

            {/* Employee variable table */}
            {activeEmployees.length === 0 ? (
              <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Users size={36} className="text-[#d1d5db]" />
                <p className="text-sm font-semibold text-[#717182]">Aucun employé actif</p>
                <p className="text-xs text-[#9ca3af] max-w-xs">
                  Ajoutez des employés dans la section RH avant de lancer la paie.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] overflow-hidden">
                <div className="grid grid-cols-[1fr_120px_120px_110px_80px] gap-0">
                  {/* Column headers */}
                  <div className="col-span-5 grid grid-cols-[1fr_120px_120px_110px_80px] border-b border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02]">
                    <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-[#717182]">Employé</div>
                    <div className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-[#717182]">Salaire base</div>
                    <div className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-sky-600">H.Sup (h)</div>
                    <div className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-sky-600">Prime (XAF)</div>
                    <div className="px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-rose-500">Absent (j)</div>
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
                    <p className="text-xs text-[#717182]">Masse salariale estimée (brut)</p>
                    <p className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400">{money(projected)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs text-[#717182]">
                      <p>Net estimé</p>
                      <p className="font-bold text-[#17211f] dark:text-white">{money(projected * 0.9)}</p>
                    </div>

                    {/* Account selector */}
                    <select
                      value={paymentAccountId ?? ""}
                      onChange={(e) => setPaymentAccountId(e.target.value ? Number(e.target.value) : null)}
                      className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm font-semibold text-[#17211f] dark:text-white outline-none"
                    >
                      <option value="">Compte source</option>
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
                      {createMut.isPending ? "Génération…" : "Générer les bulletins"}
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
                  <p className="text-base font-bold text-[#17211f] dark:text-white">Aucun bulletin pour {period}</p>
                  <p className="mt-1 text-sm text-[#717182]">Renseignez les variables puis lancez la génération.</p>
                </div>
                <button
                  onClick={() => setActiveTab("variables")}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white transition"
                >
                  <Edit2 size={14} /> Renseigner les variables
                </button>
              </div>
            ) : (
              <>
                {/* Run header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-[#17211f] dark:text-white">
                      Cycle {currentRun.period} · {currentRun.payslips.length} bulletin{currentRun.payslips.length > 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-[#717182]">
                      Brut : {money(currentRun.gross_total)} · Net : {money(currentRun.net_total)} · Créé le {shortDate(currentRun.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      currentRun.status === "validated" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                    }`}>
                      {currentRun.status === "validated" ? "Validé" : "Brouillon"}
                    </span>
                    {currentRun.status !== "validated" && (
                      <button
                        onClick={() => updateStatusMut.mutate({ id: currentRun.id, status: "validated" })}
                        className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition"
                      >
                        <CheckCircle2 size={12} /> Valider le cycle
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
                      runPeriod={currentRun.period}
                      runId={currentRun.id}
                      onDownload={handleDownloadSlip}
                      onUpdateStatus={(id, status) => updateSlipMut.mutate({ id, payload: { payout_status: status } })}
                    />
                  ))}
                </div>

                {/* Mark all paid */}
                {paidCount < currentRun.payslips.length && (
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <p className="text-xs text-[#717182]">{paidCount}/{currentRun.payslips.length} versements effectués</p>
                    <button
                      onClick={() => {
                        currentRun.payslips.forEach((s) => {
                          if (s.payout_status !== "paid") updateSlipMut.mutate({ id: s.id, payload: { payout_status: "paid" } });
                        });
                      }}
                      className="flex items-center gap-1.5 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition"
                    >
                      <CheckCircle2 size={12} /> Tout marquer comme payé
                    </button>
                  </div>
                )}

                {/* Limule analysis */}
                <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229]">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <LimuleIcon size={15} className="text-emerald-600" />
                      <h3 className="font-bold text-[#17211f] dark:text-white text-sm">Analyse Limule du cycle</h3>
                    </div>
                    <button
                      onClick={handleLimuleAnalysis}
                      disabled={limuleRunning}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-50"
                    >
                      {limuleRunning ? <Loader2 size={11} className="animate-spin" /> : <LimuleIcon size={11} />}
                      {limuleRunning ? "Analyse…" : limuleResult ? "Rafraîchir" : "Analyser"}
                    </button>
                  </div>
                  {limuleResult ? (
                    <div className="px-5 py-4">
                      <p className="text-sm leading-7 text-[#17211f] dark:text-white whitespace-pre-wrap">{limuleResult}</p>
                    </div>
                  ) : (
                    <div className="px-5 py-5 text-xs text-[#717182]">
                      Cliquez sur "Analyser" pour que Limule vérifie la conformité CNSS, détecte les anomalies et propose des recommandations.
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
                <h3 className="font-bold text-[#17211f] dark:text-white">Contrôle TERAS — {period}</h3>
                {anomalyCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-400">
                    <AlertCircle size={11} /> {anomalyCount} anomalie{anomalyCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {!currentRun ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center px-5">
                  <AlertCircle size={28} className="text-[#d1d5db]" />
                  <p className="text-sm text-[#717182]">Générez d'abord les bulletins pour lancer le contrôle TERAS.</p>
                </div>
              ) : (
                <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                  {currentRun.payslips.map((slip, i) => {
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
                              {hasAnomaly ? "Anomalie" : "OK"}
                            </span>
                          </div>
                          <div className="mt-1 grid grid-cols-2 gap-x-6 text-xs text-[#717182]">
                            <span>CNSS (10%) : {money(slip.deductions)} ✓</span>
                            <span>Net : {money(slip.net_pay)}</span>
                            <span className={slip.payout_destination ? "text-emerald-600" : "text-amber-600 font-semibold"}>
                              Versement : {slip.payout_destination || "⚠ Destination manquante"}
                            </span>
                            <span>Méthode : {slip.payout_method || "non définie"}</span>
                          </div>
                        </div>
                        {hasAnomaly && (
                          <div className="shrink-0">
                            <p className="text-[10px] text-amber-600 font-semibold max-w-[160px] text-right">
                              Complétez les coordonnées de paiement dans le dossier RH de l'employé
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
                      ? `✓ Tous les ${currentRun.payslips.length} bulletins sont conformes TERAS`
                      : `⚠ ${anomalyCount} bulletin${anomalyCount > 1 ? "s" : ""} nécessite${anomalyCount > 1 ? "nt" : ""} une correction`}
                  </p>
                </div>
              )}
            </div>

            {/* Compliance summary */}
            <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] overflow-hidden">
              <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
                <h3 className="font-bold text-[#17211f] dark:text-white">Checklist conformité réglementaire</h3>
              </div>
              <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                {[
                  { label: "Taux CNSS employé (10%)", ok: true, note: "Conforme au barème CNSS" },
                  { label: "Bulletins signés / validés", ok: currentRun?.status === "validated", note: currentRun?.status === "validated" ? "Cycle validé" : "En attente de validation" },
                  { label: "Destinations de versement", ok: anomalyCount === 0, note: anomalyCount === 0 ? "Toutes renseignées" : `${anomalyCount} manquante(s)` },
                  { label: "Période de paie complète", ok: !!currentRun, note: currentRun ? `Cycle ${currentRun.period} généré` : "Cycle non généré" },
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
        {activeTab === "historique" && (
          <div className="max-w-5xl mx-auto px-6 py-5">
            {(runsQ.data?.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] flex flex-col items-center gap-3 py-16 text-center">
                <Clock size={28} className="text-[#d1d5db]" />
                <p className="text-sm text-[#717182]">Aucun historique de paie</p>
              </div>
            ) : (
              <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] overflow-hidden">
                <div className="border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
                  <h3 className="font-bold text-[#17211f] dark:text-white">Tous les cycles de paie</h3>
                </div>
                <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                  {(runsQ.data ?? []).map((run) => {
                    const runPaid = run.payslips.filter((s) => s.payout_status === "paid").length;
                    return (
                      <div key={run.id} className="flex items-center gap-4 px-5 py-4 hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-black text-xs">
                          {run.period.slice(0, 3).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[#17211f] dark:text-white">{run.period}</p>
                          <p className="text-xs text-[#717182]">
                            {shortDate(run.created_at)} · {run.payslips.length} bulletins · {runPaid}/{run.payslips.length} versés
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-[#17211f] dark:text-white">{compactMoney(run.net_total)}</p>
                          <p className="text-xs text-[#717182]">net</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          run.status === "validated"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                            : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                        }`}>
                          {run.status === "validated" ? "Validé" : "Brouillon"}
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
                <p className="font-bold text-[#17211f] dark:text-white">Nouveau cycle — {period}</p>
                <p className="text-xs text-[#717182]">Un cycle existe déjà. Voulez-vous en créer un nouveau ?</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowNewCycleConfirm(false)}
                className="flex-1 rounded-xl border border-black/[0.08] dark:border-white/[0.08] py-2.5 text-sm font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition"
              >
                Annuler
              </button>
              <button
                onClick={handleGenerate}
                disabled={createMut.isPending}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 text-sm font-bold text-white transition disabled:opacity-60"
              >
                {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Créer quand même
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
