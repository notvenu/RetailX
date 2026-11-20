import { notFound } from "next/navigation";
import { requireArea } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { RecordsPanel } from "@/components/RecordsPanel";
import { PayrollRun } from "@/components/PayrollRun";
import { StockTransfer } from "@/components/StockTransfer";
import { todayIso } from "@/lib/metrics";

export default async function ModulePage({ params, searchParams }: PageProps<"/m/[module]">) {
  const { module: id } = await params;
  const sp = await searchParams;
  const { business: b, user } = await requireArea(id);
  const mod = b.modules.find((m) => m.id === id && m.enabled);
  if (!mod) notFound();
  const rows = b.records[id] ?? [];
  return (
    <>
      <PageHeader title={mod.name} meta={`${mod.description || "Your records"} · ${rows.length.toLocaleString("en-IN")} records`} />
      {id === "payroll" && b.modules.some((m) => m.id === "employees" && m.enabled)
        ? <PayrollRun employees={b.records.employees ?? []} payroll={rows} fmt={{ currency: b.currency, locale: b.locale }} today={todayIso()} /> : null}
      {id === "inventory" && (b.profile.locations > 1 || rows.some((r) => r.data.location)) ? (
        <StockTransfer items={rows} locations={[...new Set(["Main", ...rows.map((r) => String(r.data.location || "Main")), ...Array.from({ length: Math.max(0, b.profile.locations - 1) }, (_, i) => `Location ${i + 2}`)])]} />
      ) : null}
      <RecordsPanel
        module={mod}
        rows={rows}
        fmt={{ currency: b.currency, locale: b.locale }}
        views={user.prefs?.views?.[id] ?? []}
        biz={{ name: b.name, upiId: b.upiId }}
        autoAdd={sp.add === "1"}
      />
    </>
  );
}
