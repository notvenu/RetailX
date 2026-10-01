"use client";

import { useState, type ReactNode } from "react";
import { Play, Plus, Loader2 } from "lucide-react";
import { Figure, FigureRow, DataTable, StatusPill, Note } from "@/components/ui";
import { LineChart } from "@/components/charts";
import { money, moneyCompact, num, pct } from "@/lib/format";
import { PNL, PRODUCTS, ORG } from "@/lib/mock";

/* ---------------- shared ---------------- */

function usePredict<R>(kind: string) {
  const [result, setResult] = useState<R | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (inputs: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, ...inputs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The model could not run.");
      setResult(data as R);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return { result, error, busy, run };
}

const input =
  "w-full rounded-[4px] border border-rule-strong bg-white px-2 py-1.5 text-[0.82rem] tabular-nums text-ink outline-none focus-visible:border-accent";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">{label}</span>
      {children}
      {hint ? <span className="text-[0.7rem] text-ink-faint">{hint}</span> : null}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 self-end pb-1.5 text-[0.82rem] text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
      {label}
    </label>
  );
}

function PredictForm({
  title,
  meta,
  onRun,
  busy,
  error,
  children,
  result,
}: {
  title: string;
  meta: string;
  onRun: () => void;
  busy: boolean;
  error: string | null;
  children: ReactNode;
  result: ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-2">
        <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">{title}</h2>
        <span className="text-[0.78rem] text-ink-faint">{meta}</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onRun();
        }}
        className="grid gap-x-5 gap-y-3 border border-rule bg-panel/50 p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {children}
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-[4px] bg-accent px-4 py-1.5 text-[0.8rem] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {busy ? "Running model…" : "Run prediction"}
          </button>
          {error ? <span role="alert" className="text-[0.78rem] text-bad">{error}</span> : null}
        </div>
      </form>
      {result ? <div className="mt-4" aria-live="polite">{result}</div> : null}
    </section>
  );
}

const digits = (s: string) => s.replace(/[^0-9.]/g, "");

/* ---------------- revenue: refit Holt on the user's months ---------------- */

type ForecastResult = {
  points: { x: string; actual: number | null; predicted: number; lower: number; upper: number }[];
  model: { name: string; mape: number; mae: number; trainedOn: string; validation: string; limits: string };
};

const END = new Date(2026, 8, 1); // September 2026, the last closed month in ml/data/monthly_closes.csv
const monthLabel = (offsetFromEnd: number) => {
  const d = new Date(END.getFullYear(), END.getMonth() + offsetFromEnd, 1);
  return d.toLocaleString("en-GB", { month: "short", year: "2-digit" });
};
const monthKey = (offsetFromEnd: number) => {
  const d = new Date(END.getFullYear(), END.getMonth() + offsetFromEnd, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function RevenuePredictor() {
  const [values, setValues] = useState(PNL.map((r) => String(r.revenue)));
  const [added, setAdded] = useState(0); // months logged after September
  const [horizon, setHorizon] = useState("4");
  const { result, error, busy, run } = usePredict<ForecastResult>("revenue");
  const first = -(values.length - 1 - added);

  const next = result?.points.find((p) => p.actual == null);
  const lastActual = Number(values[values.length - 1]);

  return (
    <PredictForm
      title="Predict revenue"
      meta="edit or add months, then refit Holt's damped trend"
      busy={busy}
      error={error}
      onRun={() => run({ revenue: values.map(Number), end: monthKey(added), horizon: Number(horizon) })}
      result={
        result && next ? (
          <>
            <FigureRow>
              <Figure label={`${next.x} forecast`} value={moneyCompact(next.predicted)} deltas={[{ value: ((next.predicted - lastActual) / lastActual) * 100, label: "vs last month" }]} />
              <Figure label="90% interval" value={`${moneyCompact(next.lower)} – ${moneyCompact(next.upper)}`} />
              <Figure label="Back-test MAPE" value={pct(result.model.mape)} />
              <Figure label="Trained on" value={result.model.trainedOn} />
            </FigureRow>
            <div className="mt-4">
              <LineChart points={result.points} showBand showPredicted height={260} />
            </div>
            <Note>{result.model.validation}. {result.model.limits}</Note>
          </>
        ) : null
      }
    >
      <div className="grid grid-cols-3 gap-x-3 gap-y-2 sm:col-span-2 sm:grid-cols-4 lg:col-span-4 lg:grid-cols-7">
        {values.map((v, i) => (
          <Field key={i} label={monthLabel(first + i)}>
            <input
              className={input}
              inputMode="numeric"
              value={v ? Number(v).toLocaleString("en-IN") : ""}
              onChange={(e) => setValues((vs) => vs.map((x, j) => (j === i ? digits(e.target.value) : x)))}
            />
          </Field>
        ))}
        <button
          type="button"
          onClick={() => {
            setValues((vs) => [...vs, ""]);
            setAdded((a) => a + 1);
          }}
          className="inline-flex items-center justify-center gap-1 self-end rounded-[4px] border border-dashed border-rule-strong py-1.5 text-[0.78rem] text-ink-soft hover:border-accent hover:text-accent"
        >
          <Plus className="size-3.5" /> {monthLabel(added + 1)}
        </button>
      </div>
      <Field label="Months to predict">
        <select className={input} value={horizon} onChange={(e) => setHorizon(e.target.value)}>
          {[1, 2, 3, 4, 6, 9, 12].map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </Field>
    </PredictForm>
  );
}

/* ---------------- one day's sales ---------------- */

type DayResult = {
  date: string; revenue: number; footfall: number; avgTicket: number | null; lower: number; upper: number;
  baseRevenue: number; salesEffect: number; footfallEffect: number; baseFrom: string;
};

export function DayPredictor() {
  const [v, setV] = useState({ date: "2026-10-01", promo: false, school: false, uplift: "", baseRevenue: "", baseFootfall: "" });
  const set = (k: keyof typeof v) => (x: string | boolean) => setV((s) => ({ ...s, [k]: x }));
  const { result: r, error, busy, run } = usePredict<DayResult>("day");
  const effect = (x: number) => `${x >= 1 ? "+" : "−"}${Math.abs((x - 1) * 100).toFixed(1)}%`;

  return (
    <PredictForm
      title="Predict a day's sales"
      meta="your weekday baseline × promo effect learnt from 1,115 Rossmann stores (LightGBM)"
      busy={busy}
      error={error}
      onRun={() => run({ ...v, uplift: Number(v.uplift) || 0 })}
      result={
        r ? (
          <>
            <FigureRow>
              <Figure label={`Revenue · ${r.date}`} value={money(r.revenue)} deltas={[{ value: (r.revenue / r.baseRevenue - 1) * 100, label: "vs usual day" }]} />
              <Figure label="90% range" value={`${moneyCompact(r.lower)} – ${moneyCompact(r.upper)}`} />
              <Figure label="Footfall" value={num(r.footfall)} />
              <Figure label="Average ticket" value={r.avgTicket ? money(r.avgTicket) : "—"} />
            </FigureRow>
            <Note>
              Baseline {money(r.baseRevenue)} ({r.baseFrom}). Model effect on sales {effect(r.salesEffect)}, on footfall {effect(r.footfallEffect)}
              {Number(v.uplift) ? `, plus your ${v.uplift}% festival uplift` : ""}.
            </Note>
          </>
        ) : null
      }
    >
      <Field label="Date"><input type="date" className={input} value={v.date} onChange={(e) => set("date")(e.target.value)} /></Field>
      <Field label="Usual revenue" hint="blank = from day book"><input className={input} inputMode="numeric" placeholder="auto" value={v.baseRevenue} onChange={(e) => set("baseRevenue")(digits(e.target.value))} /></Field>
      <Field label="Usual footfall" hint="blank = from day book"><input className={input} inputMode="numeric" placeholder="auto" value={v.baseFootfall} onChange={(e) => set("baseFootfall")(digits(e.target.value))} /></Field>
      <Field label="Festival uplift %" hint="your own estimate; the model has no Indian festivals"><input className={input} inputMode="numeric" placeholder="0" value={v.uplift} onChange={(e) => set("uplift")(e.target.value.replace(/[^0-9.-]/g, ""))} /></Field>
      <Check label="Store-wide promotion" checked={v.promo} onChange={set("promo")} />
      <Check label="School holiday" checked={v.school} onChange={set("school")} />
    </PredictForm>
  );
}

/* ---------------- product demand ---------------- */

type DemandResult = {
  name: string; from: string; to: string; forecast: number; safety: number; onHand: number;
  order: number; daysCover: number | null; method: string;
};

export function DemandPredictor() {
  const [sku, setSku] = useState(PRODUCTS[0].sku);
  const [onHand, setOnHand] = useState(String(PRODUCTS[0].onHand));
  const [horizon, setHorizon] = useState("16");
  const [service, setService] = useState("95");
  const [uplift, setUplift] = useState("");
  const { result: r, error, busy, run } = usePredict<DemandResult>("demand");

  return (
    <PredictForm
      title="Predict demand for a product"
      meta="pick a SKU and change any assumption"
      busy={busy}
      error={error}
      onRun={() => run({ sku, onHand: Number(onHand), horizon: Number(horizon), service: Number(service), uplift: Number(uplift) || 0 })}
      result={
        r ? (
          <>
            <FigureRow>
              <Figure label={`Demand ${r.from} – ${r.to}`} value={`${num(r.forecast)} units`} />
              <Figure label="Safety stock" value={`${num(r.safety)} units`} />
              <Figure label="Order now" value={`${num(r.order)} units`} />
              <Figure label="Stock lasts" value={r.daysCover == null ? "—" : `${r.daysCover} days`} />
            </FigureRow>
            <Note>{r.name}. {r.method}.</Note>
          </>
        ) : null
      }
    >
      <Field label="Product">
        <select
          className={input}
          value={sku}
          onChange={(e) => {
            setSku(e.target.value);
            setOnHand(String(PRODUCTS.find((p) => p.sku === e.target.value)?.onHand ?? ""));
          }}
        >
          {PRODUCTS.map((p) => <option key={p.sku} value={p.sku}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="On hand now"><input className={input} inputMode="numeric" value={onHand} onChange={(e) => setOnHand(digits(e.target.value))} /></Field>
      <Field label="Days ahead"><input className={input} inputMode="numeric" value={horizon} onChange={(e) => setHorizon(digits(e.target.value))} /></Field>
      <Field label="Service level">
        <select className={input} value={service} onChange={(e) => setService(e.target.value)}>
          {["90", "95", "98", "99"].map((s) => <option key={s} value={s}>{s}% of days in stock</option>)}
        </select>
      </Field>
      <Field label="Expected uplift %" hint="promo or festival, your estimate"><input className={input} inputMode="numeric" placeholder="0" value={uplift} onChange={(e) => setUplift(e.target.value.replace(/[^0-9.-]/g, ""))} /></Field>
    </PredictForm>
  );
}

/* ---------------- check a day for anomalies ---------------- */

type AnomalyResult = {
  date: string;
  rows: { metric: string; actual: string; expected: string; deviation: string; z: number; threshold: number; verdict: string }[];
};

const DAY_FIELDS = [
  { name: "revenue", label: "Revenue (₹)", placeholder: "98000" },
  { name: "gross_margin_pct", label: "Gross margin %", placeholder: "19.5" },
  { name: "avg_discount_pct", label: "Avg. discount %", placeholder: "2.1" },
  { name: "footfall", label: "Footfall", placeholder: "450" },
  { name: "shrinkage_inr", label: "Shrinkage (₹)", placeholder: "800" },
  { name: "stockout_rate_pct", label: "Stock-out rate %", placeholder: "1.6" },
];

export function AnomalyCheck() {
  const [v, setV] = useState<Record<string, string>>({ date: "2026-10-01" });
  const { result: r, error, busy, run } = usePredict<AnomalyResult>("anomaly");

  return (
    <PredictForm
      title="Check a day"
      meta={`enter any of the day's figures · scored against ${ORG.name}'s September weekdays`}
      busy={busy}
      error={error}
      onRun={() => run(v)}
      result={
        r ? (
          <DataTable
            getKey={(x) => x.metric}
            rows={r.rows}
            columns={[
              { key: "m", header: `Metric · ${r.date}`, render: (x) => <span className="font-medium">{x.metric}</span> },
              { key: "a", header: "Entered", align: "right", render: (x) => x.actual },
              { key: "e", header: "Expected", align: "right", render: (x) => <span className="text-ink-soft">{x.expected}</span> },
              { key: "d", header: "Deviation", align: "right", render: (x) => x.deviation },
              { key: "z", header: "Score / flag at", align: "right", render: (x) => <span className="text-ink-soft">{x.z} / {x.threshold}</span> },
              { key: "v", header: "Verdict", align: "right", render: (x) => <StatusPill>{x.verdict}</StatusPill> },
            ]}
          />
        ) : null
      }
    >
      <Field label="Date"><input type="date" className={input} value={v.date} onChange={(e) => setV((s) => ({ ...s, date: e.target.value }))} /></Field>
      {DAY_FIELDS.map((f) => (
        <Field key={f.name} label={f.label}>
          <input
            className={input}
            inputMode="decimal"
            placeholder={f.placeholder}
            value={v[f.name] ?? ""}
            onChange={(e) => setV((s) => ({ ...s, [f.name]: digits(e.target.value) }))}
          />
        </Field>
      ))}
    </PredictForm>
  );
}
