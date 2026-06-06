import { useEffect, useMemo, useState } from "react";
import { ArrowRight, RefreshCcw } from "lucide-react";
import { api } from "../services/api";

const DEFAULT_CURRENCIES = ["XAF", "EUR", "USD", "GBP", "CAD"];

type Props = {
  defaultAmount?: number;
  defaultFrom?: string;
  defaultTo?: string;
  currencies?: string[];
  compact?: boolean;
  className?: string;
};

/**
 * Widget compact de conversion de devises.
 * Fait appel au backend /currency/convert qui gère cache + fallback déterministe.
 */
export function CurrencyConverter({
  defaultAmount = 1000,
  defaultFrom = "XAF",
  defaultTo = "EUR",
  currencies = DEFAULT_CURRENCIES,
  compact = false,
  className = "",
}: Props) {
  const [amount, setAmount] = useState<number>(defaultAmount);
  const [from, setFrom] = useState<string>(defaultFrom);
  const [to, setTo] = useState<string>(defaultTo);
  const [converted, setConverted] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [source, setSource] = useState<string>("");
  const [certified, setCertified] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRate = useMemo(
    () => async () => {
      if (!amount || !from || !to) return;
      setLoading(true);
      setError(null);
      try {
        const data = await api.currencyConvert(amount, from, to);
        setConverted(data.converted);
        setRate(data.rate);
        setSource(data.source);
        // `certified` absent (anciens backends) → on déduit de la source.
        setCertified(data.certified ?? (data.source === "api" || data.source === "cache" || data.source === "identity"));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [amount, from, to]
  );

  useEffect(() => {
    fetchRate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <div
      className={`rounded-xl border border-black/[0.06] bg-white p-3 dark:bg-[#1e2229] dark:border-white/[0.06] ${className}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
          onBlur={fetchRate}
          className="w-28 rounded-md border border-black/[0.08] bg-white dark:bg-[#252931] dark:border-white/[0.08] px-2 py-1.5 text-sm font-mono text-[#17211f] dark:text-white"
        />
        <select
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md border border-black/[0.08] bg-white dark:bg-[#252931] dark:border-white/[0.08] px-2 py-1.5 text-sm font-semibold text-[#17211f] dark:text-white"
        >
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={swap}
          className="grid h-7 w-7 place-items-center rounded-md text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition"
          title="Inverser"
        >
          <ArrowRight size={14} />
        </button>
        <select
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-md border border-black/[0.08] bg-white dark:bg-[#252931] dark:border-white/[0.08] px-2 py-1.5 text-sm font-semibold text-[#17211f] dark:text-white"
        >
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={fetchRate}
          className="grid h-7 w-7 place-items-center rounded-md text-[#717182] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition"
          title="Rafraîchir"
          disabled={loading}
        >
          <RefreshCcw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
        {error ? (
          <p className="text-xs text-rose-500">{error}</p>
        ) : converted !== null ? (
          <>
            <span className={`font-mono font-bold text-[#17211f] dark:text-white ${compact ? "text-sm" : "text-lg"}`}>
              {converted.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} {to}
            </span>
            {rate !== null && (
              <span className="text-[11px] text-[#717182]">
                1 {from} = {rate.toLocaleString("fr-FR", { maximumFractionDigits: 6 })} {to}
              </span>
            )}
            {source && (
              <span className="text-[10px] uppercase tracking-wider text-[#717182] opacity-70">
                {source}
              </span>
            )}
            {!certified && (
              <span
                className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                title="Taux estimé hors-ligne — non certifié temps réel"
              >
                ⚠ taux estimé
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-[#717182]">Chargement…</span>
        )}
      </div>
    </div>
  );
}
