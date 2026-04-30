import { ArrowRight, BarChart3, FileSpreadsheet, Leaf, ShieldCheck, Target, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Panel } from "../components/Panel";

const reportCards = [
  {
    title: "Rapport financier mensuel",
    description: "P&L, tresorerie, ratios cles",
    icon: BarChart3,
    tone: "bg-blue-50 text-blue-700",
    to: "/accounting"
  },
  {
    title: "Rapport RH",
    description: "Effectifs, turn-over, acces, paie",
    icon: Users,
    tone: "bg-amber-50 text-amber-700",
    to: "/employees"
  },
  {
    title: "Rapport projet",
    description: "Avancement, budget, risques",
    icon: Target,
    tone: "bg-violet-50 text-violet-700",
    to: "/projects"
  },
  {
    title: "Rapport conformite TERAS",
    description: "Score, alertes, recommandations",
    icon: ShieldCheck,
    tone: "bg-red-50 text-red-700",
    to: "/reports-teras"
  },
  {
    title: "Rapport RSE",
    description: "Impact social et environnemental",
    icon: Leaf,
    tone: "bg-emerald-50 text-emerald-600",
    to: "/company"
  },
  {
    title: "Evolution entreprise",
    description: "Vue 12 mois consolidee",
    icon: FileSpreadsheet,
    tone: "bg-black/[0.04] text-[#17211f]",
    to: "/"
  }
];

export function ReportsHubPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-emerald-600">Rapports & analyses</p>
        <h1 className="text-3xl font-black text-ink">Hub d'analyses</h1>
        <p className="mt-1 text-sm font-medium text-[#717182]">Rapports financiers, RH, projets, conformite et RSE.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reportCards.map((report) => (
          <article key={report.title} className="rounded-lg border border-black/[0.06] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft">
            <span className={`grid h-12 w-12 place-items-center rounded-lg ${report.tone}`}>
              <report.icon size={22} />
            </span>
            <h2 className="mt-5 text-xl font-bold text-ink">{report.title}</h2>
            <p className="mt-2 text-sm font-medium text-[#717182]">{report.description}</p>
            <div className="mt-6 flex items-center justify-between gap-3">
              <button onClick={() => navigate(report.to)} className="flex items-center gap-2 text-sm font-bold text-emerald-600">
                Generer
                <ArrowRight size={16} />
              </button>
              <span className="text-sm font-semibold text-[#717182]">PDF · Word · Excel</span>
            </div>
          </article>
        ))}
      </div>
      <Panel title="Rapports recents">
        <div className="grid gap-3 md:grid-cols-3">
          {["Synthese TERAS Avril", "Paie et RH T2", "Tresorerie consolidate"].map((item) => (
            <div key={item} className="rounded-lg border border-black/[0.05] bg-stone-50 p-4">
              <p className="font-semibold text-ink">{item}</p>
              <p className="mt-1 text-sm text-[#717182]">Pret pour revue direction</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
