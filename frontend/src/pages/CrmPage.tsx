import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, Target, X } from "lucide-react";

import { useToast } from "../components/ToastProvider";
import { api } from "../services/api";
import { money } from "../utils/format";
import type { Opportunity } from "../types/domain";

const STAGES = ["nouveau", "qualifie", "proposition", "negociation", "gagne", "perdu"] as const;

const STAGE_STYLE: Record<string, string> = {
  nouveau: "border-black/[0.08] bg-black/[0.02] dark:border-white/[0.08]",
  qualifie: "border-sky-200 bg-sky-50 dark:bg-sky-500/10 dark:border-sky-500/30",
  proposition: "border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30",
  negociation: "border-orange-200 bg-orange-50 dark:bg-orange-500/10 dark:border-orange-500/30",
  gagne: "border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30",
  perdu: "border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30",
};

type OpportunityFormData = {
  title: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  estimated_amount: string;
  probability_percent: string;
  expected_close_date: string;
};

const EMPTY_FORM: OpportunityFormData = {
  title: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  estimated_amount: "",
  probability_percent: "20",
  expected_close_date: "",
};

export function CrmPage() {
  const { t: tr } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<OpportunityFormData>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const toast = useToast();

  const opportunitiesQuery = useQuery({ queryKey: ["crm-opportunities"], queryFn: () => api.crmOpportunities() });
  const summaryQuery = useQuery({ queryKey: ["crm-pipeline-summary"], queryFn: api.crmPipelineSummary });

  const createMut = useMutation({
    mutationFn: () =>
      api.createOpportunity({
        title: form.title,
        contact_name: form.contact_name,
        contact_phone: form.contact_phone,
        contact_email: form.contact_email,
        estimated_amount_cents: Math.round(Number(form.estimated_amount || 0) * 100),
        probability_percent: Number(form.probability_percent || 0),
        expected_close_date: form.expected_close_date || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["crm-pipeline-summary"] });
      setShowForm(false);
      setForm(EMPTY_FORM);
      setError("");
    },
    onError: (err: Error) => setError(err.message),
  });

  const stageMut = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: string }) => api.updateOpportunity(id, { stage }),
    onMutate: ({ id }) => setBusyId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["crm-pipeline-summary"] });
    },
    onSettled: () => setBusyId(null),
  });

  const convertMut = useMutation({
    mutationFn: (id: number) => api.convertOpportunityToInvoice(id),
    onMutate: (id) => setBusyId(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["crm-opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["crm-pipeline-summary"] });
      navigate("/billing");
      toast.success(tr("crm.convertSuccess", { number: res.invoice_number }));
    },
    onError: (err: Error) => setError(err.message),
    onSettled: () => setBusyId(null),
  });

  const opportunities = opportunitiesQuery.data ?? [];
  const summaryByStage = new Map((summaryQuery.data?.stages ?? []).map((s) => [s.stage, s]));

  function opportunitiesForStage(stage: string): Opportunity[] {
    return opportunities.filter((o) => o.stage === stage);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <Target size={20} />
          </span>
          <div>
            <h1 className="text-lg font-bold text-[#17211f] dark:text-white">{tr("crm.title")}</h1>
            <p className="text-sm text-[#717182]">{tr("crm.subtitle")}</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Plus size={16} /> {tr("crm.newOpportunity")}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((stage) => {
          const summary = summaryByStage.get(stage);
          const stageOpportunities = opportunitiesForStage(stage);
          return (
            <div key={stage} className={`flex flex-col gap-3 rounded-2xl border p-3 ${STAGE_STYLE[stage]}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#17211f] dark:text-white">{tr(`crm.stages.${stage}`)}</h2>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold text-[#17211f] dark:bg-black/20 dark:text-white">
                  {summary?.count ?? stageOpportunities.length}
                </span>
              </div>
              <p className="text-xs text-[#717182]">
                {money((summary?.total_estimated_amount_cents ?? 0) / 100)}
              </p>

              <div className="flex flex-1 flex-col gap-2">
                {stageOpportunities.length === 0 ? (
                  <p className="text-xs text-[#717182]">{tr("crm.empty")}</p>
                ) : (
                  stageOpportunities.map((opp) => (
                    <div
                      key={opp.id}
                      className="rounded-xl border border-black/[0.08] bg-white p-3 text-sm shadow-sm dark:border-white/[0.08] dark:bg-[#1e2229]"
                    >
                      <p className="truncate font-semibold text-[#17211f] dark:text-white">{opp.title}</p>
                      <p className="truncate text-xs text-[#717182]">{opp.contact_name}</p>
                      <p className="mt-1 text-xs font-medium text-[#17211f] dark:text-white">
                        {money(opp.estimated_amount_cents / 100)} · {opp.probability_percent}%
                      </p>

                      <div className="mt-2 flex items-center gap-2">
                        {busyId === opp.id ? (
                          <Loader2 size={14} className="animate-spin text-[#717182]" />
                        ) : (
                          <select
                            value={opp.stage}
                            onChange={(e) => stageMut.mutate({ id: opp.id, stage: e.target.value })}
                            aria-label={tr("crm.form.changeStage", { title: opp.title })}
                            className="w-full rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-xs dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                          >
                            {STAGES.map((s) => (
                              <option key={s} value={s}>{tr(`crm.stages.${s}`)}</option>
                            ))}
                          </select>
                        )}
                      </div>

                      {opp.stage === "gagne" && (
                        <button
                          disabled={busyId === opp.id}
                          onClick={() => convertMut.mutate(opp.id)}
                          className="mt-2 w-full rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {tr("crm.convertToInvoice")}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-[#1e2229]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-[#17211f] dark:text-white">{tr("crm.newOpportunity")}</h2>
              <button onClick={() => setShowForm(false)} aria-label={tr("common.close")} className="text-[#717182] hover:text-[#17211f] dark:hover:text-white">
                <X size={18} />
              </button>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }}
            >
              <div>
                <label htmlFor="crm-opp-title" className="mb-1 block text-xs font-medium text-[#717182]">{tr("crm.form.title")}</label>
                <input
                  id="crm-opp-title"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="crm-opp-contact-name" className="mb-1 block text-xs font-medium text-[#717182]">{tr("crm.form.contactName")}</label>
                  <input
                    id="crm-opp-contact-name"
                    value={form.contact_name}
                    onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                    className="w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="crm-opp-contact-phone" className="mb-1 block text-xs font-medium text-[#717182]">{tr("crm.form.contactPhone")}</label>
                  <input
                    id="crm-opp-contact-phone"
                    value={form.contact_phone}
                    onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                    className="w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="crm-opp-contact-email" className="mb-1 block text-xs font-medium text-[#717182]">{tr("crm.form.contactEmail")}</label>
                <input
                  id="crm-opp-contact-email"
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  className="w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="crm-opp-amount" className="mb-1 block text-xs font-medium text-[#717182]">{tr("crm.form.estimatedAmount")}</label>
                  <input
                    id="crm-opp-amount"
                    type="number"
                    min={0}
                    value={form.estimated_amount}
                    onChange={(e) => setForm({ ...form, estimated_amount: e.target.value })}
                    className="w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="crm-opp-probability" className="mb-1 block text-xs font-medium text-[#717182]">{tr("crm.form.probability")}</label>
                  <input
                    id="crm-opp-probability"
                    type="number"
                    min={0}
                    max={100}
                    value={form.probability_percent}
                    onChange={(e) => setForm({ ...form, probability_percent: e.target.value })}
                    className="w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="crm-opp-close-date" className="mb-1 block text-xs font-medium text-[#717182]">{tr("crm.form.expectedCloseDate")}</label>
                <input
                  id="crm-opp-close-date"
                  type="date"
                  value={form.expected_close_date}
                  onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })}
                  className="w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-sm dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
                />
              </div>
              <button
                type="submit"
                disabled={createMut.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {createMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {tr("crm.form.submit")}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
