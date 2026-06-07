import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BriefcaseBusiness, CheckCircle2, ClipboardList, Download, FileSearch, RefreshCcw, Settings, ShieldCheck, ShieldOff, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { LineAreaChart, ScoreRing } from "../components/Charts";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ToastProvider";
import { api } from "../services/api";
import { shortDate } from "../utils/format";

const RECOMMENDATION_TONES = [
  "bg-blue-50 text-blue-700",
  "bg-amber-50 text-amber-700",
  "bg-emerald-50 text-emerald-600",
  "bg-violet-50 text-violet-700",
];

export function ReportsTerasPage() {
  const { t: tr } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const modules = useQuery({ queryKey: ["modules"], queryFn: api.modules });
  const terasEnabled = modules.data?.find((m) => m.module_key === "teras")?.enabled ?? true;
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => api.overview() });
  const alerts = useQuery({ queryKey: ["terasAlerts"], queryFn: api.terasAlerts });
  const scores = useQuery({ queryKey: ["terasScores"], queryFn: api.terasScores });
  const recommendations = useQuery({ queryKey: ["terasRecommendations"], queryFn: api.terasRecommendations });
  const activeAlerts = alerts.data?.filter((alert) => alert.status === "open") ?? [];
  const terasAverage = scores.data?.length
    ? Math.round(scores.data.reduce((total, score) => total + score.score, 0) / scores.data.length)
    : overview.data?.kpis.teras_score ?? 87;
  const recommendationCount = recommendations.data?.reduce((total, item) => total + item.recommendations.length, 0) || 0;

  // Build score trend from snapshots, falling back to a flat line at the average
  const scoreTrend = (() => {
    const snaps = scores.data ?? [];
    if (snaps.length >= 2) {
      return snaps
        .slice()
        .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))
        .slice(-12)
        .map((s) => ({
          label: new Date(s.created_at).toLocaleDateString("fr-FR", { month: "short" }),
          value: s.score,
        }));
    }
    // Empty state — show flat at current average
    return ["Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc","Jan","Fév","Mar","Avr"]
      .map((label) => ({ label, value: terasAverage }));
  })();

  const analyze = useMutation({
    mutationFn: api.analyzeTerasCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["terasScores"] });
      queryClient.invalidateQueries({ queryKey: ["terasRecommendations"] });
      queryClient.invalidateQueries({ queryKey: ["terasAlerts"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    }
  });
  const analyzeDomain = useMutation({
    mutationFn: (domain: "rh" | "payroll" | "declaration" | "documents") => {
      if (domain === "rh") return api.analyzeTerasRh();
      if (domain === "payroll") return api.analyzeTerasPayroll();
      if (domain === "declaration") return api.analyzeTerasDeclaration();
      return api.analyzeTerasDocuments();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["terasScores"] });
      queryClient.invalidateQueries({ queryKey: ["terasRecommendations"] });
      queryClient.invalidateQueries({ queryKey: ["terasAlerts"] });
    }
  });
  const convert = useMutation({
    mutationFn: api.createTaskFromTeras,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["terasAlerts"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  });

  return (
    <div className="space-y-5">

      {/* ── Bannière TERAS désactivé ──────────────────────────────────── */}
      {!terasEnabled && (
        <div className="flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <ShieldOff size={22} className="shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <p className="font-bold text-amber-800 dark:text-amber-300">{tr("teras.disabledTitle")}</p>
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {tr("teras.disabledDesc")}
            </p>
          </div>
          <button
            onClick={() => navigate("/settings?tab=modules")}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-amber-700 transition hover:bg-amber-50 dark:border-amber-500/40 dark:bg-transparent dark:text-amber-300 dark:hover:bg-amber-500/10"
          >
            <Settings size={14} /> {tr("teras.activateInSettings")}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-600">{tr("teras.eyebrow")}</p>
          <h1 className="text-3xl font-black text-ink">{tr("teras.title")}</h1>
          <p className="mt-1 text-sm font-medium text-[#717182]">{tr("teras.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              setExporting(true);
              try {
                const resp = await api.terasExportReport();
                const blob = await resp.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `teras_report_${new Date().toISOString().slice(0, 10)}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
              } catch { toast.error(tr("teras.exportErr")); }
              finally { setExporting(false); }
            }}
            disabled={exporting}
            className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white px-4 py-2.5 text-sm font-bold text-[#17211f] hover:bg-stone-50 disabled:opacity-50"
          >
            <Download size={16} />
            {exporting ? tr("teras.exporting") : tr("teras.exportPdf")}
          </button>
          <button
            onClick={() => analyze.mutate()}
            disabled={analyze.isPending}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:bg-stone-300"
          >
            {analyze.isPending ? <RefreshCcw className="animate-spin" size={18} /> : <BriefcaseBusiness size={18} />}
            {tr("teras.runAnalysis")}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Panel title={tr("teras.globalScore")}>
          <ScoreRing score={terasAverage} label={terasAverage >= 85 ? tr("teras.highLevel") : tr("teras.toReinforce")} />
        </Panel>
        <Panel title={tr("teras.activeAlerts")}>
          <div className="pt-5">
            <p className="text-4xl font-black text-ink">{activeAlerts.length || 3}</p>
            <p className="mt-2 text-sm font-medium text-[#717182]">{tr("teras.criticalAttention", { crit: activeAlerts.filter((alert) => alert.severity === "high").length || 1, att: Math.max((activeAlerts.length || 3) - 1, 1) })}</p>
            <div className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{tr("teras.priority")}</div>
          </div>
        </Panel>
        <Panel title={tr("teras.aiRecs")}>
          <div className="pt-5">
            <p className="text-4xl font-black text-ink">{recommendationCount}</p>
            <p className="mt-2 text-sm font-medium text-[#717182]">{tr("teras.actionsPrioritized")}</p>
            <div className="mt-5 grid gap-2">
              {["rh", "payroll", "declaration", "documents"].map((domain) => (
                <button
                  key={domain}
                  onClick={() => analyzeDomain.mutate(domain as "rh" | "payroll" | "declaration" | "documents")}
                  className="flex items-center justify-between rounded-lg border border-black/[0.05] px-3 py-2 text-sm font-semibold text-[#17211f] hover:border-emerald-500 hover:text-emerald-600"
                >
                  {tr("teras.analyzeDomain", { domain: tr("teras.domain" + domain.charAt(0).toUpperCase() + domain.slice(1)) })}
                  <FileSearch size={16} />
                </button>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Panel title={tr("teras.scoreEvolution")} action={<span className="text-sm font-bold text-emerald-600">{tr("teras.pts19")}</span>}>
          <LineAreaChart data={scoreTrend} color="#0f766e" fill="rgba(15, 118, 110, 0.10)" min={60} max={100} />
        </Panel>
        <Panel title={tr("teras.aiRecs")}>
          <div className="space-y-3">
            {(() => {
              const flat = recommendations.data?.flatMap((item, idx) => item.recommendations.map((rec, j) => ({
                key: `${item.domain}-${idx}-${j}`,
                title: rec,
                points: item.score < 65 ? "+5 pts" : "+2 pts",
                tone: RECOMMENDATION_TONES[(idx + j) % RECOMMENDATION_TONES.length],
              }))) ?? [];
              if (flat.length === 0) {
                return (
                  <p className="py-4 text-sm text-[#717182]">
                    {tr("teras.runAnalysisRecs")}
                  </p>
                );
              }
              return flat.slice(0, 4).map((recommendation) => (
                <article key={recommendation.key} className="flex items-center justify-between gap-3 border-b border-black/[0.05] py-3 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={`grid h-11 w-11 place-items-center rounded-lg ${recommendation.tone}`}>
                      <ShieldCheck size={19} />
                    </span>
                    <p className="font-semibold text-ink">{recommendation.title}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-sm font-bold text-emerald-600">{recommendation.points}</span>
                </article>
              ));
            })()}
          </div>
        </Panel>
      </div>

      <Panel title={tr("teras.terasAlerts")}>
        <div className="space-y-3">
          {activeAlerts.length === 0 && (
            <p className="py-4 text-sm text-[#717182]">
              {tr("teras.noOpenAlert")}
            </p>
          )}
          {activeAlerts.map((alert) => (
            <article key={alert.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/[0.05] p-4">
              <div className="flex items-center gap-3">
                <span className={`grid h-12 w-12 place-items-center rounded-lg ${alert.severity === "high" ? "bg-red-50 text-red-600" : alert.severity === "medium" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
                  <AlertTriangle size={21} />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={alert.severity === "high" ? tr("teras.sevCritical") : alert.severity === "medium" ? tr("teras.sevAttention") : tr("teras.sevInfo")} tone={alert.severity === "high" ? "red" : alert.severity === "medium" ? "amber" : "blue"} />
                    <p className="font-bold text-ink">{alert.title}</p>
                  </div>
                  <p className="mt-1 text-sm text-[#717182]">{alert.module} · {alert.recommendation} · {alert.created_at ? shortDate(alert.created_at) : tr("teras.recentAnalysis")}</p>
                </div>
              </div>
              <button
                disabled={alert.status === "converted" || alert.id === 0 && !activeAlerts.length}
                onClick={() => convert.mutate(alert.id)}
                className="rounded-lg border border-black/[0.06] bg-white px-3 py-2 text-sm font-bold text-ink disabled:text-stone-400"
              >
                {tr("teras.convertToTask")}
              </button>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
