/**
 * Questions the books can already answer but nobody asks until it hurts: who owes us and for how long, what stock
 * is not moving, which supplier is slipping, who at the counter is an outlier, which customers went quiet, and
 * why the planner says "order". Pure; reads Sales / Stock / Purchases / Day close rows. Self-check: `node src/lib/insights.ts`
 */
import type { RecordRow } from "./model";
import type { StockLine } from "./planning";

const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, "")) || 0);
const str = (v: unknown) => String(v ?? "").trim();
const dateOf = (r: RecordRow) => str(r.data.date ?? r.at).slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const r0 = (n: number) => Math.round(n);
/** One person = one key: the 10-digit phone if there is one, else the name. */
const who = (d: Record<string, unknown>) => {
  const p = str(d.phone).replace(/\D/g, "").slice(-10);
  return { key: p.length === 10 ? p : str(d.customer).toLowerCase(), name: str(d.customer) || "Walk-in", phone: p.length === 10 ? p : "" };
};

/* ---------------- customer ledger: dues and their age ---------------- */

/** `overdue`: the part past its due date (payment terms); bills without a due date fall due on the day. */
export type Due = { key: string; name: string; phone: string; owed: number; bills: number; oldestDays: number; b30: number; b60: number; b90: number; overdue: number };

/** Same rule as the counter: a sale that is not marked Paid is owed. Age runs from each bill's date (30 / 60 / 60+). */
export function receivables(sales: RecordRow[], today: string, payments: RecordRow[] = []): Due[] {
  const m = new Map<string, Due>();
  for (const r of sales) {
    if (!r.data.payment || r.data.payment === "Paid") continue;
    const amt = num(r.data.amount) + num(r.data.tcs), w = who(r.data);
    if (!w.key) continue;
    const age = Math.max(0, daysBetween(dateOf(r), today));
    const d = m.get(w.key) ?? { ...w, owed: 0, bills: 0, oldestDays: 0, b30: 0, b60: 0, b90: 0, overdue: 0 };
    d.owed += amt; d.bills++; d.oldestDays = Math.max(d.oldestDays, age);
    if ((str(r.data.due) || dateOf(r)) < today) d.overdue += amt;
    d[age <= 30 ? "b30" : age <= 60 ? "b60" : "b90"] += amt;
    if (w.phone) d.phone = w.phone;
    m.set(w.key, d);
  }
  // money received (Payments module, In) comes off the oldest dues first; a bounced cheque doesn't count
  for (const p of payments) {
    if (str(p.data.direction || "In") !== "In" || str(p.data.cheque_status) === "Bounced") continue;
    const ph = str(p.data.phone).replace(/\D/g, "").slice(-10);
    const d = m.get(ph.length === 10 ? ph : "") ?? m.get(str(p.data.party).toLowerCase()) ?? [...m.values()].find((x) => x.name.toLowerCase() === str(p.data.party).toLowerCase());
    if (!d) continue;
    let paid = num(p.data.amount) + num(p.data.tds);
    d.owed -= paid;
    d.overdue = Math.max(0, d.overdue - paid);
    for (const k of ["b90", "b60", "b30"] as const) { const t = Math.min(d[k], paid); d[k] -= t; paid -= t; }
  }
  return [...m.values()].filter((d) => d.owed > 0.5).sort((a, b) => b.owed - a.owed);
}

/* ---------------- stock that is not moving ---------------- */

export type Dead = { id: string; name: string; onHand: number; value: number; lastSold: string | null; idleDays: number | null; margin: number | null };

/** In stock, nothing sold for `days`. Value is at cost, i.e. the cash sitting on the shelf. */
export function deadStock(items: RecordRow[], sales: RecordRow[], today: string, days = 60): Dead[] {
  const last = new Map<string, string>();
  for (const s of sales) {
    if (num(s.data.amount) <= 0) continue;
    const k = str(s.data.item).toLowerCase(), d = dateOf(s);
    if (k && d > (last.get(k) ?? "")) last.set(k, d);
  }
  const out: Dead[] = [];
  for (const it of items) {
    const name = str(it.data.name), onHand = num(it.data.on_hand);
    if (!name || onHand <= 0) continue;
    const lastSold = last.get(name.toLowerCase()) ?? null;
    const idle = lastSold ? daysBetween(lastSold, today) : null;
    if (idle != null && idle < days) continue;
    const cost = num(it.data.unit_cost), price = num(it.data.price);
    out.push({ id: it.id, name, onHand, value: r0(onHand * cost), lastSold, idleDays: idle, margin: price > 0 && cost > 0 ? r0(((price - cost) / price) * 100) : null });
  }
  return out.sort((a, b) => b.value - a.value);
}

/* ---------------- expiry ---------------- */

export type Expiring = { id: string; name: string; onHand: number; expiry: string; daysLeft: number; perDay: number; atRisk: number; value: number };

/**
 * Stock with an expiry date inside `within` days (or already past). `atRisk` = units that will still be on the
 * shelf at that date at the last 8 weeks' selling pace, i.e. what to discount, move or return now.
 */
export function expiring(items: RecordRow[], sales: RecordRow[], today: string, within = 45): Expiring[] {
  const sold = new Map<string, number>();
  for (const s of sales) {
    const k = str(s.data.item).toLowerCase(), d = dateOf(s), q = num(s.data.quantity);
    if (k && q > 0 && num(s.data.amount) > 0 && daysBetween(d, today) >= 0 && daysBetween(d, today) < 56) sold.set(k, (sold.get(k) ?? 0) + q);
  }
  const out: Expiring[] = [];
  for (const it of items) {
    const exp = str(it.data.expiry).slice(0, 10), onHand = num(it.data.on_hand), name = str(it.data.name);
    if (!exp || !name || onHand <= 0) continue;
    const daysLeft = daysBetween(today, exp);
    if (daysLeft > within) continue;
    const perDay = (sold.get(name.toLowerCase()) ?? 0) / 56;
    const atRisk = Math.min(onHand, Math.max(0, Math.ceil(onHand - perDay * Math.max(0, daysLeft))));
    if (atRisk > 0) out.push({ id: it.id, name, onHand, expiry: exp, daysLeft, perDay, atRisk, value: r0(atRisk * num(it.data.unit_cost)) });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || b.value - a.value);
}

/* ---------------- suppliers ---------------- */

export type SupplierRow = { name: string; orders: number; spend: number; share: number; overdue: number; worstDrift: { item: string; pct: number } | null };

/** Spend and orders per supplier, open orders past their expected date, and the biggest unit-price rise per item. */
export function supplierScorecard(purchases: RecordRow[], today: string): SupplierRow[] {
  const by = new Map<string, RecordRow[]>();
  for (const r of purchases) if (r.data.status !== "Cancelled" && str(r.data.supplier)) (by.get(str(r.data.supplier)) ?? by.set(str(r.data.supplier), []).get(str(r.data.supplier))!).push(r);
  const total = [...by.values()].flat().reduce((s, r) => s + num(r.data.amount), 0) || 1;
  return [...by].map(([name, rows]) => {
    const spend = rows.reduce((s, r) => s + num(r.data.amount), 0);
    const overdue = rows.filter((r) => r.data.status === "Ordered" && str(r.data.expected) && str(r.data.expected) < today).length;
    const perItem = new Map<string, { d: string; p: number }[]>();
    for (const r of rows) {
      const q = num(r.data.quantity), item = str(r.data.item).toLowerCase();
      if (q > 0 && item) (perItem.get(item) ?? perItem.set(item, []).get(item)!).push({ d: dateOf(r), p: num(r.data.amount) / q });
    }
    let worst: SupplierRow["worstDrift"] = null;
    for (const [item, ps] of perItem) {
      if (ps.length < 2) continue;
      ps.sort((a, b) => a.d.localeCompare(b.d));
      const pct = ((ps.at(-1)!.p - ps[0].p) / ps[0].p) * 100;
      if (ps[0].p > 0 && pct > (worst?.pct ?? 0)) worst = { item, pct: Math.round(pct * 10) / 10 };
    }
    return { name, orders: rows.length, spend: r0(spend), share: Math.round((spend / total) * 100), overdue, worstDrift: worst };
  }).sort((a, b) => b.spend - a.spend);
}

/* ---------------- counter exceptions ---------------- */

export type Exception = { who: string; why: string };

/**
 * People whose numbers stand out: a return rate well above the shop's, or a drawer that keeps coming up short at
 * close. A prompt to look, never a verdict: needs a few events before it says anything.
 */
export function counterExceptions(sales: RecordRow[], closes: RecordRow[]): Exception[] {
  const out: Exception[] = [];
  const stat = new Map<string, { bills: Set<string>; returns: Set<string> }>();
  for (const r of sales) {
    const s = stat.get(r.by) ?? stat.set(r.by, { bills: new Set(), returns: new Set() }).get(r.by)!;
    (num(r.data.amount) < 0 ? s.returns : s.bills).add(str(r.data.invoice) || r.id);
  }
  const all = [...stat.values()], B = all.reduce((s, x) => s + x.bills.size, 0), R = all.reduce((s, x) => s + x.returns.size, 0);
  const shop = B ? R / B : 0;
  for (const [by, s] of stat)
    if (s.returns.size >= 3 && s.bills.size && s.returns.size / s.bills.size > Math.max(0.05, shop * 2))
      out.push({ who: by, why: `${s.returns.size} returns on ${s.bills.size} bills (${Math.round((s.returns.size / s.bills.size) * 100)}%, shop average ${Math.round(shop * 100)}%)` });
  const short = new Map<string, { n: number; total: number; days: number }>();
  for (const c of closes) {
    const by = str(c.data.closed_by) || "Unknown", s = short.get(by) ?? short.set(by, { n: 0, total: 0, days: 0 }).get(by)!;
    s.days++;
    if (num(c.data.difference) < -0.5) { s.n++; s.total += num(c.data.difference); }
  }
  for (const [by, s] of short)
    if (s.n >= 3 && s.n / s.days >= 0.4) out.push({ who: by, why: `drawer short on ${s.n} of ${s.days} closes, ${r0(-s.total)} in all` });
  return out;
}

/* ---------------- customers: best and gone quiet ---------------- */

export type Cust = { key: string; name: string; phone: string; spend: number; bills: number; last: string; quietDays: number };

export function customerValue(sales: RecordRow[], today: string): { best: Cust[]; lapsed: Cust[] } {
  const m = new Map<string, Cust & { inv: Set<string> }>();
  for (const r of sales) {
    const w = who(r.data);
    if (!w.key || w.name === "Walk-in") continue;
    const c = m.get(w.key) ?? { ...w, spend: 0, bills: 0, last: "", quietDays: 0, inv: new Set<string>() };
    c.spend += num(r.data.amount);
    if (num(r.data.amount) > 0) c.inv.add(str(r.data.invoice) || r.id);
    if (dateOf(r) > c.last) c.last = dateOf(r);
    if (w.phone) c.phone = w.phone;
    m.set(w.key, c);
  }
  const all = [...m.values()].map((c) => ({ key: c.key, name: c.name, phone: c.phone, spend: r0(c.spend), bills: c.inv.size, last: c.last, quietDays: daysBetween(c.last, today) }));
  const best = all.filter((c) => c.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 10);
  // Went quiet = good customer (3+ bills) whose gap now is over twice their typical one; fall back to 45 days.
  const lapsed = all.filter((c) => c.bills >= 3 && c.quietDays >= 45).sort((a, b) => b.spend - a.spend).slice(0, 10);
  return { best, lapsed };
}

/* ---------------- the morning watch-list ---------------- */

/** The few things worth a line in a morning briefing: old dues, expiring stock, idle cash, late supplier orders. */
export function watchList(b: { records: Record<string, RecordRow[]> }, today: string, fmt: (n: number) => string): { money: string[]; shelf: string[] } {
  const sales = b.records.sales ?? [], stock = b.records.inventory ?? [], purchases = b.records.purchases ?? [];
  const money: string[] = [], shelf: string[] = [];
  const dues = receivables(sales, today, b.records.payments ?? []), old = dues.filter((d) => d.b90 > 0);
  if (old.length) money.push(`${old.length} customer${old.length > 1 ? "s owe" : " owes"} ${fmt(old.reduce((t, d) => t + d.b90, 0))} for over 60 days, starting with ${old[0].name}. Send reminders from Insights.`);
  else if (dues.length) money.push(`${fmt(dues.reduce((t, d) => t + d.owed, 0))} is owed to you across ${dues.length} customers, none over 60 days.`);
  const exp = expiring(stock, sales, today, 30);
  if (exp.length) shelf.push(`${exp.length} product${exp.length > 1 ? "s" : ""} expire within 30 days and won't all sell in time (${exp.slice(0, 3).map((e) => e.name).join(", ")}). Discount or move them now.`);
  const dead = deadStock(stock, sales, today);
  if (dead.length && dead[0].value > 0) shelf.push(`${fmt(dead.reduce((t, d) => t + d.value, 0))} of stock at cost has not sold in 60 days, led by ${dead[0].name}.`);
  const late = supplierScorecard(purchases, today).filter((x) => x.overdue);
  if (late.length) shelf.push(`${late.reduce((t, x) => t + x.overdue, 0)} supplier order${late.length > 1 || late[0].overdue > 1 ? "s are" : " is"} past the expected date (${late.map((x) => x.name).slice(0, 3).join(", ")}). Chase them.`);
  return { money, shelf };
}

/* ---------------- why the planner says order ---------------- */

/** One plain sentence for a stock line, from the same numbers the planner used. */
export function explainLine(l: StockLine, leadDays: number): string {
  if (l.status === "no sales") return "No sales recorded for this product, so nothing is suggested.";
  const cover = l.coverDays == null ? "" : ` ${l.onHand} on hand lasts about ${l.coverDays.toFixed(1)} days${l.coverDays <= leadDays ? `, shorter than the ${leadDays}-day wait for stock` : ""}.`;
  return `Sells about ${l.avgDaily.toFixed(1)} a day; expected demand until the next delivery is ${l.demand}, plus ${l.safety} spare for busy days.${cover}${l.reorder > 0 ? ` Order ${l.reorder}.` : " Enough for now."}`;
}

/* ---------------- self-check ---------------- */

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("insights.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
  const row = (id: string, data: Record<string, unknown>, by = "u1"): RecordRow => ({ id, at: "2026-11-01T00:00:00Z", by, data: data as RecordRow["data"] });
  const T = "2026-11-19";

  const dues = receivables([
    row("a", { date: "2026-11-15", customer: "Asha", phone: "98765 43210", amount: 300, payment: "Unpaid" }),
    row("b", { date: "2026-08-01", customer: "Asha", phone: "9876543210", amount: 700, payment: "Unpaid" }),
    row("c", { date: "2026-11-10", customer: "Ravi", amount: 50, payment: "Paid" }),
    row("d", { date: "2026-10-01", customer: "Ravi", amount: 200, payment: "Part-paid" }),
  ], T);
  assert(dues.length === 2 && dues[0].name === "Asha" && dues[0].owed === 1000 && dues[0].bills === 2, "dues grouped by phone " + JSON.stringify(dues));
  assert(dues[0].b30 === 300 && dues[0].b90 === 700 && dues[1].b60 === 200, "ageing buckets");
  const paidOff = receivables([row("a", { date: "2026-11-15", customer: "Asha", phone: "9876543210", amount: 300, payment: "Unpaid" }),
    row("b", { date: "2026-08-01", customer: "Asha", phone: "9876543210", amount: 700, payment: "Unpaid" })], T,
  [row("p", { direction: "In", party: "Asha", phone: "9876543210", amount: 750, tds: 50 }), row("q", { direction: "In", party: "Asha", amount: 999, cheque_status: "Bounced" })]);
  assert(paidOff[0].owed === 200 && paidOff[0].b90 === 0 && paidOff[0].b30 === 200, "payment clears the oldest first " + JSON.stringify(paidOff));

  const inv = [row("i1", { name: "Rice", on_hand: 20, unit_cost: 40, price: 50 }), row("i2", { name: "Salt", on_hand: 5, unit_cost: 10 }), row("i3", { name: "Oil", on_hand: 0 }), row("i4", { name: "Tea", on_hand: 3, unit_cost: 100 })];
  const dead = deadStock(inv, [row("s1", { date: "2026-11-17", item: "Salt", amount: 20 }), row("s2", { date: "2026-08-01", item: "Rice", amount: 100 })], T, 60);
  assert(dead.map((d) => d.name).join() === "Rice,Tea" && dead[0].value === 800 && dead[0].margin === 20 && dead[1].lastSold === null, "dead stock " + JSON.stringify(dead));

  const exp = expiring([row("e1", { name: "Milk", on_hand: 20, unit_cost: 30, expiry: "2026-11-29" }), row("e2", { name: "Tin", on_hand: 5, expiry: "2027-06-01" }), row("e3", { name: "Curd", on_hand: 4, unit_cost: 10, expiry: "2026-11-25" })],
    [row("m1", { date: "2026-11-10", item: "Milk", quantity: 56, amount: 100 }), row("m2", { date: "2026-11-10", item: "Curd", quantity: 56, amount: 100 })], T);
  assert(exp.length === 1 && exp[0].name === "Milk" && exp[0].atRisk === 10 && exp[0].value === 300, "expiring " + JSON.stringify(exp));

  const sup = supplierScorecard([
    row("p1", { date: "2026-09-01", supplier: "Acme", item: "Rice", quantity: 10, amount: 400, status: "Received" }),
    row("p2", { date: "2026-11-01", supplier: "Acme", item: "Rice", quantity: 10, amount: 500, status: "Ordered", expected: "2026-11-10" }),
    row("p3", { date: "2026-11-02", supplier: "Zed", item: "Oil", quantity: 1, amount: 100, status: "Cancelled" }),
  ], T);
  assert(sup.length === 1 && sup[0].overdue === 1 && sup[0].worstDrift?.pct === 25 && sup[0].share === 100, "supplier " + JSON.stringify(sup));

  const ex = counterExceptions(
    [...Array(20)].map((_, i) => row("b" + i, { invoice: "B" + i, amount: 100 }, "ann")).concat([...Array(4)].map((_, i) => row("r" + i, { invoice: "R" + i, amount: -50 }, "bob")), [...Array(10)].map((_, i) => row("c" + i, { invoice: "C" + i, amount: 80 }, "bob"))),
    [...Array(5)].map((_, i) => row("d" + i, { closed_by: "bob", difference: i < 3 ? -40 : 0 })),
  );
  assert(ex.length === 2 && ex.every((e) => e.who === "bob") && !ex.some((e) => e.who === "ann"), "exceptions " + JSON.stringify(ex));

  const cv = customerValue([...Array(3)].map((_, i) => row("v" + i, { invoice: "V" + i, date: "2026-09-0" + (i + 1), customer: "Meena", phone: "9000000001", amount: 500 })).concat([row("w", { date: "2026-11-18", customer: "Kiran", phone: "9000000002", amount: 100 })]), T);
  assert(cv.best[0].name === "Meena" && cv.best[0].spend === 1500 && cv.lapsed.length === 1 && cv.lapsed[0].name === "Meena", "customers " + JSON.stringify(cv));

  const wl = watchList({ records: { sales: [row("a", { date: "2026-08-01", customer: "Asha", amount: 500, payment: "Unpaid" })], inventory: [row("e", { name: "Milk", on_hand: 20, unit_cost: 30, expiry: "2026-11-29" })] } }, T, (n) => "₹" + n);
  assert(wl.money.length === 1 && wl.money[0].includes("Asha") && wl.shelf.length >= 1 && wl.shelf[0].includes("Milk"), "watch-list " + JSON.stringify(wl));

  const line: StockLine = { id: "1", name: "Rice", onHand: 6, avgDaily: 3, demand: 30, safety: 8, reorder: 32, coverDays: 2, status: "order" };
  assert(explainLine(line, 3).includes("shorter than the 3-day") && explainLine(line, 3).includes("Order 32"), "explain");
  console.log("insights self-check ok");
}
