import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingDown, CreditCard, Loader2 } from "lucide-react";
import { api } from "../../services/api";

function fmtAmount(v: number, cur = "XAF") {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur, minimumFractionDigits: 0 }).format(v);
}

export function GroupReportsPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const { data: group } = useQuery({ queryKey: ["group", id], queryFn: () => api.group(id) });
  const { data: payReport, isLoading: l1 } = useQuery({ queryKey: ["group-report-payments", id], queryFn: () => api.groupReportPayments(id) });
  const { data: expReport, isLoading: l2 } = useQuery({ queryKey: ["group-report-expenses", id], queryFn: () => api.groupReportExpenses(id) });
  const currency = group?.currency ?? "XAF";

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-black text-[#17211f] dark:text-white">Rapports</h2>

      {/* Rapport cotisations */}
      <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-5">
        <div className="flex items-center gap-2 mb-4"><CreditCard size={16} className="text-blue-700" /><h3 className="font-bold text-[#17211f] dark:text-white">Cotisations</h3></div>
        {l1 ? <div className="flex h-20 items-center justify-center"><Loader2 size={20} className="animate-spin text-blue-700" /></div> : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl bg-[#f6f7fb] dark:bg-[#161920] p-3">
                <p className="text-xs text-[#717182]">Total attendu</p>
                <p className="text-lg font-black text-[#17211f] dark:text-white">{fmtAmount(payReport?.total_due ?? 0, currency)}</p>
              </div>
              <div className="rounded-xl bg-[#f6f7fb] dark:bg-[#161920] p-3">
                <p className="text-xs text-[#717182]">Total reçu</p>
                <p className="text-lg font-black text-emerald-600">{fmtAmount(payReport?.total_paid ?? 0, currency)}</p>
              </div>
              <div className="rounded-xl bg-[#f6f7fb] dark:bg-[#161920] p-3">
                <p className="text-xs text-[#717182]">Taux de recouvrement</p>
                <p className="text-lg font-black text-blue-800">{payReport?.recovery_rate ?? 0}%</p>
              </div>
            </div>
            {/* Barre */}
            {(payReport?.total_due ?? 0) > 0 && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08] mb-4">
                <div className="h-2 rounded-full bg-gradient-to-r from-blue-700 to-emerald-500" style={{ width: `${Math.min(100, payReport?.recovery_rate ?? 0)}%` }} />
              </div>
            )}
            {/* Top 5 arriérés */}
            {(payReport?.rows ?? []).filter(r => r.status !== "paid").slice(0, 5).length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase text-[#717182] mb-2">Membres avec arriérés</p>
                {(payReport?.rows ?? []).filter(r => r.status !== "paid").slice(0, 5).map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-black/[0.04] dark:border-white/[0.04] last:border-0">
                    <p className="text-sm text-[#17211f] dark:text-white">{r.member_name || `#${r.member_id}`}</p>
                    <p className="text-sm font-black text-rose-600">{fmtAmount(r.amount_due - r.amount_paid, currency)}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Rapport dépenses */}
      <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-5">
        <div className="flex items-center gap-2 mb-4"><TrendingDown size={16} className="text-rose-500" /><h3 className="font-bold text-[#17211f] dark:text-white">Dépenses</h3></div>
        {l2 ? <div className="flex h-20 items-center justify-center"><Loader2 size={20} className="animate-spin text-rose-500" /></div> : (
          <>
            <p className="text-2xl font-black text-rose-600 mb-4">{fmtAmount(expReport?.total ?? 0, currency)}</p>
            {/* Par catégorie */}
            {Object.entries(expReport?.by_category ?? {}).map(([cat, amount]) => {
              const total = expReport?.total ?? 1;
              const pct = Math.round(100 * amount / total);
              return (
                <div key={cat} className="mb-2">
                  <div className="flex justify-between text-xs mb-0.5"><span className="text-[#717182] capitalize">{cat}</span><span className="font-bold">{fmtAmount(amount, currency)} ({pct}%)</span></div>
                  <div className="h-1.5 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
                    <div className="h-1.5 rounded-full bg-rose-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
