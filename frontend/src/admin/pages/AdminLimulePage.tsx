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
  Sparkles,
  Tags,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "../../services/api";
import { shortDate } from "../../utils/format";

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
  const ok = status === "ok" || status === "healthy";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${ok ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"}`}>
      {ok ? "En ligne" : status}
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
    label: "Analyser les tickets critiques",
    icon: AlertTriangle,
    description: "Analyse les tickets critiques ouverts et propose des priorités.",
    prompt: "Analyse tous les tickets critiques actuellement ouverts sur la plateforme. Résume les problèmes, identifie les entreprises les plus à risque et propose un plan d'action support pour les 24 prochaines heures.",
  },
  {
    key: "health",
    label: "Résumé santé plateforme",
    icon: Activity,
    description: "Résumé des KPIs globaux de la plateforme.",
    prompt: "Donne-moi un résumé de la santé globale de la plateforme KOMPTA : nombre d'entreprises actives, score TERAS moyen, tickets en attente, alertes ouvertes et tendances des 7 derniers jours. Identifie les points d'attention prioritaires.",
  },
  {
    key: "anomalies",
    label: "Détecter anomalies",
    icon: Zap,
    description: "Détecte les anomalies TERAS sur toutes les entreprises.",
    prompt: "Analyse les alertes TERAS de toutes les entreprises de la plateforme. Détecte les anomalies inhabituelles, les patterns récurrents et les entreprises qui présentent des risques élevés. Propose des actions correctives.",
  },
];

export function AdminLimulePage() {
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
      text: "Cockpit Limule Admin prêt. Utilisez la zone de test libre ou les diagnostics prédéfinis.",
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
  const tokensConsumed = insights.data?.total_interactions
    ? `~${(insights.data.total_interactions * 420).toLocaleString("fr-FR")}`
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
        setMessages((m) => [...m, { role: "assistant", text: "Erreur : Limule n'est pas disponible. Vérifiez la configuration backend." }]);
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
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">Intelligence Artificielle</p>
          <h1 className="text-3xl font-black">Cockpit Limule Admin</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            Supervision en temps réel, zone de test libre, diagnostics prédéfinis et historique des requêtes.
          </p>
        </div>
        <button
          onClick={exportDataset}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-600"
        >
          <Download size={16} /> Exporter JSONL
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
              <p className="text-xs font-bold uppercase tracking-wider text-white/45">Statut Limule IA</p>
              <p className="font-black">
                {health.isLoading ? "Vérification..." : (health.data?.model ?? health.data?.provider ?? "Limule")}
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
        <Metric icon={BrainCircuit} label="Requêtes aujourd'hui" value={todayRequests} hint="estimé sur 7j" />
        <Metric icon={Clock} label="Latence moyenne" value={avgLatency} hint="depuis health check" />
        <Metric icon={Tags} label="Tokens consommés" value={tokensConsumed} hint="estimé ~420 tokens/req" />
        <Metric icon={Activity} label="Total interactions" value={data?.total_interactions ?? "…"} hint={`${data?.last_7_days ?? 0} sur 7 jours`} />
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
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-200">Diagnostics prédéfinis</p>
                <h2 className="text-lg font-black">Plateforme</h2>
              </div>
            </div>
            <div className="space-y-2">
              {DIAGNOSTICS.map((d) => {
                const Icon = d.icon;
                return (
                  <button
                    key={d.key}
                    onClick={() => sendPrompt(d.prompt)}
                    disabled={streaming}
                    className="flex w-full items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-left hover:bg-white/10 disabled:opacity-50 transition-colors"
                  >
                    <Icon size={16} className="mt-0.5 shrink-0 text-indigo-300" />
                    <div>
                      <p className="text-sm font-bold text-white">{d.label}</p>
                      <p className="text-xs text-white/50">{d.description}</p>
                    </div>
                    <ChevronRight size={14} className="ml-auto mt-1 shrink-0 text-white/30" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dataset info */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-3 font-black">Base d'apprentissage</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-white/70">
                <span>Interactions notées</span>
                <span className="font-bold text-white">{data?.rated ?? "–"}</span>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Note moyenne</span>
                <span className="font-bold text-white">{data?.avg_rating ?? "–"}/5</span>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Prêts entraînement</span>
                <span className="font-bold text-emerald-300">{data?.training_ready ?? "–"}</span>
              </div>
              <div className="flex justify-between text-white/70">
                <span>Modules couverts</span>
                <span className="font-bold text-white">{data?.by_module?.length ?? "–"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="flex min-h-[36rem] flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-5 py-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-300" />
              <h2 className="font-black">Zone de test libre</h2>
            </div>
            <p className="text-xs text-white/45">Envoyer n'importe quel prompt à Limule et voir la réponse en streaming</p>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "border border-white/10 bg-black/25 text-white/85"
                }`}>
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))}
            {streaming && streamText && (
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-2xl border border-indigo-500/30 bg-black/25 px-4 py-3 text-sm leading-6 text-white/85">
                  <p className="whitespace-pre-wrap">{streamText}</p>
                  <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-indigo-500" />
                </div>
              </div>
            )}
            {streaming && !streamText && (
              <p className="text-xs font-bold text-indigo-300">Limule génère une réponse...</p>
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
              placeholder="Taper un message pour tester Limule..."
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={streaming || !prompt.trim()}
              className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-600 disabled:opacity-50"
              aria-label="Envoyer"
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
            <h2 className="font-black">Historique des 10 dernières requêtes</h2>
            <button
              onClick={() => { setHistory([]); saveHistory([]); }}
              className="text-xs font-bold text-rose-400 hover:text-rose-300"
            >
              Effacer
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
                  <Database size={11} /> Rejouer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
