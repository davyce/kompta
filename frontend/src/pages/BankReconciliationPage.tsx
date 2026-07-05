import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitCompareArrows, Loader2, Upload } from "lucide-react";

import { api } from "../services/api";
import { money, shortDate } from "../utils/format";
import { ModuleHint } from "../components/ModuleHint";

const STATUS_STYLE: Record<string, string> = {
  matched: "border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30",
  suggested: "border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30",
  unmatched: "border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30",
  ignored: "border-black/[0.08] bg-black/[0.02] opacity-60 dark:border-white/[0.08]",
};

export function BankReconciliationPage() {
  const { t: tr } = useTranslation();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState<number | "">("");
  const [importId, setImportId] = useState<number | null>(null);
  const [busyLine, setBusyLine] = useState<number | null>(null);
  const [error, setError] = useState("");

  const accountsQuery = useQuery({ queryKey: ["payment-accounts"], queryFn: api.paymentAccounts });

  const importData = useQuery({
    queryKey: ["bank-statement-import", importId],
    queryFn: () => api.getBankStatementImport(importId as number),
    enabled: importId != null,
  });

  const importMut = useMutation({
    mutationFn: (file: File) => api.importBankStatement(accountId as number, file),
    onSuccess: (res) => { setImportId(res.import_id); setError(""); },
    onError: (err: Error) => setError(err.message),
  });

  async function act(lineId: number, fn: () => Promise<any>) {
    setBusyLine(lineId);
    try {
      await fn();
      await importData.refetch();
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyLine(null);
    }
  }

  const lines: any[] = importData.data?.lines ?? [];
  const accounts = accountsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <ModuleHint moduleId="bankReconciliation" title={tr("moduleHints.bankReconciliation.title")} body={tr("moduleHints.bankReconciliation.body")} />
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
          <GitCompareArrows size={20} />
        </span>
        <div>
          <h1 className="text-lg font-bold text-[#17211f] dark:text-white">{tr("bankReconciliation.title")}</h1>
          <p className="text-sm text-[#717182]">{tr("bankReconciliation.subtitle")}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-black/[0.06] bg-white p-5 dark:bg-[#1e2229] dark:border-white/[0.06] space-y-3">
        <label className="block text-sm font-medium text-[#17211f] dark:text-white">
          {tr("bankReconciliation.selectAccount")}
        </label>
        {accounts.length === 0 ? (
          <p className="text-sm text-[#717182]">{tr("bankReconciliation.noAccounts")}</p>
        ) : (
          <select
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value ? Number(e.target.value) : ""); setImportId(null); }}
            className="w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
          >
            <option value="">{tr("bankReconciliation.selectAccountPlaceholder")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        )}

        <button
          disabled={!accountId || importMut.isPending}
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-black/[0.12] px-4 py-8 text-sm font-semibold text-[#717182] hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50 dark:border-white/[0.12] transition"
        >
          {importMut.isPending ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
          {importMut.isPending ? tr("bankReconciliation.uploading") : tr("bankReconciliation.uploadButton")}
        </button>
        <p className="text-xs text-[#717182]">{tr("bankReconciliation.dropDesc")}</p>
        <input
          ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importMut.mutate(f); e.target.value = ""; }}
        />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>

      {importId && (
        <div className="rounded-2xl border border-black/[0.06] bg-white p-5 dark:bg-[#1e2229] dark:border-white/[0.06] space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-[#717182]">
            <span className="font-medium text-[#17211f] dark:text-white">{importData.data?.filename}</span>
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {tr("bankReconciliation.statusMatched")}: {importData.data?.matched_count ?? 0}
            </span>
            <span className="rounded-full bg-amber-100 dark:bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              {tr("bankReconciliation.statusSuggested")}: {importData.data?.suggested_count ?? 0}
            </span>
            <span className="rounded-full bg-red-100 dark:bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
              {tr("bankReconciliation.statusUnmatched")}: {importData.data?.unmatched_count ?? 0}
            </span>
          </div>

          {lines.length === 0 ? (
            <p className="text-sm text-[#717182]">{tr("bankReconciliation.empty")}</p>
          ) : (
            <div className="space-y-2">
              {lines.map((line) => (
                <div key={line.id} className={`rounded-xl border px-3 py-2 ${STATUS_STYLE[line.match_status] ?? ""}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#17211f] dark:text-white">{line.label}</p>
                      <p className="text-xs text-[#717182]">{shortDate(line.date)} · {money(line.amount)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {busyLine === line.id ? (
                        <Loader2 size={14} className="animate-spin text-[#717182]" />
                      ) : line.match_status === "suggested" && line.candidate_transaction ? (
                        <button
                          onClick={() => act(line.id, () => api.confirmStatementLine(line.id, line.candidate_transaction.id))}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          {tr("bankReconciliation.confirm")}
                        </button>
                      ) : line.match_status === "unmatched" ? (
                        <>
                          <button
                            onClick={() => act(line.id, () => api.createTransactionFromLine(line.id))}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            {tr("bankReconciliation.createTransaction")}
                          </button>
                          <button
                            onClick={() => act(line.id, () => api.ignoreStatementLine(line.id))}
                            className="rounded-lg border border-black/[0.08] px-2.5 py-1 text-xs font-semibold text-[#717182] hover:bg-black/[0.04] dark:border-white/[0.08]"
                          >
                            {tr("bankReconciliation.ignore")}
                          </button>
                        </>
                      ) : (
                        <span className="text-xs font-semibold capitalize text-[#717182]">
                          {tr(`bankReconciliation.status${line.match_status.charAt(0).toUpperCase()}${line.match_status.slice(1)}`, { defaultValue: line.match_status })}
                        </span>
                      )}
                    </div>
                  </div>
                  {line.match_status === "suggested" && line.candidate_transaction && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      {tr("bankReconciliation.colCandidate")}: {line.candidate_transaction.label} · {money(line.candidate_transaction.amount)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!importId && accountId && (
        <p className="text-sm text-[#717182]">{tr("bankReconciliation.noImportYet")}</p>
      )}
    </div>
  );
}
