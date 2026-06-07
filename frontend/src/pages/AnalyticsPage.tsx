import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { Download, TrendingUp, DollarSign, Users, Percent } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../services/api";
import { exportToPDF } from "../utils/export";
import i18n from "../i18n";

// Palette variée et harmonieuse (plus de « vert sur vert »).
const EMERALD_PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6", "#ef4444"];

function fmt(n: number, currency = true): string {
  if (currency) return new Intl.NumberFormat(i18n.language, { style: "currency", currency: "XAF", maximumFractionDigits: 0 }).format(n);
  return new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(n);
}

function KpiCard({ title, value, sub, icon: Icon, color }: {
  title: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-4 dark:border-white/[0.08] dark:bg-[#1e2229]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#717182] dark:text-white/50">{title}</p>
          <p className="mt-1 text-2xl font-black text-[#17211f] dark:text-white">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-[#717182] dark:text-white/40">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
    </div>
  );
}

export function AnalyticsPage() {
  const { t: tr } = useTranslation();
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));

  const overviewQuery = useQuery({ queryKey: ["overview"], queryFn: () => api.overview() });
  const invoicesQuery = useQuery({ queryKey: ["invoices"], queryFn: api.invoices });
  const clientsQuery  = useQuery({ queryKey: ["clients"], queryFn: () => api.clients() });
  const salesQuery    = useQuery({ queryKey: ["pos-sales", 200], queryFn: () => api.posSales(200) });
  const revenueQuery  = useQuery({ queryKey: ["revenue-series", "month"], queryFn: () => api.revenueSeries("month") });
  const cashflowQuery = useQuery({ queryKey: ["cashflow", "month"], queryFn: () => api.cashflow("month") });

  const invoices = invoicesQuery.data ?? [];
  const clients  = clientsQuery.data ?? [];
  const sales    = salesQuery.data ?? [];
  const overview = overviewQuery.data;
  const kpis     = overview?.kpis ?? {};

  // ── KPI computations ──
  const totalRevenue = invoices.reduce((s, inv) => s + (inv.total_amount ?? 0), 0);
  const paidRevenue  = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.total_amount ?? 0), 0);
  const recoveryRate = totalRevenue > 0 ? (paidRevenue / totalRevenue) * 100 : 0;
  const marginPct    = kpis.margin_pct ?? (revenueQuery.data?.[0]?.margin ?? 0);

  const totalSalaries = (kpis.total_payroll ?? 0);
  const employeeCount = kpis.employee_count ?? 1;
  const avgCostPerEmployee = employeeCount > 0 ? totalSalaries / employeeCount : 0;

  // ── Revenue vs Expenses per month (last 12 entries) ──
  const revData = (revenueQuery.data ?? []).slice(-12).map((d) => ({
    name: d.label,
    Revenus: d.revenue,
    Marge: d.margin,
  }));

  // ── Cashflow area chart ──
  const cfData = (cashflowQuery.data ?? []).slice(-12).map((d) => ({
    name: d.label,
    Entrées: d.inflow,
    Sorties: d.outflow,
  }));

  // ── Top 10 clients by revenue ──
  const clientRevMap: Record<string, number> = {};
  for (const inv of invoices) {
    if (!inv.customer_name) continue;
    clientRevMap[inv.customer_name] = (clientRevMap[inv.customer_name] ?? 0) + (inv.total_amount ?? 0);
  }
  // If clients exist, also try matching by name
  const top10Clients = Object.entries(clientRevMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, ca]) => ({ name, CA: ca }));

  // ── Rentabilité par produit (POS) ──
  const productMap: Record<string, number> = {};
  for (const sale of sales) {
    for (const item of sale.items ?? []) {
      const name = item.product_name;
      productMap[name] = (productMap[name] ?? 0) + (item.line_total ?? 0);
    }
  }
  const productData = Object.entries(productMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  // ── Export PDF ──
  function handleExportPDF() {
    const rows = [
      { label: tr("analytics.yearAnalyzed"), value: year },
      { label: tr("analytics.totalRevenueRow"), value: fmt(totalRevenue) },
      { label: tr("analytics.recoveryRow"), value: `${fmt(recoveryRate, false)} %` },
      { label: tr("analytics.avgMargin"), value: `${fmt(marginPct, false)} %` },
      { label: tr("analytics.avgCostEmp"), value: fmt(avgCostPerEmployee) },
      { label: tr("analytics.clientsCount"), value: String(clients.length) },
      { label: tr("analytics.invoicesCountRow"), value: String(invoices.length) },
      ...top10Clients.slice(0, 5).map((c) => ({ label: tr("analytics.clientRow", { name: c.name }), value: fmt(c.CA) })),
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
            onChange={(e) => setYear(e.target.value)}
            className="rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-sm dark:border-white/[0.08] dark:bg-[#1e2229] dark:text-white"
          >
            {["2024", "2025", "2026"].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
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
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-black/[0.04] dark:bg-white/[0.04]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard
            title={tr("analytics.kpiTotalRevenue")}
            value={fmt(totalRevenue)}
            sub={tr("analytics.invoicesCount", { count: invoices.length })}
            icon={DollarSign}
            color="bg-emerald-600"
          />
          <KpiCard
            title={tr("analytics.kpiMargin")}
            value={`${fmt(marginPct, false)} %`}
            sub={tr("analytics.netMarginEst")}
            icon={Percent}
            color="bg-teal-600"
          />
          <KpiCard
            title={tr("analytics.kpiRecovery")}
            value={`${fmt(recoveryRate, false)} %`}
            sub={tr("analytics.collected", { amount: fmt(paidRevenue) })}
            icon={TrendingUp}
            color="bg-blue-600"
          />
          <KpiCard
            title={tr("analytics.kpiCostPerEmployee")}
            value={fmt(avgCostPerEmployee)}
            sub={tr("analytics.employeesCount", { count: employeeCount })}
            icon={Users}
            color="bg-violet-600"
          />
        </div>
      )}

      {/* Revenus vs Marge par mois */}
      <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1e2229]">
        <h2 className="mb-4 text-sm font-bold text-[#17211f] dark:text-white">{tr("analytics.revMarginTitle")}</h2>
        {revData.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#717182] dark:text-white/40">{tr("analytics.noData")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={revData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Legend />
              <Bar dataKey="Revenus" name={tr("analytics.revenue")} fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Marge" name={tr("analytics.margin")} fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top 10 Clients */}
      {top10Clients.length > 0 && (
        <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1e2229]">
          <h2 className="mb-4 text-sm font-bold text-[#17211f] dark:text-white">{tr("analytics.top10")}</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart layout="vertical" data={top10Clients} margin={{ top: 4, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Bar dataKey="CA" name={tr("analytics.ca")} fill="#0ea5e9" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rentabilité par produit */}
        {productData.length > 0 && (
          <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1e2229]">
            <h2 className="mb-4 text-sm font-bold text-[#17211f] dark:text-white">{tr("analytics.productProfit")}</h2>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={productData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {productData.map((_, index) => (
                    <Cell key={index} fill={EMERALD_PALETTE[index % EMERALD_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmt(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Évolution trésorerie */}
        {cfData.length > 0 && (
          <div className="rounded-xl border border-black/[0.06] bg-white p-5 dark:border-white/[0.08] dark:bg-[#1e2229]">
            <h2 className="mb-4 text-sm font-bold text-[#17211f] dark:text-white">{tr("analytics.cashEvolution")}</h2>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={cfData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEntrees" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorSorties" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Legend />
                <Area type="monotone" dataKey="Entrées" name={tr("analytics.inflows")} stroke="#059669" fill="url(#colorEntrees)" strokeWidth={2} />
                <Area type="monotone" dataKey="Sorties" name={tr("analytics.outflows")} stroke="#ef4444" fill="url(#colorSorties)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
