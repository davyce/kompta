import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, ClipboardList,
  Download, FileSearch, FileText, RefreshCcw, ShieldCheck,
  Eye, X,
} from "lucide-react";

import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { LimuleIcon } from "../components/LimuleAvatar";
import { api } from "../services/api";
import { shortDate } from "../utils/format";
import type { DeclarationRecord } from "../types/domain";

/* ── Types de déclaration ─────────────────────────────────────────── */
const DECLARATION_TYPES = [
  {
    key: "fiscale",
    label: "Déclaration fiscale",
    short: "Fiscale",
    description: "TVA, IS, acomptes provisionnels, IRPP",
    icon: ClipboardList,
    color: "text-sky-600",
    bg: "bg-sky-50 dark:bg-sky-500/10",
    border: "border-sky-200 dark:border-sky-500/30",
  },
  {
    key: "sociale",
    label: "Déclaration sociale CNPS",
    short: "CNPS",
    description: "Cotisations salariales et patronales",
    icon: ShieldCheck,
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/30",
  },
  {
    key: "tva",
    label: "Déclaration de TVA",
    short: "TVA",
    description: "TVA mensuelle / trimestrielle collectée et déductible",
    icon: FileText,
    color: "text-violet-600",
    bg: "bg-violet-50 dark:bg-violet-500/10",
    border: "border-violet-200 dark:border-violet-500/30",
  },
  {
    key: "is",
    label: "Impôt sur les Sociétés",
    short: "IS",
    description: "Déclaration IS annuelle, acomptes provisionnels",
    icon: ClipboardCheck,
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/30",
  },
  {
    key: "bailleur",
    label: "Rapport bailleur",
    short: "Bailleur",
    description: "ONG, agence de financement, partenaires institutionnels",
    icon: FileSearch,
    color: "text-rose-600",
    bg: "bg-rose-50 dark:bg-rose-500/10",
    border: "border-rose-200 dark:border-rose-500/30",
  },
  {
    key: "statistique",
    label: "Rapport statistique",
    short: "Statistique",
    description: "ANSS, INS, déclarations annuelles d'activité",
    icon: FileSearch,
    color: "text-stone-600",
    bg: "bg-stone-50 dark:bg-stone-500/10",
    border: "border-stone-200 dark:border-stone-500/30",
  },
];

/* ── Helpers ──────────────────────────────────────────────────────── */
function parseList(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split("\n").map((s) => s.trim()).filter(Boolean);
  }
}

function statusTone(status: string): "green" | "blue" | "amber" | "purple" | "neutral" {
  if (status === "generated") return "purple";
  if (status === "draft_ready") return "blue";
  if (status === "validated") return "green";
  if (status === "pending") return "amber";
  return "neutral";
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    generated: "Générée",
    draft_ready: "Prête",
    validated: "Validée",
    pending: "En attente",
  };
  return map[status] ?? status;
}

/* ── Viewer modal ─────────────────────────────────────────────────── */
function DeclarationViewer({ record, onClose }: { record: DeclarationRecord; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const blob = await api.downloadDeclarationPdf(record.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `declaration-${record.declaration_type}-${record.period}-${record.id}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
    } finally { setDownloading(false); }
  }

  const typeInfo = DECLARATION_TYPES.find((t) => t.key === record.declaration_type);
  const checklist = parseList(record.checklist);
  const missing = parseList(record.missing_documents);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-black/[0.06] bg-white dark:bg-[#1a1f26] dark:border-white/[0.08] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] dark:border-white/[0.06] px-6 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#717182]">{record.period}</p>
            <h2 className="mt-0.5 text-lg font-black text-[#17211f] dark:text-white">
              {typeInfo?.label ?? record.declaration_type}
            </h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StatusBadge label={statusLabel(record.status)} tone={statusTone(record.status)} />
              <StatusBadge label={`${record.confidence}% confiance`} tone="blue" />
              <StatusBadge label={record.case_reference} tone="neutral" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {record.generated_text && (
              <button
                onClick={downloadPdf}
                disabled={downloading}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Download size={13} /> {downloading ? "PDF…" : "Télécharger PDF"}
              </button>
            )}
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Texte généré */}
          {record.generated_text ? (
            <div className="p-6 space-y-4">
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-[#17211f] dark:text-white/90 bg-transparent border-0 p-0">
                  {record.generated_text}
                </pre>
              </div>
            </div>
          ) : (
            <div className="p-6">
              <p className="text-sm text-[#717182] italic">
                Déclaration préparée — pas encore de document complet généré. Utilisez "Générer la déclaration" pour obtenir le document intégral.
              </p>
            </div>
          )}

          {/* Checklist + manquants */}
          {(checklist.length > 0 || missing.length > 0) && (
            <div className="grid gap-4 p-6 pt-0 md:grid-cols-2">
              {missing.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 p-4">
                  <p className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300 text-sm">
                    <AlertTriangle size={14} /> Pièces manquantes ({missing.length})
                  </p>
                  <ul className="mt-2 space-y-1">
                    {missing.map((item) => (
                      <li key={item} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-200">
                        <span className="mt-0.5 shrink-0">•</span>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {checklist.length > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30 p-4">
                  <p className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-300 text-sm">
                    <CheckCircle2 size={14} /> Checklist ({checklist.length} points)
                  </p>
                  <ul className="mt-2 space-y-1">
                    {checklist.map((item) => (
                      <li key={item} className="flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-200">
                        <CheckCircle2 size={10} className="mt-0.5 shrink-0" />{item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-black/[0.05] dark:border-white/[0.05] px-6 py-3 text-xs text-[#717182]">
          Contrôle humain recommandé avant soumission officielle · Généré le {shortDate(record.created_at)}
        </div>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────── */
export function DeclarationsPage() {
  const queryClient = useQueryClient();
  const alerts = useQuery({ queryKey: ["terasAlerts"], queryFn: api.terasAlerts });
  const scores = useQuery({ queryKey: ["terasScores"], queryFn: api.terasScores });
  const declarations = useQuery({ queryKey: ["declarations"], queryFn: api.declarations });

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().toLocaleString("fr-FR", { month: "long" });
  const [period, setPeriod] = useState(`${currentMonth.charAt(0).toUpperCase() + currentMonth.slice(1)} ${currentYear}`);
  const [selectedType, setSelectedType] = useState("fiscale");
  const [viewRecord, setViewRecord] = useState<DeclarationRecord | null>(null);

  /* ── Mutations ── */
  const prepare = useMutation({
    mutationFn: api.prepareDeclaration,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["declarations"] }),
  });

  const generate = useMutation({
    mutationFn: api.generateDeclaration,
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

  /* ── Computed ── */
  const activeAlerts = alerts.data?.filter((a) => a.status === "open") ?? [];
  const declarationAlerts = activeAlerts.filter((a) =>
    a.module.toLowerCase().includes("declar") ||
    a.module.toLowerCase().includes("fiscal") ||
    a.module.toLowerCase().includes("compt")
  );
  const allDeclarations = declarations.data ?? [];
  const generatedCount = allDeclarations.filter((d) => d.status === "generated").length;
  const typeInfo = DECLARATION_TYPES.find((t) => t.key === selectedType) ?? DECLARATION_TYPES[0];
  const TypeIcon = typeInfo.icon;
  const isLoading = prepare.isPending || generate.isPending;

  /* ── Recent declarations per type ── */
  const recentByType = allDeclarations.slice(0, 8);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-emerald-600">Obligations légales</p>
        <h1 className="text-3xl font-black text-[#17211f] dark:text-white">Déclarations & Conformité</h1>
        <p className="mt-1 text-sm text-[#717182]">
          Préparez, générez et téléchargez vos déclarations fiscales, sociales et bailleurs avec Limule.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Dossiers",         value: allDeclarations.length, icon: ClipboardList, color: "text-sky-600",     bg: "bg-sky-50 dark:bg-sky-500/10",     limule: false },
          { label: "Générées",         value: generatedCount,         icon: null,          color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-500/10", limule: true  },
          { label: "Alertes TERAS",    value: declarationAlerts.length, icon: AlertTriangle, color: declarationAlerts.length > 0 ? "text-amber-600" : "text-emerald-600", bg: declarationAlerts.length > 0 ? "bg-amber-50 dark:bg-amber-500/10" : "bg-emerald-50 dark:bg-emerald-500/10", limule: false },
          { label: "Score conformité", value: scores.data?.[0]?.score ? `${scores.data[0].score}/100` : "—", icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-500/10", limule: false },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-[#717182]">{kpi.label}</span>
                <span className={`grid h-7 w-7 place-items-center rounded-lg ${kpi.bg}`}>
                  {kpi.limule
                    ? <LimuleIcon size={18} />
                    : Icon && <Icon size={14} className={kpi.color} />
                  }
                </span>
              </div>
              <p className="mt-1.5 text-2xl font-black text-[#17211f] dark:text-white">{kpi.value}</p>
            </div>
          );
        })}
      </div>

      {/* Alertes TERAS */}
      {declarationAlerts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 p-4">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
            <AlertTriangle size={15} />
            {declarationAlerts.length} alerte(s) TERAS sur les déclarations
          </div>
          <div className="mt-2 space-y-1">
            {declarationAlerts.map((a) => (
              <p key={a.id} className="text-sm text-amber-700 dark:text-amber-200">
                · {a.title} — {a.recommendation}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[260px_1fr]">
        {/* Sélecteur de type */}
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-[#717182] mb-2">Type de déclaration</p>
          {DECLARATION_TYPES.map((t) => {
            const Icon = t.icon;
            const isSelected = selectedType === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setSelectedType(t.key)}
                className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition ${
                  isSelected
                    ? `${t.bg} ${t.border} border ring-1 ring-inset ring-current/20`
                    : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04] border border-transparent"
                }`}
              >
                <span className={`mt-0.5 shrink-0 ${t.color}`}><Icon size={16} /></span>
                <div>
                  <p className={`text-sm font-semibold ${isSelected ? t.color : "text-[#17211f] dark:text-white"}`}>{t.short}</p>
                  <p className="text-xs text-[#717182] leading-4 mt-0.5">{t.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Zone d'action principale */}
        <div className="space-y-4">
          <div className={`rounded-2xl border ${typeInfo.border} ${typeInfo.bg} p-5`}>
            <div className="flex items-center gap-3 mb-4">
              <span className={`grid h-10 w-10 place-items-center rounded-xl bg-white dark:bg-black/20 shadow-sm ${typeInfo.color}`}>
                <TypeIcon size={20} />
              </span>
              <div>
                <h2 className="font-black text-[#17211f] dark:text-white">{typeInfo.label}</h2>
                <p className="text-xs text-[#717182]">{typeInfo.description}</p>
              </div>
            </div>

            {/* Période */}
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-[#717182] mb-1">Période</label>
              <input
                type="text"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="ex: Mai 2026 / T1 2026 / Janvier–Mars 2026"
                className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] dark:bg-[#252931] dark:text-white bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => prepare.mutate({ period, declaration_type: selectedType })}
                disabled={isLoading || !period.trim()}
                className="flex items-center gap-2 rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-white/5 px-4 py-2.5 text-sm font-bold text-[#17211f] dark:text-white hover:bg-black/[0.03] disabled:opacity-50 transition"
              >
                {prepare.isPending ? <RefreshCcw size={15} className="animate-spin" /> : <ClipboardCheck size={15} />}
                {prepare.isPending ? "Audit en cours…" : "Préparer (audit + checklist)"}
              </button>
              <button
                onClick={() => generate.mutate({ period, declaration_type: selectedType })}
                disabled={isLoading || !period.trim()}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm"
              >
                {generate.isPending
                  ? <RefreshCcw size={15} className="animate-spin" />
                  : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 p-0.5">
                      <LimuleIcon size={14} />
                    </span>
                  )
                }
                {generate.isPending ? "Génération Limule…" : "Générer la déclaration complète"}
              </button>
            </div>

            {/* Indications */}
            <p className="mt-3 text-xs text-[#717182]">
              <strong>Préparer</strong> : audit des pièces manquantes et checklist de validation. ·
              <strong> Générer</strong> : document déclaratif complet avec calculs, tableaux et recommandations.
            </p>
          </div>

          {/* Résultat prepare */}
          {prepare.data && (
            <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-[#17211f] dark:text-white text-sm">Résultat de l'audit</p>
                <StatusBadge label={statusLabel(prepare.data.status)} tone={statusTone(prepare.data.status)} />
                <StatusBadge label={`${prepare.data.confidence}% confiance IA`} tone="blue" />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {parseList(prepare.data.missing_documents).length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                      <AlertTriangle size={12} /> Pièces manquantes
                    </p>
                    <ul className="mt-2 space-y-1">
                      {parseList(prepare.data.missing_documents).map((i) => (
                        <li key={i} className="text-xs text-amber-700 dark:text-amber-200">· {i}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {parseList(prepare.data.checklist).length > 0 && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 size={12} /> Checklist
                    </p>
                    <ul className="mt-2 space-y-1">
                      {parseList(prepare.data.checklist).map((i) => (
                        <li key={i} className="text-xs text-emerald-700 dark:text-emerald-200">✓ {i}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Résultat generate */}
          {generate.isSuccess && generate.data && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-500/10 dark:border-violet-500/30 p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-500/20 p-0.5">
                    <LimuleIcon size={16} />
                  </span>
                  <p className="font-bold text-violet-800 dark:text-violet-200 text-sm">
                    Déclaration générée — {generate.data.case_reference}
                  </p>
                  <StatusBadge label="Générée" tone="purple" />
                </div>
                <button
                  onClick={() => setViewRecord(generate.data!)}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700"
                >
                  <Eye size={12} /> Consulter
                </button>
              </div>
              <p className="mt-2 text-xs text-violet-700 dark:text-violet-300">
                Document complet disponible · {generate.data.period} · Téléchargeable en PDF depuis la consultation
              </p>
            </div>
          )}

          {(prepare.isError || generate.isError) && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Erreur lors de la génération. Vérifiez que le service Limule est actif.
            </p>
          )}
        </div>
      </div>

      {/* Historique */}
      <Panel title={`Historique des déclarations (${allDeclarations.length})`}>
        {declarations.isLoading && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.04]" />)}
          </div>
        )}
        {!declarations.isLoading && allDeclarations.length === 0 && (
          <p className="rounded-xl border border-dashed border-black/[0.08] dark:border-white/[0.08] p-6 text-center text-sm text-[#717182]">
            Aucun dossier pour le moment. Lancez une préparation ou une génération pour démarrer.
          </p>
        )}
        {recentByType.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {recentByType.map((record) => {
              const tInfo = DECLARATION_TYPES.find((t) => t.key === record.declaration_type);
              const Icon = tInfo?.icon ?? ClipboardList;
              const isGenerated = record.status === "generated";
              return (
                <div
                  key={record.id}
                  className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4 hover:shadow-sm transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className={`mt-0.5 shrink-0 ${tInfo?.color ?? "text-stone-500"}`}>
                        <Icon size={15} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-[#17211f] dark:text-white truncate">{record.period}</p>
                        <p className="text-xs font-semibold text-[#717182] uppercase tracking-wide mt-0.5">
                          {tInfo?.short ?? record.declaration_type}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatusBadge label={statusLabel(record.status)} tone={statusTone(record.status)} />
                      <span className="text-[10px] text-[#717182]">{record.confidence}% IA</span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-[#717182]">{record.case_reference}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => setViewRecord(record)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.03] transition"
                    >
                      <Eye size={11} /> Consulter
                    </button>
                    {isGenerated && (
                      <button
                        onClick={async () => {
                          const blob = await api.downloadDeclarationPdf(record.id);
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `declaration-${record.declaration_type}-${record.period}.pdf`;
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 8000);
                        }}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
                      >
                        <Download size={11} /> PDF
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-[10px] text-[#717182]">{shortDate(record.created_at)}</p>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Scores TERAS + Analyses */}
      <div className="grid gap-5 xl:grid-cols-2">
        {scores.data && scores.data.length > 0 && (
          <Panel title="Scores de conformité TERAS">
            <div className="grid gap-3 sm:grid-cols-2">
              {scores.data.map((s) => (
                <div key={s.id} className="rounded-xl border border-black/[0.05] dark:border-white/[0.06] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-[#17211f] dark:text-white capitalize">{s.domain}</p>
                    <ShieldCheck size={14} className={s.score >= 70 ? "text-emerald-500" : s.score >= 40 ? "text-amber-500" : "text-red-500"} />
                  </div>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="text-2xl font-black text-[#17211f] dark:text-white">{s.score}</span>
                    <span className="text-sm font-medium text-[#717182] mb-0.5">/100</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.06]">
                    <div
                      className={`h-full rounded-full ${s.score >= 70 ? "bg-emerald-500" : s.score >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${s.score}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-[#717182] line-clamp-2">{s.summary}</p>
                </div>
              ))}
            </div>
          </Panel>
        )}

        <Panel title="Analyses TERAS rapides">
          <p className="-mt-2 mb-4 text-sm text-[#717182]">Analysez chaque domaine déclaratif pour détecter les risques.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { key: "declaration", label: "Déclarations fiscales", desc: "TVA, IS, IRPP", icon: ClipboardList },
              { key: "payroll", label: "Paie & CNPS", desc: "Cotisations, bulletins", icon: ClipboardCheck },
              { key: "documents", label: "Pièces justificatives", desc: "Conformité documentaire", icon: FileSearch },
              { key: "rh", label: "Conformité RH", desc: "Contrats, registres", icon: ShieldCheck },
            ].map(({ key, label, desc, icon: Icon }) => (
              <button
                key={key}
                onClick={() => analyzeDomain.mutate(key)}
                disabled={analyzeDomain.isPending}
                className="flex items-center gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-3 text-left transition hover:border-emerald-500 hover:shadow-sm disabled:opacity-50"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600">
                  <Icon size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#17211f] dark:text-white">{label}</p>
                  <p className="text-xs text-[#717182]">
                    {analyzeDomain.isPending ? "Analyse…" : desc}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      {/* Viewer modal */}
      {viewRecord && (
        <DeclarationViewer record={viewRecord} onClose={() => setViewRecord(null)} />
      )}
    </div>
  );
}
