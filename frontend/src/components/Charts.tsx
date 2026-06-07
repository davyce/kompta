import { useTranslation } from "react-i18next";

type TrendPoint = {
  label: string;
  value: number;
  secondary?: number;
};

type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

function chartPoint(value: number, index: number, values: number[], width: number, height: number, min: number, max: number) {
  const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
  const range = Math.max(max - min, 1);
  const y = height - ((value - min) / range) * height;
  return { x, y };
}

export function LineAreaChart({
  data,
  color = "#0f766e",
  fill = "rgba(15, 118, 110, 0.14)",
  secondaryColor = "#e05252",
  min = 0,
  max
}: {
  data: TrendPoint[];
  color?: string;
  fill?: string;
  secondaryColor?: string;
  min?: number;
  max?: number;
}) {
  const { t: tr } = useTranslation();
  const width = 760;
  const height = 260;
  const primaryValues = data.map((item) => item.value);
  const secondaryValues = data.map((item) => item.secondary ?? item.value);
  const computedMax = max ?? Math.max(...primaryValues, ...secondaryValues, 10);
  const primaryPoints = primaryValues.map((value, index) => chartPoint(value, index, primaryValues, width, height, min, computedMax));
  const secondaryPoints = secondaryValues.map((value, index) => chartPoint(value, index, secondaryValues, width, height, min, computedMax));
  const primaryPath = primaryPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const secondaryPath = secondaryPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${primaryPath} L ${width} ${height} L 0 ${height} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((tick) => Math.round(min + (computedMax - min) * tick));

  return (
    <div className="h-[320px] w-full overflow-hidden">
      <svg viewBox={`0 0 ${width + 72} ${height + 58}`} className="h-full w-full" role="img" aria-label={tr("components.charts.trend")}>
        <g transform="translate(46 20)">
          {ticks.map((tick) => {
            const y = height - ((tick - min) / Math.max(computedMax - min, 1)) * height;
            return (
              <g key={tick}>
                <line x1={0} x2={width} y1={y} y2={y} stroke="#e7ece8" strokeDasharray="4 6" />
                <text x={-16} y={y + 5} textAnchor="end" className="fill-slate-400 text-[13px] font-semibold">
                  {tick}
                </text>
              </g>
            );
          })}
          {data.map((item, index) => {
            const x = primaryPoints[index].x;
            return (
              <g key={`${item.label}-${index}`}>
                <line x1={x} x2={x} y1={0} y2={height} stroke="#edf1ee" strokeDasharray="4 6" />
                <text x={x} y={height + 28} textAnchor="middle" className="fill-slate-400 text-[13px] font-semibold">
                  {item.label}
                </text>
              </g>
            );
          })}
          <path d={areaPath} fill={fill} />
          {data.some((item) => item.secondary !== undefined) ? (
            <path d={secondaryPath} fill="none" stroke={secondaryColor} strokeWidth={3} strokeLinecap="round" />
          ) : null}
          <path d={primaryPath} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
          {primaryPoints.map((point, index) => (
            <circle key={`${data[index].label}-${index}`} cx={point.x} cy={point.y} r={5} fill="white" stroke={color} strokeWidth={3} />
          ))}
        </g>
      </svg>
    </div>
  );
}

export function DonutChart({ segments, size = 210, stroke = 30 }: { segments: DonutSegment[]; size?: number; stroke?: number }) {
  const { t: tr } = useTranslation();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;

  return (
    <div className="flex flex-col items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={tr("components.charts.distribution")}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#edf1ee" strokeWidth={stroke} />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segments.map((segment) => {
            const dash = (segment.value / total) * circumference;
            const element = (
              <circle
                key={segment.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return element;
          })}
        </g>
      </svg>
      <div className="w-full space-y-2">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 font-medium text-ink">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
              {segment.label}
            </span>
            <span className="font-semibold text-stone-500">{segment.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarChart({
  data,
  color = "#0f766e",
  secondaryColor = "#e05252",
  max,
}: {
  data: TrendPoint[];
  color?: string;
  secondaryColor?: string;
  max?: number;
}) {
  const { t: tr } = useTranslation();
  const width = 760;
  const height = 220;
  const barW = Math.max(8, Math.floor((width / data.length) * 0.55));
  const gap = width / data.length;
  const primaryValues = data.map((d) => d.value);
  const secondaryValues = data.map((d) => d.secondary ?? 0);
  const computedMax = max ?? Math.max(...primaryValues, ...secondaryValues, 1);

  return (
    <div className="h-[280px] w-full overflow-hidden">
      <svg viewBox={`0 0 ${width + 72} ${height + 58}`} className="h-full w-full" role="img" aria-label={tr("components.charts.bar")}>
        <g transform="translate(46 10)">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const tick = Math.round(computedMax * t);
            const y = height - (tick / computedMax) * height;
            return (
              <g key={t}>
                <line x1={0} x2={width} y1={y} y2={y} stroke="#e7ece8" strokeDasharray="4 6" />
                <text x={-12} y={y + 4} textAnchor="end" className="fill-slate-400 text-[12px] font-semibold">{tick}</text>
              </g>
            );
          })}
          {data.map((item, i) => {
            const cx = i * gap + gap / 2;
            const pH = (item.value / computedMax) * height;
            const sH = ((item.secondary ?? 0) / computedMax) * height;
            const hasSecondary = item.secondary !== undefined && item.secondary > 0;
            return (
              <g key={item.label}>
                {hasSecondary && (
                  <rect x={cx - barW / 2 - barW * 0.6} y={height - sH} width={barW * 0.85} height={sH} fill={secondaryColor} opacity={0.7} rx={3} />
                )}
                <rect x={cx - barW / 2 + (hasSecondary ? barW * 0.1 : 0)} y={height - pH} width={barW} height={pH} fill={color} rx={3} />
                <text x={cx} y={height + 24} textAnchor="middle" className="fill-slate-400 text-[12px] font-semibold">{item.label}</text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

export function ScoreRing({ score, label = "niveau eleve" }: { score: number; label?: string }) {
  const size = 188;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(score, 100)) / 100) * circumference;

  return (
    <div className="grid place-items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${score} sur 100`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#edf1ee" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#0f766e"
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="48%" textAnchor="middle" className="fill-ink text-[42px] font-black">
          {score}
        </text>
        <text x="50%" y="62%" textAnchor="middle" className="fill-stone-500 text-[14px] font-semibold">
          /100 · {label}
        </text>
      </svg>
    </div>
  );
}
