import { auth } from "@/auth";
import { PageHeader, Section, Figure, FigureRow } from "@/components/ui";
import { Sparkline, BarComposition } from "@/components/charts";
import { InventoryProducts } from "@/components/CollectionPanel";
import { kpi, kpiDeltas } from "@/lib/kpi";
import { PRODUCTS, ORG } from "@/lib/mock";

const belowReorder = PRODUCTS.filter((p) => p.onHand <= p.reorder).length;
const byCategory = Object.entries(
  PRODUCTS.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + p.revenue30d;
    return acc;
  }, {}),
).map(([label, value]) => ({ label, value }));

export default async function InventoryPage() {
  const session = await auth();

  return (
    <>
      <PageHeader
        title="Inventory"
        meta={`${ORG.name} · ${PRODUCTS.length} tracked SKUs`}
      />

      <div className="mt-6">
        <FigureRow>
          <Figure label={kpi("inv_turnover").label} value={kpi("inv_turnover").display} deltas={kpiDeltas(kpi("inv_turnover"))} spark={<Sparkline data={kpi("inv_turnover").series} />} />
          <Figure label={kpi("dio").label} value={kpi("dio").display} higherIsBetter={false} deltas={kpiDeltas(kpi("dio"))} spark={<Sparkline data={kpi("dio").series} tone="soft" />} />
          <Figure label={kpi("stockout").label} value={kpi("stockout").display} higherIsBetter={false} deltas={kpiDeltas(kpi("stockout"))} spark={<Sparkline data={kpi("stockout").series} tone="bad" />} />
          <Figure label="SKUs at or below reorder" value={String(belowReorder)} higherIsBetter={false} />
        </FigureRow>
      </div>

      <Section title="Tracked products — September revenue by category">
        <BarComposition items={byCategory.sort((a, b) => b.value - a.value)} />
      </Section>

      <InventoryProducts role={session?.user.role} />
    </>
  );
}
