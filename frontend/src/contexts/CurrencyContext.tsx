import { createContext, useContext, useEffect, useState } from "react";
import { api, getToken } from "../services/api";
import { setActiveCurrency, convertCurrency, formatInCurrency, type CurrencyCode } from "../utils/format";

export const SUPPORTED_CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: "XAF", label: "XAF — Franc CFA BEAC" },
  { code: "XOF", label: "XOF — Franc CFA BCEAO" },
  { code: "EUR", label: "EUR — Euro €" },
  { code: "USD", label: "USD — Dollar américain $" },
  { code: "GBP", label: "GBP — Livre sterling £" },
  { code: "CNY", label: "CNY — Yuan chinois ¥" },
];

/* ── Context type ─────────────────────────────────────────────── */
type CurrencyContextType = {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  convert: (amount: number, from?: CurrencyCode, to?: CurrencyCode) => number;
  formatInCurrency: (amount: number, currency?: CurrencyCode) => string;
};

const CurrencyContext = createContext<CurrencyContextType>({
  currency: "XAF",
  setCurrency: () => {},
  convert: (amount) => amount,
  formatInCurrency: (amount) => `${amount} XAF`,
});

/* ── Provider ─────────────────────────────────────────────────── */
export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  // Initialize from localStorage for instant hydration (no flash)
  const [currency, _setLocalCurrency] = useState<CurrencyCode>(
    () => (localStorage.getItem("kompta_currency") as CurrencyCode) ?? "XAF"
  );

  // Sync format.ts module var on first render
  useEffect(() => {
    setActiveCurrency(currency);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load persisted value from API on mount (overrides localStorage if different)
  useEffect(() => {
    if (!getToken()) return;
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
    if (getToken()) {
      api.updatePreferences({ currency: c }).catch(() => {});
    }
  }

  return (
    <CurrencyContext.Provider value={{
      currency,
      setCurrency,
      convert: (amount, from = "XAF", to = currency) => convertCurrency(amount, from, to),
      formatInCurrency: (amount, curr = currency) => formatInCurrency(amount, curr),
    }}>
      {children}
    </CurrencyContext.Provider>
  );
}

/* ── Hook ─────────────────────────────────────────────────────── */
export function useCurrency() {
  return useContext(CurrencyContext);
}
