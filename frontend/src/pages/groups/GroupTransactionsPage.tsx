import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Wallet, Loader2 } from "lucide-react";
import { api } from "../../services/api";

export function GroupTransactionsPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const { data: group } = useQuery({ queryKey: ["group", id], queryFn: () => api.group(id) });
  const { data, isLoading } = useQuery({ queryKey: ["group-transactions", id], queryFn: () => api.groupTransactions(id) });
  const currency = group?.currency ?? "XAF";
  const fmt = (v: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency, minimumFractionDigits: 0 }).format(v);

  return (
    <div className="p-6 space-y-5">
      <h2 className="text-xl font-black text-[#17211f] dark:text-white">Caisse & Transactions</h2>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
          <p className="text-xs text-[#717182]">Solde actuel</p>
          <p className={`text-xl font-black mt-1 ${(data?.balance ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmt(data?.balance ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
          <div className="flex items-center gap-1.5 mb-1"><TrendingUp size={13} className="text-emerald-500" /><p className="text-xs text-[#717182]">Entrées</p></div>
          <p className="text-xl font-black text-emerald-600">{fmt(data?.total_in ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
          <div className="flex items-center gap-1.5 mb-1"><TrendingDown size={13} className="text-rose-500" /><p className="text-xs text-[#717182]">Sorties</p></div>
          <p className="text-xl font-black text-rose-600">{fmt(data?.total_out ?? 0)}</p>
        </div>
      </div>
      {isLoading ? <div className="flex h-40 items-center justify-center"><Loader2 size={24} className="animate-spin text-blue-700" /></div> : (
        <div className="overflow-x-auto rounded-xl border border-black/[0.06] dark:border-white/[0.06]">
          <table className="w-full text-sm">
            <thead><tr className="bg-[#f6f7fb] dark:bg-[#161920] border-b border-black/[0.06] dark:border-white/[0.06]">
              <th className="text-left px-4 py-3 text-xs font-bold uppercase text-[#717182]">Date</th>
              <th className="text-left px-4 py-3 text-xs font-bold uppercase text-[#717182]">Description</th>
              <th className="text-left px-4 py-3 text-xs font-bold uppercase text-[#717182]">Catégorie</th>
              <th className="text-right px-4 py-3 text-xs font-bold uppercase text-[#717182]">Montant</th>
            </tr></thead>
            <tbody>
              {(data?.items ?? []).map(t => (
                <tr key={t.id} className="border-b border-black/[0.04] dark:border-white/[0.04] hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-[#717182] text-xs">{t.transaction_date}</td>
                  <td className="px-4 py-3 font-semibold text-[#17211f] dark:text-white">{t.description}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-black/[0.05] dark:bg-white/[0.07] px-2 py-0.5 text-xs text-[#717182]">{t.category || t.type}</span></td>
                  <td className={`px-4 py-3 text-right font-black ${t.type === "in" ? "text-emerald-600" : "text-rose-600"}`}>
                    {t.type === "in" ? "+" : "-"}{fmt(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(data?.items ?? []).length === 0 && <p className="py-8 text-center text-sm text-[#717182]">Aucune transaction.</p>}
        </div>
      )}
    </div>
  );
}
