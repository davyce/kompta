import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer,
  LineChart, Line, ReferenceLine,
} from "recharts";
import {
  Download, TrendingUp, DollarSign, Users, Percent,
  Clock, Sparkles, X, Copy, FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../services/api";
import { exportToPDF } from "../utils/export";
import { useToast } from "../components/ToastProvider";
import { LimuleAvatar } from "../components/LimuleAvatar";
import { MarkdownBlock } from "../components/MarkdownBlock";
import i18n from "../i18n";

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6", "#ef4444"];

function fmt(n: number, currency = true): string {
  if (currency)
    return new Intl.NumberFormat(i18n.language, { style: "currency", currency: "XAF", maximumFractionDigits: 0 }).format(n);
  return new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(n);
}

function KpiCard({ title, value, sub, delta, icon: Icon, color }: {
  title: string; value: string; sub?: string; delta?: number | null; icon: LucideIcon; color: string;
}) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-4 dark:border-white/[0.08] dark:bg-[#1e2229]">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#717182] dark:text-white/50">{title}</p>
          <p className="mt-1 text-2xl font-black text-[#17211f] dark:text-white">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-[#717182] dark:text-white/40">{sub}</p>}
          {delta != null && (
            <p className={`mt-1 text-xs font-bold ${delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)} % vs N-1
            </p>
          )}
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
    </div>
  );
}

export function AnalyticsPage() {
  const { t: tr } = useTranslation();
  const toast = useToast();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [forecastState, setForecastState] = useState<{ content: string; loading: boolean } | null>(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const abortRef = useRef(false);

  const overviewQuery  = useQuery({ queryKey: ["overview"], queryFn: () => api.overview() });
  const invoicesQuery  = useQuery({ queryKey: ["invoices"], queryFn: api.invoices });
  const clientsQuery   = useQuery({ queryKey: ["clients"],  queryFn: () => api.clients() });
  const salesQuery     = useQuery({ queryKey: ["pos-sales", 200], queryFn: () => api.posSales(200) });
  const revenueN       = useQuery({ queryKey: ["revenue-year", year],     queryFn: () => api.revenueSeriesByYear(year) });
  const revenueN1      = useQuery({ queryKey: ["revenue-year", year - 1], queryFn: () => api.revenueSeriesByYear(year - 1) });
  const cashflowQuery  = useQuery({ queryKey: ["cashflow", "month"], queryFn: () => api.cashflow("month") });

  const invoices = invoicesQuery.data ?? [];
  const clients  = clientsQuery.data ?? [];
  const sales    = salesQuery.data ?? [];
  const kpis     = overviewQuery.data?.kpis ?? {};

  // ── KPIs ──
  const totalRevenue = invoices.filter(i => {
    const y = new Date(i.created_at ?? "").getFullYear();
    return y === year;
  }).reduce((s, i) => s + (i.total_amount ?? 0), 0);

  const totalRevenueN1 = invoices.filter(i => {
    const y = new Date(i.created_at ?? "").getFullYear();
    return y === year - 1;
  }).reduce((s, i) => s + (i.total_amount ?? 0), 0);

  const revDelta = totalRevenueN1 > 0 ? ((totalRevenue - totalRevenueN1) / totalRevenueN1) * 100 : null;

  const paidRevenue  = invoices.filter(i => i.status === "paid" && new Date(i.created_at ?? "").getFullYear() === year)
    .reduce((s, i) => s + (i.total_amount ?? 0), 0);
  const recoveryRate = totalRevenue > 0 ? (paidRevenue / totalRevenue) * 100 : 0;
  // "margin_pct" n'existe pas côté backend (pas de marge/COGS agrégé exposé par
  // /reports/overview) — null plutôt qu'un 0% fabriqué qui se ferait passer pour
  // une vraie donnée. "avg_payroll_per_employee" est en revanche calculé
  // réellement côté backend à partir de l'historique des bulletins de paie.
  const marginPct: number | null = null;
  const avgCostPerEmployee = kpis.avg_payroll_per_employee ?? 0;

  // ── Comparaison N / N-1 par mois ──
  const MONTHS = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];
  const comparisonData = MONTHS.map((label, idx) => {
    const n  = (revenueN.data  ?? [])[idx]?.revenue ?? 0;
    const n1 = (revenueN1.data ?? [])[idx]?.revenue ?? 0;
    return { label, [String(year)]: n, [String(year - 1)]: n1 };
  });

  // ── DSO : délai moyen de règlement (jours) ──
  const paidInvoices = invoices.filter(i => i.status === "paid" && i.paid_at && i.created_at);
  const dsoByMonth: Record<string, { total: number; count: number }> = {};
  for (const inv of paidInvoices) {
    const created = new Date(inv.created_at);
    const paid    = new Date(inv.paid_at!);
    const days    = Math.round((paid.getTime() - created.getTime()) / 86400000);
    if (days < 0 || days > 365) continue;
    const key = MONTHS[created.getMonth()];
    if (!dsoByMonth[key]) dsoByMonth[key] = { total: 0, count: 0 };
    dsoByMonth[key].total += days;
    dsoByMonth[key].count++;
  }
  const dsoData = MONTHS.map(label => ({
    label,
    DSO: dsoByMonth[label] ? Math.round(dsoByMonth[label].total / dsoByMonth[label].count) : 0,
  })).filter(d => d.DSO > 0);
  const avgDso = dsoData.length > 0 ? Math.round(dsoData.reduce((s, d) => s + d.DSO, 0) / dsoData.length) : null;

  // ── Top 10 clients CA ──
  const clientRevMap: Record<string, number> = {};
  for (const inv of invoices) {
    if (!inv.customer_name) continue;
    clientRevMap[inv.customer_name] = (clientRevMap[inv.customer_name] ?? 0) + (inv.total_amount ?? 0);
  }
  const top10Clients = Object.entries(clientRevMap).sort(([, a], [, b]) => b - a).slice(0, 10)
    .map(([name, CA]) => ({ name, CA }));

  // ── Rentabilité produits (POS) ──
  const productMap: Record<string, number> = {};
  for (const sale of sales)
    for (const item of sale.items ?? [])
      productMap[item.product_name] = (productMap[item.product_name] ?? 0) + (item.line_total ?? 0);
  const productData = Object.entries(productMap).sort(([, a], [, b]) => b - a).slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  // ── Cashflow ──
  const cfData = (cashflowQuery.data ?? []).slice(-12).map(d => ({
    name: d.label, Entrées: d.inflow, Sorties: d.outflow,
  }));

  // ── Limule forecast ──
  async function generateForecast() {
    abortRef.current = false;
    setForecastState({ content: "", loading: true });
    const revenueSum = (revenueN.data ?? []).reduce((s, d) => s + d.revenue, 0);
    const prompt = `Tu es Limule, l'IA financière de KOMPTA. Génère une prévision financière pour les 6 prochains mois en français, basée sur :
- Chiffre d'affaires ${year} : ${fmt(revenueSum)}
- Taux de recouvrement : ${fmt(recoveryRate, false)} %
- DSO moyen : ${avgDso ?? "N/A"} jours
- Nombre de clients actifs : ${clients.length}
- Tendance mensuelle des 12 derniers mois disponibles.

Inclure : projection CA mois par mois, risques identifiés, recommandations opérationnelles CEMAC/OHADA. Format structuré avec titres.`;

    await api.aiGenerateStream(
      { kind: "forecast", title: "Prévisions financières", prompt, context: "analytics" },
      (partial) => { if (!abortRef.current) setForecastState(prev => prev ? { ...prev, content: partial } : null); },
      (final)   => { if (!abortRef.current) setForecastState(prev => prev ? { ...prev, content: final, loading: false } : null); },
      (err)     => { if (!abortRef.current) { setForecastState(null); toast.error(err.message); } },
    );
  }

  async function exportForecastPdf() {
    if (!forecastState?.content) return;
    setPdfExporting(true);
    try {
      const blob = await api.aiContentPdf({ title: `Prévisions ${year}`, content: forecastState.content, kind: "forecast" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `limule-previsions-${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Erreur lors de la génération du PDF"); }
    finally { setPdfExporting(false); }
  }

  function handleExportPDF() {
    const rows = [
      { label: "Année analysée", value: String(year) },
      { label: "CA total", value: fmt(totalRevenue) },
      { label: "Variation vs N-1", value: revDelta != null ? `${revDelta >= 0 ? "+" : ""}${revDelta.toFixed(1)} %` : "—" },
      { label: "Taux recouvrement", value: `${fmt(recoveryRate, false)} %` },
      { label: "DSO moyen", value: avgDso ? `${avgDso} j` : "—" },
      { label: "Coût moyen/employé", value: fmt(avgCostPerEmployee) },
      { label: "Clients", value: String(clients.length) },
      ...top10Clients.slice(0, 5).map(c => ({ label: `Client : ${c.name}`, value: fmt(c.CA) })),
    ];
    exportToPDF(tr("analytics.pdfTitle", { year }), rows, `analytics-kompta-${year}.pdf`);
  }

  const loading = overviewQuery.isLoading || invoicesQuery.isLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-[#17211f] dark:text-white">{tr("analytics.title")}</h1>
          <p className="text-sm text-[#717182] dark:text-white/50">{tr("analytics.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            aria-label={tr("analytics.yearSelector")}
            className="rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-sm dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
          >
            {[currentYear - 2, currentYear - 1, currentYear].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => generateForecast()}
            disabled={forecastState?.loading}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60 transition"
          >
            <LimuleAvatar state={forecastState?.loading ? "thinking" : "idle"} size={18} />
            Prévisions Limule
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 transition"
          >
            <Download size={15} />
            {tr("analytics.exportPdf")}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.04]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
          <KpiCard title={tr("analytics.kpiTotalRevenue")} value={fmt(totalRevenue)}
            sub={tr("analytics.invoicesCount", { count: invoices.length })}
            delta={revDelta} icon={DollarSign} color="bg-emerald-600" />
          <KpiCard title={tr("analytics.kpiMargin")} value={marginPct != null ? `${fmt(marginPct, false)} %` : "—"}
            sub={tr("analytics.netMarginEst")} icon={Percent} color="bg-teal-600" />
          <KpiCard title={tr("analytics.kpiRecovery")} value={`${fmt(recoveryRate, false)} %`}
            sub={tr("analytics.collected", { amount: fmt(paidRevenue) })} icon={TrendingUp} color="bg-blue-600" />
          <KpiCard title="DSO moyen" value={avgDso ? `${avgDso} j` : "—"}
            sub="Délai moyen de paiement client" icon={Clock} color="bg-amber-500" />
          <KpiCard title={tr("analytics.kpiCostPerEmployee")} value={fmt(avgCostPerEmployee)}
            sub={tr("analytics.employeesCount", { count: kpis.employees ?? 0 })} icon={Users} color="bg-violet-600" />
        </div>
      )}

      {/* Prévisions Limule */}
      {forecastState && (
        <div className="rounded-xl border border-violet-200 bg-white shadow-sm dark:border-violet-500/30 dark:bg-[#1e2229]">
          <div className="flex items-center justify-between border-b border-violet-100 dark:border-violet-500/20 px-5 py-4">
            <div className="flex items-center gap-3">
              <LimuleAvatar state={forecastState.loading ? "thinking" : "speaking"} size={44} />
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-violet-500">Limule · Prévisions IA</p>
                <h3 className="font-black text-[#17211f] dark:text-white">Projections financières {year} → {year + 1}</h3>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {forecastState.content && !forecastState.loading && (
                <>
                  <button
                    onClick={exportForecastPdf}
                    disabled={pdfExporting}
                    className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300"
                  >
                    <FileText size={12} /> {pdfExporting ? "PDF…" : "Exporter PDF"}
                  </button>
                  <button
                    onClick={() => navigator.clipboard.writeText(forecastState.content)}
                    className="flex items-center gap-1.5 rounded-lg border border-black/[0.06] bg-white px-3 py-1.5 text-xs font-semibold text-[#717182] hover:text-violet-600 dark:bg-white/5 dark:border-white/10"
                  >
                    <Copy size={12} /> Copier
                  </button>
                </>
              )}
              <button
                onClick={() => { abortRef.current = true; setForecastState(null); }}
                aria-label={tr("common.close")}
                className="grid h-8 w-8 place-items-center rounded-lg text-[#717182] hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="px-5 py-4">
            {forecastState.loading && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-violet-50 dark:bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-600 dark:text-violet-300">
                <LimuleAvatar state="thinking" size={20} />
                Limule analyse vos données et génère les prévisions…
              </div>
            )}
            {forecastState.content && <MarkdownBlock content={forecastState.content} />}
          </div>
        </div>
      )}

      {/* Comparaison N vs N-1 */}
      <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1e2229]">
        <h2 className="mb-1 text-sm font-bold text-[#17211f] dark:text-white">Revenus {year} vs {year - 1}</h2>
        <p className="mb-4 text-xs text-[#717182]">Comparaison mensuelle chiffre d'affaires année en cours vs année précédente</p>
        {comparisonData.every(d => d[year] === 0 && d[year - 1] === 0) ? (
          <p className="py-10 text-center text-sm text-[#717182]">{tr("analytics.noData")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={comparisonData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Legend />
              <Bar dataKey={String(year)}     name={String(year)}     fill="#10b981" radius={[4,4,0,0]} />
              <Bar dataKey={String(year - 1)} name={String(year - 1)} fill="#94a3b8" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* DSO + Cashflow */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* DSO — Délai Moyen de Règlement */}
        <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1e2229]">
          <h2 className="mb-1 text-sm font-bold text-[#17211f] dark:text-white">DSO — Délai Moyen de Règlement</h2>
          <p className="mb-4 text-xs text-[#717182]">Nombre de jours entre émission et paiement de la facture</p>
          {dsoData.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#717182]">Aucune facture payée avec date de paiement enregistrée</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={dsoData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" j" />
                <Tooltip formatter={(v) => `${v} jours`} />
                {avgDso && <ReferenceLine y={avgDso} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: `Moy. ${avgDso}j`, fontSize: 10, fill: "#f59e0b" }} />}
                <Line type="monotone" dataKey="DSO" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Évolution trésorerie */}
        {cfData.length > 0 ? (
          <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1e2229]">
            <h2 className="mb-4 text-sm font-bold text-[#17211f] dark:text-white">{tr("analytics.cashEvolution")}</h2>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={cfData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cEnt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#059669" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="cSor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Legend />
                <Area type="monotone" dataKey="Entrées" name={tr("analytics.inflows")} stroke="#059669" fill="url(#cEnt)" strokeWidth={2} />
                <Area type="monotone" dataKey="Sorties" name={tr("analytics.outflows")} stroke="#ef4444" fill="url(#cSor)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          /* Marge mensuelle si pas de cashflow */
          (revenueN.data ?? []).length > 0 && (
            <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1e2229]">
              <h2 className="mb-4 text-sm font-bold text-[#17211f] dark:text-white">Marge mensuelle {year}</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={(revenueN.data ?? []).map(d => ({ label: d.label, Marge: d.margin }))} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Bar dataKey="Marge" fill="#6366f1" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        )}
      </div>

      {/* Top 10 clients */}
      {top10Clients.length > 0 && (
        <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1e2229]">
          <h2 className="mb-4 text-sm font-bold text-[#17211f] dark:text-white">{tr("analytics.top10")}</h2>
          <ResponsiveContainer width="100%" height={290}>
            <BarChart layout="vertical" data={top10Clients} margin={{ top: 4, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Bar dataKey="CA" name={tr("analytics.ca")} fill="#0ea5e9" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Rentabilité produits */}
      {productData.length > 0 && (
        <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1e2229]">
          <h2 className="mb-4 text-sm font-bold text-[#17211f] dark:text-white">{tr("analytics.productProfit")}</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={productData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`} labelLine={false}>
                {productData.map((_, idx) => <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmt(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Sparkline évolution CA N+N-1 en ligne */}
      {(revenueN.data ?? []).length > 0 && (revenueN1.data ?? []).length > 0 && (
        <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1e2229]">
          <h2 className="mb-1 text-sm font-bold text-[#17211f] dark:text-white">Tendance revenus cumulés</h2>
          <p className="mb-4 text-xs text-[#717182]">Cumul mensuel {year} vs {year - 1}</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={MONTHS.map((label, i) => {
                const rev  = (revenueN.data  ?? [])[i]?.revenue ?? 0;
                const rev1 = (revenueN1.data ?? [])[i]?.revenue ?? 0;
                return { label, [String(year)]: rev, [String(year - 1)]: rev1 };
              })}
              margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Legend />
              <Line type="monotone" dataKey={String(year)}     stroke="#10b981" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey={String(year - 1)} stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
