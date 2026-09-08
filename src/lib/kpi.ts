import { KPIS, type Kpi } from "@/lib/mock";

export function kpi(code: string): Kpi {
  const k = KPIS.find((x) => x.code === code);
  if (!k) throw new Error(`unknown KPI: ${code}`);
  return k;
}

/** delta vs target and vs previous period, in the natural unit for the KPI */
export function kpiDeltas(k: Kpi): { value: number; label: string; suffix: string }[] {
  const absUnit = k.unit === "pct" ? "pts" : k.unit === "days" ? "d" : "%";
  const rel = k.unit === "money" || k.unit === "ratio" || k.unit === "score";
  const d = (ref: number) => (rel ? ((k.value - ref) / ref) * 100 : k.value - ref);
  return [
    { value: d(k.target), label: "vs target", suffix: rel ? "%" : absUnit },
    { value: d(k.previous), label: "vs prior", suffix: rel ? "%" : absUnit },
  ];
}
