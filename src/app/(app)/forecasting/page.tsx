import { t } from "@/lib/i18n";
import Link from "next/link";
import { requireArea } from "@/lib/session";
import { kpiModules } from "@/lib/catalog";
import { todayIso } from "@/lib/metrics";
import { cashFlow } from "@/lib/planning";
import { PageHeader } from "@/components/ui";
import { ForecastStudio } from "@/components/ForecastStudio";
import { StockPlanner } from "@/components/StockPlanner";
import { CashPanel } from "@/components/CashPanel";

const TABS = [
  { id: "kpi", label: "KPI forecasts" },
  { id: "stock", label: "Stock planning" },
  { id: "cash", label: "Cash flow" },
];

export default async function ForecastingPage({ searchParams }: PageProps<"/forecasting">) {
  const { lang, business: b, can, role } = await requireArea("forecasting");
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab) ? String(sp.tab) : "kpi";
  const fmt = { currency: b.currency, locale: b.locale };
  const used = new Set(b.kpis.flatMap(kpiModules));
  const stockReady = b.modules.some((m) => m.id === "inventory" && m.enabled) && b.modules.some((m) => m.id === "sales" && m.enabled);
  const revenue = b.kpis.find((k) => k.unit === "money" && k.area === "sales" && !k.formula.includes("/"));

  return (
    <>
      <PageHeader title={t(lang, "nav.forecasting")} meta="Ten models compete on your own history; the most accurate wins. Plan stock and cash on the same engine." />
      <nav aria-label="Forecast views" className="mt-5 flex gap-1 border-b border-rule">
        {TABS.map((t) => (
          <Link key={t.id} href={`/forecasting?tab=${t.id}`} aria-current={tab === t.id ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-[0.82rem] ${tab === t.id ? "border-accent font-medium text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}>{t.label}</Link>
        ))}
      </nav>
      {tab === "kpi" ? (
        <ForecastStudio
          data={{ modules: b.modules, records: Object.fromEntries(Object.entries(b.records).filter(([k]) => used.has(k))) }}
          kpis={b.kpis}
          forecasts={b.forecasts}
          events={b.events ?? []}
          fmt={fmt}
          canSave={can("settings")}
        />
      ) : tab === "stock" ? (
        <StockPlanner ready={stockReady} today={todayIso()} auto={role.id === "owner" ? b.autoOrder ?? null : false}
          data={{ modules: b.modules, records: { sales: b.records.sales ?? [], inventory: b.records.inventory ?? [], purchases: b.records.purchases ?? [] } }} />
      ) : (
        <CashPanel plan={cashFlow(b, revenue, todayIso())} cash={b.cash} fmt={fmt} canEdit={can("settings")} />
      )}
    </>
  );
}
