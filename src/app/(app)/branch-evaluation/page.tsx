"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { PageHeader, Section, StatusPill } from "@/components/ui";
import { money, moneyCompact, pct } from "@/lib/format";
import {
  DEFAULT_INPUTS,
  evaluate,
  type BranchInputs,
  type ScenarioKey,
  type ScenarioResult,
} from "@/lib/branch";

const months = (n: number | null) => (n == null ? "36+ mo" : `${n} mo`);

type MetricRow = {
  label: string;
  get: (s: ScenarioResult) => string;
  hint?: string;
};

const METRICS: MetricRow[] = [
  { label: "Expected monthly sales", get: (s) => money(Math.round(s.monthlySales)) },
  { label: "Gross margin", get: (s) => pct(s.grossMarginPct) },
  { label: "Gross profit / month", get: (s) => money(Math.round(s.grossProfitMonthly)) },
  { label: "Fixed cost / month", get: (s) => money(Math.round(s.fixedMonthly)) },
  { label: "Operating profit / month", get: (s) => money(Math.round(s.operatingProfitMonthly)) },
  { label: "Operating margin", get: (s) => pct(s.operatingMarginPct) },
  { label: "Break-even monthly sales", get: (s) => money(Math.round(s.breakEvenMonthlySales)) },
  { label: "Break-even achievement", get: (s) => pct(s.breakEvenAchievementPct, 0) },
  { label: "Rent-to-sales ratio", get: (s) => pct(s.rentToSalesPct) },
  { label: "Payback period", get: (s) => months(s.paybackMonths) },
  { label: "ROI — year 1", get: (s) => pct(s.roiY1Pct, 0) },
  { label: "ROCE (annualised)", get: (s) => pct(s.rocePct, 0) },
  { label: "Cash-flow impact — year 1", get: (s) => money(Math.round(s.cashFlowImpactY1)) },
  { label: "Risk score", get: (s) => `${s.riskScore} / 100` },
];

const SCEN: { key: ScenarioKey; label: string }[] = [
  { key: "conservative", label: "Conservative" },
  { key: "base", label: "Base" },
  { key: "optimistic", label: "Optimistic" },
];

export default function BranchEvaluationPage() {
  const [inputs, setInputs] = useState<BranchInputs>(DEFAULT_INPUTS);
  const { scenarios, recommendation } = useMemo(() => evaluate(inputs), [inputs]);

  const set = <K extends keyof BranchInputs>(k: K, v: BranchInputs[K]) =>
    setInputs((prev) => ({ ...prev, [k]: v }));

  const verdictTone =
    recommendation.verdict === "Proceed"
      ? "border-good/30 bg-good-wash"
      : recommendation.verdict === "Do not proceed"
        ? "border-bad/30 bg-bad-wash"
        : "border-warn/30 bg-warn-wash";

  return (
    <>
      <PageHeader
        title="New branch opening evaluation"
        meta="Nandan Provisions · proposal for a second store"
        actions={
          <button
            onClick={() => setInputs(DEFAULT_INPUTS)}
            className="inline-flex items-center gap-1.5 rounded-[4px] border border-rule-strong px-3 py-1.5 text-[0.8rem] font-medium text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
          >
            <RotateCcw className="size-3.5" /> Reset to proposal
          </button>
        }
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-[320px_1fr]">
        {/* ---------- inputs ---------- */}
        <form className="lg:sticky lg:top-6 lg:self-start" onSubmit={(e) => e.preventDefault()}>
          <FieldGroup title="Proposed location">
            <TextField label="Name" value={inputs.name} onChange={(v) => set("name", v)} />
            <TextField label="Location" value={inputs.location} onChange={(v) => set("location", v)} />
            <NumField label="Store size" unit="sq ft" value={inputs.storeSqft} step={100} onChange={(v) => set("storeSqft", v)} />
          </FieldGroup>

          <FieldGroup title="Upfront investment">
            <NumField label="Initial investment" money value={inputs.initialInvestment} step={100_000} onChange={(v) => set("initialInvestment", v)} />
            <NumField label="Rent deposit" money value={inputs.deposit} step={50_000} onChange={(v) => set("deposit", v)} />
            <NumField label="Marketing / launch" money value={inputs.marketingLaunchCost} step={25_000} onChange={(v) => set("marketingLaunchCost", v)} />
          </FieldGroup>

          <FieldGroup title="Revenue assumptions">
            <NumField label="Expected monthly sales" money value={inputs.expectedMonthlySales} step={100_000} onChange={(v) => set("expectedMonthlySales", v)} />
            <NumField label="Expected gross margin" unit="%" value={inputs.grossMarginPct} step={0.5} onChange={(v) => set("grossMarginPct", v)} />
            <NumField label="Expected annual growth" unit="%" value={inputs.expectedAnnualGrowthPct} step={1} onChange={(v) => set("expectedAnnualGrowthPct", v)} />
          </FieldGroup>

          <FieldGroup title="Operating cost — monthly">
            <NumField label="Rent" money value={inputs.monthlyRent} step={10_000} onChange={(v) => set("monthlyRent", v)} />
            <NumField label="Payroll" money value={inputs.monthlyPayroll} step={10_000} onChange={(v) => set("monthlyPayroll", v)} />
            <NumField label="Headcount" value={inputs.employeeCount} step={1} onChange={(v) => set("employeeCount", v)} />
            <NumField label="Utilities" money value={inputs.monthlyUtilities} step={5_000} onChange={(v) => set("monthlyUtilities", v)} />
            <NumField label="Other operating" money value={inputs.otherMonthlyOpex} step={5_000} onChange={(v) => set("otherMonthlyOpex", v)} />
          </FieldGroup>

          <FieldGroup title="Financing">
            <NumField label="Financing cost (annual)" unit="%" value={inputs.financingCostPct} step={0.5} onChange={(v) => set("financingCostPct", v)} />
          </FieldGroup>
        </form>

        {/* ---------- results ---------- */}
        <div className="min-w-0">
          <div className={`border ${verdictTone} px-5 py-4`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                Recommendation
              </span>
              <StatusPill>{recommendation.verdict}</StatusPill>
              <span className="text-[0.76rem] text-ink-soft">
                Risk <StatusPill>{recommendation.riskLevel}</StatusPill>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[0.76rem] text-ink-soft">
                Confidence
                <span className="h-1.5 w-16 rounded-full bg-white/70">
                  <span className="block h-full rounded-full bg-accent/75" style={{ width: `${recommendation.confidence * 100}%` }} />
                </span>
                <span className="num font-medium text-ink">{Math.round(recommendation.confidence * 100)}%</span>
              </span>
            </div>
            <p className="mt-2 text-[0.86rem] leading-relaxed text-ink">{recommendation.rationale}</p>
          </div>

          <Section title="Scenario comparison" meta="conservative −18% sales · optimistic +12%">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[0.82rem]">
                <thead>
                  <tr className="border-b border-rule-strong">
                    <th className="px-3 pb-2 text-left text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">Metric</th>
                    {SCEN.map((s) => (
                      <th
                        key={s.key}
                        className={`px-3 pb-2 text-right text-[0.66rem] font-semibold uppercase tracking-[0.1em] ${
                          s.key === "base" ? "text-accent" : "text-ink-faint"
                        }`}
                      >
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {METRICS.map((m) => (
                    <tr key={m.label} className="hover:bg-panel/60">
                      <td className="px-3 py-2 text-ink-soft">{m.label}</td>
                      {SCEN.map((s) => (
                        <td
                          key={s.key}
                          className={`num px-3 py-2 tabular-nums ${
                            s.key === "base" ? "bg-accent-wash/50 font-medium text-ink" : "text-ink"
                          }`}
                        >
                          {m.get(scenarios[s.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Cumulative cash position — base case" meta="months from opening">
            <PaybackChart data={scenarios.base.cumCash} payback={scenarios.base.paybackMonths} />
          </Section>

          <Section title="What moves the decision" meta="±10% on each assumption, base case">
            <ul className="divide-y divide-rule">
              {recommendation.keyFactors.map((f, i) => (
                <li key={f.factor} className="flex items-baseline justify-between gap-4 py-2.5">
                  <span className="text-[0.84rem]">
                    <span className="mr-2 num text-ink-faint">{i + 1}</span>
                    <span className="font-medium text-ink">{f.factor}</span>
                  </span>
                  <span className="text-[0.8rem] text-ink-soft">{f.effect}</span>
                </li>
              ))}
            </ul>
          </Section>

          <p className="mt-8 border-t border-rule pt-3 text-[0.74rem] leading-relaxed text-ink-faint">
            Model: month-1 sales at 72% of the expected level, ramping to full over six months, then
            compounding at the annual growth rate. Payback compares cumulative operating profit against
            initial investment + deposit + launch cost. Capital employed includes three months of
            working capital.
          </p>
        </div>
      </div>
    </>
  );
}

/* ---------------- form primitives ---------------- */

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-6 border-t border-rule pt-3">
      <legend className="mb-2 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        {title}
      </legend>
      <div className="space-y-2.5">{children}</div>
    </fieldset>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[0.8rem] text-ink-soft">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-44 rounded-[4px] border border-rule-strong bg-white px-2 py-1 text-right text-[0.8rem] text-ink outline-none focus-visible:border-accent"
      />
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
  unit,
  money: isMoney,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  unit?: string;
  money?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[0.8rem] text-ink-soft">{label}</span>
      <span className="inline-flex w-44 shrink-0 items-center gap-1 rounded-[4px] border border-rule-strong bg-white px-2 py-1 focus-within:border-accent">
        {isMoney && <span className="shrink-0 text-[0.78rem] text-ink-faint">₹</span>}
        {isMoney ? (
          <input
            inputMode="numeric"
            value={value.toLocaleString("en-IN")}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, "");
              onChange(digits === "" ? 0 : Number(digits));
            }}
            className="w-full bg-transparent text-right text-[0.8rem] tabular-nums text-ink outline-none"
          />
        ) : (
          <input
            type="number"
            value={value}
            step={step}
            onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
            className="w-full bg-transparent text-right text-[0.8rem] tabular-nums text-ink outline-none"
          />
        )}
        {unit && (
          <span className="shrink-0 whitespace-nowrap text-[0.78rem] text-ink-faint">{unit}</span>
        )}
      </span>
    </label>
  );
}

/* ---------------- payback chart ---------------- */

function PaybackChart({ data, payback }: { data: number[]; payback: number | null }) {
  const W = 760;
  const H = 200;
  const padL = 56;
  const padR = 16;
  const padT = 12;
  const padB = 22;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const min = Math.min(0, ...data);
  const max = Math.max(0, ...data);
  const span = max - min || 1;
  const x = (i: number) => padL + (i / (data.length - 1)) * iw;
  const y = (v: number) => padT + ih - ((v - min) / span) * ih;
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const zeroY = y(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Cumulative cash position by month">
      <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="var(--color-rule-strong)" strokeWidth="1" />
      <text x={padL - 8} y={zeroY + 3} textAnchor="end" className="fill-ink-faint" style={{ fontSize: 10 }}>₹0</text>
      <text x={padL - 8} y={y(max) + 3} textAnchor="end" className="fill-ink-faint" style={{ fontSize: 10 }}>
        {moneyCompact(max)}
      </text>
      {min < 0 && (
        <text x={padL - 8} y={y(min) + 3} textAnchor="end" className="fill-ink-faint" style={{ fontSize: 10 }}>
          {moneyCompact(min)}
        </text>
      )}

      {payback != null && (
        <>
          <line x1={x(payback - 1)} y1={padT} x2={x(payback - 1)} y2={padT + ih} stroke="var(--color-good)" strokeWidth="1" strokeDasharray="3 3" />
          <text x={x(payback - 1)} y={padT + 8} textAnchor="middle" className="fill-good" style={{ fontSize: 10, fontWeight: 600 }}>
            payback · month {payback}
          </text>
        </>
      )}

      <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />

      {[0, 6, 12, 18, 24, 30, 35].map((m) => (
        <text key={m} x={x(m)} y={H - 6} textAnchor="middle" className="fill-ink-faint" style={{ fontSize: 10 }}>
          {m + 1}
        </text>
      ))}
    </svg>
  );
}
