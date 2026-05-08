export type CurrencyCode = "XAF" | "EUR" | "USD" | "XOF" | "GBP" | "CNY";

/* ── Formatters ────────────────────────────────────────────────── */
const FR  = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const FR1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

// Pre-built formatters per currency
const _fmt: Record<CurrencyCode, Intl.NumberFormat> = {
  XAF: FR,
  EUR: new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  USD: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  XOF: FR,
  GBP: new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  CNY: new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

/* ── Exchange rates (relative to XAF as base) ── */
export const EXCHANGE_RATES: Record<CurrencyCode, number> = {
  XAF: 1,
  USD: 0.00163,
  EUR: 0.00152,
  XOF: 1,
  GBP: 0.00128,
  CNY: 0.01183,
};

/** Convert amount from one currency to another (XAF as pivot) */
export function convertCurrency(amount: number, from: CurrencyCode = "XAF", to: CurrencyCode = "XAF"): number {
  if (from === to) return amount;
  const inXaf = amount / EXCHANGE_RATES[from];
  return inXaf * EXCHANGE_RATES[to];
}

/** Format an amount in a specific currency (converts from XAF if needed) */
export function formatInCurrency(amount: number, currency: CurrencyCode = "XAF"): string {
  const converted = convertCurrency(amount, "XAF", currency);
  if (currency === "XAF" || currency === "XOF") return `${FR.format(converted)} ${currency}`;
  return _fmt[currency].format(converted);
}

/* ── Module-level active currency (updated by CurrencyContext) ── */
let _activeCurrency: CurrencyCode = (() => {
  try {
    return (localStorage.getItem("kompta_currency") as CurrencyCode) ?? "XAF";
  } catch {
    return "XAF";
  }
})();

export function setActiveCurrency(code: CurrencyCode): void {
  _activeCurrency = code;
}

export function getActiveCurrency(): CurrencyCode {
  return _activeCurrency;
}

/* ── Money helpers — NO FX CONVERSION, just format with currency symbol ── */

/**
 * Format a monetary value in the active currency.
 * Values are stored and displayed as-is — no XAF↔EUR/USD conversion.
 */
export function money(value: number): string {
  const c = _activeCurrency;
  if (c === "XAF" || c === "XOF") return `${FR.format(value)} ${c}`;
  return _fmt[c].format(value);
}

export function compactMoney(value: number): string {
  const c = _activeCurrency;
  const abs = Math.abs(value);

  if (c === "XAF") {
    if (abs >= 1_000_000) return `${FR1.format(value / 1_000_000)} M XAF`;
    if (abs >= 1_000)     return `${FR.format(value / 1_000)} k XAF`;
    return `${FR.format(value)} XAF`;
  }

  if (c === "XOF") {
    if (abs >= 1_000_000) return `${FR1.format(value / 1_000_000)} M XOF`;
    if (abs >= 1_000)     return `${FR.format(value / 1_000)} k XOF`;
    return `${FR.format(value)} XOF`;
  }

  if (c === "EUR") {
    if (abs >= 1_000_000) return `${FR1.format(value / 1_000_000)} M €`;
    if (abs >= 1_000)     return `${FR1.format(value / 1_000)} k €`;
    return _fmt.EUR.format(value);
  }

  if (c === "GBP") {
    if (abs >= 1_000_000) return `£${FR1.format(value / 1_000_000)}M`;
    if (abs >= 1_000)     return `£${FR1.format(value / 1_000)}k`;
    return _fmt.GBP.format(value);
  }

  if (c === "CNY") {
    if (abs >= 1_000_000) return `¥${FR1.format(value / 1_000_000)}M`;
    if (abs >= 1_000)     return `¥${FR1.format(value / 1_000)}k`;
    return _fmt.CNY.format(value);
  }

  // USD
  if (abs >= 1_000_000) return `$${FR1.format(value / 1_000_000)}M`;
  if (abs >= 1_000)     return `$${FR1.format(value / 1_000)}k`;
  return _fmt.USD.format(value);
}

/** Short currency label for display (e.g. "XAF", "€", "$") */
export function currencyLabel(): string {
  if (_activeCurrency === "EUR") return "€";
  if (_activeCurrency === "USD") return "$";
  if (_activeCurrency === "GBP") return "£";
  if (_activeCurrency === "CNY") return "¥";
  if (_activeCurrency === "XOF") return "XOF";
  return "XAF";
}

/* ── Date helpers ──────────────────────────────────────────────── */
export function shortDate(value: string | null): string {
  if (!value) return "Non défini";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

/** Affiche la date avec l'heure si fournie : "06 mai 2026 · 14h30" */
export function shortDateTime(date: string | null, time?: string | null): string {
  if (!date) return "Non défini";
  const datePart = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
  if (!time) return datePart;
  return `${datePart} · ${time.slice(0, 5).replace(":", "h")}`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
