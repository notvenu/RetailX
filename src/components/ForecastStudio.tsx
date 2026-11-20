"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Save } from "lucide-react";
import { saveConfig } from "@/app/actions";
import { defaultForecast } from "@/lib/catalog";
import { MODELS, runForecast, SEASON_BY_GRAIN } from "@/lib/forecast";
import { complete, kpiSeries, nextBucket, bucketLabel } from "@/lib/metrics";
import { fmtUnit, type Fmt } from "@/lib/format";
import type { BizEvent, Business, ForecastDef, KpiDef } from "@/lib/model";
import { applyUplift, learnUplift } from "@/lib/planning";
import { ForecastFields } from "@/components/config/intelligence";
import { LineChart } from "@/components/charts";
import { DataTable, Empty, Section, btnGhost, btnPrimary } from "@/components/ui";
import { orAlert } from "@/lib/result";

export function ForecastStudio({ data, kpis, forecasts, events, fmt, canSave }: {
  data: Pick<Business, "modules" | "records">; kpis: KpiDef[]; forecasts: ForecastDef[]; events: BizEvent[]; fmt: Fmt; canSave: boolean;
}) {
  const [defs, setDefs] = useState<ForecastDef[]>(forecasts.length ? forecasts : kpis[0] ? [defaultForecast(kpis[0])] : []);
  const [sel, setSel] = useState(0);
  const [saved, setSaved] = useState(true);
  const [pending, start] = useTransition();
  const f = defs[sel];
  const kpi = kpis.find((k) => k.id === f?.kpi);

  const series = useMemo(() => (kpi && f ? complete(kpiSeries(data, kpi, f.grain), f.grain) : []), [data, kpi, f]);
  const result = useMemo(() => {
    if (!f || series.length < 4) return null;
    const r = runForecast(series.map((p) => p.value ?? 0), {
      model: f.model, season: f.season, seasonCandidate: SEASON_BY_GRAIN[f.grain], horizon: f.horizon,
      confidence: f.confidence, transform: f.transform, selectBy: f.selectBy,
    });
    if (!r || !f.useEvents || f.grain !== "day" || !events.length) return r && { ...r, uplift: null };
    // festivals and promotions: learn the past lift, apply it to upcoming event days (range scales with it)
    const up = learnUplift(series.map((p) => ({ date: p.key, value: p.value ?? 0 })), events);
    const dates = r.forecast.map((_, i) => nextBucket(series.at(-1)!.key, "day", i + 1));
    return {
      ...r, uplift: up,
      forecast: applyUplift(dates, r.forecast, events, up), lower: applyUplift(dates, r.lower, events, up), upper: applyUplift(dates, r.upper, events, up),
    };
  }, [series, f, events]);

  if (!kpis.length) return <div className="mt-8"><Empty title="No KPIs to forecast">Add KPIs in Settings first.</Empty></div>;
  if (!f || !kpi) return null;

  const fv = (n: number | null | undefined) => fmtUnit(n, kpi.unit, fmt, true);
  const lastKey = series.at(-1)?.key;
  const futureLabel = (i: number) => (lastKey ? bucketLabel(nextBucket(lastKey, f.grain, i + 1), f.grain) : `+${i + 1}`);
  const set = (p: Partial<ForecastDef>) => { setDefs(defs.map((x, i) => (i === sel ? { ...x, ...p } : x))); setSaved(false); };
  const total = result ? result.forecast.reduce((a, c) => a + c, 0) : 0;
  const additive = kpi.unit === "money" || kpi.unit === "number";
  const best = result?.scores.find((s) => s.key === result.chosen);

  return (
    <div>
      <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-rule pb-3">
        {defs.map((d, i) => (
          <button key={d.id} onClick={() => setSel(i)} aria-pressed={i === sel}
            className={`rounded-sm px-3 py-1.5 text-[0.82rem] ${i === sel ? "bg-accent-wash font-medium text-accent" : "text-ink-soft hover:bg-panel"}`}>{d.name}</button>
        ))}
        <button className={btnGhost} onClick={() => { setDefs([...defs, defaultForecast(kpis[0])]); setSel(defs.length); setSaved(false); }}><Plus className="size-3.5" /> New forecast</button>
        {canSave ? (
          <button className={`${btnPrimary} ml-auto`} disabled={saved || pending} onClick={() => start(async () => { await orAlert(saveConfig({ forecasts: defs })); setSaved(true); })}>
            <Save className="size-3.5" /> {saved ? "Saved" : pending ? "Saving…" : "Save forecasts"}
          </button>
        ) : null}
      </div>

      <div className="mt-5 border-l-2 border-accent/40 pl-4">
        <input aria-label="Forecast name" className="mb-3 w-full max-w-sm bg-transparent text-[1.05rem] font-semibold text-ink outline-none" value={f.name} onChange={(e) => set({ name: e.target.value })} />
        <ForecastFields f={f} kpis={kpis} onChange={set} />
      </div>

      {!result ? (
        <div className="mt-8"><Empty title={`Not enough history yet: ${series.length} ${f.grain}${series.length === 1 ? "" : "s"}`}>Forecasts need at least 4 periods. Switch to a finer granularity (e.g. daily), or import past records.</Empty></div>
      ) : (
        <>
          <Section title="Outlook" meta={`${MODELS.find((m) => m.key === result.chosen)?.name}${result.m > 1 ? ` · season ${result.m}` : ""} · ${f.confidence}% range`}>
            <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[0.8rem] sm:grid-cols-4">
              <div><p className="text-ink-faint">Next {f.grain}</p><p className="text-[1.25rem] font-semibold tabular-nums text-ink">{fv(result.forecast[0])}</p></div>
              {additive ? <div><p className="text-ink-faint">Total, next {f.horizon}</p><p className="text-[1.25rem] font-semibold tabular-nums text-ink">{fv(total)}</p></div> : null}
              <div><p className="text-ink-faint">Back-test error</p><p className="text-[1.25rem] font-semibold tabular-nums text-ink">{best ? `${best.smape.toFixed(1)}%` : "—"}</p></div>
              <div><p className="text-ink-faint">vs naive (MASE)</p><p className={`text-[1.25rem] font-semibold tabular-nums ${best && best.mase < 1 ? "text-good" : "text-warn"}`}>{best ? best.mase.toFixed(2) : "—"}</p></div>
            </div>
            <LineChart
              showBand showPredicted
              valueFormat={fv}
              points={[
                ...series.slice(-Math.max(24, f.horizon * 2)).map((p, i, arr) => ({ x: p.label, actual: p.value, predicted: result.fitted[series.length - arr.length + i] })),
                ...result.forecast.map((v, i) => ({ x: futureLabel(i), predicted: v, lower: result.lower[i], upper: result.upper[i] })),
              ]}
            />
            <p className="mt-2 text-[0.74rem] text-ink-faint">Solid: actual. Dashed: the model&apos;s fit and forecast. Shaded: {f.confidence}% range. Learns from finished periods only; the one in progress is left out.</p>
            {result.notes.length ? <ul className="mt-3 space-y-1 text-[0.8rem] text-ink-soft">{result.notes.map((n) => <li key={n}>• {n}</li>)}</ul> : null}
            {result.uplift ? (
              <p className="mt-2 text-[0.8rem] text-ink-soft">
                • Event effect learned from {result.uplift.samples} past event day{result.uplift.samples === 1 ? "" : "s"}:{" "}
                {Object.entries(result.uplift.byName).map(([k, v]) => `${k} ${v >= 1 ? "+" : ""}${Math.round((v - 1) * 100)}%`).join(", ") || `average ${Math.round((result.uplift.overall - 1) * 100)}%`}.
                {result.uplift.samples ? "" : " No past events in your history yet, so upcoming ones are left as forecast."}
              </p>
            ) : null}
          </Section>

          <Section title="Period by period" meta={f.scenarios.length ? "with what-if scenarios" : undefined}>
            <DataTable
              getKey={(r) => r.i}
              rows={result.forecast.map((v, i) => ({ i, v }))}
              columns={[
                { key: "p", header: "Period", render: (r) => futureLabel(r.i) },
                { key: "lo", header: "Low", align: "right", render: (r) => fv(result.lower[r.i]) },
                { key: "v", header: "Forecast", align: "right", render: (r) => <span className="font-semibold">{fv(r.v)}</span> },
                { key: "hi", header: "High", align: "right", render: (r) => fv(result.upper[r.i]) },
                ...f.scenarios.map((s, j) => ({ key: `s${j}`, header: `${s.name} (${s.pct > 0 ? "+" : ""}${s.pct}%)`, align: "right" as const, render: (r: { v: number }) => fv(r.v * (1 + s.pct / 100)) })),
              ]}
            />
          </Section>

          <Section title="Model comparison" meta={`Rolling-origin back-test, ${best?.folds ?? 0} folds, ranked by ${f.selectBy.toUpperCase()}`}>
            <DataTable
              getKey={(s) => s.key}
              rows={result.scores}
              rowClassName={(s) => (s.key === result.chosen ? "bg-accent-wash" : "")}
              columns={[
                { key: "m", header: "Model", render: (s) => <span className={s.key === result.chosen ? "font-semibold text-accent" : ""}>{s.name}{s.key === result.chosen ? " ✓" : ""}</span> },
                { key: "smape", header: "sMAPE", align: "right", render: (s) => `${s.smape.toFixed(1)}%` },
                { key: "mase", header: "MASE", align: "right", render: (s) => s.mase.toFixed(2) },
                { key: "mae", header: "MAE", align: "right", render: (s) => fv(s.mae) },
                { key: "rmse", header: "RMSE", align: "right", render: (s) => fv(s.rmse) },
                { key: "bias", header: "Bias", align: "right", render: (s) => `${s.bias > 0 ? "+" : ""}${fv(s.bias)}` },
                { key: "a", header: "How it works", render: (s) => <span className="text-[0.75rem] text-ink-faint">{MODELS.find((m) => m.key === s.key)?.about}</span> },
              ]}
            />
            {Object.keys(result.params).length ? (
              <p className="mt-3 text-[0.75rem] text-ink-faint">
                Fitted parameters: {Object.entries(result.params).map(([k, v]) => `${k} ${Number(v).toFixed(3)}`).join(" · ")}
              </p>
            ) : null}
          </Section>
        </>
      )}
    </div>
  );
}
