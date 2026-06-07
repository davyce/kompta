import { useMemo, useState, useEffect, useRef } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, BellOff, BookOpen,
  BrainCircuit, Building2, Calendar, ChevronRight, Download, Edit2,
  ExternalLink, Globe, Info, Loader2, Plus, RefreshCcw, Search,
  TrendingDown, TrendingUp, Trash2, X,
} from "lucide-react";

import { api } from "../services/api";
import type {
  InvestmentDto, InvestmentCreateDto, StockQuoteDto,
  StockNewsItem, TickerSearchResult,
} from "../services/api";
import { money, compactMoney } from "../utils/format";
import { useCurrency } from "../contexts/CurrencyContext";
import { useConfirm } from "../components/ConfirmProvider";
import { CurrencyConverter } from "../components/CurrencyConverter";
import i18n from "../i18n";

/* ── Palette for pie chart ─────────────────────────────────────── */
const PALETTE = [
  "#059669","#3b82f6","#f59e0b","#ef4444","#8b5cf6",
  "#06b6d4","#ec4899","#84cc16","#f97316","#14b8a6",
];

/* ── Helpers ──────────────────────────────────────────────────── */
const fmt = (v: number | null | undefined, dec = 2) =>
  v == null ? "—" : v.toLocaleString(i18n.language, { minimumFractionDigits: dec, maximumFractionDigits: dec });

const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

const PERIODS = [
  { key: "1d",  tk: "investmentsPage.periods.oneDay" },
  { key: "5d",  tk: "investmentsPage.periods.fiveDays" },
  { key: "1mo", tk: "investmentsPage.periods.oneMonth" },
  { key: "3mo", tk: "investmentsPage.periods.threeMonths" },
  { key: "6mo", tk: "investmentsPage.periods.sixMonths" },
  { key: "1y",  tk: "investmentsPage.periods.oneYear" },
  { key: "5y",  tk: "investmentsPage.periods.fiveYears" },
  { key: "max", tk: "investmentsPage.periods.max" },
] as const;
type Period = typeof PERIODS[number]["key"];
type ExchangeGuideItem = { label: string; hint: string };

function translatedMarketAnalysisFallback(count: number, analysis: string, tr: TFunction) {
  return `${tr("investmentsPage.analysis.portfolioFallbackTitle", { count })}\n\n${analysis}`;
}

/* ── Metric card ──────────────────────────────────────────────── */
function MetricBox({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-white/60 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] px-4 py-3">
      <p className="text-[11px] text-[#717182] font-medium uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-base font-bold ${accent || "text-[#17211f] dark:text-white"}`}>{value}</p>
      {sub && <p className="text-[10px] text-[#717182] mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── News card ────────────────────────────────────────────────── */
function NewsCard({ item }: { item: StockNewsItem }) {
  return (
    <a href={item.url || undefined} target="_blank" rel="noopener noreferrer"
      className="flex gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4 hover:border-emerald-400/50 transition group">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#17211f] dark:text-white leading-snug line-clamp-2 group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
          {item.title}
        </p>
        {item.summary && <p className="mt-1 text-xs text-[#717182] line-clamp-2">{item.summary}</p>}
        <p className="mt-2 text-[10px] text-[#aaaabc] font-medium">
          {item.provider || "Yahoo Finance"}{item.published ? ` · ${item.published.slice(0, 10)}` : ""}
        </p>
      </div>
      {item.url && <ExternalLink size={13} className="shrink-0 text-[#aaaabc] mt-1 group-hover:text-emerald-500 transition" />}
    </a>
  );
}

/* ── Custom chart tooltip ─────────────────────────────────────── */
function ChartTooltip({ active, payload, label, currency }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  active?: boolean; payload?: any[]; label?: string; currency: string;
}) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value as number;
  return (
    <div className="rounded-xl bg-[#17211f] px-3 py-2 text-white text-xs shadow-xl">
      <p className="font-mono font-bold">{v.toLocaleString(i18n.language, { minimumFractionDigits: 2 })} {currency}</p>
      <p className="text-white/60 mt-0.5">{label}</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
export function InvestmentsPage() {
  const { t: tr } = useTranslation();
  useCurrency();
  const queryClient = useQueryClient();
  const { confirm } = useConfirm();

  /* ── View state ── */
  const [view, setView]                   = useState<"detail" | "portfolio">("detail");
  const [selectedId, setSelectedId]       = useState<number | null>(null);
  const [period, setPeriod]               = useState<Period>("1y");
  const [showAdd, setShowAdd]             = useState(false);
  const [showEdit, setShowEdit]           = useState(false);
  const [editTarget, setEditTarget]       = useState<InvestmentDto | null>(null);

  /* ── Add form ── */
  const [tickerSearch, setTickerSearch]   = useState("");
  const [searchResults, setSearchResults] = useState<TickerSearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<TickerSearchResult | null>(null);
  const [addForm, setAddForm]             = useState({ invested_amount: "", purchase_date: "", notes: "" });

  /* ── Edit form ── */
  const [editForm, setEditForm]           = useState({ shares: "", invested_amount: "", purchase_price_ref: "", purchase_date: "", notes: "" });

  /* ── Analysis ── */
  const [analysis, setAnalysis]           = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [portfolioAnalysis, setPortfolioAnalysis] = useState<string | null>(null);
  const [portfolioAnalysisLoading, setPortfolioAnalysisLoading] = useState(false);

  /* ── Alert state ── */
  const [alertTicker, setAlertTicker]     = useState<string | null>(null);
  const [alertHigh, setAlertHigh]         = useState("");
  const [alertLow, setAlertLow]           = useState("");

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Queries ── */
  const investmentsQ = useQuery({ queryKey: ["investments"], queryFn: api.investments });

  const selected = useMemo(
    () => investmentsQ.data?.find((i) => i.id === selectedId) ?? null,
    [investmentsQ.data, selectedId],
  );

  useEffect(() => {
    if (!selectedId && investmentsQ.data?.length) setSelectedId(investmentsQ.data[0].id);
  }, [investmentsQ.data, selectedId]);

  useEffect(() => { setAnalysis(null); }, [selectedId]);

  const quoteQ = useQuery({
    queryKey: ["stock-quote", selected?.ticker],
    queryFn: () => api.stockQuote(selected!.ticker),
    enabled: !!selected,
    refetchInterval: 60_000,
  });

  const historyQ = useQuery({
    queryKey: ["stock-history", selected?.ticker, period],
    queryFn: () => api.stockHistory(selected!.ticker, period),
    enabled: !!selected && view === "detail",
  });

  const newsQ = useQuery({
    queryKey: ["stock-news", selected?.ticker],
    queryFn: () => api.stockNews(selected!.ticker),
    enabled: !!selected && view === "detail",
  });

  const newsQFr = useQuery({
    queryKey: ["stock-news-fr", selected?.ticker],
    queryFn: () => api.stockNewsFr(selected!.ticker),
    enabled: !!selected && view === "detail",
  });

  /* ── French description (Limule translation) ── */
  const [descFr, setDescFr] = useState<string | null>(null);
  const [descFrLoading, setDescFrLoading] = useState(false);

  useEffect(() => { setDescFr(null); setDescFrLoading(false); }, [selectedId]);

  /* ── All quotes for portfolio overview ── */
  const tickers = useMemo(
    () => [...new Set((investmentsQ.data ?? []).map((i) => i.ticker))],
    [investmentsQ.data],
  );
  const quotesMap = useQuery({
    queryKey: ["stock-quotes-all", tickers.join(",")],
    queryFn: async () => {
      const results: Record<string, StockQuoteDto> = {};
      await Promise.all(tickers.map(async (t) => {
        try { results[t] = await api.stockQuote(t); } catch { /* offline */ }
      }));
      return results;
    },
    enabled: tickers.length > 0,
    refetchInterval: 120_000,
  });

  /* ── Portfolio stats ── */
  const portfolioStats = useMemo(() => {
    const invs = investmentsQ.data ?? [];
    const qmap = quotesMap.data ?? {};
    let totalInvested = 0, totalCurrent = 0;
    const breakdown: { name: string; invested: number; current: number; gain: number; gainPct: number; color: string }[] = [];

    invs.forEach((inv, i) => {
      totalInvested += inv.invested_amount;
      const q = qmap[inv.ticker];
      const cur = q?.price ? inv.shares * q.price : inv.invested_amount;
      totalCurrent += cur;
      breakdown.push({
        name: inv.ticker,
        invested: inv.invested_amount,
        current: cur,
        gain: cur - inv.invested_amount,
        gainPct: inv.invested_amount > 0 ? ((cur - inv.invested_amount) / inv.invested_amount) * 100 : 0,
        color: PALETTE[i % PALETTE.length],
      });
    });

    const gain    = totalCurrent - totalInvested;
    const gainPct = totalInvested > 0 ? (gain / totalInvested) * 100 : 0;
    return { totalInvested, totalCurrent, gain, gainPct, breakdown };
  }, [investmentsQ.data, quotesMap.data]);

  /* ── Pie chart data ── */
  const pieData = useMemo(() =>
    portfolioStats.breakdown.map((b) => ({ name: b.name, value: b.current, color: b.color })),
    [portfolioStats.breakdown],
  );

  /* ── Current investment P&L ── */
  const invPnl = useMemo(() => {
    if (!selected || !quoteQ.data?.price) return null;
    const current = selected.shares * quoteQ.data.price;
    const gain = current - selected.invested_amount;
    const gainPct = selected.invested_amount > 0 ? (gain / selected.invested_amount) * 100 : 0;
    return { current, gain, gainPct };
  }, [selected, quoteQ.data]);

  /* ── Chart data ── */
  const chartData = useMemo(() => {
    return (historyQ.data ?? []).map((p) => ({
      t: period === "1d" || period === "5d"
        ? p.t.slice(11, 16)
        : p.t.slice(5, 10).replace("-", "/"),
      c: p.c,
    }));
  }, [historyQ.data, period]);

  const chartColor = useMemo(() => {
    if (chartData.length < 2) return "#10b981";
    return chartData[chartData.length - 1].c >= chartData[0].c ? "#10b981" : "#f43f5e";
  }, [chartData]);

  const quote = quoteQ.data;

  /* ── Mutations ── */
  const deleteMut = useMutation({
    mutationFn: api.deleteInvestment,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["investments"] }); setSelectedId(null); },
  });

  async function handleDeleteInvestment(investment: InvestmentDto) {
    const ok = await confirm({
      title: tr("investmentsPage.confirmDelete.title", { ticker: investment.ticker }),
      message: tr("investmentsPage.confirmDelete.message"),
      confirmLabel: tr("common.delete"),
      danger: true,
    });
    if (ok) deleteMut.mutate(investment.id);
  }

  const createMut = useMutation({
    mutationFn: (payload: InvestmentCreateDto) => api.createInvestment(payload),
    onSuccess: (newInv) => {
      queryClient.invalidateQueries({ queryKey: ["investments"] });
      setSelectedId(newInv.id);
      setShowAdd(false);
      setTickerSearch(""); setSelectedResult(null);
      setAddForm({ invested_amount: "", purchase_date: "", notes: "" });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<InvestmentCreateDto> }) =>
      api.updateInvestment(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investments"] });
      setShowEdit(false); setEditTarget(null);
    },
  });

  /* ── Ticker search ── */
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!tickerSearch.trim() || tickerSearch.length < 2) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      try { setSearchResults(await api.searchTickers(tickerSearch)); } catch { setSearchResults([]); }
    }, 400);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [tickerSearch]);

  /* ── Add investment ── */
  async function handleAdd() {
    if (!selectedResult) return;
    let price = 0;
    let currency = "USD";
    try {
      const q = await api.stockQuote(selectedResult.ticker);
      price = q.price ?? 0;
      currency = q.currency || selectedResult.currency || "USD";
    } catch { /* use defaults */ }
    const invested = parseFloat(addForm.invested_amount) || 0;
    const shares = price > 0 ? invested / price : 0;
    createMut.mutate({
      ticker: selectedResult.ticker,
      display_name: selectedResult.name,
      exchange: selectedResult.exchange,
      currency_stock: currency,
      shares: Math.round(shares * 10000) / 10000,
      invested_amount: invested,
      purchase_price_ref: price,
      purchase_date: addForm.purchase_date || null,
      notes: addForm.notes || null,
    });
  }

  /* ── Open edit modal ── */
  function openEdit(inv: InvestmentDto) {
    setEditTarget(inv);
    setEditForm({
      shares: String(inv.shares),
      invested_amount: String(inv.invested_amount),
      purchase_price_ref: String(inv.purchase_price_ref),
      purchase_date: inv.purchase_date ?? "",
      notes: inv.notes ?? "",
    });
    setShowEdit(true);
  }

  function handleEditSave() {
    if (!editTarget) return;
    updateMut.mutate({
      id: editTarget.id,
      payload: {
        shares: parseFloat(editForm.shares) || 0,
        invested_amount: parseFloat(editForm.invested_amount) || 0,
        purchase_price_ref: parseFloat(editForm.purchase_price_ref) || 0,
        purchase_date: editForm.purchase_date || null,
        notes: editForm.notes || null,
      },
    });
  }

  /* ── Individual analysis ── */
  async function handleAnalyze() {
    if (!selected) return;
    setAnalysisLoading(true); setAnalysis(null);
    try {
      const res = await api.analyzeInvestment(selected.ticker, selected.id);
      setAnalysis(res.analysis);
      queryClient.invalidateQueries({ queryKey: ["investments"] });
    } catch { setAnalysis(tr("investmentsPage.analysis.error")); }
    finally { setAnalysisLoading(false); }
  }

  /* ── Portfolio evaluation ── */
  async function handlePortfolioEval() {
    const invs = investmentsQ.data ?? [];
    if (!invs.length) return;
    setPortfolioAnalysisLoading(true); setPortfolioAnalysis(null);
    try {
      const data = await api.analyzePortfolio();
      setPortfolioAnalysis(data.analysis);
    } catch {
      // Fallback: analyze top holding individually
      try {
        const first = await api.analyzeInvestment(invs[0].ticker, invs[0].id);
        setPortfolioAnalysis(translatedMarketAnalysisFallback(invs.length, first.analysis, tr));
      } catch {
        setPortfolioAnalysis(tr("investmentsPage.analysis.portfolioUnavailable"));
      }
    } finally { setPortfolioAnalysisLoading(false); }
  }

  /* ── Translate description to French via Limule ── */
  async function handleDescFr() {
    if (!quote?.description || descFrLoading) return;
    setDescFrLoading(true);
    setDescFr("");
    try {
      await api.aiGenerateStream(
        {
          kind: "translate",
          title: tr("investmentsPage.description.aiTitle", { name: quote.name || selected?.ticker }),
          prompt: tr("investmentsPage.description.prompt", { name: quote.name || selected?.ticker, description: quote.description }),
          context: i18n.language.startsWith("en") ? "investment_desc_en" : "investment_desc_fr",
        },
        (partial) => setDescFr(partial),
        (final, _id) => { setDescFr(final); setDescFrLoading(false); },
        () => { setDescFr(tr("investmentsPage.description.limuleUnavailable")); setDescFrLoading(false); },
      );
    } catch {
      setDescFr(tr("investmentsPage.description.translationUnavailable")); setDescFrLoading(false);
    }
  }

  /* ── Download analysis PDF ── */
  async function handleDownloadPdf(invId: number) {
    const res = await api.downloadAnalysisPdf(invId);
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `limule-analyse.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  const isEmpty = !investmentsQ.isLoading && !(investmentsQ.data?.length);
  const exchangeGuide = tr("investmentsPage.add.exchangeGuide.items", { returnObjects: true }) as ExchangeGuideItem[];

  /* ══════════════ RENDER ══════════════════════════════════════ */
  return (
    <div className="flex flex-col min-h-0">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 shrink-0 border-b border-black/[0.05] dark:border-white/[0.05]">
        <div>
          <p className="text-xs font-semibold text-emerald-600">{tr("investmentsPage.header.eyebrow")}</p>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#17211f] dark:text-white">{tr("investmentsPage.header.title")}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          {(investmentsQ.data?.length ?? 0) > 0 && (
            <div className="flex rounded-xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden">
              <button
                onClick={() => setView("detail")}
                className={`px-3 py-2 text-xs font-bold transition ${view === "detail" ? "bg-emerald-600 text-white" : "text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}
              >
                {tr("investmentsPage.header.detail")}
              </button>
              <button
                onClick={() => setView("portfolio")}
                className={`px-3 py-2 text-xs font-bold transition ${view === "portfolio" ? "bg-emerald-600 text-white" : "text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"}`}
              >
                {tr("investmentsPage.header.portfolio")}
              </button>
            </div>
          )}
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["stock-quotes-all"] })}
            className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] p-2 text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition"
            title={tr("investmentsPage.header.refreshPrices")}
          >
            <RefreshCcw size={14} />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 sm:px-4 py-2 text-sm font-bold text-white shadow-sm transition"
          >
            <Plus size={15} /> <span className="hidden sm:inline">{tr("common.add")}</span><span className="sm:hidden">+</span>
          </button>
        </div>
      </div>

      {/* ── Empty state ── */}
      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-500/15">
            <TrendingUp size={36} className="text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-[#17211f] dark:text-white">{tr("investmentsPage.empty.title")}</h2>
          <p className="max-w-sm text-sm text-[#717182]">
            {tr("investmentsPage.empty.body")}
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white transition"
          >
            <Plus size={15} /> {tr("investmentsPage.empty.add")}
          </button>
        </div>
      ) : view === "portfolio" ? (
        /* ══ PORTFOLIO VIEW ════════════════════════════════════ */
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

            {/* Portfolio KPIs */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MetricBox label={tr("investmentsPage.portfolio.totalInvested")} value={compactMoney(portfolioStats.totalInvested)} />
              <MetricBox
                label={tr("investmentsPage.portfolio.currentValue")}
                value={portfolioStats.totalCurrent > 0 ? compactMoney(portfolioStats.totalCurrent) : "—"}
              />
              <MetricBox
                label={tr("investmentsPage.portfolio.gainLoss")}
                value={portfolioStats.gain >= 0 ? `+${compactMoney(portfolioStats.gain)}` : compactMoney(portfolioStats.gain)}
                accent={portfolioStats.gain >= 0 ? "text-emerald-600" : "text-rose-500"}
              />
              <MetricBox
                label={tr("investmentsPage.portfolio.performance")}
                value={pct(portfolioStats.gainPct)}
                accent={portfolioStats.gainPct >= 0 ? "text-emerald-600" : "text-rose-500"}
                sub={tr("investmentsPage.portfolio.positionsCount", { count: (investmentsQ.data ?? []).length })}
              />
            </div>

            {/* Allocation PieChart + breakdown */}
            <div className="grid gap-6 lg:grid-cols-2">

              {/* Pie */}
              <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-5">
                <h3 className="font-bold text-[#17211f] dark:text-white mb-4">{tr("investmentsPage.portfolio.allocation")}</h3>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                        dataKey="value" nameKey="name" paddingAngle={2}>
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(val: any) => [compactMoney(Number(val)), tr("investmentsPage.portfolio.value")]}
                        contentStyle={{ borderRadius: 10, fontSize: 12, border: "1px solid rgba(0,0,0,0.08)" }}
                      />
                      <Legend iconType="circle" iconSize={10} formatter={(v) => <span className="text-xs text-[#717182]">{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-[#717182] text-center py-10">{tr("investmentsPage.portfolio.pricesUnavailable")}</p>
                )}
              </div>

              {/* Position breakdown table */}
              <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] overflow-hidden">
                <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
                  <h3 className="font-bold text-[#17211f] dark:text-white">{tr("investmentsPage.portfolio.positionsDetail")}</h3>
                </div>
                <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                  {portfolioStats.breakdown.map((b) => (
                    <div key={b.name} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ background: b.color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[#17211f] dark:text-white">{b.name}</p>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${portfolioStats.totalCurrent > 0 ? Math.round((b.current / portfolioStats.totalCurrent) * 100) : 0}%`, background: b.color }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-[#17211f] dark:text-white">{compactMoney(b.current)}</p>
                        <p className={`text-xs font-semibold ${b.gainPct >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{pct(b.gainPct)}</p>
                      </div>
                      <button
                        onClick={() => { setView("detail"); setSelectedId(investmentsQ.data?.find((i) => i.ticker === b.name)?.id ?? null); }}
                        className="text-[#aaaabc] hover:text-emerald-500 transition"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Limule portfolio evaluation */}
            <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <BrainCircuit size={16} className="text-emerald-600" />
                  <h3 className="font-bold text-[#17211f] dark:text-white">{tr("investmentsPage.analysis.portfolioTitle")}</h3>
                </div>
                <button
                  onClick={handlePortfolioEval}
                  disabled={portfolioAnalysisLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-50"
                >
                  {portfolioAnalysisLoading ? <Loader2 size={12} className="animate-spin" /> : <BrainCircuit size={12} />}
                  {portfolioAnalysisLoading ? tr("investmentsPage.analysis.running") : tr("investmentsPage.analysis.evaluatePortfolio")}
                </button>
              </div>
              <div className="px-5 py-5">
                {portfolioAnalysisLoading ? (
                  <div className="flex items-center gap-3 py-6 text-[#717182]">
                    <Loader2 size={18} className="animate-spin text-emerald-500" />
                    <span className="text-sm">{tr("investmentsPage.analysis.portfolioLoading")}</span>
                  </div>
                ) : portfolioAnalysis ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {portfolioAnalysis.split("\n").map((line, i) => {
                      if (!line.trim()) return <br key={i} />;
                      const clean = line.replace(/\*\*/g, "").replace(/^#{1,3}\s+/, "");
                      const isH = /^#{1,3}\s+/.test(line) || /^\*\*.+\*\*$/.test(line);
                      return isH
                        ? <p key={i} className="font-bold text-emerald-700 dark:text-emerald-400 mt-3 mb-1">{clean}</p>
                        : <p key={i} className="text-sm text-[#17211f] dark:text-white/90 leading-relaxed mb-1">{clean}</p>;
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-[#717182] py-4 text-center">
                    {tr("investmentsPage.analysis.portfolioEmpty")}
                  </p>
                )}
              </div>
            </div>

            {/* Individual cards */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#717182] mb-3">{tr("investmentsPage.portfolio.individualPositions")}</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(investmentsQ.data ?? []).map((inv, i) => {
                  const b = portfolioStats.breakdown.find((x) => x.name === inv.ticker);
                  const isPos = (b?.gainPct ?? 0) >= 0;
                  return (
                    <div key={inv.id} className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl font-extrabold text-sm text-white"
                            style={{ background: PALETTE[i % PALETTE.length] }}>
                            {inv.ticker.slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-bold text-[#17211f] dark:text-white">{inv.ticker}</p>
                            <p className="text-[11px] text-[#717182] truncate max-w-[120px]">{inv.display_name}</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(inv)} className="rounded-lg p-1.5 text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition">
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => { setView("detail"); setSelectedId(inv.id); }}
                            className="rounded-lg p-1.5 text-[#717182] hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-600 transition"
                          >
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-[#717182]">{tr("investmentsPage.position.invested")}</p>
                          <p className="font-bold text-[#17211f] dark:text-white">{compactMoney(inv.invested_amount)}</p>
                        </div>
                        <div>
                          <p className="text-[#717182]">{tr("investmentsPage.position.currentValue")}</p>
                          <p className="font-bold text-[#17211f] dark:text-white">{b ? compactMoney(b.current) : "—"}</p>
                        </div>
                        <div>
                          <p className="text-[#717182]">{tr("investmentsPage.position.shares")}</p>
                          <p className="font-bold text-[#17211f] dark:text-white">{inv.shares.toLocaleString(i18n.language, { maximumFractionDigits: 4 })}</p>
                        </div>
                        <div>
                          <p className="text-[#717182]">{tr("investmentsPage.position.pnl")}</p>
                          <p className={`font-bold ${isPos ? "text-emerald-600" : "text-rose-500"}`}>{pct(b?.gainPct)}</p>
                        </div>
                      </div>
                      {inv.last_analysis_at && (
                        <p className="mt-2 text-[10px] text-[#aaaabc]">{tr("investmentsPage.position.limuleAnalysis", { date: inv.last_analysis_at.slice(0, 10) })}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ══ DETAIL VIEW ══════════════════════════════════════ */
        <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">

          {/* LEFT SIDEBAR — en bas sur mobile, à gauche sur desktop */}
          <div className="lg:w-64 shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-black/[0.06] dark:border-white/[0.06] overflow-y-auto max-h-60 lg:max-h-none">

            {/* Portfolio summary bar */}
            <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06] bg-black/[0.015] dark:bg-white/[0.015]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#717182]">{tr("investmentsPage.sidebar.totalPortfolio")}</p>
              <p className="mt-1 text-lg font-extrabold text-[#17211f] dark:text-white">
                {portfolioStats.totalCurrent > 0 ? compactMoney(portfolioStats.totalCurrent) : compactMoney(portfolioStats.totalInvested)}
              </p>
              <p className={`text-xs font-semibold flex items-center gap-1 ${portfolioStats.gain >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                {portfolioStats.gain >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {pct(portfolioStats.gainPct)} · {portfolioStats.gain >= 0 ? "+" : ""}{compactMoney(Math.abs(portfolioStats.gain))}
              </p>
            </div>

            {/* Investment list */}
            <div className="flex-1 py-1">
              {(investmentsQ.data ?? []).map((inv) => {
                const b = portfolioStats.breakdown.find((x) => x.name === inv.ticker);
                const isPos = (b?.gainPct ?? 0) >= 0;
                return (
                  <div key={inv.id} className="group relative">
                    <button
                      onClick={() => setSelectedId(inv.id)}
                      className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04] ${
                        selectedId === inv.id ? "bg-emerald-50 dark:bg-emerald-500/10 border-r-2 border-emerald-500" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#17211f] dark:text-white">{inv.ticker}</p>
                        <p className="text-[11px] text-[#717182] truncate">{inv.display_name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-[#17211f] dark:text-white">
                          {quotesMap.data?.[inv.ticker]?.price
                            ? quotesMap.data[inv.ticker].price!.toLocaleString(i18n.language, { maximumFractionDigits: 2 })
                            : "—"}
                        </p>
                        <p className={`text-[11px] font-bold ${isPos ? "text-emerald-600" : "text-rose-500"}`}>
                          {pct(b?.gainPct)}
                        </p>
                      </div>
                    </button>
                    {/* Edit button on hover */}
                    <button
                      onClick={() => openEdit(inv)}
                      className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 rounded p-1 text-[#717182] hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition"
                      title={tr("common.edit")}
                    >
                      <Edit2 size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT DETAIL */}
          {selected && (
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-5 space-y-5 sm:space-y-6">

                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-2xl font-extrabold text-[#17211f] dark:text-white">
                        {quote?.name || selected.display_name}
                      </h2>
                      <span className="rounded-full bg-black/[0.06] dark:bg-white/[0.08] px-2 py-0.5 text-xs font-bold text-[#717182]">
                        {selected.ticker}
                      </span>
                      {quote?.exchange && (
                        <span className="rounded-full bg-black/[0.04] dark:bg-white/[0.06] px-2 py-0.5 text-[10px] text-[#717182]">
                          {quote.exchange}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-baseline gap-3 flex-wrap">
                      {quoteQ.isLoading ? (
                        <span className="h-8 w-32 animate-pulse rounded-lg bg-black/[0.06] dark:bg-white/[0.06]" />
                      ) : (
                        <>
                          <span className="text-3xl font-extrabold text-[#17211f] dark:text-white">
                            {fmt(quote?.price)} {quote?.currency || "USD"}
                          </span>
                          <span className={`flex items-center gap-1 text-base font-bold ${(quote?.change_pct ?? 0) >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                            {(quote?.change_pct ?? 0) >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                            {quote?.change != null && `${quote.change >= 0 ? "+" : ""}${fmt(quote.change)}`}
                            {" "}({pct(quote?.change_pct)})
                          </span>
                        </>
                      )}
                    </div>
                    {quote?.sector && <p className="mt-1 text-xs text-[#717182]">{quote.sector} · {quote.industry}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(selected)}
                      className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.08] px-3 py-2 text-xs font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition"
                    >
                      <Edit2 size={12} /> {tr("common.edit")}
                    </button>
                    <button
                      onClick={() => setAlertTicker(alertTicker === selected.ticker ? null : selected.ticker)}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                        alertTicker === selected.ticker
                          ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-600/40 dark:bg-amber-500/10 dark:text-amber-400"
                          : "border-black/[0.08] dark:border-white/[0.08] text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]"
                      }`}
                    >
                      {alertTicker === selected.ticker ? <Bell size={12} /> : <BellOff size={12} />}
                      {tr("investmentsPage.alert.button")}
                    </button>
                    <button
                      onClick={() => handleDeleteInvestment(selected)}
                      className="rounded-lg border border-red-200 dark:border-red-900/40 p-2 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Price alert panel */}
                {alertTicker === selected.ticker && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-600/30 bg-amber-50/60 dark:bg-amber-500/10 px-5 py-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle size={14} className="text-amber-600" />
                      <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300">{tr("investmentsPage.alert.title")}</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-1">{tr("investmentsPage.alert.high")}</label>
                        <input type="number" value={alertHigh} onChange={(e) => setAlertHigh(e.target.value)}
                          placeholder={`> ${fmt(quote?.price)}`}
                          className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none focus:border-amber-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-1">{tr("investmentsPage.alert.low")}</label>
                        <input type="number" value={alertLow} onChange={(e) => setAlertLow(e.target.value)}
                          placeholder={`< ${fmt(quote?.price)}`}
                          className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2 text-sm text-[#17211f] dark:text-white outline-none focus:border-amber-400" />
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        localStorage.setItem(`alert_${selected.ticker}`, JSON.stringify({ high: alertHigh, low: alertLow }));
                        setAlertTicker(null);
                      }}
                      className="mt-3 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-1.5 text-xs font-bold text-white transition"
                    >
                      {tr("investmentsPage.alert.save")}
                    </button>
                  </div>
                )}

                {/* Chart */}
                <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] overflow-hidden">
                  <div className="flex gap-1 px-4 pt-4">
                    {PERIODS.map((p) => (
                      <button key={p.key} onClick={() => setPeriod(p.key)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                          period === p.key ? "bg-emerald-600 text-white" : "text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                        }`}>
                        {tr(p.tk)}
                      </button>
                    ))}
                  </div>
                  <div className="h-52 px-2 py-3">
                    {historyQ.isLoading ? (
                      <div className="flex h-full items-center justify-center">
                        <Loader2 size={22} className="animate-spin text-emerald-500" />
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gStock" x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor={chartColor} stopOpacity={0.25} />
                              <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={52}
                            tickFormatter={(v) => v.toLocaleString(i18n.language, { maximumFractionDigits: 0 })} />
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          <Tooltip content={(props: any) => <ChartTooltip {...props} currency={quote?.currency || "USD"} />} />
                          {selected.purchase_price_ref > 0 && (
                            <ReferenceLine y={selected.purchase_price_ref} stroke="#f59e0b" strokeDasharray="4 4"
                              label={{ value: tr("investmentsPage.chart.purchase"), fill: "#f59e0b", fontSize: 10, position: "insideTopLeft" }} />
                          )}
                          <Area type="monotone" dataKey="c" stroke={chartColor} fill="url(#gStock)" strokeWidth={2} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Key metrics */}
                {quote && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#717182] mb-3">{tr("investmentsPage.metrics.title")}</h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      <MetricBox label={tr("investmentsPage.metrics.marketCap")} value={quote.market_cap_fmt} />
                      <MetricBox label="P/E" value={fmt(quote.pe_ratio, 1)} />
                      <MetricBox label={tr("investmentsPage.metrics.eps")} value={fmt(quote.eps, 2)} sub={quote.currency} />
                      <MetricBox label={tr("investmentsPage.metrics.beta")} value={fmt(quote.beta, 2)} />
                      <MetricBox label={tr("investmentsPage.metrics.week52High")} value={`${fmt(quote.week52_high)} ${quote.currency}`} />
                      <MetricBox label={tr("investmentsPage.metrics.week52Low")} value={`${fmt(quote.week52_low)} ${quote.currency}`} />
                      <MetricBox label={tr("investmentsPage.metrics.open")} value={`${fmt(quote.open)} ${quote.currency}`} />
                      <MetricBox label={tr("investmentsPage.metrics.volume")} value={quote.volume ? (quote.volume / 1_000_000).toLocaleString(i18n.language, { maximumFractionDigits: 1 }) + "M" : "—"} />
                      {quote.dividend_yield != null && <MetricBox label={tr("investmentsPage.metrics.dividend")} value={`${fmt(quote.dividend_yield, 2)}%`} />}
                      {quote.sector && <MetricBox label={tr("investmentsPage.metrics.sector")} value={quote.sector} sub={quote.industry} />}
                    </div>
                  </div>
                )}

                {/* My position */}
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                      <Building2 size={13} /> {tr("investmentsPage.position.myPosition")}
                    </h3>
                    <button onClick={() => openEdit(selected)}
                      className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-600 transition">
                      <Edit2 size={11} /> {tr("common.edit")}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#717182]">{tr("investmentsPage.position.shares")}</span>
                      <span className="font-bold text-[#17211f] dark:text-white">{selected.shares.toLocaleString(i18n.language, { maximumFractionDigits: 4 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#717182]">{tr("investmentsPage.position.purchasePrice")}</span>
                      <span className="font-bold text-[#17211f] dark:text-white">{fmt(selected.purchase_price_ref)} {selected.currency_stock}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#717182]">{tr("investmentsPage.position.invested")}</span>
                      <span className="font-bold text-[#17211f] dark:text-white">{money(selected.invested_amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#717182]">{tr("investmentsPage.position.currentValue")}</span>
                      <span className="font-bold text-[#17211f] dark:text-white">
                        {invPnl ? `${invPnl.current.toLocaleString(i18n.language, { maximumFractionDigits: 2 })} ${quote?.currency || "USD"}` : "—"}
                      </span>
                    </div>
                    {invPnl && (
                      <div className="col-span-2 flex justify-between pt-2 border-t border-emerald-200/60 dark:border-emerald-500/20">
                        <span className="text-[#717182] font-medium">{tr("investmentsPage.position.gainLoss")}</span>
                        <span className={`font-extrabold text-base ${invPnl.gain >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-500"}`}>
                          {invPnl.gain >= 0 ? "+" : ""}{invPnl.gain.toLocaleString(i18n.language, { maximumFractionDigits: 2 })} {quote?.currency || "USD"}
                          {" "}({pct(invPnl.gainPct)})
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Convertisseur de devise : si l'action n'est pas en XAF, montrer l'équivalent */}
                  {invPnl && (selected.currency_stock || "USD") !== "XAF" && (
                    <div className="mt-3 pt-3 border-t border-emerald-200/60 dark:border-emerald-500/20">
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#717182]">
                        {tr("investmentsPage.position.localConversion")}
                      </p>
                      <CurrencyConverter
                        defaultAmount={Math.round(invPnl.current * 100) / 100}
                        defaultFrom={selected.currency_stock || quote?.currency || "USD"}
                        defaultTo="XAF"
                        compact
                      />
                    </div>
                  )}
                  {selected.purchase_date && (
                    <p className="mt-2 text-xs text-[#717182] flex items-center gap-1">
                      <Calendar size={11} /> {tr("investmentsPage.position.boughtOn", { date: selected.purchase_date })}
                    </p>
                  )}
                  {selected.notes && <p className="mt-2 text-xs text-[#717182] italic">{selected.notes}</p>}
                </div>

                {/* Limule analysis */}
                <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229]">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <BrainCircuit size={16} className="text-emerald-600" />
                      <h3 className="font-bold text-[#17211f] dark:text-white">{tr("investmentsPage.analysis.title")}</h3>
                    </div>
                    <div className="flex gap-2">
                      {(analysis || selected.last_analysis) && (
                        <button onClick={() => handleDownloadPdf(selected.id)}
                          className="flex items-center gap-1.5 rounded-lg border border-black/[0.08] dark:border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition">
                          <Download size={12} /> PDF
                        </button>
                      )}
                      <button onClick={handleAnalyze} disabled={analysisLoading}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-50">
                        {analysisLoading ? <Loader2 size={12} className="animate-spin" /> : <BrainCircuit size={12} />}
                        {analysisLoading ? tr("investmentsPage.analysis.analyzing") : tr("investmentsPage.analysis.generate")}
                      </button>
                    </div>
                  </div>
                  <div className="px-5 py-4">
                    {analysisLoading ? (
                      <div className="flex items-center gap-3 py-6 text-[#717182]">
                        <Loader2 size={18} className="animate-spin text-emerald-500" />
                        <span className="text-sm">{tr("investmentsPage.analysis.loadingMarket")}</span>
                      </div>
                    ) : (analysis || selected.last_analysis) ? (
                      <div>
                        {selected.last_analysis_at && !analysis && (
                          <p className="text-[10px] text-[#aaaabc] mb-3">{tr("investmentsPage.analysis.lastAnalysis", { date: selected.last_analysis_at.slice(0, 10) })}</p>
                        )}
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          {(analysis || selected.last_analysis || "").split("\n").map((line, i) => {
                            if (!line.trim()) return <br key={i} />;
                            const clean = line.replace(/\*\*/g, "").replace(/^#{1,3}\s+/, "");
                            const isH = /^#{1,3}\s+/.test(line) || /^\*\*.+\*\*$/.test(line);
                            return isH
                              ? <p key={i} className="font-bold text-emerald-700 dark:text-emerald-400 mt-3 mb-1">{clean}</p>
                              : <p key={i} className="text-sm text-[#17211f] dark:text-white/90 leading-relaxed mb-1">{clean}</p>;
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-[#717182] py-4 text-center">
                        {tr("investmentsPage.analysis.empty")}
                      </p>
                    )}
                  </div>
                </div>

                {/* Description */}
                {quote?.description && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-[#717182] flex items-center gap-2">
                        <Info size={12} /> {tr("investmentsPage.description.about")}
                      </h3>
                      <button
                        onClick={handleDescFr}
                        disabled={descFrLoading}
                        className="flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-600/30 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition disabled:opacity-50"
                      >
                        {descFrLoading ? <Loader2 size={10} className="animate-spin" /> : <Globe size={10} />}
                        {descFrLoading
                          ? tr("investmentsPage.description.translating")
                          : descFr
                            ? tr("investmentsPage.description.refreshFr")
                            : tr("investmentsPage.description.describeFr")}
                      </button>
                    </div>
                    <p className="text-sm text-[#717182] leading-relaxed line-clamp-4">{quote.description}</p>
                    {/* French description from Limule */}
                    {(descFr !== null) && (
                      <div className="mt-3 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 px-4 py-3">
                        <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mb-1.5 flex items-center gap-1">
                          <Globe size={10} /> {tr("investmentsPage.description.summaryFr")}
                        </p>
                        <p className="text-sm text-[#17211f] dark:text-white leading-relaxed">
                          {descFr || <span className="text-[#717182] animate-pulse">{tr("investmentsPage.description.limuleTranslating")}</span>}
                        </p>
                      </div>
                    )}
                    {quote.website && (
                      <a href={quote.website} target="_blank" rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline">
                        <Globe size={11} /> {quote.website}
                      </a>
                    )}
                  </div>
                )}

                {/* News françaises */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#717182] mb-3 flex items-center gap-2">
                    <BookOpen size={12} /> {tr("investmentsPage.news.french")}
                  </h3>
                  {newsQFr.isLoading ? (
                    <div className="flex items-center gap-2 text-xs text-[#717182]">
                      <Loader2 size={14} className="animate-spin" /> {tr("investmentsPage.news.loadingFrench")}
                    </div>
                  ) : (newsQFr.data ?? []).length === 0 ? (
                    <p className="text-sm text-[#717182]">{tr("investmentsPage.news.noFrench")}</p>
                  ) : (
                    <div className="space-y-2">
                      {(newsQFr.data ?? []).map((n, i) => <NewsCard key={i} item={n} />)}
                    </div>
                  )}
                </div>

                {/* News internationales */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#717182] mb-3 flex items-center gap-2">
                    <BookOpen size={12} /> {tr("investmentsPage.news.international")}
                  </h3>
                  {newsQ.isLoading ? (
                    <div className="flex items-center gap-2 text-xs text-[#717182]">
                      <Loader2 size={14} className="animate-spin" /> {tr("common.loading")}
                    </div>
                  ) : (newsQ.data ?? []).length === 0 ? (
                    <p className="text-sm text-[#717182]">{tr("investmentsPage.news.noNews")}</p>
                  ) : (
                    <div className="space-y-2">
                      {(newsQ.data ?? []).map((n, i) => <NewsCard key={i} item={n} />)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ ADD MODAL ══════════════════════════════════════════════ */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1e2229] border border-black/[0.08] dark:border-white/[0.08] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
              <h2 className="font-bold text-[#17211f] dark:text-white">{tr("investmentsPage.add.title")}</h2>
              <button onClick={() => { setShowAdd(false); setSelectedResult(null); setTickerSearch(""); setSearchResults([]); }}>
                <X size={18} className="text-[#717182]" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {!selectedResult ? (
                <div>
                  <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-1.5">{tr("investmentsPage.add.searchLabel")}</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#717182]" />
                    <input autoFocus type="text" value={tickerSearch} onChange={(e) => setTickerSearch(e.target.value)}
                      placeholder="TotalEnergies, BNP.PA, Airbus, AAPL, BP.L, SAP.DE…"
                      className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] pl-9 pr-4 py-2.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500" />
                  </div>
                  {searchResults.length > 0 && (
                    <div className="mt-1.5 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e2229] overflow-hidden shadow-lg max-h-64 overflow-y-auto">
                      {searchResults.map((r) => (
                        <button key={r.ticker} onClick={() => { setSelectedResult(r); setSearchResults([]); }}
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition border-b border-black/[0.03] dark:border-white/[0.03] last:border-0">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-[#17211f] dark:text-white">{r.ticker}</p>
                              {r.currency && <span className="text-[10px] font-semibold rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5">{r.currency}</span>}
                              <span className="text-[10px] rounded bg-black/[0.04] dark:bg-white/[0.06] text-[#717182] px-1.5 py-0.5">{r.type}</span>
                            </div>
                            <p className="text-xs text-[#717182] truncate mt-0.5">{r.name}</p>
                          </div>
                          <span className="text-[10px] text-[#aaaabc] shrink-0 ml-2 text-right max-w-[100px] leading-tight">{r.exchange}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Exchange reference guide */}
                  {!tickerSearch && (
                    <div className="mt-3 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.015] dark:bg-white/[0.03] p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#717182] mb-2 flex items-center gap-1.5">
                        <Globe size={10} /> {tr("investmentsPage.add.exchangeGuide.title")}
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-[#717182]">
                        {exchangeGuide.map((item) => (
                          <div key={item.label} className="flex flex-col">
                            <span className="font-semibold text-[#17211f] dark:text-white/70">{item.label}</span>
                            <span className="opacity-70 font-mono text-[9px]">{item.hint}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-4 py-3">
                    <div>
                      <p className="font-bold text-emerald-800 dark:text-emerald-300">{selectedResult.ticker}</p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">{selectedResult.name} · {selectedResult.exchange}</p>
                    </div>
                    <button onClick={() => setSelectedResult(null)} className="text-emerald-600 hover:text-emerald-800 transition"><X size={14} /></button>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-1.5">{tr("investmentsPage.form.investedAmount")}</label>
                    <input type="number" min="0" value={addForm.invested_amount} onChange={(e) => setAddForm((f) => ({ ...f, invested_amount: e.target.value }))}
                      placeholder="Ex : 5000"
                      className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-4 py-2.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500" />
                    <p className="mt-1 text-[10px] text-[#717182]">{tr("investmentsPage.add.sharesAuto")}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-1.5">{tr("investmentsPage.form.purchaseDateOptional")}</label>
                    <input type="date" value={addForm.purchase_date} onChange={(e) => setAddForm((f) => ({ ...f, purchase_date: e.target.value }))}
                      className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-4 py-2.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-1.5">{tr("investmentsPage.form.notesOptional")}</label>
                    <textarea rows={2} value={addForm.notes} onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder={tr("investmentsPage.form.notesPlaceholder")}
                      className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-4 py-2.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500 resize-none" />
                  </div>
                </div>
              )}
            </div>
            {selectedResult && (
              <div className="flex gap-3 px-6 py-4 border-t border-black/[0.06] dark:border-white/[0.06]">
                <button onClick={() => { setShowAdd(false); setSelectedResult(null); setTickerSearch(""); }}
                  className="flex-1 rounded-xl border border-black/[0.08] dark:border-white/[0.08] py-2.5 text-sm font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition">
                  {tr("common.cancel")}
                </button>
                <button onClick={handleAdd} disabled={!addForm.invested_amount || createMut.isPending}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 text-sm font-bold text-white transition disabled:opacity-50">
                  {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {tr("common.add")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ EDIT MODAL ═════════════════════════════════════════════ */}
      {showEdit && editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1e2229] border border-black/[0.08] dark:border-white/[0.08] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
              <h2 className="font-bold text-[#17211f] dark:text-white">
                {tr("investmentsPage.edit.title", { ticker: editTarget.ticker })}
              </h2>
              <button onClick={() => { setShowEdit(false); setEditTarget(null); }}>
                <X size={18} className="text-[#717182]" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-1.5">{tr("investmentsPage.form.shares")}</label>
                  <input type="number" step="0.0001" value={editForm.shares} onChange={(e) => setEditForm((f) => ({ ...f, shares: e.target.value }))}
                    className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-1.5">{tr("investmentsPage.form.investedAmount")}</label>
                  <input type="number" value={editForm.invested_amount} onChange={(e) => setEditForm((f) => ({ ...f, invested_amount: e.target.value }))}
                    className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-1.5">{tr("investmentsPage.form.purchasePrice", { currency: editTarget.currency_stock })}</label>
                  <input type="number" step="0.01" value={editForm.purchase_price_ref} onChange={(e) => setEditForm((f) => ({ ...f, purchase_price_ref: e.target.value }))}
                    className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-1.5">{tr("investmentsPage.form.purchaseDate")}</label>
                  <input type="date" value={editForm.purchase_date} onChange={(e) => setEditForm((f) => ({ ...f, purchase_date: e.target.value }))}
                    className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-3 py-2.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#17211f] dark:text-white mb-1.5">{tr("investmentsPage.form.notes")}</label>
                <textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252931] px-4 py-2.5 text-sm text-[#17211f] dark:text-white outline-none focus:border-emerald-500 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-black/[0.06] dark:border-white/[0.06]">
              <button onClick={() => { setShowEdit(false); setEditTarget(null); }}
                className="flex-1 rounded-xl border border-black/[0.08] dark:border-white/[0.08] py-2.5 text-sm font-semibold text-[#17211f] dark:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition">
                {tr("common.cancel")}
              </button>
              <button onClick={handleEditSave} disabled={updateMut.isPending}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 text-sm font-bold text-white transition disabled:opacity-50">
                {updateMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Edit2 size={14} />}
                {tr("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
