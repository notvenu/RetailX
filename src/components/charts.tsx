import { moneyCompact } from "@/lib/format";

/* ---------------- Sparkline ---------------- */

export function Sparkline({
  data,
  width = 132,
  height = 30,
  tone = "accent",
}: {
  data: number[];
  width?: number;
  height?: number;
  tone?: "accent" | "good" | "bad" | "soft";
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const d = data.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const stroke = {
    accent: "var(--color-accent)",
    good: "var(--color-good)",
    bad: "var(--color-bad)",
    soft: "var(--color-ink-faint)",
  }[tone];
  return (
    <svg width={width} height={height} className="block" aria-hidden>
      <line x1="0" y1={height - 2} x2={width} y2={height - 2} stroke="var(--color-rule)" strokeWidth="1" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(data.length - 1) * step} cy={y(data[data.length - 1])} r="2" fill={stroke} />
    </svg>
  );
}

/* ---------------- Line chart with optional confidence band ---------------- */

type LinePoint = {
  x: string;
  actual?: number | null;
  predicted?: number | null;
  lower?: number | null;
  upper?: number | null;
};

export function LineChart({
  points,
  showBand = false,
  showPredicted = false,
  valueFormat = moneyCompact,
  height = 260,
}: {
  points: LinePoint[];
  showBand?: boolean;
  showPredicted?: boolean;
  valueFormat?: (n: number) => string;
  height?: number;
}) {
  const W = 760;
  const H = height;
  const padL = 56;
  const padR = 16;
  const padT = 14;
  const padB = 26;
  const iw = W - padL - padR;
  const ih = H - padT - padB;

  const all = points.flatMap((p) =>
    [p.actual, p.predicted, p.lower, p.upper].filter((v): v is number => v != null),
  );
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.12 || 1;
  const lo = min - pad;
  const hi = max + pad;

  const x = (i: number) => padL + (i / (points.length - 1)) * iw;
  const y = (v: number) => padT + ih - ((v - lo) / (hi - lo)) * ih;

  const line = (key: "actual" | "predicted") => {
    let d = "";
    let started = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (v == null) {
        started = false;
        return;
      }
      d += `${started ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      started = true;
    });
    return d.trim();
  };

  let band = "";
  if (showBand) {
    const up = points.map((p, i) => `${x(i).toFixed(1)},${y((p.upper ?? p.predicted ?? p.actual)!).toFixed(1)}`);
    const dn = points
      .map((p, i) => `${x(i).toFixed(1)},${y((p.lower ?? p.predicted ?? p.actual)!).toFixed(1)}`)
      .reverse();
    band = `M${up.join(" L")} L${dn.join(" L")} Z`;
  }

  const ticks = 4;
  const gridVals = Array.from({ length: ticks + 1 }, (_, i) => lo + ((hi - lo) * i) / ticks);
  const forecastStart = points.findIndex((p) => p.actual == null && p.predicted != null);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Trend chart">
      {gridVals.map((v, i) => (
        <g key={i}>
          <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="var(--color-rule)" strokeWidth="1" />
          <text x={padL - 8} y={y(v) + 3} textAnchor="end" className="fill-ink-faint" style={{ fontSize: 10 }}>
            {valueFormat(v)}
          </text>
        </g>
      ))}

      {forecastStart > 0 && (
        <line
          x1={x(forecastStart - 0.5)}
          y1={padT}
          x2={x(forecastStart - 0.5)}
          y2={padT + ih}
          stroke="var(--color-rule-strong)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      )}

      {showBand && band && <path d={band} fill="var(--color-accent)" fillOpacity="0.08" stroke="none" />}

      {showPredicted && (
        <path
          d={line("predicted")}
          fill="none"
          stroke="var(--color-ink-soft)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
      )}
      <path d={line("actual")} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />

      {points.map((p, i) =>
        p.actual != null ? (
          <circle key={i} cx={x(i)} cy={y(p.actual)} r="2.5" fill="var(--color-accent)" />
        ) : null,
      )}

      {points.map((p, i) =>
        i % 2 === 0 || i === points.length - 1 ? (
          <text
            key={`l${i}`}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            className="fill-ink-faint"
            style={{ fontSize: 10 }}
          >
            {p.x}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/* ---------------- Horizontal composition bars ---------------- */

export function BarComposition({
  items,
  format = moneyCompact,
}: {
  items: { label: string; value: number; hint?: string }[];
  format?: (n: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.value)) || 1;
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it) => (
        <li key={it.label} className="grid grid-cols-[10rem_1fr_auto] items-center gap-3 text-[0.8rem]">
          <span className="truncate text-ink-soft">{it.label}</span>
          <span className="h-2 rounded-[2px] bg-panel-deep">
            <span
              className="block h-full rounded-[2px] bg-accent/75"
              style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }}
            />
          </span>
          <span className="num font-medium text-ink">
            {format(it.value)}
            {it.hint ? <span className="ml-2 text-ink-faint">{it.hint}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
