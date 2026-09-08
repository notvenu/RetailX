import { auth } from "@/auth";
import { PageHeader, Section, Figure, FigureRow, DataTable } from "@/components/ui";
import { Sparkline, LineChart, BarComposition } from "@/components/charts";
import { ExpensesPanel } from "@/components/CollectionPanel";
import { kpi, kpiDeltas } from "@/lib/kpi";
import { money, moneyCompact, pct } from "@/lib/format";
import { PNL, derive, SUMMARY, EXPENSES, RECEIVABLES_AGEING, ORG } from "@/lib/mock";

const cur = PNL[PNL.length - 1];
const d = derive(cur);
const arTotal = RECEIVABLES_AGEING.reduce((s, r) => s + r.amount, 0);

export default async function FinancePage() {
  const session = await auth();

  return (
    <>
      <PageHeader
        title="Finance & accounting"
        meta={`${ORG.name} · month ending ${ORG.asOf} · sample data`}
      />

      <div className="mt-6">
        <FigureRow>
          <Figure label="Revenue" value={money(cur.revenue)} deltas={kpiDeltas(kpi("revenue"))} spark={<Sparkline data={kpi("revenue").series} />} />
          <Figure label="Gross profit" value={money(d.grossProfit)} deltas={[{ value: d.grossMargin - 34, label: "vs target", suffix: "pts" }]} spark={<Sparkline data={PNL.map((r) => derive(r).grossProfit)} />} />
          <Figure label="Operating expenses" value={money(cur.opex)} higherIsBetter={false} deltas={[{ value: ((cur.opex - PNL[PNL.length - 2].opex) / PNL[PNL.length - 2].opex) * 100, label: "vs prior" }]} spark={<Sparkline data={PNL.map((r) => r.opex)} tone="soft" />} />
          <Figure label="Net profit" value={money(d.netProfit)} deltas={kpiDeltas(kpi("net_margin"))} spark={<Sparkline data={PNL.map((r) => derive(r).netProfit)} />} />
        </FigureRow>
      </div>

      <Section title="Revenue — trailing 12 months" meta={<>YTD {moneyCompact(SUMMARY.ytdRevenue)}</>}>
        <LineChart points={PNL.map((r) => ({ x: r.month, actual: r.revenue }))} height={220} />
      </Section>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <Section title="Operating expenses — current month" className="mt-0 first:mt-0">
          <BarComposition items={EXPENSES.map((e) => ({ label: e.category, value: e.month, hint: pct(e.share) }))} />
        </Section>
        <Section title="Receivables ageing" meta={<>{moneyCompact(arTotal)} outstanding</>} className="mt-0 first:mt-0">
          <BarComposition items={RECEIVABLES_AGEING.map((r) => ({ label: r.bucket, value: r.amount }))} />
        </Section>
      </div>

      <Section title="Expense register" meta="Controlled categories · current month">
        <DataTable
          getKey={(r) => r.category}
          rows={EXPENSES}
          columns={[
            { key: "cat", header: "Category", render: (r) => r.category },
            { key: "month", header: "This month", align: "right", render: (r) => money(r.month) },
            { key: "ytd", header: "Year to date", align: "right", render: (r) => money(r.ytd) },
            { key: "share", header: "Share of opex", align: "right", render: (r) => <span className="text-ink-soft">{pct(r.share)}</span> },
          ]}
        />
      </Section>

      <ExpensesPanel role={session?.user.role} />
    </>
  );
}
