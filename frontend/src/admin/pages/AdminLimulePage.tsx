import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, BrainCircuit, Database, Download, Send, Sparkles, Tags } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "../../services/api";

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
      <Icon className="mb-3 text-violet-300" size={20} />
      <p className="text-xs font-bold uppercase tracking-wider text-white/45">{label}</p>
      <p className="mt-1 text-3xl font-black text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-white/45">{hint}</p> : null}
    </div>
  );
}

export function AdminLimulePage() {
  const [module, setModule] = useState("");
  const [prompt, setPrompt] = useState("Analyse la plateforme et donne-moi les priorités superadmin des prochaines 24h.");
  const [messages, setMessages] = useState<Array<{ role: "user" | "sage"; text: string; sources?: string[] }>>([
    {
      role: "sage",
      text: "Grand Sage est prêt. Je surveille les entreprises, tickets, alertes TERAS et la base Limule pour t'aider à piloter la plateforme.",
    },
  ]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const insights = useQuery({ queryKey: ["adminLimuleInsights"], queryFn: api.adminLimuleInsights });
  const dataset = useQuery({
    queryKey: ["adminLimuleDataset", module],
    queryFn: () => api.adminLimuleDataset({ limit: 40, module: module || undefined }),
  });
  const grandSage = useMutation({
    mutationFn: (text: string) => api.adminLimuleChat(text),
    onSuccess: (data) => {
      setMessages((current) => [...current, { role: "sage", text: data.answer, sources: data.sources }]);
      queryClient.invalidateQueries({ queryKey: ["adminLimuleInsights"] });
      queryClient.invalidateQueries({ queryKey: ["adminLimuleDataset"] });
    },
    onError: () => {
      setMessages((current) => [
        ...current,
        { role: "sage", text: "Grand Sage n'arrive pas à joindre Limule pour l'instant. Vérifie le backend puis relance l'analyse." },
      ]);
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, grandSage.isPending]);

  function askGrandSage(text = prompt) {
    const clean = text.trim();
    if (!clean || grandSage.isPending) return;
    setMessages((current) => [...current, { role: "user", text: clean }]);
    setPrompt("");
    grandSage.mutate(clean);
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-violet-400">Limule Intelligence</p>
          <h1 className="text-3xl font-black">Base d'apprentissage Limule</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            Interactions contextualisées, signaux métier et exports JSONL pour organiser une future base d'entraînement.
          </p>
        </div>
        <button
          onClick={exportDataset}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500"
        >
          <Download size={16} />
          Exporter JSONL
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={BrainCircuit} label="Interactions" value={data?.total_interactions ?? "…"} hint={`${data?.last_7_days ?? 0} sur 7 jours`} />
        <Metric icon={Tags} label="Samples notés" value={data?.rated ?? "…"} hint={`moyenne ${data?.avg_rating ?? 0}/5`} />
        <Metric icon={Database} label="Prêts entraînement" value={data?.training_ready ?? "…"} hint="notes >= 4" />
        <Metric icon={Activity} label="Modules couverts" value={data?.by_module?.length ?? "…"} hint="contextes différents" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <div className="rounded-xl border border-violet-400/30 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-500/30 text-violet-100">
              <Sparkles size={20} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-violet-200">Limule Grand Sage</p>
              <h2 className="text-xl font-black">Cockpit IA superadmin</h2>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-white/65">
            Analyse cross-tenant: entreprises à risque, tickets critiques, alertes TERAS,
            usage Limule et priorités opérationnelles.
          </p>
          <div className="mt-4 grid gap-2">
            {[
              "Priorise les tickets critiques et propose une réponse support.",
              "Quelles entreprises sont à risque et pourquoi ?",
              "Transforme les signaux plateforme en plan d'action superadmin.",
            ].map((item) => (
              <button
                key={item}
                onClick={() => askGrandSage(item)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-bold text-white/75 hover:bg-white/10"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-[24rem] flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-5 py-3">
            <h2 className="font-black">Chat Grand Sage</h2>
            <p className="text-xs text-white/45">Réponses enrichies avec données plateforme en temps réel</p>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "bg-violet-600 text-white"
                    : "border border-white/10 bg-black/25 text-white/85"
                }`}>
                  <p className="whitespace-pre-wrap">{message.text}</p>
                  {message.sources?.length ? (
                    <p className="mt-3 border-t border-white/10 pt-2 text-[11px] font-semibold text-violet-200">
                      Sources: {message.sources.join(", ")}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
            {grandSage.isPending ? <p className="text-xs font-bold text-violet-200">Grand Sage analyse la plateforme...</p> : null}
            <div ref={endRef} />
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              askGrandSage();
            }}
            className="flex items-center gap-2 border-t border-white/10 p-3"
          >
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Demander à Grand Sage..."
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-violet-400"
            />
            <button
              disabled={grandSage.isPending || !prompt.trim()}
              className="grid h-10 w-10 place-items-center rounded-xl bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-50"
              aria-label="Envoyer"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.65fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-black">Modules analysés</h2>
            <div className="mt-4 space-y-2">
              {(data?.by_module ?? []).map((item) => (
                <button
                  key={item.module}
                  onClick={() => setModule(item.module === module ? "" : item.module)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-bold ${
                    module === item.module
                      ? "border-violet-400 bg-violet-500/20 text-white"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  <span>{item.module}</span>
                  <span>{item.count}</span>
                </button>
              ))}
              {(data?.by_module ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-white/40">Aucune interaction enregistrée.</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-black">Intentions</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {(data?.by_intent ?? []).map((item) => (
                <span key={item.intent} className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/70">
                  {item.intent} · {item.count}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-black">Dataset enrichi</h2>
            {module ? (
              <button onClick={() => setModule("")} className="text-xs font-bold text-violet-300 hover:text-white">
                Effacer filtre
              </button>
            ) : null}
          </div>
          <div className="space-y-3">
            {(dataset.data ?? []).map((row) => (
              <div key={row.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase text-white/45">
                  <span>{row.company.name || `Company #${row.company.id}`}</span>
                  <span>·</span>
                  <span>{row.module}</span>
                  <span>·</span>
                  <span>{row.intent}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-white">{row.input}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/55">{row.output}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {row.tags.slice(0, 8).map((tag) => (
                    <span key={tag} className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-200">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {dataset.isLoading ? <p className="py-6 text-center text-sm text-white/40">Chargement…</p> : null}
            {!dataset.isLoading && (dataset.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-white/40">
                Les prochains échanges avec Limule rempliront automatiquement cette base.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
