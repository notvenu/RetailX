import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { tone } from "@/lib/format";

/* ---------------- layout ---------------- */

export function PageHeader({
  title,
  meta,
  actions,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-rule pb-4">
      <div>
        <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {meta ? (
          <p className="mt-1 text-[0.8rem] text-ink-soft">{meta}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({
  title,
  meta,
  actions,
  children,
  className = "",
}: {
  title?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mt-10 first:mt-8 ${className}`}>
      {title ? (
        <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-rule pb-2">
          <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
            {title}
          </h2>
          <div className="flex items-baseline gap-3 text-[0.78rem] text-ink-faint">
            {meta}
            {actions}
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}

/* ---------------- deltas & figures ---------------- */

export function Delta({
  value,
  label,
  suffix = "%",
  higherIsBetter = true,
  digits = 1,
}: {
  value: number;
  label?: string;
  suffix?: string;
  higherIsBetter?: boolean;
  digits?: number;
}) {
  const t = tone(value, higherIsBetter);
  const color =
    t === "good" ? "text-good" : t === "bad" ? "text-bad" : "text-ink-faint";
  const Icon = t === "good" ? ArrowUp : t === "bad" ? ArrowDown : Minus;
  const mag = Math.abs(value).toFixed(digits);
  return (
    <span className={`inline-flex items-baseline gap-1 ${color}`}>
      <Icon className="size-3 translate-y-[1px]" strokeWidth={2.25} aria-hidden />
      <span className="num font-medium">{suffix === "%" ? `${mag}%` : `${mag} ${suffix}`}</span>
      {label ? <span className="text-ink-faint">{label}</span> : null}
    </span>
  );
}

export function Figure({
  label,
  value,
  deltas = [],
  higherIsBetter = true,
  spark,
}: {
  label: string;
  value: string;
  deltas?: { value: number; label: string; suffix?: string }[];
  higherIsBetter?: boolean;
  spark?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 px-5 py-4">
      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </span>
      <span className="font-semibold tabular-nums text-[1.55rem] leading-none tracking-[-0.02em] text-ink">
        {value}
      </span>
      {deltas.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.75rem]">
          {deltas.map((d) => (
            <Delta
              key={d.label}
              value={d.value}
              label={d.label}
              suffix={d.suffix}
              higherIsBetter={higherIsBetter}
            />
          ))}
        </div>
      )}
      {spark ? <div className="mt-1">{spark}</div> : null}
    </div>
  );
}

export function FigureRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-rule border-y border-rule sm:grid-cols-2 lg:grid-cols-4 lg:divide-y-0">
      {children}
    </div>
  );
}

/* ---------------- status ---------------- */

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "flat"> = {
  Paid: "good", Received: "good", Active: "good", Healthy: "good", Approved: "good",
  Resolved: "good", Proceed: "good",
  "Part-paid": "warn", "In transit": "warn", "Ramp-up": "warn", Reorder: "warn",
  Investigating: "warn", Probation: "warn", "Proceed with conditions": "warn", Open: "warn",
  Unpaid: "bad", Overdue: "bad", Critical: "bad", "Do not proceed": "bad",
  High: "bad", Medium: "warn", Low: "flat",
};

export function StatusPill({ children }: { children: string }) {
  const t = STATUS_TONE[children] ?? "flat";
  const cls = {
    good: "text-good bg-good-wash border-good/25",
    warn: "text-warn bg-warn-wash border-warn/25",
    bad: "text-bad bg-bad-wash border-bad/25",
    flat: "text-ink-soft bg-panel border-rule-strong",
  }[t];
  return (
    <span
      className={`inline-flex items-center rounded-[3px] border px-1.5 py-0.5 text-[0.7rem] font-medium leading-none ${cls}`}
    >
      {children}
    </span>
  );
}

/* ---------------- table ---------------- */

export type Column<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  width?: string;
};

export function DataTable<T>({
  columns,
  rows,
  empty = "No records for this view.",
  getKey,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: string;
  getKey: (row: T, i: number) => string | number;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[640px] border-collapse text-[0.82rem]">
        <thead>
          <tr className="border-b border-rule-strong text-left">
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width }}
                className={`px-3 pb-2 pt-0 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-ink-faint ${
                  c.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-10 text-center text-[0.8rem] text-ink-faint"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={getKey(row, i)} className="transition-colors hover:bg-panel/70">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2.5 align-middle text-ink ${
                      c.align === "right" ? "num" : ""
                    }`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- misc ---------------- */

export function KeyValue({ items }: { items: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2.5 text-[0.82rem]">
      {items.map((it) => (
        <div key={it.k} className="contents">
          <dt className="text-ink-soft">{it.k}</dt>
          <dd className="num !text-left font-medium text-ink">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.75rem] leading-relaxed text-ink-faint">{children}</p>
  );
}
