/**
 * Market benchmarks: where a business's KPIs sit against businesses like it. Each benchmark is a range: p25 (a
 * quarter of businesses are below), p50 (the typical business) and p75, in the KPI's own unit.
 *
 * Three sources, most specific wins: the owner's own figures, figures researched on the web by the AI team (with
 * sources and a date), then the built-in reference ranges below. The built-in ranges are rules of thumb for Indian
 * MSMEs drawn from widely quoted industry norms. They are a starting point, not live data, and the page says so.
 * Only ratios and rates are benchmarked: absolute totals depend on the size of the business.
 * Self-check: `node src/lib/benchmarks.ts`
 */
import type { KpiDef } from "./model";

export type Range = { p25: number; p50: number; p75: number };
export type Benchmark = Range & {
  origin: "builtin" | "web" | "owner";
  note?: string;
  source?: string;
  url?: string;
  asOf?: string;
};

const r = (p25: number, p50: number, p75: number, note?: string) => ({ p25, p50, p75, note });

/** Ranges that hold across industries unless an industry or category says otherwise. */
const GENERAL: Record<string, Range & { note?: string }> = {
  gross_margin: r(20, 30, 40),
  net_margin: r(2, 6, 10),
  payroll_ratio: r(10, 15, 22, "Staff cost as a share of revenue"),
  stockout_rate: r(3, 6, 10, "Share of products out of stock"),
  win_rate: r(15, 25, 35, "Won deals out of decided deals"),
  utilization: r(60, 70, 80, "Billable hours out of hours worked"),
  project_margin: r(20, 30, 40),
  no_show_rate: r(5, 10, 15),
  return_rate: r(8, 15, 25, "Online orders returned"),
  shipping_share: r(6, 10, 15, "Shipping cost as a share of order value"),
  yield: r(90, 95, 98, "Produced out of planned"),
  rejection_rate: r(1, 3, 5, "Rejected out of produced"),
  on_time: r(85, 92, 97),
  trip_margin: r(8, 15, 22),
  fee_collection: r(80, 90, 97, "Fees collected out of fees billed"),
  food_cost_pct: r(28, 32, 36, "Food cost as a share of food sales"),
  waste_pct: r(4, 7, 10, "Waste as a share of food cost"),
  cancellation_rate: r(10, 18, 25, "Bookings cancelled; OTA-heavy hotels run higher"),
  harvest_margin: r(15, 25, 35),
};

const BY_INDUSTRY: Record<string, Record<string, Range & { note?: string }>> = {
  retail: { gross_margin: r(15, 22, 30), net_margin: r(1.5, 3, 5), payroll_ratio: r(6, 9, 12) },
  wholesale: { gross_margin: r(6, 10, 15), net_margin: r(1, 2, 4), payroll_ratio: r(3, 5, 8) },
  manufacturing: { gross_margin: r(20, 28, 35), net_margin: r(4, 7, 10), payroll_ratio: r(8, 12, 18) },
  services: { gross_margin: r(35, 45, 55), net_margin: r(8, 15, 22), payroll_ratio: r(35, 45, 55), project_margin: r(25, 35, 45) },
  healthcare: { gross_margin: r(40, 55, 65), no_show_rate: r(5, 8, 12) },
  ecommerce: { gross_margin: r(35, 45, 55), net_margin: r(-5, 3, 8, "Many D2C brands run at a loss while growing") },
  wellness: { no_show_rate: r(5, 10, 15), gross_margin: r(45, 55, 65) },
  restaurant: { payroll_ratio: r(20, 25, 30) },
  hospitality: { cancellation_rate: r(12, 20, 28), payroll_ratio: r(18, 24, 30) },
  logistics: { trip_margin: r(6, 12, 18), on_time: r(85, 92, 96) },
  construction: { project_margin: r(10, 15, 22) },
  education: { fee_collection: r(75, 88, 95) },
  agriculture: { harvest_margin: r(10, 20, 30) },
};

/** Within retail, margins differ most by what is sold. */
const BY_CATEGORY: Record<string, Record<string, Range & { note?: string }>> = {
  "Grocery & supermarket": { gross_margin: r(15, 20, 25), net_margin: r(1, 2.5, 4) },
  "Apparel & fashion": { gross_margin: r(35, 45, 55), net_margin: r(4, 8, 12) },
  "Electronics & mobiles": { gross_margin: r(8, 12, 18), net_margin: r(1, 3, 5) },
  Pharmacy: { gross_margin: r(15, 20, 25), net_margin: r(3, 5, 8) },
  "Hardware & paints": { gross_margin: r(15, 22, 30) },
  "Books & stationery": { gross_margin: r(25, 32, 40) },
  Jewellery: { gross_margin: r(8, 12, 18), net_margin: r(2, 4, 6) },
  "Cloud kitchen": { food_cost_pct: r(30, 34, 38) },
  "Quick service": { food_cost_pct: r(28, 31, 35) },
};

export const BUILTIN_NOTE = "Built-in reference range: a rule of thumb for Indian MSMEs, not live market data.";

/** The benchmark for a KPI, most specific first: the owner's figure, web research, category, industry, general. */
export function benchmarkFor(
  b: { industry: string; category: string; benchmarks?: Record<string, Benchmark> },
  kpi: Pick<KpiDef, "id">,
): Benchmark | null {
  const own = b.benchmarks?.[kpi.id];
  if (own) return own;
  const base = BY_CATEGORY[b.category]?.[kpi.id] ?? BY_INDUSTRY[b.industry]?.[kpi.id] ?? GENERAL[kpi.id];
  return base ? { ...base, origin: "builtin" } : null;
}

export type Band = "top" | "above" | "below" | "bottom";

/**
 * Where a value sits in the range, read the right way round: for "lower is better" KPIs (costs, returns, rejects),
 * being under the 25th percentile is the top band.
 */
export function placement(value: number, bm: Range, higherIsBetter: boolean) {
  const [good, typical, weak] = higherIsBetter ? [bm.p75, bm.p50, bm.p25] : [bm.p25, bm.p50, bm.p75];
  const better = (a: number, c: number) => (higherIsBetter ? a >= c : a <= c);
  const band: Band = better(value, good) ? "top" : better(value, typical) ? "above" : better(value, weak) ? "below" : "bottom";
  const gap = higherIsBetter ? value - bm.p50 : bm.p50 - value; // positive = better than the typical business
  return { band, gap };
}

/** KPIs where the gap to the median converts straight into rupees: profit share of revenue, or cost share of revenue. */
const MARGINS = new Set(["gross_margin", "net_margin", "project_margin", "trip_margin", "harvest_margin"]);
const COST_SHARES = new Set(["payroll_ratio", "shipping_share"]);

/** Monthly money at stake in closing the gap to the median, given the month's revenue. Null when it doesn't apply. */
export function worthAtMedian(kpiId: string, value: number, bm: Range, monthlyRevenue: number | null): number | null {
  if (!monthlyRevenue || monthlyRevenue <= 0) return null;
  if (MARGINS.has(kpiId) && value < bm.p50) return (monthlyRevenue * (bm.p50 - value)) / 100;
  if (COST_SHARES.has(kpiId) && value > bm.p50) return (monthlyRevenue * (value - bm.p50)) / 100;
  return null;
}

/** Checks a researched / entered range before it is stored. */
export function validRange(x: unknown): x is Range {
  const v = x as Range;
  return !!v && [v.p25, v.p50, v.p75].every((n) => typeof n === "number" && Number.isFinite(n)) && v.p25 <= v.p50 && v.p50 <= v.p75;
}

/* ---------------- self-check ---------------- */

if (typeof process !== "undefined" && process.argv[1]?.endsWith("benchmarks.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
  const grocery = { industry: "retail", category: "Grocery & supermarket" };
  assert(benchmarkFor(grocery, { id: "gross_margin" })!.p50 === 20, "category beats industry");
  assert(benchmarkFor({ industry: "retail", category: "Toys" }, { id: "gross_margin" })!.p50 === 22, "industry beats general");
  assert(benchmarkFor({ industry: "other", category: "General" }, { id: "gross_margin" })!.p50 === 30, "general fallback");
  assert(benchmarkFor(grocery, { id: "revenue" }) === null, "absolute totals aren't benchmarked");
  const own = { ...grocery, benchmarks: { gross_margin: { p25: 10, p50: 11, p75: 12, origin: "owner" as const } } };
  assert(benchmarkFor(own, { id: "gross_margin" })!.origin === "owner", "owner's figure wins");

  const gm = { p25: 15, p50: 20, p75: 25 };
  assert(placement(26, gm, true).band === "top" && placement(21, gm, true).band === "above", "higher is better");
  assert(placement(16, gm, true).band === "below" && placement(10, gm, true).band === "bottom", "lower bands");
  const food = { p25: 28, p50: 32, p75: 36 };
  assert(placement(27, food, false).band === "top" && placement(38, food, false).band === "bottom", "lower is better flips");
  assert(placement(30, food, false).gap === 2, "gap is positive when better than median");

  assert(worthAtMedian("gross_margin", 18, gm, 1_000_000) === 20_000, "2 pts of margin on ₹10 L = ₹20k");
  assert(worthAtMedian("gross_margin", 22, gm, 1_000_000) === null, "nothing at stake above median");
  assert(worthAtMedian("payroll_ratio", 12, { p25: 6, p50: 9, p75: 12 }, 1_000_000) === 30_000, "cost share over median");
  assert(validRange({ p25: 1, p50: 2, p75: 3 }) && !validRange({ p25: 3, p50: 2, p75: 1 }) && !validRange({ p25: NaN, p50: 2, p75: 3 }), "range checks");
  console.log("benchmarks self-check ok");
}
