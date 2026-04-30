import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Download, FileCheck2, Send, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { api } from "../services/api";
import { money, shortDate } from "../utils/format";

function openBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function KpiCard({ label, value, hint, delta, accent = "indigo" }: {
  label: string; value: string; hint?: string; delta?: string; deltaPositive?: boolean; accent?: string;
}) {
  const colors: Record<string, string> = {
    indigo: "from-emerald-500/15 to-emerald-500/0 text-emerald-600",
    emerald: "from-emerald-500/15 to-emerald-500/0 text-emerald-600",
    amber: "from-amber-500/15 to-amber-500/0 text-amber-600",
    sky: "from-sky-500/15 to-sky-500/0 text-sky-600",
  };
  return (
    <div className="relative overflow-hidden rounded-xl border border-black/[0.08] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1e2229]">
      <div className={`absolute -right-8 -top-8 size-32 rounded-full bg-gradient-to-br ${colors[accent]} blur-2xl opacity-70`} />
      <p className="text-sm text-[#717182]">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-[#17211f] dark:text-white">{value}</span>
        {delta && (
          <span className="flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">
            ↑ {delta}
          </span>
        )}
      </div>
      {hint && <p className="mt-0.5 text-xs text-[#717182]">{hint}</p>}
    </div>
  );
}

const PAYROLL_STEPS = [
  { label: "Collecte des variables (présence, heures, primes)", key: "collect" },
  { label: "Calcul automatique IA des bulletins", key: "calc" },
  { label: "Contrôle TERAS (cotisations, plafonds, anomalies)", key: "teras" },
  { label: "Validation RH puis Finance", key: "validate" },
  { label: "Génération des bulletins PDF & versements", key: "generate" },
];

const EMPLOYEE_COLORS = [
  {
    avatar: "from-emerald-500 to-teal-500",
    text: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    header: "from-emerald-600 to-teal-600",
  },
  {
    avatar: "from-violet-500 to-indigo-500",
    text: "text-violet-600 dark:text-violet-300",
    badge: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    header: "from-violet-600 to-indigo-600",
  },
  {
    avatar: "from-sky-500 to-blue-500",
    text: "text-sky-600 dark:text-sky-300",
    badge: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    header: "from-sky-600 to-blue-600",
  },
  {
    avatar: "from-amber-500 to-orange-500",
    text: "text-amber-600 dark:text-amber-300",
    badge: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    header: "from-amber-600 to-orange-600",
  },
  {
    avatar: "from-rose-500 to-pink-500",
    text: "text-rose-600 dark:text-rose-300",
    badge: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    header: "from-rose-600 to-pink-600",
  },
];

function colorForEmployee(name: string, index = 0) {
  const seed = name.split("").reduce((sum, char) => sum + char.charCodeAt(0), index);
  return EMPLOYEE_COLORS[Math.abs(seed) % EMPLOYEE_COLORS.length];
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

export function PayrollPage() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState("Mai 2026");
  const [activeStep, setActiveStep] = useState(3); // 0-indexed, step 4 is current
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null);
  const [previewSlip, setPreviewSlip] = useState<{
    name: string; role?: string; gross: number; net: number; deductions: number;
  } | null>(null);

  const runs = useQuery({ queryKey: ["payrollRuns"], queryFn: api.payrollRuns });
  const paymentAccounts = useQuery({ queryKey: ["paymentAccounts"], queryFn: api.paymentAccounts });
  const create = useMutation({
    mutationFn: api.createPayrollRun,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payrollRuns"] });
      setActiveStep(4);
    },
  });

  async function exportRun(id: number, runPeriod: string) {
    setExportingId(id);
    try {
      const blob = await api.exportPayrollRun(id, "pdf");
      openBlob(blob, `bulletins-${runPeriod}.pdf`);
    } finally {
      setExportingId(null);
    }
  }

  const latestRun = runs.data?.[0];
  const payrollAccounts = useMemo(
    () => (paymentAccounts.data ?? []).filter((account) => account.enabled && account.use_for_payroll),
    [paymentAccounts.data]
  );
  useEffect(() => {
    if (paymentAccountId !== null) return;
    const defaultAccount = payrollAccounts.find((account) => account.is_default_payroll) ?? payrollAccounts[0];
    if (defaultAccount) setPaymentAccountId(defaultAccount.id);
  }, [paymentAccountId, payrollAccounts]);
  const totalGross = runs.data?.reduce((s, r) => s + (r.gross_total ?? 0), 0) ?? 0;
  const totalNet = runs.data?.reduce((s, r) => s + (r.net_total ?? 0), 0) ?? 0;
  const allSlips = runs.data?.flatMap((r) => r.payslips) ?? [];
  const doneCount = runs.data?.filter((r) => r.status === "validated").length ?? 0;
  const highlightedSlip = latestRun?.payslips[0];
  const highlightedColor = highlightedSlip ? colorForEmployee(highlightedSlip.employee_name) : EMPLOYEE_COLORS[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#17211f] dark:text-white">Paie</h1>
          <p className="mt-0.5 text-sm text-[#717182]">
            {latestRun ? `Cycle ${latestRun.period} · ${latestRun.payslips.length} bulletins` : "Aucun cycle actif"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => latestRun && exportRun(latestRun.id, latestRun.period)}
            disabled={!latestRun}
            className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm disabled:opacity-40 hover:bg-[#f5f5fa] dark:border-white/10 dark:bg-white/5"
          >
            <Download size={15} /> Exporter
          </button>
          <button
            onClick={() => create.mutate({ period, payment_account_id: paymentAccountId })}
            disabled={create.isPending}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            <Send size={15} />
            {create.isPending ? "Génération…" : "Lancer la paie"}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Masse salariale"
          value={totalGross > 0 ? `${(totalGross / 1_000_000).toFixed(1)} M XOF` : "—"}
          delta={totalGross > 0 ? "+1,2%" : undefined}
          hint="incl. charges sociales"
          accent="teal"
        />
        <KpiCard
          label="Bulletins prêts"
          value={`${doneCount} / ${runs.data?.length ?? 0}`}
          hint={runs.data && runs.data.length - doneCount > 0 ? `${runs.data.length - doneCount} en cours` : "Tous validés"}
          accent="emerald"
        />
        <KpiCard
          label="Anomalies TERAS"
          value="2"
          hint="écart cotisations détecté"
          accent="amber"
        />
        <KpiCard
          label="Versements"
          value={totalNet > 0 ? `${(totalNet / 1_000_000).toFixed(1)} M XOF` : "—"}
          hint={latestRun?.payment_account_label || "Mobile money / banque / PayPal"}
          accent="sky"
        />
      </div>

      {/* Main content */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Workflow stepper */}
        <div className="lg:col-span-2 rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#1e2229]">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
            <div>
              <h3 className="font-semibold text-[#17211f] dark:text-white">Préparation du cycle — {period}</h3>
              <p className="text-xs text-[#717182] mt-0.5">5 étapes · {activeStep} terminées</p>
            </div>
            <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              {activeStep >= 5 ? "Terminé" : "En cours"}
            </span>
          </div>
          <ol className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {PAYROLL_STEPS.map((step, i) => {
              const done = i < activeStep;
              const current = i === activeStep;
              return (
                <li key={step.key} className="flex items-center gap-4 px-5 py-4">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    done
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                      : current
                        ? "bg-emerald-600 text-white"
                        : "bg-[#ececf0] text-[#717182] dark:bg-white/10 dark:text-white/40"
                  }`}>
                    {done ? <FileCheck2 size={14} /> : i + 1}
                  </div>
                  <span className={`flex-1 text-sm ${done || current ? "text-[#17211f] dark:text-white" : "text-[#717182]"}`}>
                    {step.label}
                  </span>
                  {current && (
                    <button
                      onClick={() => setActiveStep((s) => Math.min(s + 1, 5))}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Continuer
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {/* New period input */}
          <div className="border-t border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
            <div className="flex items-center gap-3">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-black/[0.08] bg-[#f8f8fc] px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <Wallet size={15} className="text-[#717182]" />
              <input
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  placeholder="Période (ex: Mai 2026)"
                  className="flex-1 bg-transparent text-sm outline-none text-[#17211f] placeholder:text-[#717182] dark:text-white"
              />
            </div>
              <select
                value={paymentAccountId ?? ""}
                onChange={(e) => setPaymentAccountId(e.target.value ? Number(e.target.value) : null)}
                className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm font-semibold text-[#17211f] outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
              >
                <option value="">Compte source paie</option>
                {payrollAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label} · {account.masked_identifier || account.currency}
                  </option>
                ))}
              </select>
              <button
                onClick={() => { create.mutate({ period, payment_account_id: paymentAccountId }); setActiveStep(0); }}
                disabled={create.isPending}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {create.isPending ? "…" : "Nouveau cycle"}
              </button>
            </div>
          </div>
        </div>

        {/* Bulletin preview */}
        <div className="rounded-xl border border-black/[0.08] bg-white overflow-hidden dark:border-white/[0.08] dark:bg-[#1e2229]">
          {latestRun && latestRun.payslips[0] ? (
            <>
              <div className={`bg-gradient-to-br ${highlightedColor.header} px-5 py-4 text-white`}>
                <p className="text-xs text-white/70">Bulletin de paie · {latestRun.period}</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
                    {initials(latestRun.payslips[0].employee_name)}
                  </div>
                  <div>
                    <p className="font-semibold">{latestRun.payslips[0].employee_name}</p>
                    <p className="text-xs text-white/70">{latestRun.payment_account_label || "Compte source à définir"}</p>
                  </div>
                </div>
              </div>
              <div className="p-5 space-y-2 text-sm">
                {[
                  { k: "Salaire brut", v: money(latestRun.payslips[0].gross_pay) },
                  { k: "Cotisations sociales", v: `-${money(latestRun.payslips[0].deductions)}`, muted: true },
                ].map((row) => (
                  <div key={row.k} className={`flex items-center justify-between ${row.muted ? "text-[#717182]" : "text-[#17211f] dark:text-white"}`}>
                    <span>{row.k}</span><span>{row.v}</span>
                  </div>
                ))}
                <div className="my-2 border-t border-black/[0.06] dark:border-white/[0.06]" />
                <div className={`flex items-center justify-between font-semibold ${highlightedColor.text}`}>
                  <span>Net à payer</span>
                  <span>{money(latestRun.payslips[0].net_pay)} XOF</span>
                </div>
                <div className="rounded-lg bg-black/[0.03] px-3 py-2 text-xs text-[#717182] dark:bg-white/[0.05]">
                  Versement : {latestRun.payslips[0].payout_method || "non défini"} · {latestRun.payslips[0].payout_destination || "destination manquante"}
                </div>
                <button
                  onClick={() => exportRun(latestRun.id, latestRun.period)}
                  disabled={exportingId === latestRun.id}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-black/[0.08] py-2 text-sm hover:bg-[#f5f5fa] dark:border-white/10 disabled:opacity-50"
                >
                  <Download size={15} />
                  {exportingId === latestRun.id ? "Export…" : "Télécharger le PDF"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Wallet size={36} className="text-emerald-300" />
              <p className="text-sm text-[#717182]">Lancez un cycle de paie pour voir le bulletin</p>
            </div>
          )}
        </div>
      </div>

      {/* TERAS Anomalies */}
      {latestRun && (
        <div className="rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#1e2229]">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
            <h3 className="font-semibold text-[#17211f] dark:text-white">Anomalies détectées par TERAS</h3>
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <AlertCircle size={14} /> 2 à examiner
            </span>
          </div>
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {latestRun.payslips.map((slip, i) => {
              const employeeColor = colorForEmployee(slip.employee_name, i);
              return (
                <div key={slip.id} className="flex items-start gap-3 px-5 py-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${employeeColor.avatar} text-xs font-bold text-white`}>
                    {initials(slip.employee_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                    <span className={`font-semibold ${employeeColor.text}`}>{slip.employee_name}</span>
                    <span className="text-[#717182]"> — {i === 0 ? "Cotisation CNPS supérieure de 4 200 XOF au plafond — vérifier l'assiette" : `Bulletin ${slip.reference} en attente de validation`}</span>
                  </div>
                    <p className="mt-1 text-xs text-[#717182]">
                      Versement {slip.payout_method || "non défini"} · {slip.payout_destination || "destination manquante"} · {slip.payout_status === "ready" ? "prêt" : "à compléter"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${i === 0 ? "bg-amber-50 text-amber-700" : employeeColor.badge}`}>
                      {i === 0 ? "Attention" : "Info"}
                    </span>
                    <button
                      onClick={async () => {
                        try {
                          const resp = await api.downloadPayslip(slip.id);
                          const blob = await resp.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `bulletin_${slip.reference}.pdf`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch { alert("Erreur téléchargement"); }
                      }}
                      className="flex items-center gap-1 text-[11px] text-emerald-700 hover:underline"
                    >
                      <Download size={11} /> Bulletin PDF
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* History */}
      {(runs.data?.length ?? 0) > 1 && (
        <div className="rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.08] dark:bg-[#1e2229]">
          <div className="border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
            <h3 className="font-semibold text-[#17211f] dark:text-white">Historique des cycles</h3>
          </div>
          <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {runs.data?.map((run) => (
              <div key={run.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div>
                  <p className="font-semibold text-sm text-[#17211f] dark:text-white">{run.period}</p>
                  <p className="text-xs text-[#717182]">{shortDate(run.created_at)} · {run.payslips.length} bulletins</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${run.status === "validated" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {run.status === "validated" ? "Validé" : run.status}
                  </span>
                  <span className="font-semibold text-sm text-[#17211f] dark:text-white">{money(run.net_total)} XOF</span>
                  <button
                    onClick={() => exportRun(run.id, run.period)}
                    disabled={exportingId === run.id}
                    className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs font-semibold hover:bg-[#f5f5fa] disabled:opacity-40 dark:border-white/10 dark:bg-white/5"
                  >
                    <Download size={13} />
                    {exportingId === run.id ? "…" : "PDF"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
