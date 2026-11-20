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
        <h1 suppressHydrationWarning className="text-[1.35rem] font-semibold tracking-[-0.02em] text-ink">
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
  Paid: "good", Received: "good", Active: "good", Completed: "good", Delivered: "good", Won: "good", Confirmed: "good",
  "Checked-in": "good", Done: "good", done: "good", Yes: "good", good: "good",
  "Part-paid": "warn", Ordered: "warn", Shipped: "warn", Placed: "warn", Proposal: "warn", Contacted: "warn", Probation: "warn",
  Pending: "warn", Booked: "warn", "On hold": "warn", "On leave": "warn", doing: "warn", watch: "warn", New: "warn",
  "Order now": "bad", "Order soon": "warn", Enough: "good",
  Unpaid: "bad", Overdue: "bad", "No-show": "bad", Returned: "bad", Lost: "bad", Cancelled: "bad", Dropped: "bad", No: "bad", bad: "bad",
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
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[0.7rem] font-medium leading-none ${cls}`}
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
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: string;
  getKey: (row: T, i: number) => string | number;
  rowClassName?: (row: T, i: number) => string;
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
              <tr key={getKey(row, i)} className={`transition-colors hover:bg-panel/70 ${rowClassName?.(row, i) ?? ""}`}>
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

/* ---------------- controls ---------------- */

export const control =
  "min-w-0 rounded-sm border border-rule-strong bg-surface px-2.5 py-1.5 text-[0.84rem] text-ink outline-none transition-colors focus-visible:border-accent";
export const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-sm px-3.5 py-1.5 text-[0.82rem] font-medium transition-colors disabled:opacity-50";
export const btnPrimary = `${btn} bg-accent text-white hover:bg-accent-hover`;
export const btnGhost = `${btn} border border-rule-strong text-ink-soft hover:border-accent hover:text-accent`;
export const btnQuiet = `${btn} text-ink-soft hover:bg-panel hover:text-ink`;

export function Label({ text, hint, children }: { text: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">{text}</span>
      {children}
      {hint ? <span className="text-[0.72rem] text-ink-faint">{hint}</span> : null}
    </label>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border border-dashed border-rule-strong px-6 py-10 text-center">
      <p className="text-[0.9rem] font-medium text-ink">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-[0.8rem] leading-relaxed text-ink-soft">{children}</div> : null}
    </div>
  );
}

/** Just enough markdown for AI replies: paragraphs, `- ` bullets, **bold**, `code`. Text only, no HTML. */
export function Prose({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
      part.startsWith("**") ? <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
        : part.startsWith("`") ? <code key={i} className="rounded-sm bg-panel px-1 text-[0.78rem] text-ink">{part.slice(1, -1)}</code>
        : part,
    );
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2.5 text-[0.84rem] leading-relaxed text-ink-soft">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s/.test(l)))
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-ink-faint">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s/, ""))}</li>)}
            </ul>
          );
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>{j ? <br /> : null}{/^\s*[-*•]\s/.test(l) ? "• " : ""}{inline(l.replace(/^#+\s*/, "").replace(/^\s*[-*•]\s/, ""))}</span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/* ---------------- choice controls (used inside client components) ---------------- */

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-rule-strong"}`}
    >
      <span className={`absolute top-0.5 size-4 rounded-full bg-surface shadow transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-sm border border-rule-strong bg-panel/60 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-sm px-2.5 py-1 text-[0.78rem] transition-colors ${o.value === value ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-ink-soft hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[0.78rem] transition-colors ${on ? "border-accent bg-accent-wash text-accent" : "border-rule-strong text-ink-soft hover:border-ink-faint hover:text-ink"}`}
    >
      {children}
    </button>
  );
}
