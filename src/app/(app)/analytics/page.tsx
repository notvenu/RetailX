import Link from "next/link";
import { PageHeader, Section, Figure, FigureRow, DataTable, StatusPill, Delta, Note } from "@/components/ui";
import { Sparkline } from "@/components/charts";
import { KPIS } from "@/lib/mock";
import { kpi, kpiDeltas } from "@/lib/kpi";
import { BRANCHES, ANOMALIES, ORG } from "@/lib/mock";

const LEVELS = [
  { q: "What happened?", a: "Descriptive — the KPI register below, computed from ERP transactions." },
  { q: "Why did it happen?", a: "Diagnostic — variance vs target and prior, plus the anomaly log." },
  { q: "What is likely next?", a: "Predictive — see Forecasting for revenue projections with intervals." },
  { q: "What should we do?", a: "Prescriptive — see Decision support and Branch evaluation." },
];

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Analytics"
        meta={`${ORG.name} · ${KPIS.length} KPIs · recomputed ${ORG.asOf} · sample data`}
      />

      <div className="mt-6">
        <FigureRow>
          <Figure label={kpi("roce").label} value={kpi("roce").display} deltas={kpiDeltas(kpi("roce"))} spark={<Sparkline data={kpi("roce").series} />} />
          <Figure label={kpi("ccc").label} value={kpi("ccc").display} higherIsBetter={false} deltas={kpiDeltas(kpi("ccc"))} spark={<Sparkline data={kpi("ccc").series} tone="soft" />} />
          <Figure label={kpi("gross_margin").label} value={kpi("gross_margin").display} deltas={kpiDeltas(kpi("gross_margin"))} spark={<Sparkline data={kpi("gross_margin").series} />} />
          <Figure label={kpi("stockout").label} value={kpi("stockout").display} higherIsBetter={false} deltas={kpiDeltas(kpi("stockout"))} spark={<Sparkline data={kpi("stockout").series} tone="bad" />} />
        </FigureRow>
      </div>

      <Section title="Four questions the analytics layer answers">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {LEVELS.map((l) => (
            <div key={l.q} className="border-l border-rule-strong pl-3">
              <dt className="text-[0.84rem] font-semibold text-ink">{l.q}</dt>
              <dd className="mt-0.5 text-[0.8rem] text-ink-soft">{l.a}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="KPI register" meta="value · target · variance">
        <DataTable
          getKey={(r) => r.code}
          rows={KPIS}
          columns={[
            { key: "label", header: "KPI", render: (r) => <span className="font-medium">{r.label}</span> },
            { key: "value", header: "Current", align: "right", render: (r) => <span className="font-medium">{r.display}</span> },
            {
              key: "vsTarget", header: "vs target", align: "right",
              render: (r) => { const [t] = kpiDeltas(r); return <Delta value={t.value} suffix={t.suffix} higherIsBetter={r.higherIsBetter} />; },
            },
            {
              key: "vsPrior", header: "vs prior", align: "right",
              render: (r) => { const [, p] = kpiDeltas(r); return <Delta value={p.value} suffix={p.suffix} higherIsBetter={r.higherIsBetter} />; },
            },
            { key: "trend", header: "12-month", align: "right", render: (r) => <span className="inline-flex justify-end"><Sparkline data={r.series} width={110} height={26} tone={r.higherIsBetter ? "accent" : "soft"} /></span> },
          ]}
        />
      </Section>

      <Section title="Branch health">
        <DataTable
          getKey={(r) => r.id}
          rows={BRANCHES}
          columns={[
            { key: "name", header: "Branch", render: (r) => <span className="font-medium">{r.name}</span> },
            { key: "city", header: "City", render: (r) => <span className="text-ink-soft">{r.city}</span> },
            { key: "size", header: "Size", align: "right", render: (r) => `${r.sizeSqft.toLocaleString("en-IN")} sq ft` },
            { key: "opened", header: "Opened", render: (r) => <span className="text-ink-soft">{r.openingDate}</span> },
            {
              key: "health", header: "Health score", align: "right",
              render: (r) => (
                <span className="inline-flex items-center justify-end gap-2">
                  <span className="h-1.5 w-20 rounded-full bg-panel-deep">
                    <span
                      className={`block h-full rounded-full ${r.health >= 70 ? "bg-good" : r.health >= 55 ? "bg-warn" : "bg-bad"}`}
                      style={{ width: `${r.health}%` }}
                    />
                  </span>
                  <span className="w-6 font-medium">{r.health}</span>
                </span>
              ),
            },
            { key: "status", header: "Status", align: "right", render: (r) => <StatusPill>{r.status}</StatusPill> },
          ]}
        />
      </Section>

      <Section title="Anomaly log" meta="expected values from the forecasting layer">
        <DataTable
          getKey={(_, i) => i}
          rows={ANOMALIES}
          columns={[
            { key: "metric", header: "Metric", render: (r) => <span className="font-medium">{r.metric}</span> },
            { key: "branch", header: "Branch", render: (r) => r.branch },
            { key: "date", header: "Detected", render: (r) => <span className="text-ink-soft">{r.date}</span> },
            { key: "actual", header: "Actual", align: "right", render: (r) => r.actual },
            { key: "expected", header: "Expected", align: "right", render: (r) => <span className="text-ink-soft">{r.expected}</span> },
            { key: "dev", header: "Deviation", align: "right", render: (r) => r.deviation },
            { key: "sev", header: "Severity", align: "right", render: (r) => <StatusPill>{r.severity}</StatusPill> },
            { key: "status", header: "Status", align: "right", render: (r) => <StatusPill>{r.status}</StatusPill> },
          ]}
        />
        <Note>
          Anomalies compare each metric against its forecast band. Resolved items stay in the log for audit.{" "}
          <Link href="/forecasting" className="font-medium text-accent hover:underline">See the forecasting model →</Link>
        </Note>
      </Section>
    </>
  );
}
