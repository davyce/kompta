const FR = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const FR1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function money(value: number): string {
  return `${FR.format(value)} XAF`;
}

export function compactMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${FR1.format(value / 1_000_000)} M XAF`;
  if (abs >= 1_000) return `${FR.format(value / 1_000)} k XAF`;
  return `${FR.format(value)} XAF`;
}

export function shortDate(value: string | null): string {
  if (!value) {
    return "Non defini";
  }
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(value)
  );
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
