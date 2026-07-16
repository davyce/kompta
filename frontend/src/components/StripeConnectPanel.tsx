import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Banknote, CheckCircle2, ExternalLink, Loader2, ShieldAlert } from "lucide-react";

import { api } from "../services/api";

const STATUS_TONE: Record<string, string> = {
  not_started: "bg-stone-100 text-stone-600",
  pending: "bg-amber-100 text-amber-700",
  active: "bg-emerald-100 text-emerald-700",
  restricted: "bg-red-100 text-red-700",
};

const STATUS_TK: Record<string, string> = {
  not_started: "stripeConnect.status.notStarted",
  pending: "stripeConnect.status.pending",
  active: "stripeConnect.status.active",
  restricted: "stripeConnect.status.restricted",
};

/**
 * Reversement des encaissements carte (Tap to Pay, Apple Pay, carte web) vers
 * le compte bancaire de l'entreprise via Stripe Connect. Sans ce compte, les
 * paiements carte restent sur le compte Stripe de la plateforme KOMPTA —
 * cf. audit "aucun mécanisme de reversement automatique".
 */
export function StripeConnectPanel() {
  const { t: tr } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["connect-status"], queryFn: () => api.connectStatus() });
  const [feeInput, setFeeInput] = useState<string | null>(null);

  const onboard = useMutation({
    mutationFn: () => {
      const returnUrl = `${window.location.origin}/settings?tab=payments&connect=return`;
      const refreshUrl = `${window.location.origin}/settings?tab=payments&connect=refresh`;
      return api.startConnectOnboarding(returnUrl, refreshUrl);
    },
    onSuccess: (res) => {
      window.location.href = res.onboarding_url;
    },
  });

  const updateFee = useMutation({
    mutationFn: (percent: number) => api.updatePlatformFee(percent),
    onSuccess: () => {
      setFeeInput(null);
      qc.invalidateQueries({ queryKey: ["connect-status"] });
    },
  });

  const status = q.data?.status ?? "not_started";
  const fee = feeInput ?? String(q.data?.platform_fee_percent ?? 0);

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white p-5 dark:border-white/[0.08] dark:bg-white/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
            <Banknote size={18} />
          </span>
          <div>
            <h3 className="font-black text-[#17211f] dark:text-white">{tr("stripeConnect.title")}</h3>
            <p className="mt-0.5 text-sm text-[#717182]">
              {tr("stripeConnect.description")}
            </p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE[status] ?? STATUS_TONE.not_started}`}>
          {q.isLoading ? "…" : tr(STATUS_TK[status] ?? STATUS_TK.not_started)}
        </span>
      </div>

      {status !== "active" ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            {status === "pending"
              ? tr("stripeConnect.pendingNotice")
              : tr("stripeConnect.notStartedNotice")}
          </span>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CheckCircle2 size={14} className="shrink-0" />
          <span>{tr("stripeConnect.activeNotice")}</span>
        </div>
      )}

      <button
        onClick={() => onboard.mutate()}
        disabled={onboard.isPending}
        className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {onboard.isPending ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
        {status === "not_started" ? tr("stripeConnect.setupAccount") : tr("stripeConnect.resumeSetup")}
      </button>
      {onboard.isError ? (
        <p className="mt-2 text-xs font-medium text-red-600">
          {(onboard.error as Error)?.message || tr("stripeConnect.onboardError")}
        </p>
      ) : null}

      <div className="mt-5 border-t border-black/[0.06] pt-4 dark:border-white/[0.06]">
        <label className="text-xs font-bold uppercase tracking-wide text-[#717182]">
          {tr("stripeConnect.feeLabel")}
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={fee}
            onChange={(e) => setFeeInput(e.target.value)}
            aria-label={tr("stripeConnect.feeLabel")}
            className="w-24 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-white/10 dark:bg-white/5"
          />
          <span className="text-sm text-[#717182]">%</span>
          <button
            onClick={() => updateFee.mutate(Number(fee))}
            disabled={updateFee.isPending || feeInput === null}
            className="rounded-lg border border-black/10 px-3 py-2 text-xs font-bold hover:bg-black/[0.04] disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/[0.06]"
          >
            {updateFee.isPending ? "…" : tr("stripeConnect.feeSave")}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-[#717182]">
          {tr("stripeConnect.feeHint")}
        </p>
        {updateFee.isError ? (
          <p className="mt-1 text-xs font-medium text-red-600">
            {(updateFee.error as Error)?.message || tr("stripeConnect.feeError")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
