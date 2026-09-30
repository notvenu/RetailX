import Link from "next/link";
import { Building2, TriangleAlert } from "lucide-react";
import { PageHeader, Section, Figure, FigureRow, StatusPill, DataTable, Delta } from "@/components/ui";
import { Sparkline, LineChart } from "@/components/charts";
import { kpi, kpiDeltas } from "@/lib/kpi";
import { money, moneyCompact, pct } from "@/lib/format";
import {
  ORG, PNL, derive, SUMMARY, REVENUE_FORECAST, ANOMALIES, ACTIVITY,
} from "@/lib/mock";

const cur = PNL[PNL.length - 1];
const prev = PNL[PNL.length - 2];
const d = derive(cur);
const dp = derive(prev);

const HEADLINE = [
  { k: kpi("revenue"), value: money(cur.revenue) },
  { k: kpi("gross_margin"), value: pct(d.grossMargin) },
  { k: kpi("operating_profit"), value: money(d.operatingProfit) },
  { k: kpi("net_margin"), value: pct(d.netMargin) },
];

const PNL_ROWS = [
  { label: "Revenue", now: cur.revenue, was: prev.revenue, strong: true },
  { label: "Cost of goods sold", now: -cur.cogs, was: -prev.cogs },
  { label: "Gross profit", now: d.grossProfit, was: dp.grossProfit, strong: true, sub: pct(d.grossMargin) + " margin" },
  { label: "Operating expenses", now: -cur.opex, was: -prev.opex },
  { label: "Operating profit", now: d.operatingProfit, was: dp.operatingProfit, strong: true, sub: pct(d.operatingMargin) + " margin" },
  { label: "Other income", now: cur.otherIncome, was: prev.otherIncome },
  { label: "Tax", now: -cur.tax, was: -prev.tax },
  { label: "Net profit", now: d.netProfit, was: dp.netProfit, strong: true, sub: pct(d.netMargin) + " margin" },
];

export default async function Overview({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { denied } = await searchParams;

  return (
    <>
      <PageHeader
        title="Overview"
        meta={`${ORG.name} · ${ORG.location} · month ending ${ORG.asOf}`}
        actions={
          <Link
            href="/branch-evaluation"
            className="inline-flex items-center gap-1.5 rounded-[4px] bg-accent px-3 py-1.5 text-[0.8rem] font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <Building2 className="size-4" strokeWidth={1.75} />
            New branch evaluation
          </Link>
        }
      />

      {denied && (
        <p className="mt-4 flex items-center gap-2 rounded-[4px] border border-warn/25 bg-warn-wash px-3 py-2 text-[0.8rem] text-warn">
          <TriangleAlert className="size-4 shrink-0" />
          Your role doesn&apos;t have access to <span className="font-mono">{denied}</span>.
        </p>
      )}

      <div className="mt-6">
        <FigureRow>
          {HEADLINE.map(({ k, value }) => (
            <Figure
              key={k.code}
              label={k.label}
              value={value}
              deltas={kpiDeltas(k)}
              higherIsBetter={k.higherIsBetter}
              spark={<Sparkline data={k.series} />}
            />
          ))}
        </FigureRow>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-3">
        <Section title="Revenue vs forecast" className="mt-0 first:mt-0 lg:col-span-2">
          <LineChart points={REVENUE_FORECAST} showBand showPredicted />
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.72rem] text-ink-soft">
            <Legend swatch="line-accent" label="Actual revenue" />
            <Legend swatch="line-dash" label="Forecast (Holt, damped trend)" />
            <Legend swatch="band" label="90% prediction interval" />
          </div>
        </Section>

        <Section title="Needs attention" className="mt-0 first:mt-0">
          <ul className="divide-y divide-rule">
            {ANOMALIES.filter((a) => a.status !== "Resolved").map((a) => (
              <li key={a.metric + a.branch + a.date} className="flex items-start justify-between gap-3 py-2.5">
                <div>
                  <p className="text-[0.82rem] font-medium text-ink">{a.metric}</p>
                  <p className="text-[0.74rem] text-ink-soft">
                    {a.branch} · {a.actual} vs {a.expected} expected
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusPill>{a.severity}</StatusPill>
                  <span className="num text-[0.74rem] text-ink-soft">{a.deviation}</span>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/analytics"
            className="mt-3 inline-block text-[0.78rem] font-medium text-accent hover:underline"
          >
            All anomalies &amp; KPI drill-down →
          </Link>
        </Section>
      </div>

      <Section
        title="Profit & loss — current month"
        meta={<>vs {prev.month}</>}
      >
        <table className="w-full text-[0.84rem]">
          <tbody className="divide-y divide-rule">
            {PNL_ROWS.map((r) => {
              const delta = ((r.now - r.was) / Math.abs(r.was)) * 100;
              return (
                <tr key={r.label} className={r.strong ? "font-semibold text-ink" : "text-ink-soft"}>
                  <td className="py-2 pr-3">
                    {r.label}
                    {r.sub ? (
                      <span className="ml-2 text-[0.72rem] font-normal text-ink-faint">{r.sub}</span>
                    ) : null}
                  </td>
                  <td className="num py-2 tabular-nums">{money(r.now)}</td>
                  <td className="num w-28 py-2 pl-3 text-[0.76rem] font-normal">
                    <Delta value={delta} suffix="%" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <div className="mt-10 grid gap-10 lg:grid-cols-3">
        <Section title="Cash position" className="mt-0 first:mt-0">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-[0.84rem]">
            <Stat label="Cash on hand" value={moneyCompact(SUMMARY.cashOnHand)} />
            <Stat label="Receivables" value={moneyCompact(SUMMARY.receivables)} />
            <Stat label="Payables" value={moneyCompact(SUMMARY.payables)} />
            <Stat label="YTD revenue" value={moneyCompact(SUMMARY.ytdRevenue)} />
          </dl>
        </Section>

        <Section title="Recent activity" className="mt-0 first:mt-0 lg:col-span-2">
          <DataTable
            getKey={(_, i) => i}
            rows={ACTIVITY}
            columns={[
              { key: "when", header: "When", render: (r) => <span className="text-ink-soft">{r.when}</span>, width: "5.5rem" },
              { key: "who", header: "Who", render: (r) => r.who },
              { key: "what", header: "Event", render: (r) => r.what },
              { key: "where", header: "Module", align: "right", render: (r) => <span className="text-ink-soft">{r.where}</span> },
            ]}
          />
        </Section>
      </div>
    </>
  );
}

function Legend({ swatch, label }: { swatch: "line-accent" | "line-dash" | "band"; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch === "band" ? (
        <span className="h-2.5 w-4 rounded-[1px] bg-accent/15" />
      ) : (
        <span
          className={`h-0 w-4 border-t-2 ${
            swatch === "line-dash" ? "border-dashed border-ink-soft" : "border-accent"
          }`}
        />
      )}
      {label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.72rem] uppercase tracking-[0.1em] text-ink-faint">{label}</dt>
      <dd className="num !text-left mt-1 font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}
