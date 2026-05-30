import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CheckCircle, Clock, AlertTriangle, X, Loader2, CreditCard, Send } from "lucide-react";
import { api } from "../../services/api";

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-500/15",
  pending: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300",
  late: "bg-rose-100 text-rose-700 dark:bg-rose-500/15",
};

function fmtAmount(v: number, cur = "XAF") {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur, minimumFractionDigits: 0 }).format(v);
}

export function GroupContributionsPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"plans" | "payments">("plans");
  const [showPlan, setShowPlan] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [planForm, setPlanForm] = useState({ title: "", amount: "", frequency: "mensuelle", due_day: "", is_mandatory: true });
  const [payForm, setPayForm] = useState({ member_id: "", plan_id: "", amount_paid: "", payment_method: "cash" });

  const { data: group } = useQuery({ queryKey: ["group", id], queryFn: () => api.group(id) });
  const { data: plans = [] } = useQuery({ queryKey: ["group-plans", id], queryFn: () => api.groupContributionPlans(id) });
  const { data: paymentsData } = useQuery({ queryKey: ["group-payments", id, filterStatus], queryFn: () => api.groupPayments(id, filterStatus ? { status: filterStatus } : undefined) });
  const { data: members = [] } = useQuery({ queryKey: ["group-members", id], queryFn: () => api.groupMembers(id) });

  const payments = paymentsData?.items ?? [];
  const stats = paymentsData?.stats ?? {};
  const currency = group?.currency ?? "XAF";

  const createPlan = useMutation({
    mutationFn: () => api.createContributionPlan(id, { title: planForm.title, amount: Number(planForm.amount), frequency: planForm.frequency, due_day: planForm.due_day ? Number(planForm.due_day) : undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["group-plans", id] }); setShowPlan(false); setPlanForm({ title: "", amount: "", frequency: "mensuelle", due_day: "", is_mandatory: true }); },
  });

  const recordPayment = useMutation({
    mutationFn: () => api.recordPayment(id, { member_id: Number(payForm.member_id), plan_id: Number(payForm.plan_id), amount_paid: Number(payForm.amount_paid), payment_method: payForm.payment_method }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["group-payments", id] }); setShowPayment(false); setPayForm({ member_id: "", plan_id: "", amount_paid: "", payment_method: "cash" }); },
  });

  const validatePay = useMutation({
    mutationFn: (paymentId: number) => api.validatePayment(id, paymentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-payments", id] }),
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-[#17211f] dark:text-white">Cotisations</h2>
        <div className="flex gap-2">
          {group?.can_manage && <button onClick={() => setShowPlan(true)} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-700 transition"><Plus size={14} /> Plan</button>}
          <button onClick={() => setShowPayment(true)} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition"><CreditCard size={14} /> Paiement</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total attendu", value: fmtAmount(stats.total_due ?? 0, currency), color: "text-[#17211f] dark:text-white" },
          { label: "Total reçu", value: fmtAmount(stats.total_paid ?? 0, currency), color: "text-emerald-600" },
          { label: "Arriérés", value: fmtAmount(stats.arrears ?? 0, currency), color: "text-rose-600" },
          { label: "À jour", value: stats.members_up_to_date ?? 0, color: "text-sky-600" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-3">
            <p className="text-xs text-[#717182]">{s.label}</p>
            <p className={`text-lg font-black mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-[#f6f7fb] dark:bg-[#161920] p-1 w-fit">
        {[["plans","Plans"], ["payments","Paiements"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as "plans" | "payments")}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${tab === k ? "bg-white dark:bg-[#1e2229] shadow-sm text-[#17211f] dark:text-white" : "text-[#717182] hover:text-[#17211f] dark:hover:text-white"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "plans" ? (
        <div className="space-y-3">
          {plans.length === 0 ? <p className="text-sm text-[#717182]">Aucun plan créé.</p> :
            plans.map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
                <div>
                  <p className="font-bold text-[#17211f] dark:text-white">{p.title}</p>
                  <p className="text-sm text-[#717182]">{fmtAmount(p.amount, currency)} · {p.frequency} · {p.is_mandatory ? "Obligatoire" : "Optionnelle"}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{p.status}</span>
              </div>
            ))}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Filtre statut */}
          <div className="flex gap-2 flex-wrap">
            {["","paid","partial","pending","late"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`rounded-full px-3 py-1 text-xs font-bold border transition ${filterStatus === s ? "bg-violet-600 text-white border-violet-600" : "border-black/[0.08] dark:border-white/[0.08] text-[#717182] hover:border-violet-400"}`}>
                {s === "" ? "Tous" : s === "paid" ? "Payés" : s === "partial" ? "Partiels" : s === "pending" ? "En attente" : "En retard"}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-black/[0.06] dark:border-white/[0.06]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f6f7fb] dark:bg-[#161920] border-b border-black/[0.06] dark:border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-xs font-bold uppercase text-[#717182]">Membre</th>
                  <th className="text-left px-4 py-3 text-xs font-bold uppercase text-[#717182]">Plan</th>
                  <th className="text-right px-4 py-3 text-xs font-bold uppercase text-[#717182]">Dû</th>
                  <th className="text-right px-4 py-3 text-xs font-bold uppercase text-[#717182]">Payé</th>
                  <th className="text-left px-4 py-3 text-xs font-bold uppercase text-[#717182]">Statut</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} className="border-b border-black/[0.04] dark:border-white/[0.04] hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-semibold text-[#17211f] dark:text-white">{p.member_name || `#${p.member_id}`}</td>
                    <td className="px-4 py-3 text-[#717182]">{p.plan_title || `#${p.plan_id}`}</td>
                    <td className="px-4 py-3 text-right">{fmtAmount(p.amount_due, currency)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">{fmtAmount(p.amount_paid, currency)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[p.status] ?? "bg-gray-100 text-gray-600"}`}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {!p.validated_at && (
                        <button onClick={() => validatePay.mutate(p.id)} className="flex items-center gap-1 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 px-2 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 transition">
                          <CheckCircle size={11} /> Valider
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payments.length === 0 && <p className="py-6 text-center text-sm text-[#717182]">Aucun paiement.</p>}
          </div>
        </div>
      )}

      {/* Modal plan */}
      {showPlan && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-black text-[#17211f] dark:text-white">Nouveau plan</h3><button onClick={() => setShowPlan(false)}><X size={16} /></button></div>
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase text-[#717182]">Titre *<input value={planForm.title} onChange={e => setPlanForm(f => ({...f, title: e.target.value}))} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case focus:border-violet-500" /></label>
              <label className="block text-xs font-bold uppercase text-[#717182]">Montant ({currency}) *<input type="number" value={planForm.amount} onChange={e => setPlanForm(f => ({...f, amount: e.target.value}))} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case" /></label>
              <label className="block text-xs font-bold uppercase text-[#717182]">Fréquence<select value={planForm.frequency} onChange={e => setPlanForm(f => ({...f, frequency: e.target.value}))} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case">{["unique","hebdomadaire","mensuelle","trimestrielle","annuelle"].map(fr => <option key={fr} value={fr}>{fr}</option>)}</select></label>
            </div>
            <button disabled={!planForm.title || !planForm.amount || createPlan.isPending} onClick={() => createPlan.mutate()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-black text-white hover:bg-violet-700 disabled:bg-stone-300 transition">
              {createPlan.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Créer
            </button>
          </div>
        </div>
      )}

      {/* Modal paiement */}
      {showPayment && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-black text-[#17211f] dark:text-white">Enregistrer un paiement</h3><button onClick={() => setShowPayment(false)}><X size={16} /></button></div>
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase text-[#717182]">Membre *<select value={payForm.member_id} onChange={e => setPayForm(f => ({...f, member_id: e.target.value}))} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case"><option value="">—</option>{members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></label>
              <label className="block text-xs font-bold uppercase text-[#717182]">Plan de cotisation *<select value={payForm.plan_id} onChange={e => setPayForm(f => ({...f, plan_id: e.target.value}))} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case"><option value="">—</option>{plans.map(p => <option key={p.id} value={p.id}>{p.title} — {fmtAmount(p.amount, currency)}</option>)}</select></label>
              <label className="block text-xs font-bold uppercase text-[#717182]">Montant payé ({currency}) *<input type="number" value={payForm.amount_paid} onChange={e => setPayForm(f => ({...f, amount_paid: e.target.value}))} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case" /></label>
              <label className="block text-xs font-bold uppercase text-[#717182]">Méthode<select value={payForm.payment_method} onChange={e => setPayForm(f => ({...f, payment_method: e.target.value}))} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case">{["cash","mobile_money","bank","card"].map(m => <option key={m}>{m}</option>)}</select></label>
            </div>
            <button disabled={!payForm.member_id || !payForm.plan_id || !payForm.amount_paid || recordPayment.isPending} onClick={() => recordPayment.mutate()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:bg-stone-300 transition">
              {recordPayment.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
