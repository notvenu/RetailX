import { auth } from "@/auth";
import { PageHeader, Section, Figure, FigureRow, DataTable } from "@/components/ui";
import { Sparkline, BarComposition } from "@/components/charts";
import { SalesInvoices } from "@/components/CollectionPanel";
import { kpi, kpiDeltas } from "@/lib/kpi";
import { money, moneyCompact, pct } from "@/lib/format";
import { CUSTOMERS, BRANCH_MONTH, ORG } from "@/lib/mock";

const outstanding = CUSTOMERS.reduce((s, c) => s + c.outstanding, 0);

export default async function SalesPage() {
  const session = await auth();

  return (
    <>
      <PageHeader
        title="Sales & CRM"
        meta={`${ORG.name} · month ending ${ORG.asOf} · sample data`}
      />

      <div className="mt-6">
        <FigureRow>
          <Figure label={kpi("sales_target").label} value={pct(kpi("sales_target").value)} deltas={kpiDeltas(kpi("sales_target"))} spark={<Sparkline data={kpi("sales_target").series} />} />
          <Figure label={kpi("avg_bill").label} value={money(kpi("avg_bill").value)} deltas={kpiDeltas(kpi("avg_bill"))} spark={<Sparkline data={kpi("avg_bill").series} />} />
          <Figure label="Wholesale outstanding" value={moneyCompact(outstanding)} higherIsBetter={false} spark={<Sparkline data={[62, 71, 58, 66, 74, 69, 61, 55, 63, 60, 58, 55].map((x) => x * 1000)} tone="soft" />} />
          <Figure label={kpi("rev_per_emp").label} value={moneyCompact(kpi("rev_per_emp").value)} deltas={kpiDeltas(kpi("rev_per_emp"))} spark={<Sparkline data={kpi("rev_per_emp").series} />} />
        </FigureRow>
      </div>

      <Section title="Revenue by branch — current month">
        <BarComposition items={BRANCH_MONTH.map((b) => ({ label: b.branch, value: b.revenue, hint: pct(b.grossMarginPct) + " GM" }))} />
      </Section>

      <SalesInvoices role={session?.user.role} />

      <Section title="Top customers — last 90 days">
        <DataTable
          getKey={(r) => r.name}
          rows={CUSTOMERS}
          columns={[
            { key: "name", header: "Customer", render: (r) => <span className="font-medium">{r.name}</span> },
            { key: "type", header: "Type", render: (r) => <span className="text-ink-soft">{r.type}</span> },
            { key: "since", header: "Since", render: (r) => <span className="text-ink-soft">{r.since}</span> },
            { key: "rev", header: "Revenue 90d", align: "right", render: (r) => money(r.revenue90d) },
            { key: "orders", header: "Orders", align: "right", render: (r) => r.orders90d.toLocaleString("en-IN") },
            { key: "out", header: "Outstanding", align: "right", render: (r) => (r.outstanding ? <span className="text-warn">{money(r.outstanding)}</span> : <span className="text-ink-faint">—</span>) },
          ]}
        />
      </Section>
    </>
  );
}
