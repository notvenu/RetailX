"use client";

import { Plus, Trash2, X } from "lucide-react";
import { defaultForecast } from "@/lib/catalog";
import { MODELS } from "@/lib/forecast";
import type { AnalyticsPrefs, ForecastDef, Grain, KpiDef, ModuleDef } from "@/lib/model";
import { Label, Segmented, btnGhost, btnQuiet, control } from "@/components/ui";

export const GRAINS: { value: Grain; label: string }[] = [
  { value: "day", label: "Daily" }, { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }, { value: "quarter", label: "Quarterly" },
];

/** One forecast's settings. Used here and live in the Forecasting studio. */
export function ForecastFields({ f, kpis, onChange }: { f: ForecastDef; kpis: KpiDef[]; onChange: (p: Partial<ForecastDef>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Label text="What to forecast">
        <select className={control} value={f.kpi} onChange={(e) => onChange({ kpi: e.target.value })}>
          {kpis.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
      </Label>
      <Label text="Granularity">
        <select className={control} value={f.grain} onChange={(e) => onChange({ grain: e.target.value as Grain })}>
          {GRAINS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </Label>
      <Label text="Look ahead" hint={`${f.horizon} ${f.grain === "day" ? "days" : f.grain + "s"}`}>
        <input type="range" min={1} max={f.grain === "day" ? 90 : f.grain === "week" ? 26 : 12} value={f.horizon} onChange={(e) => onChange({ horizon: +e.target.value })} className="accent-[var(--color-accent)]" />
      </Label>
      <Label text="Model" hint={f.model === "auto" ? "Back-tests every model, keeps the most accurate" : MODELS.find((m) => m.key === f.model)?.about}>
        <select className={control} value={f.model} onChange={(e) => onChange({ model: e.target.value as ForecastDef["model"] })}>
          <option value="auto">Automatic (recommended)</option>
          {MODELS.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
        </select>
      </Label>
      <Label text="Seasonality">
        <select className={control} value={String(f.season)} onChange={(e) => onChange({ season: e.target.value === "auto" || e.target.value === "none" ? e.target.value : +e.target.value })}>
          <option value="auto">Detect automatically</option>
          <option value="none">None</option>
          <option value="7">Weekly cycle (7 days)</option>
          <option value="4">4 periods</option>
          <option value="12">Yearly cycle (12 months)</option>
          <option value="52">Yearly cycle (52 weeks)</option>
        </select>
      </Label>
      <Label text="Range confidence">
        <Segmented label="Confidence" value={f.confidence} options={[80, 90, 95, 99].map((v) => ({ value: v as ForecastDef["confidence"], label: `${v}%` }))} onChange={(v) => onChange({ confidence: v })} />
      </Label>
      <Label text="Pick best model by" hint="sMAPE: % error · MASE: vs naive · RMSE punishes big misses">
        <select className={control} value={f.selectBy} onChange={(e) => onChange({ selectBy: e.target.value as ForecastDef["selectBy"] })}>
          <option value="smape">sMAPE (% error)</option><option value="mase">MASE (vs naive)</option>
          <option value="rmse">RMSE</option><option value="mae">MAE</option>
        </select>
      </Label>
      <Label text="Transform" hint="Log helps when swings grow with size">
        <Segmented label="Transform" value={f.transform} options={[{ value: "none", label: "None" }, { value: "log", label: "Log" }]} onChange={(v) => onChange({ transform: v })} />
      </Label>
      {f.grain === "day" ? (
        <label className="flex items-center gap-2.5 text-[0.82rem] text-ink-soft sm:col-span-2 lg:col-span-4">
          <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={!!f.useEvents} onChange={(e) => onChange({ useEvents: e.target.checked })} />
          Learn how festivals and promotions on your calendar moved sales, and apply that to upcoming ones
        </label>
      ) : null}
      <div className="sm:col-span-2 lg:col-span-4">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">What-if scenarios</span>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {f.scenarios.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-sm border border-rule-strong bg-surface px-1.5 py-1">
              <input aria-label="Scenario name" className="w-24 bg-transparent text-[0.8rem] outline-none" value={s.name}
                onChange={(e) => onChange({ scenarios: f.scenarios.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input aria-label="Scenario change %" className="w-12 bg-transparent text-right text-[0.8rem] tabular-nums outline-none" value={s.pct}
                onChange={(e) => onChange({ scenarios: f.scenarios.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value.replace(/[^0-9.-]/g, "")) || 0 } : x)) })} />
              <span className="text-[0.75rem] text-ink-faint">%</span>
              <button type="button" aria-label="Remove scenario" onClick={() => onChange({ scenarios: f.scenarios.filter((_, j) => j !== i) })}><X className="size-3 text-ink-faint" /></button>
            </span>
          ))}
          <button type="button" className={btnQuiet} onClick={() => onChange({ scenarios: [...f.scenarios, { name: "Promo month", pct: 15 }] })}><Plus className="size-3.5" /> Scenario</button>
        </div>
      </div>
    </div>
  );
}

export function IntelligenceEditor({ forecasts, analytics, kpis, modules, onChange }: {
  forecasts: ForecastDef[]; analytics: AnalyticsPrefs; kpis: KpiDef[]; modules: ModuleDef[];
  onChange: (p: { forecasts?: ForecastDef[]; analytics?: AnalyticsPrefs }) => void;
}) {
  const setA = (p: Partial<AnalyticsPrefs>) => onChange({ analytics: { ...analytics, ...p } });
  const dated = modules.filter((m) => m.enabled);
  return (
    <div className="space-y-10">
      <section>
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">Forecasts</h3>
        <p className="mt-1 text-[0.78rem] text-ink-soft">Each forecast compares ten models on your own history and keeps the most accurate, with a range and what-if scenarios.</p>
        <div className="mt-4 space-y-5">
          {forecasts.map((f, i) => (
            <div key={f.id} className="border-l-2 border-accent/40 pl-4">
              <div className="mb-3 flex items-center gap-2">
                <input aria-label="Forecast name" className={`${control} max-w-xs font-medium`} value={f.name}
                  onChange={(e) => onChange({ forecasts: forecasts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <button type="button" className={btnQuiet} aria-label="Remove forecast" onClick={() => onChange({ forecasts: forecasts.filter((_, j) => j !== i) })}><Trash2 className="size-3.5" /></button>
              </div>
              <ForecastFields f={f} kpis={kpis} onChange={(p) => onChange({ forecasts: forecasts.map((x, j) => (j === i ? { ...x, ...p } : x)) })} />
            </div>
          ))}
          {kpis.length ? (
            <button type="button" className={btnGhost} onClick={() => onChange({ forecasts: [...forecasts, defaultForecast(kpis[0])] })}><Plus className="size-3.5" /> Add forecast</button>
          ) : <p className="text-[0.8rem] text-ink-faint">Add a KPI first; forecasts are built on KPIs.</p>}
        </div>
      </section>

      <section>
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">Analytics</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Label text="Report KPIs by">
            <Segmented label="Grain" value={analytics.grain} options={GRAINS} onChange={(v) => setA({ grain: v })} />
          </Label>
          <Label text="Compare with">
            <Segmented label="Compare" value={analytics.compareTo} options={[{ value: "previous", label: "Previous period" }, { value: "last_year", label: "Same period last year" }]} onChange={(v) => setA({ compareTo: v })} />
          </Label>
          <Label text="Anomaly sensitivity" hint={`Flag days ${analytics.anomalyZ.toFixed(1)}σ from normal · ${analytics.anomalyZ <= 2.5 ? "catches more, some noise" : analytics.anomalyZ >= 3.5 ? "only the extreme" : "balanced"}`}>
            <input type="range" min={2} max={5} step={0.5} value={analytics.anomalyZ} onChange={(e) => setA({ anomalyZ: +e.target.value })} className="accent-[var(--color-accent)]" />
          </Label>
        </div>
        <div className="mt-5">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Breakdowns</span>
          <p className="text-[0.75rem] text-ink-faint">Slice a module by one of its fields, e.g. sales by category or expenses by vendor.</p>
          <div className="mt-2 space-y-2">
            {analytics.breakdowns.map((b, i) => {
              const mod = dated.find((m) => m.id === b.module);
              return (
                <div key={i} className="flex flex-wrap items-center gap-2 text-[0.82rem]">
                  <select aria-label="Module" className={`${control} w-auto`} value={b.module}
                    onChange={(e) => setA({ breakdowns: analytics.breakdowns.map((x, j) => (j === i ? { module: e.target.value, field: dated.find((m) => m.id === e.target.value)?.fields[0]?.key ?? "" } : x)) })}>
                    {dated.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <span className="text-ink-faint">by</span>
                  <select aria-label="Field" className={`${control} w-auto`} value={b.field}
                    onChange={(e) => setA({ breakdowns: analytics.breakdowns.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })}>
                    {mod?.fields.filter((f) => f.type !== "money" && f.type !== "number" && f.type !== "date").map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  <span className="text-ink-faint">measuring</span>
                  <select aria-label="Measure" className={`${control} w-auto`} value={b.measure ?? ""}
                    onChange={(e) => setA({ breakdowns: analytics.breakdowns.map((x, j) => (j === i ? { ...x, measure: e.target.value || undefined } : x)) })}>
                    <option value="">Main amount</option>
                    <option value="1">Number of records</option>
                    {mod?.fields.filter((f) => f.type === "money" || f.type === "number").map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  <button type="button" className={btnQuiet} aria-label="Remove breakdown" onClick={() => setA({ breakdowns: analytics.breakdowns.filter((_, j) => j !== i) })}><X className="size-3.5" /></button>
                </div>
              );
            })}
            {dated.length ? (
              <button type="button" className={btnQuiet} onClick={() => setA({ breakdowns: [...analytics.breakdowns, { module: dated[0].id, field: dated[0].fields.find((f) => f.type === "select" || f.type === "text")?.key ?? "" }] })}>
                <Plus className="size-3.5" /> Add breakdown
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
