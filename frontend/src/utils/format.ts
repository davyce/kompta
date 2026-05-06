export type CurrencyCode = "XAF" | "EUR" | "USD";

/* ── Formatters ────────────────────────────────────────────────── */
const FR  = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const FR1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

// Pre-built formatters per currency (EUR/USD always show 2 decimal places)
const _fmt: Record<CurrencyCode, Intl.NumberFormat> = {
  XAF: FR,
  EUR: new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  USD: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

/* ── Module-level active currency (updated by CurrencyContext) ── */
let _activeCurrency: CurrencyCode =
  (localStorage.getItem("kompta_currency") as CurrencyCode) ?? "XAF";

/** FX multiplier: value (stored as XAF) × _fxRate = value in _activeCurrency */
let _fxRate = 1.0;

export function setActiveCurrency(code: CurrencyCode): void {
  _activeCurrency = code;
}

export function getActiveCurrency(): CurrencyCode {
  return _activeCurrency;
}

export function setFxRate(rate: number): void {
  _fxRate = rate > 0 ? rate : 1;
}

export function getFxRate(): number {
  return _fxRate;
}

/* ── Money helpers ─────────────────────────────────────────────── */
export function money(value: number): string {
  const c = _activeCurrency;
  if (c === "XAF") return `${FR.format(value)} XAF`;
  const converted = value * _fxRate;
  return _fmt[c].format(converted);
}

export function compactMoney(value: number): string {
  const c = _activeCurrency;
  const abs = Math.abs(value);

  if (c === "XAF") {
    if (abs >= 1_000_000) return `${FR1.format(value / 1_000_000)} M XAF`;
    if (abs >= 1_000)     return `${FR.format(value / 1_000)} k XAF`;
    return `${FR.format(value)} XAF`;
  }

  const converted = value * _fxRate;
  const absC = Math.abs(converted);

  if (c === "EUR") {
    if (absC >= 1_000_000) return `${FR1.format(converted / 1_000_000)} M €`;
    if (absC >= 1_000)     return `${FR1.format(converted / 1_000)} k €`;
    return _fmt.EUR.format(converted);
  }

  // USD
  if (absC >= 1_000_000) return `$${FR1.format(converted / 1_000_000)}M`;
  if (absC >= 1_000)     return `$${FR1.format(converted / 1_000)}k`;
  return _fmt.USD.format(converted);
}

/** Short currency label for display (e.g. "XAF", "€", "$") */
export function currencyLabel(): string {
  if (_activeCurrency === "EUR") return "€";
  if (_activeCurrency === "USD") return "$";
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
