import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CheckCircle, X, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../services/api";
import i18n from "../../i18n";

const PAYMENT_METHOD_TK: Record<string, string> = {
  cash: "groupPages.expenses.paymentMethods.cash",
  mobile_money: "groupPages.expenses.paymentMethods.mobileMoney",
  bank: "groupPages.expenses.paymentMethods.bank",
};

export function GroupExpensesPage() {
  const { t: tr } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", amount: "", category: "", payment_method: "cash", paid_to: "", notes: "" });
  const { data: group } = useQuery({ queryKey: ["group", id], queryFn: () => api.group(id) });
  const { data: expenses = [], isLoading } = useQuery({ queryKey: ["group-expenses", id], queryFn: () => api.groupExpenses(id) });
  const currency = group?.currency ?? "XAF";
  const fmt = (v: number) => new Intl.NumberFormat(i18n.language, { style: "currency", currency, minimumFractionDigits: 0 }).format(v);

  const create = useMutation({
    mutationFn: () => api.createExpense(id, { ...form, amount: Number(form.amount) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["group-expenses", id] }); setShowAdd(false); setForm({ title: "", amount: "", category: "", payment_method: "cash", paid_to: "", notes: "" }); },
  });
  const approve = useMutation({
    mutationFn: (eid: number) => api.approveExpense(id, eid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-expenses", id] }),
  });

  const total = expenses.reduce((s, e) => s + (e.status === "paid" ? e.amount : 0), 0);
  const pending = expenses.filter(e => e.status === "pending");

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-[#17211f] dark:text-white">{tr("groupPages.expenses.title")}</h2>
          <p className="text-sm text-[#717182]">{tr("groupPages.expenses.pendingApproval", { count: pending.length })}</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 transition">
          <Plus size={15} /> {tr("groupPages.expenses.add")}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
          <p className="text-xs text-[#717182]">{tr("groupPages.expenses.totalPaid")}</p><p className="text-xl font-black text-rose-600 mt-1">{fmt(total)}</p>
        </div>
        <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
          <p className="text-xs text-[#717182]">{tr("groupPages.expenses.pending")}</p><p className="text-xl font-black text-amber-600 mt-1">{pending.length}</p>
        </div>
        <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
          <p className="text-xs text-[#717182]">{tr("groupPages.expenses.totalRows")}</p><p className="text-xl font-black text-[#17211f] dark:text-white mt-1">{expenses.length}</p>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? [1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.04]" />) :
          expenses.map(e => (
            <div key={e.id} className="flex items-center gap-4 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#17211f] dark:text-white">{e.title}</p>
                <p className="text-xs text-[#717182]">{e.category} · {e.expense_date} · {e.paid_to || "—"}</p>
              </div>
              <p className="font-black text-rose-600 shrink-0">{fmt(e.amount)}</p>
              {e.status === "pending" ? (
                <button onClick={() => approve.mutate(e.id)} disabled={approve.isPending}
                  className="flex items-center gap-1 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 px-2.5 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 transition">
                  <CheckCircle size={12} /> {tr("groupPages.expenses.approve")}
                </button>
              ) : (
                <span className="flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle size={10} /> {tr("groupPages.expenses.paid")}
                </span>
              )}
            </div>
          ))}
        {expenses.length === 0 && !isLoading && <p className="text-center text-sm text-[#717182] py-8">{tr("groupPages.expenses.empty")}</p>}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1e2229] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-black text-[#17211f] dark:text-white">{tr("groupPages.expenses.modalTitle")}</h3><button onClick={() => setShowAdd(false)}><X size={16} /></button></div>
            <div className="space-y-3">
              {[
                { f: "title", l: tr("groupPages.expenses.form.title"), p: tr("groupPages.expenses.form.titlePlaceholder") },
                { f: "amount", l: tr("groupPages.expenses.form.amount"), p: "" },
                { f: "category", l: tr("groupPages.expenses.form.category"), p: tr("groupPages.expenses.form.categoryPlaceholder") },
                { f: "paid_to", l: tr("groupPages.expenses.form.paidTo"), p: tr("groupPages.expenses.form.paidToPlaceholder") },
              ].map(({ f, l, p }) => (
                <label key={f} className="block text-xs font-bold uppercase text-[#717182]">{l}
                  <input type={f === "amount" ? "number" : "text"} value={(form as Record<string, string>)[f]} onChange={e => setForm(fm => ({...fm, [f]: e.target.value}))} placeholder={p}
                    className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case focus:border-blue-700" />
                </label>
              ))}
              <label className="block text-xs font-bold uppercase text-[#717182]">{tr("groupPages.expenses.form.method")}<select value={form.payment_method} onChange={e => setForm(f => ({...f, payment_method: e.target.value}))} className="mt-1 w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none normal-case">{["cash","mobile_money","bank"].map(m => <option key={m} value={m}>{tr(PAYMENT_METHOD_TK[m] ?? "groupPages.expenses.paymentMethods.unknown", { defaultValue: m })}</option>)}</select></label>
            </div>
            <button disabled={!form.title || !form.amount || create.isPending} onClick={() => create.mutate()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-sm font-black text-white hover:bg-rose-700 disabled:bg-stone-300 transition">
              {create.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} {tr("common.save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
