import { auth } from "@/auth";
import { PageHeader, Section, Figure, FigureRow, DataTable } from "@/components/ui";
import { PurchaseOrdersPanel } from "@/components/CollectionPanel";
import { money, moneyCompact, pct } from "@/lib/format";
import { PURCHASE_ORDERS, SUPPLIERS, ORG } from "@/lib/mock";

const openPos = PURCHASE_ORDERS.filter((p) => p.status !== "Received").length;
const overdue = PURCHASE_ORDERS.filter((p) => p.status === "Overdue").length;
const payable = SUPPLIERS.reduce((s, x) => s + x.payable, 0);
const onTimeAvg = SUPPLIERS.reduce((s, x) => s + x.onTimePct, 0) / SUPPLIERS.length;

export default async function ProcurementPage() {
  const session = await auth();

  return (
    <>
      <PageHeader
        title="Procurement"
        meta={`${ORG.name} · ${SUPPLIERS.length} active suppliers · sample data`}
      />

      <div className="mt-6">
        <FigureRow>
          <Figure label="Open purchase orders" value={String(openPos)} />
          <Figure label="Overdue" value={String(overdue)} higherIsBetter={false} />
          <Figure label="Payables outstanding" value={moneyCompact(payable)} higherIsBetter={false} />
          <Figure label="On-time delivery" value={pct(onTimeAvg)} deltas={[{ value: onTimeAvg - 95, label: "vs target", suffix: "pts" }]} />
        </FigureRow>
      </div>

      <PurchaseOrdersPanel role={session?.user.role} />

      <Section title="Suppliers">
        <DataTable
          getKey={(r) => r.name}
          rows={SUPPLIERS}
          columns={[
            { key: "name", header: "Supplier", render: (r) => <span className="font-medium">{r.name}</span> },
            { key: "terms", header: "Terms", render: (r) => <span className="text-ink-soft">{r.terms}</span> },
            { key: "ontime", header: "On-time", align: "right", render: (r) => <span className={r.onTimePct < 90 ? "text-warn" : ""}>{pct(r.onTimePct, 0)}</span> },
            { key: "open", header: "Open POs", align: "right", render: (r) => r.openPos },
            { key: "payable", header: "Payable", align: "right", render: (r) => money(r.payable) },
          ]}
        />
      </Section>
    </>
  );
}
