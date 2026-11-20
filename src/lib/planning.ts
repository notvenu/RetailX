/**
 * Planning on top of the books: cash-flow forecast, per-product demand and reorder quantities, and event uplift
 * for forecasts (festivals, sales, promotions). Pure; runs on server and client. Self-check: `node src/lib/planning.ts`
 */
import { runForecast } from "./forecast.ts";
import type { BizEvent, Business, KpiDef, RecordRow } from "./model";

const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, "")) || 0);
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return day(d); };
const dateOf = (r: RecordRow, field = "date") => String(r.data[field] ?? r.at).slice(0, 10);
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const k = s.length >> 1; return s.length ? (s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2) : 0; };

type Data = Pick<Business, "modules" | "records" | "cash" | "events">;

/** Daily totals of `field` over the last `days` days up to yesterday, zero-filled. */
export function dailyTotals(rows: RecordRow[], field: string, days: number, today: string, filter?: (r: RecordRow) => boolean) {
  const start = addDays(today, -days);
  const by = new Map<string, number>();
  for (const r of rows) {
    const d = dateOf(r);
    if (d < start || d >= today || (filter && !filter(r))) continue;
    by.set(d, (by.get(d) ?? 0) + num(r.data[field] ?? (field === "quantity" ? 1 : 0)));
  }
  return Array.from({ length: days }, (_, i) => { const d = addDays(start, i); return { date: d, value: by.get(d) ?? 0 }; });
}

/* ---------------- event uplift ---------------- */

/** Festival dates for India. Lunar festivals move every year; these are approximate, so check and edit them. */
export const FESTIVALS: Omit<BizEvent, "id">[] = [
  { date: "2025-10-18", name: "Diwali", days: 5 }, { date: "2026-11-06", name: "Diwali", days: 5 }, { date: "2027-10-27", name: "Diwali", days: 5 },
  { date: "2026-03-04", name: "Holi", days: 2 }, { date: "2027-03-22", name: "Holi", days: 2 },
  { date: "2026-03-20", name: "Eid al-Fitr", days: 2 }, { date: "2027-03-10", name: "Eid al-Fitr", days: 2 },
  { date: "2026-09-14", name: "Ganesh Chaturthi", days: 3 }, { date: "2027-09-04", name: "Ganesh Chaturthi", days: 3 },
  { date: "2026-10-11", name: "Navratri", days: 9 }, { date: "2027-09-30", name: "Navratri", days: 9 },
  { date: "2026-10-20", name: "Dussehra", days: 1 }, { date: "2027-10-09", name: "Dussehra", days: 1 },
  { date: "2026-08-28", name: "Raksha Bandhan", days: 1 }, { date: "2027-08-17", name: "Raksha Bandhan", days: 1 },
  { date: "2027-01-14", name: "Makar Sankranti / Pongal", days: 2 }, { date: "2026-01-14", name: "Makar Sankranti / Pongal", days: 2 },
  { date: "2025-12-25", name: "Christmas", days: 1 }, { date: "2026-12-25", name: "Christmas", days: 1 }, { date: "2027-12-25", name: "Christmas", days: 1 },
];

/** Every date an event covers, mapped to the event's name. */
export function eventDays(events: BizEvent[] = []) {
  const m = new Map<string, string>();
  for (const e of events) for (let i = 0; i < (e.days ?? 1); i++) m.set(addDays(e.date, i), e.name);
  return m;
}

/**
 * How much busier (or quieter) event days were than an ordinary day of the same weekday, per event name, plus an
 * overall figure for events seen for the first time. Learned from a daily series.
 */
export function learnUplift(series: { date: string; value: number }[], events: BizEvent[] = []) {
  const ev = eventDays(events);
  const ratios: Record<string, number[]> = {};
  series.forEach((p, i) => {
    const name = ev.get(p.date);
    if (!name) return;
    // the same weekday in the 4 weeks before, ignoring other event days
    const base = [7, 14, 21, 28].map((k) => series[i - k]).filter((q) => q && !ev.has(q.date)).map((q) => q!.value);
    const b = median(base);
    if (b > 0) (ratios[name] ??= []).push(p.value / b);
  });
  const byName = Object.fromEntries(Object.entries(ratios).map(([k, v]) => [k, mean(v)]));
  const all = Object.values(ratios).flat();
  return { byName, overall: all.length ? mean(all) : 1, samples: all.length };
}

/** Multiplies a daily forecast by the learned uplift on future event days. */
export function applyUplift(dates: string[], values: number[], events: BizEvent[] = [], uplift = { byName: {} as Record<string, number>, overall: 1 }) {
  const ev = eventDays(events);
  return values.map((v, i) => { const name = ev.get(dates[i]); return name ? v * (uplift.byName[name] ?? uplift.overall) : v; });
}

/* ---------------- stock planning ---------------- */

export type StockLine = {
  id: string; name: string; onHand: number; avgDaily: number; demand: number; safety: number; reorder: number; coverDays: number | null;
  status: "order" | "watch" | "ok" | "no sales"; supplier?: string;
};

const Z: Record<number, number> = { 0.9: 1.2816, 0.95: 1.6449, 0.98: 2.0537, 0.99: 2.3263 };

/**
 * For each stock item, demand from the sales register (sales whose item matches the product name), forecast over
 * lead time + review period with a weekly pattern, safety stock at the chosen service level, and how much to order.
 */
export function stockPlan(b: Data, o: { leadDays: number; reviewDays: number; service: number }, today: string): StockLine[] {
  const items = b.records.inventory ?? [];
  const sales = b.records.sales ?? [];
  const horizon = o.leadDays + o.reviewDays;
  return items.map((it) => {
    const name = String(it.data.name ?? "").trim();
    const onHand = num(it.data.on_hand);
    const key = name.toLowerCase();
    const series = dailyTotals(sales, "quantity", 56, today, (r) => String(r.data.item ?? "").trim().toLowerCase() === key);
    const y = series.map((p) => p.value);
    const sold = y.reduce((s, x) => s + x, 0);
    if (!name || sold === 0) return { id: it.id, name, onHand, avgDaily: 0, demand: 0, safety: 0, reorder: 0, coverDays: null, status: "no sales" as const, supplier: String(it.data.supplier ?? "") || undefined };
    const r = runForecast(y, { model: "auto", season: 7, seasonCandidate: 7, horizon, confidence: 90, transform: "none", selectBy: "mae" });
    const demand = Math.max(0, (r?.forecast ?? Array(horizon).fill(mean(y))).reduce((s, x) => s + Math.max(0, x), 0));
    const resid = r ? y.map((v, i) => (r.fitted[i] == null ? null : v - r.fitted[i]!)).filter((x): x is number => x != null) : [];
    const sd = Math.sqrt(mean(resid.map((x) => x * x))) || Math.sqrt(mean(y));
    const safety = (Z[o.service] ?? 1.6449) * sd * Math.sqrt(o.leadDays);
    const avgDaily = sold / y.length;
    const reorder = Math.max(0, Math.ceil(demand + safety - onHand));
    const coverDays = avgDaily > 0 ? onHand / avgDaily : null;
    return {
      id: it.id, name, onHand, avgDaily, demand: Math.round(demand), safety: Math.ceil(safety), reorder, coverDays,
      status: (reorder > 0 && (coverDays ?? 0) <= o.leadDays ? "order" : reorder > 0 ? "watch" : "ok") as StockLine["status"],
      supplier: String(it.data.supplier ?? "") || undefined,
    };
  }).sort((a, b) => ({ order: 0, watch: 1, ok: 2, "no sales": 3 })[a.status] - ({ order: 0, watch: 1, ok: 2, "no sales": 3 })[b.status] || b.reorder - a.reorder);
}

/* ---------------- cash flow ---------------- */

export type CashWeek = { start: string; label: string; inflow: number; outflow: number; net: number; balance: number; lines: { label: string; amount: number }[] };
export type CashPlan = { opening: number; openingAsOf: string; weeks: CashWeek[]; lowest: number; runOutWeek: string | null; assumptions: string[] };

/**
 * 13 weeks of cash. Opening balance = the balance the owner entered, moved by recorded receipts and payments since
 * that date. Then, each week: expected sales receipts (forecast weekly revenue × the share paid on the spot, plus
 * credit sales collected after the business's usual delay), unpaid bills collected, regular expenses by category,
 * salaries on the 1st, purchases at their recent weekly rate (or cost of goods when purchases aren't recorded).
 */
export function cashFlow(b: Data, revenueKpi: KpiDef | undefined, today: string, weeks = 13): CashPlan | null {
  const cash = b.cash;
  if (!cash) return null;
  const sales = b.records.sales ?? [], expenses = b.records.expenses ?? [], purchases = b.records.purchases ?? [];
  const employees = b.records.employees ?? [], payroll = b.records.payroll ?? [];
  const paidSale = (r: RecordRow) => String(r.data.payment ?? "Paid") === "Paid";
  const since = cash.asOf;
  const between = (r: RecordRow) => dateOf(r) >= since && dateOf(r) < today;
  const assumptions: string[] = [];

  // opening: entered balance moved by what was recorded since
  let opening = cash.balance;
  opening += sales.filter((r) => between(r) && paidSale(r)).reduce((s, r) => s + num(r.data.amount), 0);
  opening -= expenses.filter(between).reduce((s, r) => s + num(r.data.amount), 0);
  opening -= purchases.filter((r) => between(r) && r.data.status === "Received").reduce((s, r) => s + num(r.data.amount), 0);
  opening -= payroll.filter(between).reduce((s, r) => s + num(r.data.net ?? r.data.gross), 0);
  if (since < today) assumptions.push(`Opening balance: ${cash.balance.toLocaleString("en-IN")} on ${since}, moved by the receipts and payments recorded since.`);

  // weekly sales from the last 12 weeks, projected with the forecasting engine
  const daily = dailyTotals(sales, "amount", 84, today);
  const weekly = Array.from({ length: 12 }, (_, w) => daily.slice(w * 7, w * 7 + 7).reduce((s, p) => s + p.value, 0));
  const hasSales = weekly.some((x) => x > 0);
  const fc = hasSales ? runForecast(weekly, { model: "auto", season: "none", seasonCandidate: 1, horizon: weeks, confidence: 80, transform: "none", selectBy: "mae" }) : null;
  const futureSales = fc?.forecast.map((x) => Math.max(0, x)) ?? Array(weeks).fill(mean(weekly));
  const recent = sales.filter((r) => dateOf(r) >= addDays(today, -84));
  const total = recent.reduce((s, r) => s + num(r.data.amount), 0);
  const paidShare = total ? recent.filter(paidSale).reduce((s, r) => s + num(r.data.amount), 0) / total : 1;
  const cogsShare = total ? recent.reduce((s, r) => s + num(r.data.cost), 0) / total : 0;
  if (hasSales) assumptions.push(`Sales: ${Math.round(paidShare * 100)}% paid on the spot (last 12 weeks); credit sales arrive 2 weeks later.`);

  const receivable = sales.filter((r) => !paidSale(r)).reduce((s, r) => s + num(r.data.amount), 0);
  if (receivable) assumptions.push(`Unpaid bills (${Math.round(receivable).toLocaleString("en-IN")}) are collected evenly over the next 4 weeks.`);

  // regular expenses: weekly average per category over the last 12 weeks
  const recentExp = expenses.filter((r) => dateOf(r) >= addDays(today, -84) && dateOf(r) < today);
  const byCat = new Map<string, number>();
  for (const r of recentExp) byCat.set(String(r.data.category ?? "Other"), (byCat.get(String(r.data.category ?? "Other")) ?? 0) + num(r.data.amount));
  if (byCat.size) assumptions.push("Expenses: each category's weekly average over the last 12 weeks continues.");

  const salaries = employees.filter((r) => r.data.status !== "Exited").reduce((s, r) => s + num(r.data.salary), 0)
    || (payroll.length ? mean(Object.values(groupMonth(payroll, "gross"))) : 0);
  if (salaries) assumptions.push(`Salaries of ${Math.round(salaries).toLocaleString("en-IN")} are paid in the week containing the 1st.`);

  const recentPur = purchases.filter((r) => dateOf(r) >= addDays(today, -84) && dateOf(r) < today && r.data.status !== "Cancelled");
  const weeklyPurchases = recentPur.reduce((s, r) => s + num(r.data.amount), 0) / 12;
  const openPOs = purchases.filter((r) => r.data.status === "Ordered");
  if (recentPur.length) assumptions.push("Stock purchases: the last 12 weeks' weekly average; open purchase orders are paid when due.");
  else if (cogsShare) assumptions.push(`No purchase records, so restocking is estimated at cost of goods (${Math.round(cogsShare * 100)}% of sales).`);

  const out: CashWeek[] = [];
  let balance = opening;
  for (let w = 0; w < weeks; w++) {
    const start = addDays(today, w * 7), end = addDays(start, 7);
    const lines: { label: string; amount: number }[] = [];
    const sale = futureSales[w] ?? 0;
    if (sale) lines.push({ label: "Sales received", amount: sale * paidShare });
    if (w >= 2 && futureSales[w - 2]) lines.push({ label: "Credit sales collected", amount: futureSales[w - 2] * (1 - paidShare) });
    if (receivable && w < 4) lines.push({ label: "Unpaid bills collected", amount: receivable / 4 });
    for (const [cat, amt] of byCat) lines.push({ label: cat, amount: -amt / 12 });
    if (salaries && Array.from({ length: 7 }, (_, i) => addDays(start, i)).some((d) => d.endsWith("-01"))) lines.push({ label: "Salaries", amount: -salaries });
    if (recentPur.length) lines.push({ label: "Stock purchases", amount: -weeklyPurchases });
    else if (cogsShare) lines.push({ label: "Restocking (cost of goods)", amount: -sale * cogsShare });
    for (const po of openPOs) {
      const due = String(po.data.expected ?? po.data.date ?? "");
      if (due >= start && due < end) lines.push({ label: `PO ${po.data.po ?? ""} ${po.data.supplier ?? ""}`.trim(), amount: -num(po.data.amount) });
    }
    const inflow = lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
    const outflow = -lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0);
    balance += inflow - outflow;
    const d = new Date(start + "T00:00:00");
    out.push({ start, label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), inflow, outflow, net: inflow - outflow, balance, lines });
  }
  const neg = out.find((w) => w.balance < 0);
  return { opening, openingAsOf: today, weeks: out, lowest: Math.min(opening, ...out.map((w) => w.balance)), runOutWeek: neg?.start ?? null, assumptions };
}

function groupMonth(rows: RecordRow[], field: string) {
  const m: Record<string, number> = {};
  for (const r of rows) m[dateOf(r).slice(0, 7)] = (m[dateOf(r).slice(0, 7)] ?? 0) + num(r.data[field]);
  return m;
}

/* ---------------- self-check ---------------- */

if (typeof process !== "undefined" && process.argv[1]?.endsWith("planning.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
  const today = "2026-10-05";
  const row = (data: Record<string, unknown>): RecordRow => ({ id: Math.random().toString(36), at: today, by: "t", data: data as RecordRow["data"] });
  // 8 weeks of rice sales, ~10/day, Sundays double; one Diwali-like event doubling sales
  const sales: RecordRow[] = [];
  for (let i = 56; i >= 1; i--) {
    const d = addDays(today, -i);
    const sunday = new Date(d + "T00:00:00").getDay() === 0;
    sales.push(row({ date: d, item: "Rice 5kg", quantity: sunday ? 20 : 10, amount: (sunday ? 20 : 10) * 400, cost: (sunday ? 20 : 10) * 320, payment: i % 10 === 0 ? "Unpaid" : "Paid" }));
  }
  const data = {
    modules: [], cash: { balance: 100000, asOf: today },
    records: {
      sales, inventory: [row({ name: "Rice 5kg", on_hand: 40 }), row({ name: "Ghee 1L", on_hand: 5 })],
      expenses: Array.from({ length: 3 }, (_, k) => row({ date: addDays(today, -7 - k * 28), category: "Rent", amount: 30000 })),
    },
  } as unknown as Data;

  const plan = stockPlan(data, { leadDays: 3, reviewDays: 7, service: 0.95 }, today);
  const rice = plan.find((p) => p.name === "Rice 5kg")!;
  assert(rice.demand >= 100 && rice.demand <= 160, `10 days of rice demand ≈ 114–143, got ${rice.demand}`);
  assert(rice.reorder > 60 && rice.status !== "ok", `rice needs ordering, got ${JSON.stringify(rice)}`);
  assert(plan.find((p) => p.name === "Ghee 1L")!.status === "no sales", "items without sales are flagged, not guessed");

  const cf = cashFlow(data, undefined, today)!;
  assert(cf.weeks.length === 13 && cf.weeks[0].inflow > 20000, "weekly inflows " + cf.weeks[0].inflow);
  assert(cf.weeks.some((w) => w.lines.some((l) => l.label === "Rent")), "recurring expenses");
  assert(cf.weeks[0].lines.some((l) => l.label === "Restocking (cost of goods)"), "restocking from cost of goods");

  const series = dailyTotals(sales, "amount", 56, today).map((p, i) => (i === 40 ? { ...p, value: p.value * 2 } : p));
  const ev: BizEvent[] = [{ id: "e", date: series[40].date, name: "Diwali", days: 1 }];
  const up = learnUplift(series, ev);
  assert(Math.abs(up.byName.Diwali - 2) < 0.01, "learned 2× uplift, got " + up.byName.Diwali);
  assert(applyUplift(["2026-11-06", "2026-11-20"], [100, 100], [{ id: "x", date: "2026-11-06", name: "Diwali" }], up).join() === "200,100", "applies uplift");
  console.log(`planning self-check ok · rice: order ${rice.reorder} (demand ${rice.demand}, safety ${rice.safety}); cash lowest ${Math.round(cf.lowest)}`);
}
