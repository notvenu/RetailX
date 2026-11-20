import { requireArea } from "@/lib/session";
import { DEFAULT_INPUTS, type BranchInputs } from "@/lib/branch";
import type { Business, RecordRow } from "@/lib/model";
import { BranchPlanner } from "@/components/BranchPlanner";

const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "")) || 0);
const monthOf = (r: RecordRow) => String(r.data.date ?? r.at).slice(0, 7);

/** Starts the evaluation from what an average existing location does today; anything unknown keeps the illustration. */
function defaultsFrom(b: Business): { inputs: BranchInputs; basis: string } {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const months = (rows: RecordRow[]) => [...new Set(rows.map(monthOf))].filter((m) => m < thisMonth).sort().slice(-3);
  const perMonth = (rows: RecordRow[], field: string, filter: (r: RecordRow) => boolean = () => true) => {
    const ms = months(rows);
    return ms.length ? rows.filter((r) => ms.includes(monthOf(r)) && filter(r)).reduce((s, r) => s + num(r.data[field]), 0) / ms.length : 0;
  };
  const locs = Math.max(1, b.profile.locations);
  const sales = b.records.sales ?? [], expenses = b.records.expenses ?? [];
  const revenue = perMonth(sales, "amount") / locs;
  const cost = perMonth(sales, "cost") / locs;
  const staff = (b.records.employees ?? []).filter((r) => r.data.status !== "Exited");
  const rent = perMonth(expenses, "amount", (r) => r.data.category === "Rent") / locs;
  const utilities = perMonth(expenses, "amount", (r) => r.data.category === "Utilities") / locs;
  const other = perMonth(expenses, "amount", (r) => !["Rent", "Utilities"].includes(String(r.data.category))) / locs;
  const used: string[] = [];
  const pick = (v: number, d: number, what: string) => (v > 0 ? (used.push(what), Math.round(v)) : d);
  const inputs: BranchInputs = {
    ...DEFAULT_INPUTS,
    name: `Location ${locs + 1}`,
    location: b.city,
    expectedMonthlySales: pick(revenue, DEFAULT_INPUTS.expectedMonthlySales, "sales"),
    grossMarginPct: revenue > 0 && cost > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : DEFAULT_INPUTS.grossMarginPct,
    employeeCount: staff.length ? Math.max(1, Math.round(staff.length / locs)) : DEFAULT_INPUTS.employeeCount,
    monthlyPayroll: pick(staff.reduce((s, r) => s + num(r.data.salary), 0) / locs, DEFAULT_INPUTS.monthlyPayroll, "payroll"),
    monthlyRent: pick(rent, DEFAULT_INPUTS.monthlyRent, "rent"),
    deposit: rent > 0 ? Math.round(rent * 3) : DEFAULT_INPUTS.deposit,
    monthlyUtilities: pick(utilities, DEFAULT_INPUTS.monthlyUtilities, "utilities"),
    otherMonthlyOpex: pick(other, DEFAULT_INPUTS.otherMonthlyOpex, "other costs"),
  };
  return {
    inputs,
    basis: used.length
      ? `Starts from an average existing location over the last 3 months (${used.join(", ")}). Change any assumption.`
      : "Illustrative starting numbers: record a few months of sales and expenses to start from your own.",
  };
}

export default async function PlannerPage() {
  const { business: b } = await requireArea("analytics");
  const { inputs, basis } = defaultsFrom(b);
  return <BranchPlanner defaults={inputs} basis={basis} fmt={{ currency: b.currency, locale: b.locale }} />;
}
