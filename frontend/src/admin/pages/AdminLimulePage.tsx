import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  ChevronRight,
  Clock,
  Database,
  Download,
  FlaskConical,
  Send,
  Tags,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { LimuleIcon } from "../../components/LimuleAvatar";
import { api } from "../../services/api";
import { shortDate } from "../../utils/format";
import i18n from "../../i18n";

// ── localStorage history
const LS_KEY = "kompta_admin_limule_history";
type HistoryItem = { id: number; prompt: string; response: string; ts: string };

function loadHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as HistoryItem[];
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, 10)));
  } catch {}
}

// ── Status badge
function StatusBadge({ status }: { status: string }) {
  const { t: tr } = useTranslation();
  const ok = status === "ok" || status === "healthy";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${ok ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"}`}>
      {ok ? tr("admin.limule.online") : status}
    </span>
  );
}

// ── Metric card
function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof BrainCircuit;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <Icon className="mb-3 text-indigo-300" size={20} />
      <p className="text-xs font-bold uppercase tracking-wider text-white/45">{label}</p>
      <p className="mt-1 text-3xl font-black text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-white/45">{hint}</p> : null}
    </div>
  );
}

// ── Predefined diagnostics
const DIAGNOSTICS = [
  {
    key: "tickets",
    labelTk: "admin.limule.diagnostics.tickets.label",
    icon: AlertTriangle,
    descriptionTk: "admin.limule.diagnostics.tickets.description",
    promptTk: "admin.limule.diagnostics.tickets.prompt",
  },
  {
    key: "health",
    labelTk: "admin.limule.diagnostics.health.label",
    icon: Activity,
    descriptionTk: "admin.limule.diagnostics.health.description",
    promptTk: "admin.limule.diagnostics.health.prompt",
  },
  {
    key: "anomalies",
    labelTk: "admin.limule.diagnostics.anomalies.label",
    icon: Zap,
    descriptionTk: "admin.limule.diagnostics.anomalies.description",
    promptTk: "admin.limule.diagnostics.anomalies.prompt",
  },
];

export function AdminLimulePage() {
  const { t: tr } = useTranslation();
  // ── Health
  const health = useQuery({
    queryKey: ["adminAiHealth"],
    queryFn: api.aiHealth,
    refetchInterval: 30_000,
  });

  // ── Limule insights for metrics
  const insights = useQuery({
    queryKey: ["adminLimuleInsights"],
    queryFn: api.adminLimuleInsights,
  });

  // ── Chat state
  const [prompt, setPrompt] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    {
      role: "assistant",
      text: tr("admin.limule.initialMessage"),
    },
  ]);
  const endRef = useRef<HTMLDivElement | null>(null);

  // ── History
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());

  // ── Simulated daily metrics (could be real with a dedicated endpoint)
  const todayRequests = insights.data?.last_7_days
    ? Math.round(insights.data.last_7_days / 7)
    : "–";
  const avgLatency = health.data?.latency_ms != null ? `${health.data.latency_ms}ms` : "–";
  // Explicit estimate: token metering is not instrumented by the LLM provider.
  // The UI shows an indicative bound (about 420 tokens/request), not an exact metric.
  const tokensConsumed = insights.data?.total_interactions
    ? `≈ ${(insights.data.total_interactions * 420).toLocaleString(i18n.language)}`
    : "–";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamText]);

  async function sendPrompt(text: string) {
    const clean = text.trim();
    if (!clean || streaming) return;
    setPrompt("");
    setMessages((m) => [...m, { role: "user", text: clean }]);
    setStreaming(true);
    setStreamText("");
    let finalText = "";
    await api.limuleChatStream(
      { prompt: clean },
      (partial) => {
        setStreamText(partial);
        finalText = partial;
      },
      (final) => {
        finalText = final;
        setStreamText("");
        setStreaming(false);
        setMessages((m) => [...m, { role: "assistant", text: final }]);
        const item: HistoryItem = { id: Date.now(), prompt: clean, response: final, ts: new Date().toISOString() };
        setHistory((prev) => {
          const next = [item, ...prev].slice(0, 10);
          saveHistory(next);
          return next;
        });
      },
      () => {
        setStreaming(false);
        setStreamText("");
        setMessages((m) => [...m, { role: "assistant", text: tr("admin.limule.unavailableError") }]);
      },
    );
  }

  async function exportDataset() {
    const blob = await api.adminLimuleDatasetExport(1000);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "limule-training-dataset.jsonl";
    a.click();
    URL.revokeObjectURL(url);
  }

  const data = insights.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">{tr("admin.limule.eyebrow")}</p>
          <h1 className="text-3xl font-black">{tr("admin.limule.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            {tr("admin.limule.subtitle")}
          </p>
        </div>
        <button
          onClick={exportDataset}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-600"
        >
          <Download size={16} /> {tr("admin.limule.exportJsonl")}
        </button>
      </div>

      {/* Status card */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600/20 text-indigo-300">
              <BrainCircuit size={20} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-white/45">{tr("admin.limule.statusTitle")}</p>
              <p className="font-black">
                {health.isLoading ? tr("admin.limule.checking") : (health.data?.model ?? health.data?.provider ?? "Limule")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {health.data && <StatusBadge status={health.data.status} />}
            {health.data?.latency_ms != null && (
              <div className="flex items-center gap-1.5 text-xs font-bold text-white/50">
                <Clock size={13} /> {health.data.latency_ms}ms
              </div>
            )}
            {health.data?.provider && (
              <span className="rounded-full bg-indigo-600/15 px-2.5 py-1 text-xs font-bold text-fuchsia-200">
                {health.data.provider}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={BrainCircuit} label={tr("admin.limule.metrics.requestsToday")} value={todayRequests} hint={tr("admin.limule.metrics.estimated7d")} />
        <Metric icon={Clock} label={tr("admin.limule.metrics.avgLatency")} value={avgLatency} hint={tr("admin.limule.metrics.fromHealth")} />
        <Metric icon={Tags} label={tr("admin.limule.metrics.tokensEstimate")} value={tokensConsumed} hint={tr("admin.limule.metrics.tokensHint")} />
        <Metric icon={Activity} label={tr("admin.limule.metrics.totalInteractions")} value={data?.total_interactions ?? "…"} hint={tr("admin.limule.metrics.last7Days", { count: data?.last_7_days ?? 0 })} />
      </div>

      {/* Diagnostics + Chat */}
      <div className="grid gap-4 xl:grid-cols-[0.65fr_1.35fr]">
        {/* Diagnostics */}
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-600/20 to-indigo-600/10 p-5">
            <div className="flex items-center gap-3 mb-4">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600/30 text-indigo-100">
                <FlaskConical size={18} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-200">{tr("admin.limule.predefinedDiagnostics")}</p>
                <h2 className="text-lg font-black">{tr("admin.limule.platform")}</h2>
              </div>
            </div>
            <div className="space-y-2">
              {DIAGNOSTICS.map((d) => {
                const Icon = d.icon;
                return (
                  <button
                    key={d.key}
                    onClick={() => sendPrompt(tr(d.promptTk))}
                    disabled={streaming}
                    className="flex w-full items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-left hover:bg-white/10 disabled:opacity-50 transition-colors"
                  >
                    <Icon size={16} className="mt-0.5 shrink-0 text-indigo-300" />
                    <div>
                      <p className="text-sm font-bold text-white">{tr(d.labelTk)}</p>
                      <p className="text-xs text-white/50">{tr(d.descriptionTk)}</p>
                    </div>
                    <ChevronRight size={14} className="ml-auto mt-1 shrink-0 text-white/30" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dataset info */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 font-black">{tr("admin.limule.trainingBase")}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-white/70">
                <span>{tr("admin.limule.dataset.ratedInteractions")}</span>
                <span className="font-bold text-white">{data?.rated ?? "–"}</span>
              </div>
              <div className="flex justify-between text-white/70">
                <span>{tr("admin.limule.dataset.avgRating")}</span>
                <span className="font-bold text-white">{data?.avg_rating ?? "–"}/5</span>
              </div>
              <div className="flex justify-between text-white/70">
                <span>{tr("admin.limule.dataset.trainingReady")}</span>
                <span className="font-bold text-emerald-300">{data?.training_ready ?? "–"}</span>
              </div>
              <div className="flex justify-between text-white/70">
                <span>{tr("admin.limule.dataset.coveredModules")}</span>
                <span className="font-bold text-white">{data?.by_module?.length ?? "–"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="flex min-h-[36rem] flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-5 py-3">
            <div className="flex items-center gap-2">
              <LimuleIcon size={16} />
              <h2 className="font-black">{tr("admin.limule.freeTestZone")}</h2>
            </div>
            <p className="text-xs text-white/45">{tr("admin.limule.freeTestHint")}</p>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "border border-slate-200 bg-slate-100 text-slate-800 dark:border-white/10 dark:bg-black/25 dark:text-white/85"
                }`}>
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))}
            {streaming && streamText && (
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-2xl border border-indigo-300 bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-800 dark:border-indigo-500/30 dark:bg-black/25 dark:text-white/85">
                  <p className="whitespace-pre-wrap">{streamText}</p>
                  <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-indigo-500" />
                </div>
              </div>
            )}
            {streaming && !streamText && (
              <p className="text-xs font-bold text-indigo-300">{tr("admin.limule.generating")}</p>
            )}
            <div ref={endRef} />
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); sendPrompt(prompt); }}
            className="flex items-center gap-2 border-t border-white/10 p-3"
          >
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={tr("admin.limule.promptPlaceholder")}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={streaming || !prompt.trim()}
              className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-600 disabled:opacity-50"
              aria-label={tr("admin.tickets.send")}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-black">{tr("admin.limule.historyTitle")}</h2>
            <button
              onClick={() => { setHistory([]); saveHistory([]); }}
              className="text-xs font-bold text-rose-400 hover:text-rose-300"
            >
              {tr("admin.limule.clear")}
            </button>
          </div>
          <div className="space-y-3">
            {history.map((item) => (
              <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-indigo-200 line-clamp-1">{item.prompt}</p>
                  <span className="shrink-0 text-xs text-white/35">{shortDate(item.ts)}</span>
                </div>
                <p className="line-clamp-3 text-xs leading-5 text-white/55">{item.response}</p>
                <button
                  onClick={() => sendPrompt(item.prompt)}
                  className="mt-2 flex items-center gap-1.5 text-xs font-bold text-indigo-300 hover:text-white"
                >
                  <Database size={11} /> {tr("admin.limule.replay")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
