/**
 * Monthly pay run from the Team list: gross, provident fund (PF) and ESI deductions, net. Pure; the same function
 * previews on screen and writes on the server. Self-check: `node src/lib/payroll.ts`
 *
 * Rates are the statutory defaults: employee PF 12% of wages up to the ₹15,000 wage ceiling, employee ESI 0.75% of
 * gross when gross is ₹21,000 a month or less. ponytail: wages = gross (not basic + DA split), no professional tax or
 * TDS, no attendance or loss-of-pay days. Add them when a business needs them; they differ by state and by company.
 */
import type { RecordRow } from "./model";

export const PF_RATE = 0.12, PF_CEILING = 15000, ESI_RATE = 0.0075, ESI_LIMIT = 21000;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, "")) || 0);

export function payslip(gross: number, o: { pf?: boolean; esi?: boolean } = {}) {
  const pf = o.pf === false ? 0 : r2(Math.min(gross, PF_CEILING) * PF_RATE);
  const esi = o.esi === false || gross > ESI_LIMIT ? 0 : Math.ceil(gross * ESI_RATE); // ESI rounds up to the next rupee
  return { gross: r2(gross), pf, esi, deductions: r2(pf + esi), net: r2(gross - pf - esi) };
}

export type PayLine = { employee: string; gross: number; pf: number; esi: number; deductions: number; net: number; done: boolean };

/** Who gets paid for `month` (YYYY-MM): everyone on the team not Exited with a salary; `done` if already in Payroll. */
export function payRun(employees: RecordRow[], payroll: RecordRow[], month: string): PayLine[] {
  const paid = new Set(payroll.filter((r) => String(r.data.date ?? "").slice(0, 7) === month).map((r) => String(r.data.employee ?? "").trim().toLowerCase()));
  return employees
    .filter((e) => String(e.data.status ?? "Active") !== "Exited" && num(e.data.salary) > 0 && String(e.data.name ?? "").trim())
    .map((e) => {
      const employee = String(e.data.name).trim();
      return { employee, ...payslip(num(e.data.salary)), done: paid.has(employee.toLowerCase()) };
    });
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("payroll.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
  const a = payslip(12000), b = payslip(30000), c = payslip(20000);
  assert(a.pf === 1440 && a.esi === 90 && a.net === 10470, "below both ceilings " + JSON.stringify(a));
  assert(b.pf === 1800 && b.esi === 0 && b.net === 28200, "PF capped, no ESI above 21000 " + JSON.stringify(b));
  assert(c.esi === 150 && c.pf === 1800, "ESI " + JSON.stringify(c));
  assert(payslip(30000, { pf: false }).deductions === 0, "PF can be switched off");
  const row = (id: string, data: Record<string, unknown>): RecordRow => ({ id, at: "", by: "", data: data as RecordRow["data"] });
  const run = payRun(
    [row("1", { name: "Asha", salary: 12000 }), row("2", { name: "Ravi", salary: 30000, status: "Exited" }), row("3", { name: "Meena", salary: 20000, status: "Probation" }), row("4", { name: "NoPay" })],
    [row("p", { date: "2026-11-30", employee: "meena" }), row("q", { date: "2026-10-31", employee: "Asha" })], "2026-11");
  assert(run.length === 2 && run[0].employee === "Asha" && !run[0].done && run[1].done, "run " + JSON.stringify(run));
  console.log("payroll self-check ok");
}
