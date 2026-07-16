import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CheckCircle, AlertTriangle, X, Loader2, CreditCard, Send, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../services/api";
import i18n from "../../i18n";

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-500/15",
  pending: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300",
  late: "bg-rose-100 text-rose-700 dark:bg-rose-500/15",
};

const FILTER_CHIPS = [
  { value: "", tk: "common.all", active: "bg-blue-800 text-white border-blue-800", inactive: "border-black/[0.08] dark:border-white/[0.08] text-[#717182]" },
  { value: "paid", tk: "groupPages.contributions.filters.paid", active: "bg-emerald-600 text-white border-emerald-600", inactive: "border-black/[0.08] dark:border-white/[0.08] text-[#717182]" },
  { value: "partial", tk: "groupPages.contributions.filters.partial", active: "bg-amber-500 text-white border-amber-500", inactive: "border-black/[0.08] dark:border-white/[0.08] text-[#717182]" },
  { value: "pending", tk: "groupPages.contributions.filters.pending", active: "bg-gray-600 text-white border-gray-600", inactive: "border-black/[0.08] dark:border-white/[0.08] text-[#717182]" },
  { value: "late", tk: "groupPages.contributions.filters.late", active: "bg-rose-600 text-white border-rose-600", inactive: "border-black/[0.08] dark:border-white/[0.08] text-[#717182]" },
];

const STATUS_TK: Record<string, string> = {
  paid: "groupPages.contributions.status.paid",
  partial: "groupPages.contributions.status.partial",
  pending: "groupPages.contributions.status.pending",
  late: "groupPages.contributions.status.late",
  active: "groupPages.contributions.status.active",
  inactive: "groupPages.contributions.status.inactive",
};

const FREQUENCY_TK: Record<string, string> = {
  unique: "groupPages.contributions.frequency.once",
  hebdomadaire: "groupPages.contributions.frequency.weekly",
  mensuelle: "groupPages.contributions.frequency.monthly",
  trimestrielle: "groupPages.contributions.frequency.quarterly",
  annuelle: "groupPages.contributions.frequency.yearly",
};

const PAYMENT_METHOD_TK: Record<string, string> = {
  cash: "groupPages.expenses.paymentMethods.cash",
  mobile_money: "groupPages.expenses.paymentMethods.mobileMoney",
  bank: "groupPages.expenses.paymentMethods.bank",
  card: "groupPages.contributions.paymentMethods.card",
};

function fmtAmount(v: number, cur = "XAF") {
  return new Intl.NumberFormat(i18n.language, { style: "currency", currency: cur, minimumFractionDigits: 0 }).format(v);
}

export function GroupContributionsPage() {
  const { t: tr } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"plans" | "payments">("plans");
  const [showPlan, setShowPlan] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [planForm, setPlanForm] = useState({
    title: "",
    amount: "",
    frequency: "mensuelle",
    due_day: "",
    is_mandatory: true,
    description: "",
  });
  const [payForm, setPayForm] = useState({ member_id: "", plan_id: "", amount_paid: "", payment_method: "cash" });
  // Modal Relance
  const [reminderResult, setReminderResult] = useState<{
    member_name: string;
    amount_due: number;
    currency: string;
    message: string;
    channels: { sms?: string; whatsapp?: string; email?: string };
  } | null>(null);
  const [reminderLoading, setReminderLoading] = useState<number | null>(null);
  const [reminderCopied, setReminderCopied] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);

  async function sendReminder(memberId: number) {
    setReminderLoading(memberId);
    setReminderError(null);
    try {
      const data = await api.remindMember(id, { member_id: memberId, tone: "poli" });
      setReminderResult(data);
    } catch (e) {
      setReminderError(e instanceof Error ? e.message : tr("groupPages.contributions.reminderGenerateFailed"));
    } finally {
      setReminderLoading(null);
    }
  }

  const { data: group } = useQuery({ queryKey: ["group", id], queryFn: () => api.group(id) });
  const { data: plans = [] } = useQuery({ queryKey: ["group-plans", id], queryFn: () => api.groupContributionPlans(id) });
  const { data: paymentsData } = useQuery({ queryKey: ["group-payments", id, filterStatus], queryFn: () => api.groupPayments(id, filterStatus ? { status: filterStatus } : undefined) });
  const { data: members = [] } = useQuery({ queryKey: ["group-members", id], queryFn: () => api.groupMembers(id) });

  const payments = paymentsData?.items ?? [];
  const stats = paymentsData?.stats ?? {};
  const currency = group?.currency ?? "XAF";

  // All payments unfiltered for non-payers calculation — use cached paymentsData
  const { data: allPaymentsData } = useQuery({
    queryKey: ["group-payments", id, ""],
    queryFn: () => api.groupPayments(id, undefined),
  });
  const allPayments = allPaymentsData?.items ?? [];

  // Members who have at least one paid/partial payment across all plans
  const paidMemberIds = new Set(
    allPayments
      .filter(p => p.status === "paid" || p.status === "partial")
      .map(p => p.member_id)
  );
  const nonPayers = members.filter(m => !paidMemberIds.has(m.id));

  const createPlan = useMutation({
    mutationFn: () =>
      api.createContributionPlan(id, {
        title: planForm.title,
        amount: Number(planForm.amount),
        frequency: planForm.frequency,
        due_day: planForm.due_day ? Number(planForm.due_day) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-plans", id] });
      setShowPlan(false);
      setPlanForm({ title: "", amount: "", frequency: "mensuelle", due_day: "", is_mandatory: true, description: "" });
    },
  });

  const recordPayment = useMutation({
    mutationFn: () =>
      api.recordPayment(id, {
        member_id: Number(payForm.member_id),
        plan_id: Number(payForm.plan_id),
        amount_paid: Number(payForm.amount_paid),
        payment_method: payForm.payment_method,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-payments", id] });
      setShowPayment(false);
      setPayForm({ member_id: "", plan_id: "", amount_paid: "", payment_method: "cash" });
    },
  });

  const validatePay = useMutation({
    mutationFn: (paymentId: number) => api.validatePayment(id, paymentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-payments", id] }),
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-[#17211f] dark:text-white">{tr("groupPages.contributions.title")}</h2>
        <div className="flex gap-2">
          {group?.can_manage && (
            <button
              onClick={() => setShowPlan(true)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-800 px-3 py-2 text-sm font-bold text-white hover:bg-blue-900 transition"
            >
              <Plus size={14} /> {tr("groupPages.contributions.plan")}
            </button>
          )}
          <button
            onClick={() => setShowPayment(true)}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition"
          >
            <CreditCard size={14} /> {tr("groupPages.contributions.payment")}
          </button>
        </div>
      </div>
      {reminderError && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{reminderError}</span>
          <button onClick={() => setReminderError(null)} aria-label={tr("common.close")} className="ml-auto text-rose-500 hover:text-rose-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: tr("groupPages.reports.totalDue"), value: fmtAmount(stats.total_due ?? 0, currency), color: "text-[#17211f] dark:text-white" },
          { label: tr("groupPages.reports.totalReceived"), value: fmtAmount(stats.total_paid ?? 0, currency), color: "text-emerald-600" },
          { label: tr("groupPages.contributions.arrears"), value: fmtAmount(stats.arrears ?? 0, currency), color: "text-rose-600" },
          { label: tr("groupPages.contributions.upToDate"), value: stats.members_up_to_date ?? 0, color: "text-sky-600" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-3">
            <p className="text-xs text-[#717182]">{s.label}</p>
            <p className={`text-lg font-black mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-[#f6f7fb] dark:bg-[#161920] p-1 w-fit">
        {(["plans", "payments"] as const).map(k => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${
              tab === k
                ? "bg-white dark:bg-[#1e2229] shadow-sm text-[#17211f] dark:text-white"
                : "text-[#717182] hover:text-[#17211f] dark:hover:text-white"
            }`}
          >
            {k === "plans" ? tr("groupPages.contributions.plans") : tr("groupPages.contributions.payments")}
          </button>
        ))}
      </div>

      {/* ─────────── Onglet Plans ─────────── */}
      {tab === "plans" ? (
        <div className="space-y-3">
          {plans.length === 0 ? (
            <p className="text-sm text-[#717182]">{tr("groupPages.contributions.noPlan")}</p>
          ) : (
            plans.map(plan => {
              const membersPaid = new Set(
                allPayments
                  .filter(p => p.plan_id === plan.id && (p.status === "paid" || p.status === "partial"))
                  .map(p => p.member_id)
              ).size;
              const total = members.length;
              const pct = total > 0 ? Math.round((membersPaid / total) * 100) : 0;
              const barColor =
                pct >= 80
                  ? "bg-emerald-500"
                  : pct >= 40
                  ? "bg-amber-400"
                  : "bg-rose-500";
              const expectedTotal = plan.amount * total;

              return (
                <div
                  key={plan.id}
                  className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-[#17211f] dark:text-white">{plan.title}</p>
                      <p className="text-sm text-[#717182]">
                        {fmtAmount(plan.amount, currency)} · {tr(FREQUENCY_TK[plan.frequency] ?? "groupPages.contributions.frequency.unknown", { defaultValue: plan.frequency })} ·{" "}
                        {plan.is_mandatory ? tr("groupPages.contributions.mandatory") : tr("groupPages.contributions.optional")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {total > 0 && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-900 dark:bg-blue-800/12 dark:text-blue-400">
                          {tr("groupPages.contributions.expectedAmount", { amount: fmtAmount(expectedTotal, currency) })}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          plan.status === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {tr(STATUS_TK[plan.status] ?? "groupPages.contributions.status.unknown", { defaultValue: plan.status })}
                      </span>
                    </div>
                  </div>

                  {/* Barre de progression */}
                  {total > 0 && (
                    <div className="space-y-1.5">
                      <div className="h-2 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.06] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-[#717182]">
                        <span className="font-semibold text-[#17211f] dark:text-white">
                          {membersPaid}/{total}
                        </span>{" "}
                        {tr("groupPages.contributions.membersPaidThisMonth")}
                        <span
                          className={`ml-2 font-bold ${
                            pct >= 80
                              ? "text-emerald-600"
                              : pct >= 40
                              ? "text-amber-500"
                              : "text-rose-600"
                          }`}
                        >
                          ({pct}%)
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* ─────────── Onglet Paiements ─────────── */
        <div className="space-y-4">
          {/* Non-payeurs */}
          {nonPayers.length > 0 && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-rose-600" />
                <p className="text-sm font-bold text-rose-700 dark:text-rose-400">
                  {tr("groupPages.contributions.nonPayers", { count: nonPayers.length })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {nonPayers.map(m => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 rounded-lg bg-white dark:bg-[#1e2229] border border-rose-200 dark:border-rose-500/20 px-2.5 py-1"
                  >
                    <span className="text-sm font-semibold text-[#17211f] dark:text-white">{m.full_name}</span>
                    <button
                      onClick={() => sendReminder(m.id)}
                      disabled={reminderLoading === m.id}
                      className="flex items-center gap-1 rounded-md bg-rose-100 dark:bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-200 transition disabled:opacity-50"
                      title={tr("groupPages.contributions.generateReminder")}
                    >
                      {reminderLoading === m.id ? <Loader2 size={9} className="animate-spin" /> : <Bell size={9} />}
                      {tr("groupPages.contributions.remind")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filtres */}
          <div className="flex gap-2 flex-wrap">
            {FILTER_CHIPS.map(chip => (
              <button
                key={chip.value}
                onClick={() => setFilterStatus(chip.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold border transition ${
                  filterStatus === chip.value ? chip.active : chip.inactive + " hover:border-blue-500"
                }`}
              >
                {tr(chip.tk)}
              </button>
            ))}
          </div>

          {/* Tableau */}
          <div className="overflow-x-auto rounded-xl border border-black/[0.06] dark:border-white/[0.06]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f6f7fb] dark:bg-[#161920] border-b border-black/[0.06] dark:border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-xs font-bold uppercase text-[#717182]">{tr("groupPages.members.member")}</th>
                  <th className="text-left px-4 py-3 text-xs font-bold uppercase text-[#717182]">{tr("groupPages.contributions.plan")}</th>
                  <th className="text-right px-4 py-3 text-xs font-bold uppercase text-[#717182]">{tr("groupPages.contributions.due")}</th>
                  <th className="text-right px-4 py-3 text-xs font-bold uppercase text-[#717182]">{tr("groupPages.contributions.paid")}</th>
                  <th className="text-left px-4 py-3 text-xs font-bold uppercase text-[#717182]">{tr("common.status")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr
                    key={p.id}
                    className="border-b border-black/[0.04] dark:border-white/[0.04] hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 font-semibold text-[#17211f] dark:text-white">{p.member_name || `#${p.member_id}`}</td>
                    <td className="px-4 py-3 text-[#717182]">{p.plan_title || `#${p.plan_id}`}</td>
                    <td className="px-4 py-3 text-right">{fmtAmount(p.amount_due, currency)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">{fmtAmount(p.amount_paid, currency)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {tr(STATUS_TK[p.status] ?? "groupPages.contributions.status.unknown", { defaultValue: p.status })}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!p.validated_at && (
                        <button
                          onClick={() => validatePay.mutate(p.id)}
                          className="flex items-center gap-1 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 px-2 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 transition"
                        >
                          <CheckCircle size={11} /> {tr("groupPages.contributions.validate")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payments.length === 0 && <p className="py-6 text-center text-sm text-[#717182]">{tr("groupPages.contributions.noPayment")}</p>}
          </div>
        </div>
      )}

      {/* Modal plan */}
      {showPlan && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-[#17211f] dark:text-white">{tr("groupPages.contributions.newPlan")}</h3>
              <button onClick={() => setShowPlan(false)} aria-label={tr("common.close")}><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase text-[#717182]">
                {tr("groupPages.contributions.form.title")}
                <input
                  value={planForm.title}
                  onChange={e => setPlanForm(f => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case focus:border-blue-700"
                />
              </label>
              <label className="block text-xs font-bold uppercase text-[#717182]">
                {tr("groupPages.contributions.form.amount", { currency })}
                <input
                  type="number"
                  value={planForm.amount}
                  onChange={e => setPlanForm(f => ({ ...f, amount: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case"
                />
              </label>
              <label className="block text-xs font-bold uppercase text-[#717182]">
                {tr("groupPages.contributions.form.frequency")}
                <select
                  value={planForm.frequency}
                  onChange={e => setPlanForm(f => ({ ...f, frequency: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case"
                >
                  {["unique", "hebdomadaire", "mensuelle", "trimestrielle", "annuelle"].map(fr => (
                    <option key={fr} value={fr}>{tr(FREQUENCY_TK[fr] ?? "groupPages.contributions.frequency.unknown", { defaultValue: fr })}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-bold uppercase text-[#717182]">
                {tr("groupPages.contributions.form.description")}
                <textarea
                  value={planForm.description}
                  onChange={e => setPlanForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case focus:border-blue-700 resize-none"
                />
              </label>
              {/* Toggle obligatoire */}
              <div className="flex items-center justify-between rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5">
                <span className="text-xs font-bold uppercase text-[#717182]">{tr("groupPages.contributions.form.mandatory")}</span>
                <button
                  type="button"
                  onClick={() => setPlanForm(f => ({ ...f, is_mandatory: !f.is_mandatory }))}
                  role="switch"
                  aria-checked={planForm.is_mandatory}
                  aria-label={tr("groupPages.contributions.form.mandatory")}
                  className={`relative w-10 h-5 rounded-full transition-colors ${planForm.is_mandatory ? "bg-blue-800" : "bg-gray-300 dark:bg-gray-600"}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${planForm.is_mandatory ? "translate-x-5" : "translate-x-0"}`}
                  />
                </button>
              </div>
            </div>
            <button
              disabled={!planForm.title || !planForm.amount || createPlan.isPending}
              onClick={() => createPlan.mutate()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-800 py-3 text-sm font-black text-white hover:bg-blue-900 disabled:bg-stone-300 transition"
            >
              {createPlan.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} {tr("common.create")}
            </button>
          </div>
        </div>
      )}

      {/* Modal paiement */}
      {showPayment && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-[#17211f] dark:text-white">{tr("groupPages.contributions.recordPayment")}</h3>
              <button onClick={() => setShowPayment(false)} aria-label={tr("common.close")}><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase text-[#717182]">
                {tr("groupPages.contributions.form.member")}
                <select
                  value={payForm.member_id}
                  onChange={e => setPayForm(f => ({ ...f, member_id: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case"
                >
                  <option value="">—</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold uppercase text-[#717182]">
                {tr("groupPages.contributions.form.contributionPlan")}
                <select
                  value={payForm.plan_id}
                  onChange={e => setPayForm(f => ({ ...f, plan_id: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case"
                >
                  <option value="">—</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.title} — {fmtAmount(p.amount, currency)}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold uppercase text-[#717182]">
                {tr("groupPages.contributions.form.amountPaid", { currency })}
                <input
                  type="number"
                  value={payForm.amount_paid}
                  onChange={e => setPayForm(f => ({ ...f, amount_paid: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case"
                />
              </label>
              <label className="block text-xs font-bold uppercase text-[#717182]">
                {tr("groupPages.expenses.form.method")}
                <select
                  value={payForm.payment_method}
                  onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case"
                >
                  {["cash", "mobile_money", "bank", "card"].map(m => <option key={m} value={m}>{tr(PAYMENT_METHOD_TK[m] ?? "groupPages.expenses.paymentMethods.unknown", { defaultValue: m })}</option>)}
                </select>
              </label>
            </div>
            <button
              disabled={!payForm.member_id || !payForm.plan_id || !payForm.amount_paid || recordPayment.isPending}
              onClick={() => recordPayment.mutate()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:bg-stone-300 transition"
            >
              {recordPayment.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {tr("common.save")}
            </button>
          </div>
        </div>
      )}

      {/* Modal Relance — message IA + canaux SMS/WhatsApp/email */}
      {reminderResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1e2229] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-rose-600" />
                <h3 className="font-bold text-[#17211f] dark:text-white">{tr("groupPages.contributions.remindMember", { name: reminderResult.member_name })}</h3>
              </div>
              <button onClick={() => { setReminderResult(null); setReminderCopied(false); }} aria-label={tr("common.close")} className="text-[#717182] hover:text-[#17211f] dark:hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 px-4 py-2.5">
                <p className="text-xs text-rose-700 dark:text-rose-300">{tr("groupPages.contributions.expectedDue")}</p>
                <p className="text-xl font-extrabold text-rose-800 dark:text-rose-200">{fmtAmount(reminderResult.amount_due, reminderResult.currency)}</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#17211f] dark:text-white">{tr("groupPages.contributions.limuleMessage")}</label>
                  <button
                    onClick={() => { navigator.clipboard.writeText(reminderResult.message); setReminderCopied(true); setTimeout(() => setReminderCopied(false), 2000); }}
                    className="text-[11px] font-semibold text-blue-700 hover:underline"
                  >
                    {reminderCopied ? tr("groupPages.contributions.copiedBang") : tr("groupPages.contributions.copy")}
                  </button>
                </div>
                <textarea
                  value={reminderResult.message}
                  onChange={e => setReminderResult({ ...reminderResult, message: e.target.value })}
                  rows={6}
                  className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-4 py-2.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-blue-500 resize-none"
                />
                <p className="mt-1 text-[10px] text-[#aaaabc]">{tr("groupPages.contributions.editBeforeSending")}</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#17211f] dark:text-white">{tr("groupPages.contributions.sendVia")}</p>
                {reminderResult.channels.whatsapp && (
                  <a href={reminderResult.channels.whatsapp} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 rounded-xl bg-green-600 hover:bg-green-700 px-4 py-2.5 text-sm font-bold text-white transition">
                    <Send size={14} /> WhatsApp
                  </a>
                )}
                {reminderResult.channels.sms && (
                  <a href={reminderResult.channels.sms}
                    className="flex items-center gap-2 rounded-xl bg-blue-700 hover:bg-blue-800 px-4 py-2.5 text-sm font-bold text-white transition">
                    <Send size={14} /> SMS
                  </a>
                )}
                {reminderResult.channels.email && (
                  <a href={reminderResult.channels.email}
                    className="flex items-center gap-2 rounded-xl bg-gray-700 hover:bg-gray-800 px-4 py-2.5 text-sm font-bold text-white transition">
                    <Send size={14} /> Email
                  </a>
                )}
                {!reminderResult.channels.sms && !reminderResult.channels.whatsapp && !reminderResult.channels.email && (
                  <p className="text-xs text-amber-700">{tr("groupPages.contributions.noContactChannel")}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
