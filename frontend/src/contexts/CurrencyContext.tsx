import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../services/api";
import { setActiveCurrency, setFxRate, type CurrencyCode } from "../utils/format";

/* ── Approximate fallback rates (XAF → target) ───────────────── */
const FALLBACK_RATES: Record<Exclude<CurrencyCode, "XAF">, number> = {
  EUR: 0.001524, // 1 XAF ≈ 0.001524 EUR  (1 EUR ≈ 656 XAF, pegged)
  USD: 0.001635, // 1 XAF ≈ 0.001635 USD  (approx. market rate)
};

async function fetchFxRate(toCurrency: Exclude<CurrencyCode, "XAF">): Promise<number> {
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=XAF&to=${toCurrency}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const rate = (data as Record<string, Record<string, number>>)?.rates?.[toCurrency];
    if (typeof rate === "number" && rate > 0) return rate;
  } catch {
    /* fall through to hardcoded fallback */
  }
  return FALLBACK_RATES[toCurrency];
}

/* ── Context type ─────────────────────────────────────────────── */
type CurrencyContextType = {
  currency: CurrencyCode;
  fxRate: number;
  setCurrency: (c: CurrencyCode) => void;
};

const CurrencyContext = createContext<CurrencyContextType>({
  currency: "XAF",
  fxRate: 1,
  setCurrency: () => {},
});

/* ── Provider ─────────────────────────────────────────────────── */
export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  // Initialize from localStorage for instant hydration (no flash)
  const [currency, _setLocalCurrency] = useState<CurrencyCode>(
    () => (localStorage.getItem("kompta_currency") as CurrencyCode) ?? "XAF"
  );
  const [fxRate, _setFxRate] = useState<number>(1);

  // Sync format.ts module var on first render
  useEffect(() => {
    setActiveCurrency(currency);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch real FX rate whenever currency changes
  useEffect(() => {
    if (currency === "XAF") {
      setFxRate(1);
      _setFxRate(1);
      return;
    }
    fetchFxRate(currency as Exclude<CurrencyCode, "XAF">).then((rate) => {
      setFxRate(rate);
      _setFxRate(rate);
    });
  }, [currency]);

  // Load persisted value from API on mount (overrides localStorage if different)
  useEffect(() => {
    api.preferences()
      .then((prefs) => {
        const c = ((prefs as Record<string, unknown>).currency as CurrencyCode) ?? "XAF";
        _setLocalCurrency(c);
        setActiveCurrency(c);
        localStorage.setItem("kompta_currency", c);
      })
      .catch(() => {/* offline — use localStorage value */});
  }, []);

  function setCurrency(c: CurrencyCode) {
    _setLocalCurrency(c);
    setActiveCurrency(c);
    localStorage.setItem("kompta_currency", c);
    // Persist to backend (fire-and-forget)
    api.updatePreferences({ currency: c }).catch(() => {});
  }

  return (
    <CurrencyContext.Provider value={{ currency, fxRate, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

/* ── Hook ─────────────────────────────────────────────────────── */
export function useCurrency() {
  return useContext(CurrencyContext);
}
