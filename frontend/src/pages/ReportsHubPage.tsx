import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, BarChart3, Copy, Download, FileSpreadsheet,
  Leaf, LucideIcon, ShieldCheck, Target, Users, X,
} from "lucide-react";
import { LimuleAvatar, LimuleIcon } from "../components/LimuleAvatar";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/* ── Léger renderer Markdown → JSX (sans dépendance externe) ─────── */
function MarkdownBlock({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (!listItems.length) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="my-2 space-y-1 pl-4">
        {listItems.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm leading-6 text-[#17211f] dark:text-white/85">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
            <span>{inlineRender(item)}</span>
          </li>
        ))}
      </ul>
    );
    listItems = [];
  }

  function inlineRender(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={i} className="font-bold text-[#17211f] dark:text-white">{part.slice(2, -2)}</strong>
        : <span key={i}>{part}</span>
    );
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      flushList();
      nodes.push(<h3 key={i} className="mt-4 mb-1 text-base font-black text-[#17211f] dark:text-white">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      flushList();
      nodes.push(<h2 key={i} className="mt-5 mb-1 text-lg font-black text-violet-700 dark:text-violet-300">{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      flushList();
      nodes.push(<h1 key={i} className="mt-4 mb-2 text-xl font-black text-[#17211f] dark:text-white">{line.slice(2)}</h1>);
    } else if (/^[-*•]\s/.test(line)) {
      listItems.push(line.replace(/^[-*•]\s/, ""));
    } else if (/^\d+\.\s/.test(line)) {
      listItems.push(line.replace(/^\d+\.\s/, ""));
    } else if (line.trim() === "") {
      flushList();
      if (nodes.length > 0) nodes.push(<div key={`sp-${i}`} className="h-2" />);
    } else {
      flushList();
      nodes.push(
        <p key={i} className="text-sm leading-7 text-[#17211f] dark:text-white/85">
          {inlineRender(line)}
        </p>
      );
    }
  }
  flushList();
  return <div className="space-y-0.5">{nodes}</div>;
}

import { Panel } from "../components/Panel";
import { api } from "../services/api";
import { compactMoney, shortDate } from "../utils/format";
import { useCurrency } from "../contexts/CurrencyContext";

interface ReportCard {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: string;
  to: string;
  kind: string;
  promptFn: (ctx: ReportContext) => string;
}

interface ReportContext {
  terasScore: number | undefined;
  treasury: number | undefined;
  revenue: number | undefined;
  payroll: number | undefined;
  lastPayrollPeriod: string | undefined;
  payslipCount: number;
  failedChecks: number;
}

function buildContext(
  overview: { data?: { kpis: Record<string, number>; compliance: { checks: Array<{ label: string; status: string }> } } | undefined },
  payrollRuns: { data?: Array<{ period: string; payslips?: unknown[]; created_at?: string }> | undefined },
): ReportContext {
  return {
    terasScore: overview.data?.kpis.teras_score,
    treasury: overview.data?.kpis.treasury,
    revenue: overview.data?.kpis.revenue,
    payroll: overview.data?.kpis.payroll,
    lastPayrollPeriod: payrollRuns.data?.[0]?.period,
    payslipCount: payrollRuns.data?.[0]?.payslips?.length ?? 0,
    failedChecks: overview.data?.compliance?.checks?.filter((c) => c.status === "fail").length ?? 0,
  };
}

const REPORT_CARDS: ReportCard[] = [
  {
    title: "Rapport financier mensuel",
    description: "P&L, trésorerie, ratios clés",
    icon: BarChart3,
    tone: "bg-blue-50 text-blue-700",
    to: "/accounting",
    kind: "financial_report",
    promptFn: (c) =>
      `Génère un rapport financier mensuel complet. Données disponibles: Trésorerie=${c.treasury !== undefined ? compactMoney(c.treasury) : "N/A"}, Chiffre d'affaires=${c.revenue !== undefined ? compactMoney(c.revenue) : "N/A"}, Masse salariale=${c.payroll !== undefined ? compactMoney(c.payroll) : "N/A"}, Alertes actives=${c.failedChecks}. Inclure analyse P&L, ratios de liquidité, recommandations opérationnelles.`,
  },
  {
    title: "Rapport RH",
    description: "Effectifs, turn-over, accès, paie",
    icon: Users,
    tone: "bg-amber-50 text-amber-700",
    to: "/employees",
    kind: "hr_report",
    promptFn: (c) =>
      `Génère un rapport RH synthétique. Dernier cycle de paie: ${c.lastPayrollPeriod ?? "non lancé"}, ${c.payslipCount} bulletins. Masse salariale: ${c.payroll !== undefined ? compactMoney(c.payroll) : "N/A"}. Inclure analyse des effectifs, recommandations sur la politique RH, gestion des risques liés au personnel.`,
  },
  {
    title: "Rapport projet",
    description: "Avancement, budget, risques",
    icon: Target,
    tone: "bg-violet-50 text-violet-700",
    to: "/projects",
    kind: "project_report",
    promptFn: (c) =>
      `Génère un rapport de pilotage projet. Context financier: trésorerie=${c.treasury !== undefined ? compactMoney(c.treasury) : "N/A"}, alertes actives=${c.failedChecks}. Inclure analyse d'avancement, risques identifiés, recommandations sur la priorisation des projets.`,
  },
  {
    title: "Rapport conformité TERAS",
    description: "Score, alertes, recommandations",
    icon: ShieldCheck,
    tone: "bg-red-50 text-red-700",
    to: "/reports-teras",
    kind: "teras_report",
    promptFn: (c) =>
      `Génère un rapport de conformité TERAS détaillé. Score actuel: ${c.terasScore ?? "inconnu"}/100. Nombre d'alertes actives: ${c.failedChecks}. Analyser les risques de conformité, identifier les actions correctives prioritaires, proposer un plan d'amélioration du score.`,
  },
  {
    title: "Rapport RSE",
    description: "Impact social et environnemental",
    icon: Leaf,
    tone: "bg-emerald-50 text-emerald-600",
    to: "/company",
    kind: "rse_report",
    promptFn: () =>
      `Génère un rapport RSE (Responsabilité Sociale des Entreprises). Inclure analyse de l'impact social, environnemental et de gouvernance. Proposer des indicateurs clés de performance RSE, des actions concrètes et un plan de communication.`,
  },
  {
    title: "Évolution entreprise",
    description: "Vue 12 mois consolidée",
    icon: FileSpreadsheet,
    tone: "bg-black/[0.04] text-[#17211f]",
    to: "/",
    kind: "evolution_report",
    promptFn: (c) =>
      `Génère une analyse consolidée de l'évolution de l'entreprise sur 12 mois. Métriques clés disponibles: TERAS=${c.terasScore ?? "N/A"}/100, Trésorerie=${c.treasury !== undefined ? compactMoney(c.treasury) : "N/A"}, CA=${c.revenue !== undefined ? compactMoney(c.revenue) : "N/A"}. Inclure tendances, axes d'amélioration, projection sur les 3 prochains mois.`,
  },
];

type AiState = {
  title: string;
  content: string;
  loading: boolean;
  error: string;
} | null;

export function ReportsHubPage() {
  const navigate = useNavigate();
  useCurrency();
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => api.overview() });
  const payrollRuns = useQuery({ queryKey: ["payrollRuns"], queryFn: () => api.payrollRuns() });
  const [aiState, setAiState] = useState<AiState>(null);
  const abortRef = useRef(false);

  const ctx = buildContext(overview, payrollRuns);

  async function generateReport(card: ReportCard) {
    abortRef.current = false;
    setAiState({ title: card.title, content: "", loading: true, error: "" });
    await api.aiGenerateStream(
      {
        kind: card.kind,
        title: card.title,
        prompt: card.promptFn(ctx),
        context: "reports",
      },
      (partial) => {
        if (!abortRef.current) setAiState((prev) => prev ? { ...prev, content: partial } : null);
      },
      (final) => {
        if (!abortRef.current) setAiState((prev) => prev ? { ...prev, content: final, loading: false } : null);
      },
      (err) => {
        if (!abortRef.current) setAiState((prev) => prev ? { ...prev, loading: false, error: err.message } : null);
      },
    );
  }

  /* Build recent report list from real data */
  const recentReports = [
    {
      title: "Synthèse TERAS",
      subtitle: `Score: ${ctx.terasScore ?? "—"}/100`,
      to: "/reports-teras",
      date: new Date().toISOString(),
    },
    {
      title: "Paie & RH",
      subtitle: ctx.lastPayrollPeriod
        ? `Cycle ${ctx.lastPayrollPeriod} · ${ctx.payslipCount} bulletins`
        : "Aucun cycle lancé",
      to: "/payroll",
      date: payrollRuns.data?.[0]?.created_at ?? new Date().toISOString(),
    },
    {
      title: "Trésorerie",
      subtitle: ctx.treasury !== undefined ? `Solde: ${compactMoney(ctx.treasury)}` : "Données financières",
      to: "/accounting",
      date: new Date().toISOString(),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-emerald-600">Rapports &amp; analyses</p>
        <h1 className="text-3xl font-black text-ink dark:text-white">Hub d'analyses</h1>
        <p className="mt-1 text-sm font-medium text-[#717182]">Rapports financiers, RH, projets, conformité et RSE.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORT_CARDS.map((report) => (
          <article
            key={report.title}
            className="rounded-xl border border-black/[0.06] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/[0.06] dark:bg-[#1e2229]"
          >
            <span className={`grid h-12 w-12 place-items-center rounded-xl ${report.tone}`}>
              <report.icon size={22} />
            </span>
            <h2 className="mt-5 text-xl font-bold text-ink dark:text-white">{report.title}</h2>
            <p className="mt-2 text-sm font-medium text-[#717182]">{report.description}</p>
            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                onClick={() => generateReport(report)}
                disabled={aiState?.loading && aiState.title === report.title}
                className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-violet-700 disabled:opacity-60"
              >
                {aiState?.loading && aiState.title === report.title ? (
                  <>
                    <LimuleAvatar state="thinking" size={20} />
                    Génération…
                  </>
                ) : (
                  <>
                    <LimuleAvatar state="idle" size={20} />
                    Générer
                  </>
                )}
              </button>
              <button
                onClick={() => navigate(report.to)}
                className="flex items-center gap-1 text-sm font-semibold text-[#717182] transition hover:text-emerald-600"
              >
                Voir module
                <ArrowRight size={14} />
              </button>
            </div>
          </article>
        ))}
      </div>

      {/* AI Report Output */}
      {aiState && (
        <div className="rounded-xl border border-violet-200 bg-white shadow-sm dark:border-violet-500/30 dark:bg-[#1e2229]">
          <div className="flex items-center justify-between border-b border-violet-100 dark:border-violet-500/20 px-5 py-4">
            <div className="flex items-center gap-3">
              <LimuleAvatar
                state={aiState.loading ? "thinking" : "speaking"}
                size={44}
              />
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-violet-500">Limule · Rapport IA</p>
                <h3 className="font-black text-ink dark:text-white">{aiState.title}</h3>
              </div>
            </div>
            <button
              onClick={() => { abortRef.current = true; setAiState(null); }}
              className="grid h-8 w-8 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
            >
              <X size={16} />
            </button>
          </div>
          <div className="px-5 pb-5">
            {aiState.error ? (
              <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">{aiState.error}</p>
            ) : (
              <div className="relative">
                {aiState.loading && (
                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-violet-50 dark:bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-600 dark:text-violet-300">
                    <LimuleAvatar state="thinking" size={22} />
                    Limule génère votre rapport en temps réel…
                  </div>
                )}
                {!aiState.content && !aiState.loading && (
                  <p className="animate-pulse text-sm text-[#717182]">Démarrage…</p>
                )}
                {aiState.content && (
                  <>
                    <div className="mb-3 flex justify-end">
                      <button
                        onClick={() => navigator.clipboard.writeText(aiState.content)}
                        className="flex items-center gap-1.5 rounded-lg border border-black/[0.06] bg-white px-3 py-1.5 text-xs font-semibold text-[#717182] hover:text-violet-600 dark:bg-white/5 dark:border-white/10"
                      >
                        <Copy size={12} /> Copier
                      </button>
                    </div>
                    <MarkdownBlock content={aiState.content} />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <Panel title="Rapports récents">
        <div className="grid gap-3 md:grid-cols-3">
          {recentReports.map((item) => (
            <button
              key={item.title}
              onClick={() => navigate(item.to)}
              className="rounded-xl border border-black/[0.05] bg-stone-50 p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50 dark:border-white/[0.05] dark:bg-white/[0.02] dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-ink dark:text-white">{item.title}</p>
                <Download size={14} className="mt-0.5 shrink-0 text-[#717182]" />
              </div>
              <p className="mt-1 text-sm text-[#717182]">{item.subtitle}</p>
              <p className="mt-2 text-xs text-[#717182]">{shortDate(item.date)}</p>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
