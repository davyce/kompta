import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Panel } from "../components/Panel";

export function ModuleBoardPage({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-emerald-600">Module KOMPTA</p>
        <h1 className="text-3xl font-black text-ink">{title}</h1>
      </div>
      <Panel title="Vues disponibles">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item} className="rounded-lg border border-stone-100 bg-stone-50 p-4">
              <CheckCircle2 className="text-emerald-600" size={20} />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="font-semibold text-ink">{item}</p>
                <ArrowRight size={17} className="text-stone-400" />
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
