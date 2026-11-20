"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { AREA_LABEL, availableKpis, kpiModules } from "@/lib/catalog";
import { exprNames, validExpr } from "@/lib/metrics";
import { uid, type Agg, type Area, type Condition, type KpiDef, type MetricRef, type ModuleDef, type Op, type Unit } from "@/lib/model";
import { Segmented, Toggle, btnGhost, btnPrimary, btnQuiet, control } from "@/components/ui";

const UNITS: { value: Unit; label: string }[] = [
  { value: "money", label: "Money" }, { value: "number", label: "Count" }, { value: "pct", label: "%" }, { value: "days", label: "Days" }, { value: "ratio", label: "Ratio" },
];
const AGGS: { value: Agg; label: string }[] = [
  { value: "sum", label: "Total of" }, { value: "count", label: "Number of records" }, { value: "avg", label: "Average of" },
  { value: "min", label: "Lowest" }, { value: "max", label: "Highest" }, { value: "distinct", label: "Distinct values of" }, { value: "last", label: "Latest value of" },
];
export const OPS: { value: Op; label: string }[] = [
  { value: "eq", label: "is" }, { value: "ne", label: "is not" }, { value: "gt", label: ">" }, { value: "gte", label: "≥" },
  { value: "lt", label: "<" }, { value: "lte", label: "≤" }, { value: "contains", label: "contains" }, { value: "empty", label: "is empty" }, { value: "notempty", label: "is filled" },
];

export const unitSuffix = (u: Unit) => (u === "pct" ? "%" : u === "days" ? "days" : u === "ratio" ? "×" : "");

/** Pick KPIs from the library, set targets, or build your own from any module's fields. */
export function KpiEditor({ kpis, modules, onChange }: { kpis: KpiDef[]; modules: ModuleDef[]; onChange: (k: KpiDef[]) => void }) {
  const [building, setBuilding] = useState(false);
  const enabled = new Set(modules.filter((m) => m.enabled).map((m) => m.id));
  const lib = availableKpis(modules).filter((k) => !kpis.some((x) => x.id === k.id));
  const set = (i: number, patch: Partial<KpiDef>) => onChange(kpis.map((k, j) => (j === i ? { ...k, ...patch } : k)));

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-2 text-[0.78rem] text-ink-soft">Tracked on your dashboard and by your AI roles. Set a target to get variance, alerts and coaching against it.</p>
        <ul className="divide-y divide-rule border-y border-rule">
          {kpis.map((k, i) => {
            const broken = kpiModules(k).some((m) => !enabled.has(m));
            return (
              <li key={k.id} className="grid grid-cols-[1fr_auto] items-center gap-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_9rem_8rem_auto]">
                <span className="min-w-0">
                  <span className="block text-[0.86rem] font-medium text-ink">{k.name}</span>
                  <span className="block truncate text-[0.72rem] text-ink-faint">
                    {AREA_LABEL[k.area]} · <code className="text-[0.7rem]">{k.formula}</code>
                    {broken ? <span className="ml-1 text-warn">· needs a module that is switched off</span> : null}
                  </span>
                </span>
                <label className="hidden items-center gap-1.5 sm:flex">
                  <span className="text-[0.7rem] text-ink-faint">Target</span>
                  <input aria-label={`${k.name} target`} inputMode="decimal" className={`${control} text-right`} placeholder="—"
                    value={k.target ?? ""} onChange={(e) => set(i, { target: e.target.value === "" ? undefined : Number(e.target.value.replace(/[^0-9.-]/g, "")) })} />
                  <span className="w-6 text-[0.7rem] text-ink-faint">{unitSuffix(k.unit)}</span>
                </label>
                <span className="hidden items-center gap-2 text-[0.72rem] text-ink-soft sm:flex">
                  <Toggle on={k.higherIsBetter} onChange={(v) => set(i, { higherIsBetter: v })} label="Higher is better" />
                  {k.higherIsBetter ? "Higher is better" : "Lower is better"}
                </span>
                <button type="button" className={btnQuiet} aria-label={`Remove ${k.name}`} onClick={() => onChange(kpis.filter((_, j) => j !== i))}>
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
          {!kpis.length ? <li className="py-6 text-center text-[0.8rem] text-ink-faint">No KPIs yet. Add some below.</li> : null}
        </ul>
      </div>

      {lib.length ? (
        <div>
          <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">Library: works with your modules</h3>
          <div className="mt-3 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(AREA_LABEL) as Area[]).map((area) => {
              const items = lib.filter((k) => k.area === area);
              if (!items.length) return null;
              return (
                <div key={area}>
                  <p className="mb-1.5 text-[0.72rem] font-semibold text-ink-faint">{AREA_LABEL[area]}</p>
                  <ul className="space-y-1">
                    {items.map((k) => (
                      <li key={k.id}>
                        <button type="button" onClick={() => onChange([...kpis, structuredClone(k)])}
                          className="group flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[0.82rem] text-ink-soft hover:bg-panel hover:text-ink">
                          <Plus className="size-3.5 text-ink-faint group-hover:text-accent" /> {k.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {building ? (
        <KpiBuilder modules={modules.filter((m) => m.enabled)} onCancel={() => setBuilding(false)} onSave={(k) => { onChange([...kpis, k]); setBuilding(false); }} />
      ) : (
        <button type="button" className={btnGhost} onClick={() => setBuilding(true)}><Plus className="size-3.5" /> Build a custom KPI</button>
      )}
    </div>
  );
}

const ALIASES = "abcdefgh".split("");

export function KpiBuilder({ modules, onSave, onCancel }: { modules: ModuleDef[]; onSave: (k: KpiDef) => void; onCancel: () => void }) {
  const first = modules[0]?.id ?? "";
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<Unit>("money");
  const [area, setArea] = useState<Area>("finance");
  const [higher, setHigher] = useState(true);
  const [metrics, setMetrics] = useState<MetricRef[]>([{ module: first, agg: "sum", field: numericFields(modules, first)[0]?.key }]);
  const [formula, setFormula] = useState("a");

  const aliases = ALIASES.slice(0, metrics.length);
  const unknown = exprNames(formula).filter((n) => !aliases.includes(n));
  const ok = name.trim() && validExpr(formula) && !unknown.length && metrics.every((m) => m.module && (m.agg === "count" || m.field));
  const setM = (i: number, patch: Partial<MetricRef>) => setMetrics(metrics.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <div className="space-y-4 border border-rule bg-panel/40 p-4">
      <h3 className="text-[0.92rem] font-semibold text-ink">Custom KPI</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="flex flex-col gap-1">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Name</span>
          <input className={control} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Repeat customer share" />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Unit</span>
          <Segmented label="Unit" value={unit} options={UNITS} onChange={setUnit} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Area</span>
          <select className={control} value={area} onChange={(e) => setArea(e.target.value as Area)}>
            {(Object.keys(AREA_LABEL) as Area[]).map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Ingredients</p>
        {metrics.map((m, i) => {
          const mod = modules.find((x) => x.id === m.module);
          return (
            <div key={i} className="space-y-2 border-l-2 border-accent/40 pl-3">
              <div className="flex flex-wrap items-center gap-2 text-[0.82rem]">
                <code className="grid size-6 place-items-center rounded-sm bg-accent-wash font-semibold text-accent">{aliases[i]}</code>
                <span className="text-ink-faint">=</span>
                <select aria-label="Aggregation" className={`${control} w-auto`} value={m.agg} onChange={(e) => setM(i, { agg: e.target.value as Agg })}>
                  {AGGS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
                {m.agg !== "count" ? (
                  <input aria-label="Field or expression" className={`${control} w-44`} list={`rx-f-${i}`} value={m.field ?? ""} onChange={(e) => setM(i, { field: e.target.value })} placeholder="field, or price * qty" />
                ) : null}
                <datalist id={`rx-f-${i}`}>{mod?.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</datalist>
                <span className="text-ink-faint">in</span>
                <select aria-label="Module" className={`${control} w-auto`} value={m.module} onChange={(e) => setM(i, { module: e.target.value, field: numericFields(modules, e.target.value)[0]?.key, where: [] })}>
                  {modules.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                {metrics.length > 1 ? (
                  <button type="button" className={btnQuiet} aria-label="Remove ingredient" onClick={() => setMetrics(metrics.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button>
                ) : null}
              </div>
              <Conditions module={mod} conditions={m.where ?? []} onChange={(where) => setM(i, { where })} />
            </div>
          );
        })}
        {metrics.length < ALIASES.length ? (
          <button type="button" className={btnQuiet} onClick={() => setMetrics([...metrics, { module: first, agg: "sum", field: numericFields(modules, first)[0]?.key }])}>
            <Plus className="size-3.5" /> Add ingredient
          </button>
        ) : null}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Formula</span>
        <input className={`${control} font-mono`} value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="(a - b) / a * 100" />
        <span className={`text-[0.72rem] ${validExpr(formula) && !unknown.length ? "text-ink-faint" : "text-bad"}`}>
          {!validExpr(formula) ? "Use numbers, + − × ÷ and brackets." : unknown.length ? `Unknown: ${unknown.join(", ")}` : `Uses ${aliases.join(", ")}. Percentages: multiply by 100.`}
        </span>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[0.8rem] text-ink-soft">
          <Toggle on={higher} onChange={setHigher} label="Higher is better" /> {higher ? "Higher is better" : "Lower is better"}
        </span>
        <div className="flex gap-2">
          <button type="button" className={btnQuiet} onClick={onCancel}>Cancel</button>
          <button type="button" disabled={!ok} className={btnPrimary}
            onClick={() => onSave({
              id: uid("k_"), name: name.trim(), unit, area, higherIsBetter: higher, formula,
              metrics: Object.fromEntries(metrics.map((m, i) => [aliases[i], m])),
            })}>
            Add KPI
          </button>
        </div>
      </div>
    </div>
  );
}

export function numericFields(modules: ModuleDef[], id: string) {
  return modules.find((m) => m.id === id)?.fields.filter((f) => f.type === "money" || f.type === "number") ?? [];
}

/** "only records where …" rows; shared by the KPI builder and automations. */
export function Conditions({ module, conditions, onChange }: { module?: ModuleDef; conditions: Condition[]; onChange: (c: Condition[]) => void }) {
  const set = (i: number, patch: Partial<Condition>) => onChange(conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-1.5">
      {conditions.map((c, i) => {
        const field = module?.fields.find((f) => f.key === c.field);
        return (
          <div key={i} className="flex flex-wrap items-center gap-2 text-[0.8rem]">
            <span className="text-ink-faint">{i ? "and" : "only where"}</span>
            <select aria-label="Field" className={`${control} w-auto`} value={c.field} onChange={(e) => set(i, { field: e.target.value })}>
              {module?.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <select aria-label="Comparison" className={`${control} w-auto`} value={c.op} onChange={(e) => set(i, { op: e.target.value as Op })}>
              {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {c.op !== "empty" && c.op !== "notempty" ? (
              field?.type === "select" && (c.op === "eq" || c.op === "ne") ? (
                <select aria-label="Value" className={`${control} w-auto`} value={c.value ?? ""} onChange={(e) => set(i, { value: e.target.value })}>
                  <option value="">Choose…</option>
                  {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input aria-label="Value" className={`${control} w-36`} value={c.value ?? ""} onChange={(e) => set(i, { value: e.target.value })} placeholder="value or @field" />
              )
            ) : null}
            <button type="button" className={btnQuiet} aria-label="Remove condition" onClick={() => onChange(conditions.filter((_, j) => j !== i))}><X className="size-3.5" /></button>
          </div>
        );
      })}
      {module ? (
        <button type="button" className="text-[0.76rem] text-ink-faint hover:text-accent"
          onClick={() => onChange([...conditions, { field: module.fields[0]?.key ?? "", op: "eq", value: "" }])}>
          + {conditions.length ? "Another condition" : "Only count some records"}
        </button>
      ) : null}
    </div>
  );
}
