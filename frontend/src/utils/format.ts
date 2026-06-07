import i18n from "../i18n";

export type CurrencyCode = "XAF" | "EUR" | "USD" | "XOF" | "GBP" | "CNY";

/* ── Formatters ────────────────────────────────────────────────── */
function appLocale(): string {
  return i18n.language || "fr";
}

function wholeNumber(): Intl.NumberFormat {
  return new Intl.NumberFormat(appLocale(), { maximumFractionDigits: 0 });
}

function oneDecimal(): Intl.NumberFormat {
  return new Intl.NumberFormat(appLocale(), { maximumFractionDigits: 1 });
}

function currencyFormatter(currency: Exclude<CurrencyCode, "XAF" | "XOF">): Intl.NumberFormat {
  return new Intl.NumberFormat(appLocale(), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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
  if (currency === "XAF" || currency === "XOF") return `${wholeNumber().format(converted)} ${currency}`;
  return currencyFormatter(currency).format(converted);
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
  if (c === "XAF" || c === "XOF") return `${wholeNumber().format(value)} ${c}`;
  return currencyFormatter(c).format(value);
}

export function compactMoney(value: number): string {
  const c = _activeCurrency;
  const abs = Math.abs(value);
  const n0 = wholeNumber();
  const n1 = oneDecimal();

  if (c === "XAF") {
    if (abs >= 1_000_000) return `${n1.format(value / 1_000_000)} M XAF`;
    if (abs >= 1_000)     return `${n0.format(value / 1_000)} k XAF`;
    return `${n0.format(value)} XAF`;
  }

  if (c === "XOF") {
    if (abs >= 1_000_000) return `${n1.format(value / 1_000_000)} M XOF`;
    if (abs >= 1_000)     return `${n0.format(value / 1_000)} k XOF`;
    return `${n0.format(value)} XOF`;
  }

  if (c === "EUR") {
    if (abs >= 1_000_000) return `${n1.format(value / 1_000_000)} M €`;
    if (abs >= 1_000)     return `${n1.format(value / 1_000)} k €`;
    return currencyFormatter("EUR").format(value);
  }

  if (c === "GBP") {
    if (abs >= 1_000_000) return `£${n1.format(value / 1_000_000)}M`;
    if (abs >= 1_000)     return `£${n1.format(value / 1_000)}k`;
    return currencyFormatter("GBP").format(value);
  }

  if (c === "CNY") {
    if (abs >= 1_000_000) return `¥${n1.format(value / 1_000_000)}M`;
    if (abs >= 1_000)     return `¥${n1.format(value / 1_000)}k`;
    return currencyFormatter("CNY").format(value);
  }

  // USD
  if (abs >= 1_000_000) return `$${n1.format(value / 1_000_000)}M`;
  if (abs >= 1_000)     return `$${n1.format(value / 1_000)}k`;
  return currencyFormatter("USD").format(value);
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
  if (!value) return i18n.t("common.notDefined", { defaultValue: "Not defined" });
  return new Intl.DateTimeFormat(i18n.language, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

/** Affiche la date avec l'heure si fournie : "06 mai 2026 · 14h30" */
export function shortDateTime(date: string | null, time?: string | null): string {
  if (!date) return i18n.t("common.notDefined", { defaultValue: "Not defined" });
  const datePart = new Intl.DateTimeFormat(i18n.language, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
  if (!time) return datePart;
  const timePart = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(`${date}T${time}`));
  return `${datePart} · ${timePart}`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
