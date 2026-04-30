import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, ClipboardList,
  FileSearch, RefreshCcw, ShieldCheck,
} from "lucide-react";

import { SelectInput, TextInput } from "../components/FormField";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../services/api";
import { shortDate } from "../utils/format";

const DECLARATION_TYPES = [
  { key: "fiscale", label: "Déclaration fiscale", description: "TVA, IS, acomptes provisionnels, IRPP" },
  { key: "sociale", label: "Déclaration sociale", description: "CNPS, cotisations, charges patronales" },
  { key: "bailleur", label: "Rapport bailleur", description: "Bailleur de fonds, ONG, agence de financement" },
  { key: "statistique", label: "Rapport statistique", description: "ANSS, INS, déclarations annuelles" },
];

function parseList(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split("\n").map((item) => item.trim()).filter(Boolean);
  }
}

export function DeclarationsPage() {
  const queryClient = useQueryClient();
  const alerts = useQuery({ queryKey: ["terasAlerts"], queryFn: api.terasAlerts });
  const scores = useQuery({ queryKey: ["terasScores"], queryFn: api.terasScores });
  const declarations = useQuery({ queryKey: ["declarations"], queryFn: api.declarations });

  const [form, setForm] = useState({ period: "Avril 2026", declaration_type: "fiscale" });
  const declaration = useMutation({
    mutationFn: api.prepareDeclaration,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["declarations"] }),
  });

  const analyzeDomain = useMutation({
    mutationFn: (domain: string) => {
      if (domain === "rh") return api.analyzeTerasRh();
      if (domain === "payroll") return api.analyzeTerasPayroll();
      if (domain === "declaration") return api.analyzeTerasDeclaration();
      return api.analyzeTerasDocuments();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["terasScores"] });
      queryClient.invalidateQueries({ queryKey: ["terasAlerts"] });
    },
  });

  const activeAlerts = alerts.data?.filter((a) => a.status === "open") ?? [];
  const declarationAlerts = activeAlerts.filter((a) =>
    a.module.toLowerCase().includes("declar") ||
    a.module.toLowerCase().includes("compt") ||
    a.module.toLowerCase().includes("fiscal")
  );

  const selectedType = DECLARATION_TYPES.find((t) => t.key === form.declaration_type) ?? DECLARATION_TYPES[0];
  const resultMissingDocuments = parseList(declaration.data?.missing_documents);
  const resultChecklist = parseList(declaration.data?.checklist);

  function submit(e: FormEvent) {
    e.preventDefault();
    declaration.mutate(form);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-emerald-600">Obligations légales</p>
        <h1 className="text-3xl font-black text-ink">Déclarations assistées</h1>
        <p className="mt-1 text-sm font-medium text-[#717182]">
          Préparez vos déclarations fiscales, sociales et bailleurs avec l'assistance IA et le contrôle TERAS.
        </p>
      </div>

      {/* Alertes TERAS liées aux déclarations */}
      {declarationAlerts.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle size={16} />
            <span className="text-sm font-bold">{declarationAlerts.length} alerte(s) TERAS sur les déclarations</span>
          </div>
          <div className="mt-2 space-y-1">
            {declarationAlerts.map((a) => (
              <p key={a.id} className="text-sm text-amber-700">{a.title} · {a.recommendation}</p>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[0.4fr_1fr]">
        {/* Types de déclarations */}
        <Panel title="Type de déclaration">
          <div className="space-y-2">
            {DECLARATION_TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => setForm({ ...form, declaration_type: t.key })}
                className={`flex w-full flex-col gap-0.5 rounded-lg px-3 py-3 text-left transition ${
                  form.declaration_type === t.key
                    ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500"
                    : "hover:bg-stone-50 text-ink"
                }`}
              >
                <span className="font-semibold text-sm">{t.label}</span>
                <span className="text-xs text-[#717182]">{t.description}</span>
              </button>
            ))}
          </div>
        </Panel>

        {/* Formulaire + résultat */}
        <Panel
          title={selectedType.label}
          action={
            declaration.isPending
              ? <span className="flex items-center gap-2 text-xs font-bold text-[#717182]"><RefreshCcw className="animate-spin" size={14} />Analyse en cours…</span>
              : null
          }
        >
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput
                label="Période"
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value })}
              />
              <SelectInput
                label="Type"
                value={form.declaration_type}
                onChange={(e) => setForm({ ...form, declaration_type: e.target.value })}
              >
                {DECLARATION_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </SelectInput>
            </div>

            <button
              type="submit"
              disabled={declaration.isPending}
              className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 font-semibold text-white disabled:bg-stone-300"
            >
              <ClipboardCheck size={18} />
              {declaration.isPending ? "Préparation…" : "Préparer la déclaration"}
            </button>
          </form>

          {/* Résultat */}
          {declaration.data && (
            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap gap-2">
                <StatusBadge label={declaration.data.case_reference} tone="purple" />
                <StatusBadge label={`${declaration.data.confidence}% confiance IA`} tone="blue" />
                <StatusBadge label={declaration.data.status} tone="green" />
                <StatusBadge label={declaration.data.provider} tone="neutral" />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {resultMissingDocuments.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="flex items-center gap-2 font-bold text-amber-800">
                      <AlertTriangle size={15} />
                      Pièces manquantes
                    </p>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-700">
                      {resultMissingDocuments.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {resultChecklist.length > 0 && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <p className="flex items-center gap-2 font-bold text-emerald-800">
                      <CheckCircle2 size={15} />
                      Checklist de préparation
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-emerald-600">
                      {resultChecklist.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span className="mt-0.5">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <p className="rounded-lg bg-stone-50 p-3 text-sm text-[#17211f]">
                Contrôle humain recommandé avant soumission officielle.
              </p>
            </div>
          )}

          {declaration.error && (
            <p className="mt-3 text-sm text-red-600">{declaration.error.message}</p>
          )}
        </Panel>
      </div>

      <Panel title="Dossiers déclaratifs enregistrés">
        {declarations.isLoading && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-lg bg-black/[0.04]" />
            ))}
          </div>
        )}
        {!declarations.isLoading && (declarations.data?.length ?? 0) === 0 && (
          <p className="rounded-lg border border-dashed border-black/[0.08] p-4 text-sm text-[#717182]">
            Aucun dossier préparé. Lancez une préparation IA pour créer un historique exploitable.
          </p>
        )}
        {(declarations.data?.length ?? 0) > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {declarations.data?.slice(0, 6).map((record) => (
              <div key={record.id} className="rounded-lg border border-black/[0.06] bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-ink">{record.case_reference}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#717182]">
                      {record.declaration_type} · {record.period}
                    </p>
                  </div>
                  <StatusBadge label={`${record.confidence}%`} tone="blue" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusBadge label={record.status} tone="green" />
                  <StatusBadge label={record.provider} tone="neutral" />
                </div>
                <p className="mt-3 text-xs text-[#717182]">{shortDate(record.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Scores TERAS par domaine */}
      {scores.data && scores.data.length > 0 && (
        <Panel title="Scores de conformité par domaine">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {scores.data.map((s) => (
              <div key={s.id} className="rounded-lg border border-black/[0.05] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-[#17211f] capitalize">{s.domain}</p>
                  <ShieldCheck size={15} className="text-emerald-600" />
                </div>
                <p className="mt-2 text-2xl font-black text-ink">{s.score}<span className="text-sm font-medium text-stone-400">/100</span></p>
                <p className="mt-1 text-xs text-[#717182] line-clamp-2">{s.summary}</p>
                <p className="mt-1 text-xs text-stone-400">{shortDate(s.created_at)}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Analyses TERAS rapides */}
      <Panel title="Analyses TERAS par domaine">
        <p className="-mt-2 mb-4 text-sm text-[#717182]">Déclenchez une analyse ciblée pour chaque domaine déclaratif.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { key: "declaration", label: "Déclarations fiscales", icon: ClipboardList },
            { key: "payroll", label: "Paie & cotisations", icon: ClipboardCheck },
            { key: "documents", label: "Pièces justificatives", icon: FileSearch },
            { key: "rh", label: "Conformité RH", icon: ShieldCheck },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => analyzeDomain.mutate(key)}
              disabled={analyzeDomain.isPending}
              className="flex items-center gap-3 rounded-lg border border-black/[0.06] bg-white p-3 text-left transition hover:border-emerald-500 hover:shadow-sm disabled:opacity-50"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                <Icon size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">{label}</p>
                <p className="text-xs text-[#717182]">{analyzeDomain.isPending && analyzeDomain.variables === key ? "Analyse…" : "Analyser avec TERAS"}</p>
              </div>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
