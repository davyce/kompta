import { useQuery } from "@tanstack/react-query";
import { Activity, BrainCircuit, Database, Download, Tags } from "lucide-react";
import { useState } from "react";

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
  const insights = useQuery({ queryKey: ["adminLimuleInsights"], queryFn: api.adminLimuleInsights });
  const dataset = useQuery({
    queryKey: ["adminLimuleDataset", module],
    queryFn: () => api.adminLimuleDataset({ limit: 40, module: module || undefined }),
  });

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
