import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, Loader2, CheckCircle2, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../services/api";
import type { PaymentAccount } from "../types/domain";

const CASH_KEY = "cash";

type AccountOption = {
  key: string;
  paymentAccountId: number | null;
  label: string;
  currency: string;
};

export function OpeningBalancePanel({ paymentAccounts }: { paymentAccounts: PaymentAccount[] }) {
  const { t: tr } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["opening-balances"], queryFn: () => api.getOpeningBalances() });
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const options: AccountOption[] = useMemo(() => {
    const cash: AccountOption = { key: CASH_KEY, paymentAccountId: null, label: tr("settingsPage.openingBalance.cash"), currency: "XAF" };
    const accounts: AccountOption[] = paymentAccounts.map((a) => ({
      key: String(a.id),
      paymentAccountId: a.id,
      label: a.label,
      currency: a.currency || "XAF",
    }));
    return [cash, ...accounts];
  }, [paymentAccounts, tr]);

  const existingByAccount = useMemo(() => {
    const map = new Map<number | null, { id: number; amount: number; date: string; label: string; currency: string }>();
    (q.data ?? []).forEach((ob) => map.set(ob.payment_account_id, ob));
    return map;
  }, [q.data]);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof api.setOpeningBalance>[0]) => api.setOpeningBalance(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opening-balances"] });
      qc.invalidateQueries({ queryKey: ["transactionStats"] });
      qc.invalidateQueries({ queryKey: ["accountingBalance"] });
      setEditingKey(null);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[#17211f] dark:text-white">
        <Wallet size={18} className="text-emerald-600" />
        <h3 className="font-black">{tr("settingsPage.openingBalance.title")}</h3>
      </div>
      <p className="max-w-2xl text-sm text-[#717182]">{tr("settingsPage.openingBalance.subtitle")}</p>

      {q.isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-[#717182]"><Loader2 size={16} className="animate-spin" /> {tr("common.loading")}</div>
      ) : (
        <div className="grid gap-3">
          {options.map((opt) => {
            const existing = existingByAccount.get(opt.paymentAccountId) ?? null;
            return (
              <OpeningBalanceRow
                key={opt.key}
                option={opt}
                existing={existing}
                editing={editingKey === opt.key}
                saving={mutation.isPending}
                onEdit={() => setEditingKey(opt.key)}
                onCancel={() => setEditingKey(null)}
                onSave={(amount, entry_date, label) =>
                  mutation.mutate({ payment_account_id: opt.paymentAccountId, amount, entry_date, label })
                }
              />
            );
          })}
        </div>
      )}
      {mutation.error && <p className="text-xs font-semibold text-red-600">{(mutation.error as Error).message}</p>}
    </div>
  );
}

function OpeningBalanceRow({
  option, existing, editing, saving, onEdit, onCancel, onSave,
}: {
  option: AccountOption;
  existing: { id: number; amount: number; date: string; label: string; currency: string } | null;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (amount: number, entry_date: string, label: string) => void;
}) {
  const { t: tr } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [entryDate, setEntryDate] = useState(existing?.date || today);
  const [label, setLabel] = useState(existing?.label || tr("settingsPage.openingBalance.defaultLabel"));

  return (
    <article className="rounded-xl border border-black/[0.06] bg-[#fbfbfd] p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold text-[#17211f] dark:text-white">{option.label}</p>
          {existing ? (
            <p className="mt-1 text-sm text-[#717182]">
              {tr("settingsPage.openingBalance.current")}: <strong className="text-[#17211f] dark:text-white">{existing.amount.toLocaleString()} {option.currency}</strong> · {existing.date}
            </p>
          ) : (
            <p className="mt-1 text-sm text-[#717182]">{tr("settingsPage.openingBalance.none")}</p>
          )}
        </div>
        {!editing && (
          <button onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-xs font-bold hover:bg-emerald-50 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <Pencil size={13} /> {existing ? tr("common.edit") : tr("settingsPage.openingBalance.add")}
          </button>
        )}
      </div>

      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const num = parseFloat(amount);
            if (!Number.isFinite(num) || num < 0) return;
            onSave(num, entryDate, label);
          }}
          className="mt-4 grid gap-3 sm:grid-cols-3"
        >
          <label className="text-xs font-bold uppercase text-[#717182]">
            {tr("settingsPage.openingBalance.amount")} ({option.currency})
            <input
              type="number" min="0" step="0.01" required
              value={amount} onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
            />
          </label>
          <label className="text-xs font-bold uppercase text-[#717182]">
            {tr("settingsPage.openingBalance.date")}
            <input
              type="date" required
              value={entryDate} onChange={(e) => setEntryDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
            />
          </label>
          <label className="text-xs font-bold uppercase text-[#717182]">
            {tr("settingsPage.openingBalance.label")}
            <input
              value={label} onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm normal-case text-[#17211f] outline-none dark:border-white/[0.08] dark:bg-[#252931] dark:text-white"
            />
          </label>
          <div className="sm:col-span-3 flex flex-wrap gap-2">
            <button disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} {tr("common.save")}
            </button>
            <button type="button" onClick={onCancel} className="rounded-lg border border-black/[0.08] px-4 py-2 text-xs font-bold text-[#717182] hover:bg-black/[0.03] dark:border-white/[0.08]">
              {tr("common.cancel")}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
