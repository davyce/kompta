import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen, Building2, ChevronDown, ChevronRight, Download,
  Filter, HandCoins, Landmark, Plus, RefreshCcw, WalletCards,
  TrendingUp, TrendingDown, ArrowUpRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell,
} from "recharts";

import { api } from "../services/api";
import { compactMoney, money, currencyLabel } from "../utils/format";
import { useCurrency } from "../contexts/CurrencyContext";

const SYSCEMAC_CLASSES = [
  { n: 1, label: "Ressources durables",    desc: "Capitaux propres, dettes financières à long terme",                  c: "#4f46e5" },
  { n: 2, label: "Actifs immobilisés",     desc: "Immobilisations corporelles, incorporelles, financières",             c: "#0f766e" },
  { n: 3, label: "Stocks",                 desc: "Marchandises, matières premières, produits finis",                   c: "#f59e0b" },
  { n: 4, label: "Tiers",                  desc: "Clients, fournisseurs, État, organismes sociaux",                    c: "#0ea5e9" },
  { n: 5, label: "Trésorerie",             desc: "Banques, caisses, valeurs mobilières de placement",                  c: "#16a34a" },
  { n: 6, label: "Charges AO",             desc: "Achats, charges de personnel, dotations aux amortissements",         c: "#e05252" },
  { n: 7, label: "Revenus AO",             desc: "Ventes, prestations de services, produits financiers",               c: "#0d9488" },
  { n: 8, label: "Hors AO (HAO)",          desc: "Charges et produits hors activités ordinaires",                     c: "#8b5cf6" },
  { n: 9, label: "CAGE",                   desc: "Comptabilité analytique de gestion (usage interne)",                 c: "#78716c" },
];

const TABS = [
  "Vue d'ensemble", "Dépenses", "Budgets",
  "Subventions reçues", "Projets / fonds dédiés", "Rapprochement bancaire",
];

/* ── KPI card ────────────────────────────────────────────────────── */
function Card({
  label, value, detail, icon: Icon, accent = "indigo", delta, deltaPos = true,
}: {
  label: string; value: string; detail: string; icon: React.ElementType;
  accent?: string; delta?: string; deltaPos?: boolean;
}) {
  const colors: Record<string, string> = {
    indigo:  "bg-emerald-50  text-emerald-600  dark:bg-emerald-500/15 dark:text-emerald-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
    amber:   "bg-amber-50   text-amber-600   dark:bg-amber-500/15   dark:text-amber-400",
    rose:    "bg-rose-50    text-rose-600    dark:bg-rose-500/15    dark:text-rose-400",
  };
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:bg-[#1e2229] dark:border-white/[0.06]">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#717182]">{label}</p>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors[accent] ?? colors.indigo}`}>
          <Icon size={19} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-extrabold text-[#17211f] dark:text-white leading-none">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        {delta && (
          <span className={`text-sm font-bold flex items-center gap-0.5 ${deltaPos ? "text-emerald-600" : "text-rose-500"}`}>
            {deltaPos ? <TrendingUp size={13}/> : <TrendingDown size={13}/>}{delta}
          </span>
        )}
        <span className="text-xs text-[#717182]">{detail}</span>
      </div>
    </div>
  );
}

/* ── main ────────────────────────────────────────────────────────── */
export function AccountingFinancePage() {
  const navigate = useNavigate();
  // Subscribe to currency changes for reactive re-render
  useCurrency();
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => api.overview() });
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: api.invoices });
  const cashflow = useQuery({ queryKey: ["cashflow"], queryFn: () => api.cashflow() });
  const expenses = useQuery({ queryKey: ["expenses"], queryFn: api.expenses });
  const syscemac = useQuery({ queryKey: ["syscemac"], queryFn: api.syscemac });
  const [tab, setTab]           = useState(0);
  const [planOpen, setPlanOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const invoicesTotal = overview.data?.kpis.invoices_total ?? 0;
  const salesTotal    = overview.data?.kpis.sales_total    ?? 0;

  // Cashflow chart in M XAF
  const cashflowChart = useMemo(
    () => (cashflow.data ?? []).map((p) => ({
      m: p.label,
      in: Math.round((p.inflow / 1_000_000) * 10) / 10,
      out: Math.round((p.outflow / 1_000_000) * 10) / 10,
    })),
    [cashflow.data]
  );

  // Expenses pie — convert amounts to %
  const expensesChart = useMemo(() => {
    const list = expenses.data ?? [];
    const total = list.reduce((s, e) => s + (e.amount || 0), 0);
    if (total <= 0) return list.map((e) => ({ name: e.name, v: 0, c: e.color }));
    return list.map((e) => ({
      name: e.name,
      v: Math.round((e.amount / total) * 100),
      c: e.color,
    }));
  }, [expenses.data]);

  // Real activity from invoices (most recent first)
  const activity = useMemo(() => {
    const inv = invoices.data ?? [];
    return [...inv]
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
      .slice(0, 5)
      .map((i) => ({
        id: i.id,
        label: `Facture ${i.number} — ${i.customer_name}`,
        actor: i.status === "paid" ? "Encaissé" : i.status === "sent" ? "En attente" : "Brouillon",
        amount: i.status === "paid" ? +i.total_amount : -0,
        tone: i.status === "paid" ? "green" : i.status === "sent" ? "amber" : "red",
      }));
  }, [invoices.data]);

  const cashflowTotalIn = (cashflow.data ?? []).reduce((s, p) => s + p.inflow, 0);
  const cashflowTotalOut = (cashflow.data ?? []).reduce((s, p) => s + p.outflow, 0);
  const netResult = cashflowTotalIn - cashflowTotalOut;

  function exportLedger() {
    const lines = ["Numéro,Client,Statut,Montant,Date"];
    for (const inv of invoices.data ?? []) {
      lines.push(`${inv.number},"${inv.customer_name}",${inv.status},${inv.total_amount},${inv.created_at}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kompta-grand-livre-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-emerald-600">Comptabilité &amp; finance</p>
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 tracking-wide">
              SYSCEMAC RÉVISÉ
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-[#17211f] dark:text-white">Finance et Comptabilité</h1>
          <p className="mt-1 text-sm text-[#717182]">
            {invoices.data?.length ?? 0} factures · Référentiel SYSCEMAC · Zone CEMACE/XAF
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setPlanOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:border-emerald-500/30 dark:text-emerald-300 transition"
          >
            <BookOpen size={16} /> Plan comptable SYSCEMAC
          </button>
          <button
            onClick={() => setTab(1)}
            className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] px-3 py-2 text-sm font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
            <Filter size={16} /> Filtres
          </button>
          <button
            onClick={exportLedger}
            disabled={(invoices.data?.length ?? 0) === 0}
            className="flex items-center gap-2 rounded-lg border border-black/[0.08] bg-white dark:bg-[#1e2229] dark:border-white/[0.08] px-3 py-2 text-sm font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.03] disabled:opacity-50">
            <Download size={16} /> Export CSV
          </button>
          <button
            onClick={() => navigate("/billing")}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition">
            <Plus size={16} /> Nouvelle facture
          </button>
        </div>
      </div>

      {/* ── SYSCEMAC panel ── */}
      {planOpen && (
        <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] p-5">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="font-bold text-[#17211f] dark:text-white">Plan comptable SYSCEMAC actif — CEMACE/XAF</h3>
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">9 classes</span>
          </div>
          <p className="mb-4 text-sm text-[#717182]">
            Référentiel comptable SYSCEMAC utilisé en zone CEMACE. Cliquez pour voir le détail des classes.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {SYSCEMAC_CLASSES.map((cls) => (
              <button
                key={cls.n}
                onClick={() => setExpanded(expanded === cls.n ? null : cls.n)}
                className="group flex items-start gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-3 text-left transition hover:border-black/[0.12] hover:shadow-sm"
              >
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-black text-white" style={{ backgroundColor: cls.c }}>
                  {cls.n}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#17211f] dark:text-white">Classe {cls.n} — {cls.label}</p>
                  <p className={`mt-0.5 text-xs text-[#717182] transition-all ${expanded === cls.n ? "block" : "hidden group-hover:block"}`}>
                    {cls.desc}
                  </p>
                </div>
                {expanded === cls.n
                  ? <ChevronDown size={14} className="mt-1 shrink-0 text-[#717182]" />
                  : <ChevronRight size={14} className="mt-1 shrink-0 text-[#717182]" />}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-sm">
            <span className="font-bold text-emerald-800 dark:text-emerald-300">SYSCEMAC Révisé · CEMACE</span>
            <span className="text-emerald-400">·</span>
            <span className="text-emerald-700 dark:text-emerald-400">En vigueur depuis le 1er janvier 2018</span>
            <span className="text-emerald-400">·</span>
            <span className="text-emerald-700 dark:text-emerald-400">Devise opérationnelle {currencyLabel()}</span>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] p-2">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                tab === i
                  ? "bg-emerald-600 text-white"
                  : "text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              }`}
            >
              {i === 0 && <Building2 size={15} />}
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card label="Trésorerie"  value={compactMoney(cashflowTotalIn - cashflowTotalOut + salesTotal)} detail={`${cashflow.data?.length ?? 0} mois agrégés`}   icon={WalletCards}  accent="emerald" delta={cashflow.data?.length ? "Calculé" : "—"}  />
        <Card label="Créances"    value={compactMoney(invoicesTotal)}    detail={`${invoices.data?.length ?? 0} factures émises`}   icon={Landmark}     accent="emerald" delta={invoicesTotal > 0 ? "OK" : "—"}  />
        <Card label="Sorties"     value={compactMoney(cashflowTotalOut)} detail="charges + paie cumulées"                            icon={HandCoins}    accent="amber"   delta="—" deltaPos={false} />
        <Card label="Résultat"    value={compactMoney(netResult)}        detail={netResult >= 0 ? "marge positive" : "résultat négatif"} icon={RefreshCcw} accent="emerald" delta={netResult >= 0 ? "+" : "-"} deltaPos={netResult >= 0} />
      </div>

      {/* ── Charts ── */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Cash flow area chart */}
        <div className="lg:col-span-2 rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
          <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
            <div>
              <h3 className="font-bold text-[#17211f] dark:text-white">Flux entrants vs sortants</h3>
              <p className="text-xs text-[#717182]">12 derniers mois · M {currencyLabel()}</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#717182]">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600"/>Entrées</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500"/>Sorties</span>
            </div>
          </div>
          <div className="h-64 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashflowChart} margin={{ left: 4, right: 16, top: 12, bottom: 4 }}>
                <defs>
                  <linearGradient id="gcIn" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity={0.35}/>
                    <stop offset="100%" stopColor="#059669" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gcOut" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.25}/>
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)"/>
                <XAxis dataKey="m" stroke="#94a3b8" fontSize={11}/>
                <YAxis stroke="#94a3b8" fontSize={11}/>
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid rgba(0,0,0,0.08)" }} formatter={(v) => [`${v} M ${currencyLabel()}`]}/>
                <Area type="monotone" dataKey="in"  stroke="#059669" fill="url(#gcIn)"  strokeWidth={2.5} dot={false}/>
                <Area type="monotone" dataKey="out" stroke="#f43f5e" fill="url(#gcOut)" strokeWidth={2}   dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expenses donut */}
        <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06] flex flex-col">
          <div className="border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
            <h3 className="font-bold text-[#17211f] dark:text-white">Structure des dépenses</h3>
            <p className="text-xs text-[#717182]">Par poste</p>
          </div>
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Pie
                  data={expensesChart}
                  dataKey="v"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={82}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {expensesChart.map((e, i) => <Cell key={i} fill={e.c} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid rgba(0,0,0,0.08)" }}
                  formatter={(v, name) => [`${v}%`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 px-5 pb-5 pt-2">
            {expensesChart.map((e) => (
              <div key={e.name} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: e.c }} />
                <span className="flex-1 text-sm text-[#17211f] dark:text-white">{e.name}</span>
                <span
                  className="min-w-[36px] rounded-full px-2 py-0.5 text-center text-[11px] font-bold"
                  style={{ background: e.c + "22", color: e.c }}
                >
                  {e.v}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recent activity ── */}
      <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
        <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
          <h3 className="font-bold text-[#17211f] dark:text-white">Activité comptable récente</h3>
          <button onClick={() => navigate("/billing")} className="flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-700">
            Voir tout <ArrowUpRight size={15}/>
          </button>
        </div>
        <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {activity.length === 0 && (
            <p className="px-5 py-8 text-sm text-[#717182]">Aucune activité comptable récente. Les factures apparaîtront ici dès leur création.</p>
          )}
          {activity.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-center gap-4">
                <span className={`grid h-11 w-11 place-items-center rounded-xl text-lg font-black ${
                  item.tone === "green" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : item.tone === "red"   ? "bg-rose-50   text-rose-600   dark:bg-rose-500/15   dark:text-rose-400"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                }`}>
                  {item.amount >= 0 ? <TrendingUp size={20}/> : <TrendingDown size={20}/>}
                </span>
                <div>
                  <p className="font-semibold text-[#17211f] dark:text-white">{item.label}</p>
                  <p className="text-sm text-[#717182]">par {item.actor}</p>
                </div>
              </div>
              <p className={`text-lg font-extrabold ${item.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {money(item.amount)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── SYSCEMAC journals status ── */}
      <div className="rounded-xl border border-black/[0.06] bg-white dark:bg-[#1e2229] dark:border-white/[0.06]">
        <div className="border-b border-black/[0.06] dark:border-white/[0.06] px-5 py-4">
          <h3 className="font-bold text-[#17211f] dark:text-white">État des journaux SYSCEMAC</h3>
          <p className="text-xs text-[#717182]">Calculé en temps réel à partir de tes données</p>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2 lg:grid-cols-4">
          {(syscemac.data ?? []).map((j) => (
            <div key={j.code} className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#717182]">{j.code}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  j.status === "ready"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : j.status === "draft"
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                    : "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                }`}>
                  {j.status === "ready" ? "À jour" : j.status === "draft" ? "Brouillon" : "Vide"}
                </span>
              </div>
              <p className="mt-2 font-semibold text-[#17211f] dark:text-white">{j.label}</p>
              <p className="mt-0.5 text-xs text-[#717182]">{j.count} écriture{j.count > 1 ? "s" : ""}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
