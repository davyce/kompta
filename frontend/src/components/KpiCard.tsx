import type { LucideIcon } from "lucide-react";

type KpiCardProps = {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  tone?: string;
  trend?: string;
  trendTone?: "green" | "red" | "blue";
};

export function KpiCard({ label, value, detail, icon: Icon, tone = "bg-emerald-600", trend, trendTone = "green" }: KpiCardProps) {
  const trendClass = trendTone === "red" ? "bg-red-50 text-red-700" : trendTone === "blue" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-600";
  return (
    <article className="rounded-lg border border-black/[0.06] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-[#717182]">{label}</p>
          <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-lg text-white ${tone}`}>
          <Icon size={19} />
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm text-[#717182]">{detail}</p>
        {trend ? <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${trendClass}`}>{trend}</span> : null}
      </div>
    </article>
  );
}
