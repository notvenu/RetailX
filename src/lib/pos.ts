/**
 * The billing counter (ported from the FitSecret POS): pricing a multi-line bill, finding items by barcode / SKU /
 * name, bill numbers, the day-close (Z report) totals and Code 128 barcodes for shelf labels. Pure, so the counter
 * screen and the server agree on every rupee. Self-check: `node src/lib/pos.ts`
 *
 * A bill is saved as one Sales record per line, sharing an invoice number: GST, HSN, breakdowns and stock planning
 * keep working line by line, and "bills" KPIs count distinct invoice numbers.
 */
import type { RecordRow, Value } from "./model";

export const MODES = ["Cash", "UPI", "Card", "Credit"] as const;
export type Mode = (typeof MODES)[number];
/** preturn = goods sent back to a supplier (a debit note) */
export type BillKind = "sale" | "return" | "purchase" | "preturn";

export type CartLine = {
  /** Stock record id; none for a service or anything not kept in stock */
  itemId?: string;
  name: string;
  qty: number;
  rate: number;
  /** line discount, % */
  disc?: number;
  gst?: number;
  hsn?: string;
  category?: string;
  /** unit cost, for gross profit */
  cost?: number;
  /** serial / IMEI of the unit sold */
  serial?: string;
};
export type PricedLine = CartLine & { gross: number; amount: number };

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const n = (v: Value | undefined) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, "")) || 0);

/** "10%" → 10% of the subtotal, "50" → ₹50; never negative, never more than the bill. */
export function billDiscount(input: string, subtotal: number) {
  const s = String(input ?? "").trim();
  const v = parseFloat(s) || 0;
  return r2(Math.min(Math.max(s.endsWith("%") ? (subtotal * v) / 100 : v, 0), subtotal));
}

/** Line discounts first, then the bill discount spread over the lines in proportion, so each line's GST drops with it. */
export function priceBill(lines: CartLine[], discount = "") {
  const gross = lines.map((l) => r2(l.qty * l.rate * (1 - Math.min(Math.max(l.disc ?? 0, 0), 100) / 100)));
  const subtotal = r2(gross.reduce((s, g) => s + g, 0));
  const off = billDiscount(discount, subtotal);
  const f = subtotal ? 1 - off / subtotal : 1;
  const priced: PricedLine[] = lines.map((l, i) => ({ ...l, gross: gross[i], amount: r2(gross[i] * f) }));
  // the paisa lost to rounding goes on the last line, so the lines add up to the bill exactly
  const total = r2(subtotal - off);
  const drift = r2(total - priced.reduce((s, l) => s + l.amount, 0));
  if (priced.length && drift) priced[priced.length - 1].amount = r2(priced[priced.length - 1].amount + drift);
  return { lines: priced, subtotal, discount: off, total };
}

/** What the customer is likely to hand over: the next ₹100 / ₹500 / ₹2000 above the bill. */
export const tenders = (total: number) => [...new Set([100, 500, 2000].map((x) => Math.ceil(total / x) * x))].filter((x) => x > total).slice(0, 3);

/** "3*milk" or "3 x milk" → 3 of milk; a plain search is 1. */
export function parseQty(q: string) {
  const m = q.trim().match(/^(\d+(?:\.\d+)?)\s*[*x×]\s*(.+)$/i);
  return m ? { qty: +m[1], q: m[2].trim() } : { qty: 1, q: q.trim() };
}

/**
 * First expiry, first out: batches of one product share its barcode, so a scan picks the batch that expires soonest
 * and still has stock. Expired batches go last (billing refuses them), then empty ones.
 */
export function fefo(rows: RecordRow[], today: string) {
  const rank = (r: RecordRow) => {
    const exp = String(r.data.expiry ?? "");
    return exp && exp < today ? 2 : n(r.data.on_hand) > 0 ? 0 : 1;
  };
  return [...rows].sort((a, b) => rank(a) - rank(b) || String(a.data.expiry || "9999").localeCompare(String(b.data.expiry || "9999")));
}
export const isExpired = (it: RecordRow | undefined, today: string) => !!it && !!it.data.expiry && String(it.data.expiry) < today;

/** A barcode or SKU match exactly (what a scanner types); otherwise names containing every word. */
export function findItems(items: RecordRow[], q: string, limit = 8, today = new Date().toISOString().slice(0, 10)) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const exact = items.filter((r) => [r.data.barcode, r.data.sku].some((v) => v != null && String(v).trim().toLowerCase() === s));
  if (exact.length) return fefo(exact, today);
  const words = s.split(/\s+/);
  return items.filter((r) => {
    const hay = `${r.data.name ?? ""} ${r.data.sku ?? ""} ${r.data.barcode ?? ""} ${r.data.category ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  }).slice(0, limit);
}

const buying = (kind: BillKind) => kind === "purchase" || kind === "preturn";

/** The list rate for `qty`: cost on a stock-in or debit note, else the wholesale price once qty reaches its minimum. */
export function autoRate(it: RecordRow, qty: number, kind: BillKind = "sale") {
  if (buying(kind)) return n(it.data.unit_cost);
  const wp = n(it.data.wholesale_price), min = n(it.data.wholesale_min);
  return wp > 0 && min > 0 && qty >= min ? wp : n(it.data.price);
}

/** A stock record as a cart line. `last` = this customer's last rate for it, reused when set. */
export const toLine = (it: RecordRow, qty = 1, kind: BillKind = "sale", last?: number): CartLine => ({
  itemId: it.id, name: String(it.data.name ?? "Item"), qty,
  rate: last && !buying(kind) ? last : autoRate(it, qty, kind),
  gst: n(it.data.gst_rate), hsn: it.data.hsn ? String(it.data.hsn) : undefined,
  category: it.data.category ? String(it.data.category) : undefined, cost: n(it.data.unit_cost),
});

const ph10 = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);

/** The rate a customer (by phone) last paid per item name, from their sales: amount ÷ qty of the latest line. */
export function lastRates(sales: RecordRow[], phone: string) {
  const p = ph10(phone), out: Record<string, { rate: number; date: string }> = {};
  if (p.length !== 10) return out;
  for (const r of sales) {
    const q = n(r.data.quantity), k = String(r.data.item ?? "").trim().toLowerCase(), d = String(r.data.date ?? "");
    if (ph10(r.data.phone) !== p || !(q > 0) || !k) continue;
    if (!out[k] || d >= out[k].date) out[k] = { rate: r2(n(r.data.amount) / q), date: d };
  }
  return out;
}

/** What can still come back against an invoice, per item name: sold minus returned (returns carry `against`). */
export function returnable(sales: RecordRow[], invoice: string) {
  const left: Record<string, number> = {};
  for (const r of sales) {
    const k = String(r.data.item ?? "").trim().toLowerCase(), q = n(r.data.quantity);
    if (String(r.data.invoice ?? "") === invoice && q > 0) left[k] = r2((left[k] ?? 0) + q);
    if (String(r.data.against ?? "") === invoice && q < 0) left[k] = r2((left[k] ?? 0) + q);
  }
  return left;
}

/**
 * Cashier limits. `maxDiscount` (% of the bill) caps what the cashier gives by hand: line discounts beyond any offer
 * plus the typed bill discount. `priceEdit: false` stops a rate below the item's list rate. Returns the reason, or "".
 */
export function cashierCheck(
  lines: (CartLine & { offerPct?: number })[], typed: number, items: RecordRow[], role: { maxDiscount?: number; priceEdit?: boolean },
) {
  const byId = new Map(items.map((r) => [r.id, r]));
  if (role.priceEdit === false) for (const l of lines) {
    const it = l.itemId ? byId.get(l.itemId) : undefined;
    if (it && l.rate < autoRate(it, l.qty) - 0.001) return `${l.name}: your role can't sell below the list price of ${autoRate(it, l.qty)}.`;
  }
  if (role.maxDiscount == null) return "";
  const gross = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const byHand = lines.reduce((s, l) => s + (l.qty * l.rate * Math.max(0, (l.disc ?? 0) - (l.offerPct ?? 0))) / 100, 0) + typed;
  return gross > 0 && byHand > (gross * role.maxDiscount) / 100 + 0.5
    ? `Discount of ${r2(byHand)} is over your limit of ${role.maxDiscount}% (${r2((gross * role.maxDiscount) / 100)}). Ask the owner.` : "";
}

/** Gross profit of a priced bill: amount net of GST minus cost. */
export function billProfit(lines: PricedLine[]) {
  const net = lines.reduce((s, l) => s + l.amount / (1 + (l.gst ?? 0) / 100), 0);
  const cost = lines.reduce((s, l) => s + l.qty * (l.cost ?? 0), 0);
  return { profit: r2(net - cost), pct: net ? r2(((net - cost) / net) * 100) : 0, known: lines.every((l) => (l.cost ?? 0) > 0) };
}

/**
 * A quotation as a bill to start from: one line at the quoted price (the amount is GST-inclusive, like every amount),
 * tied to the stock item of the same name when there is one so stock comes off when it is billed.
 */
export function quoteToBill(quote: RecordRow, items: RecordRow[]) {
  const d = quote.data, qty = n(d.quantity) > 0 ? n(d.quantity) : 1;
  const name = String(d.item ?? "").trim() || "As quoted";
  const it = items.find((x) => String(x.data.name ?? "").trim().toLowerCase() === name.toLowerCase());
  const base = it ? toLine(it, qty) : { name, qty, rate: 0 };
  const line: CartLine = { ...base, rate: r2(n(d.amount) / qty), gst: n(d.gst_rate) || base.gst || 0 };
  return { lines: [line], customer: String(d.customer ?? ""), phone: String(d.phone ?? "") };
}

/** Indian financial year label: 2026-10-19 → "26-27". */
export function fyLabel(iso: string) {
  const y = +iso.slice(0, 4) - (+iso.slice(5, 7) < 4 ? 1 : 0);
  return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
}
export const billPrefix = (kind: BillKind, iso: string, own = "") =>
  `${{ sale: own.trim().replace(/\/?$/, own.trim() ? "/" : ""), return: "CN/", purchase: "GRN/", preturn: "DN/" }[kind]}${fyLabel(iso)}/`;
export const billNo = (prefix: string, seq: number) => prefix + String(seq).padStart(4, "0");

/* ---------------- day close (Z report) ---------------- */

export const NOTES = [500, 200, 100, 50, 20, 10, 5, 2, 1];

export type DayTotals = {
  bills: number; sales: number; returns: number; byMode: Record<Mode, number>; cashExpenses: number;
  opening: number; expectedCash: number;
};

/** Sales (net of returns) by payment mode for one day, cash expenses, and what the drawer should hold. */
export function dayTotals(sales: RecordRow[], expenses: RecordRow[], date: string, opening = 0): DayTotals {
  const day = sales.filter((r) => String(r.data.date ?? "") === date);
  const byMode = Object.fromEntries(MODES.map((m) => [m, 0])) as Record<Mode, number>;
  let total = 0, returns = 0;
  const bills = new Set<string>();
  for (const r of day) {
    const amt = n(r.data.amount) + n(r.data.tcs); // TCS is collected with the bill, so it is in the drawer too
    // records typed by hand before the counter existed: Unpaid → Credit, anything else → Cash
    const mode = (MODES as readonly string[]).includes(String(r.data.mode)) ? (r.data.mode as Mode) : r.data.payment === "Unpaid" ? "Credit" : "Cash";
    byMode[mode] = r2(byMode[mode] + amt);
    if (amt < 0) returns = r2(returns - amt); else total = r2(total + amt);
    bills.add(String(r.data.invoice || r.id));
  }
  const cashExpenses = r2(expenses.filter((r) => String(r.data.date ?? "") === date && String(r.data.mode ?? "Cash") === "Cash")
    .reduce((s, r) => s + n(r.data.amount), 0));
  return { bills: bills.size, sales: total, returns, byMode, cashExpenses, opening: r2(opening), expectedCash: r2(opening + byMode.Cash - cashExpenses) };
}

/** Over the customer's credit limit? `limit` 0 = none set. Returns how far over, or 0. */
export const overLimit = (owed: number, bill: number, limit: number) => (limit > 0 && owed + bill > limit ? r2(owed + bill - limit) : 0);

/* ---------------- loyalty points: 1 point per ₹100 spent, worth ₹1 each ---------------- */

export const pointsEarned = (spend: number) => Math.floor(Math.max(0, spend) / 100);
const last10 = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);

/**
 * Points balance by customer phone (last 10 digits): earned on everything they bought (returns take points back)
 * minus what their Customers record says they redeemed. A customer with no phone cannot earn: nothing identifies them.
 */
export function pointsBalance(sales: RecordRow[], customers: RecordRow[]): Record<string, number> {
  const spend: Record<string, number> = {};
  for (const s of sales) { const p = last10(s.data.phone); if (p.length === 10) spend[p] = (spend[p] ?? 0) + n(s.data.amount); }
  const out: Record<string, number> = {};
  for (const [p, v] of Object.entries(spend)) out[p] = pointsEarned(v);
  for (const c of customers) { const p = last10(c.data.phone); if (p in out) out[p] -= n(c.data.points_redeemed); }
  for (const p of Object.keys(out)) out[p] = Math.max(0, out[p]);
  return out;
}

/** The bill discount (as a plain amount) once `points` are used on top of the typed discount. Never takes the bill below zero. */
export function discountWithPoints(lines: CartLine[], discount: string, points: number) {
  const p = priceBill(lines, discount);
  const use = Math.max(0, Math.min(Math.floor(points), Math.floor(p.total)));
  return { discount: use ? String(r2(p.discount + use)) : discount, used: use };
}

/** Opening cash for a day: the cash counted at the last close before it. */
export function openingCash(closes: RecordRow[], date: string) {
  const last = closes.filter((r) => String(r.data.date ?? "") < date).sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)) || b.at.localeCompare(a.at))[0];
  return last ? n(last.data.counted) : 0;
}

/* ---------------- Code 128-B, for shelf labels any USB scanner reads ---------------- */

const C128 = ("212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 "
  + "221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 "
  + "231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 "
  + "314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 "
  + "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 "
  + "114131 311141 411131 211412 211214 211232 2331112").split(" ");

/** SVG path (bars) and width in modules, with a 10-module quiet zone each side. Plain ASCII only. */
export function code128Svg(text: string, height = 40) {
  const vals = [...text].map((c) => {
    const v = c.charCodeAt(0) - 32;
    if (v < 0 || v > 95) throw new Error("Barcodes take plain letters, digits and symbols only.");
    return v;
  });
  const check = vals.reduce((s, v, i) => s + v * (i + 1), 104) % 103;
  const widths = [104, ...vals, check, 106].map((v) => C128[v]).join("");
  let x = 10, d = "";
  [...widths].forEach((w, i) => { if (i % 2 === 0) d += `M${x} 0h${w}v${height}h-${w}z`; x += +w; });
  return { d, width: x + 10, height };
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("pos.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
  const row = (id: string, data: Record<string, Value>): RecordRow => ({ id, at: "2026-11-01T10:00:00Z", by: "t", data });

  const p = priceBill([{ name: "A", qty: 2, rate: 100, disc: 10 }, { name: "B", qty: 1, rate: 50 }], "10%");
  assert(p.subtotal === 230 && p.discount === 23 && p.total === 207, "bill " + JSON.stringify(p));
  assert(r2(p.lines.reduce((s, l) => s + l.amount, 0)) === p.total, "lines add up to the total");
  const odd = priceBill([{ name: "A", qty: 1, rate: 33.33 }, { name: "B", qty: 1, rate: 33.33 }, { name: "C", qty: 1, rate: 33.34 }], "10");
  assert(r2(odd.lines.reduce((s, l) => s + l.amount, 0)) === 90, "rounding drift lands on the last line");
  assert(billDiscount("500", 200) === 200 && billDiscount("-5", 200) === 0, "discount is clamped");
  assert(JSON.stringify(tenders(437)) === "[500,2000]" && tenders(500).length === 1, "tenders " + tenders(437));

  assert(parseQty("3*milk").qty === 3 && parseQty("3 x milk").q === "milk" && parseQty("milk").qty === 1, "qty syntax");
  const items = [row("i1", { name: "Amul Milk 1L", sku: "M1", barcode: "8901262010016", price: 66 }), row("i2", { name: "Amul Butter", sku: "B1", price: 56 })];
  assert(findItems(items, "8901262010016")[0].id === "i1", "barcode match");
  assert(findItems(items, "amul").length === 2 && findItems(items, "amul milk").length === 1, "name words");
  assert(findItems(items, "b1")[0].id === "i2", "sku match is case-insensitive");

  assert(fyLabel("2026-10-19") === "26-27" && fyLabel("2027-03-31") === "26-27" && fyLabel("2027-04-01") === "27-28", "financial year");
  assert(billNo(billPrefix("return", "2026-11-11"), 7) === "CN/26-27/0007", "bill no");

  const sales = [
    row("s1", { date: "2026-11-11", invoice: "26-27/0001", amount: 500, mode: "Cash" }),
    row("s2", { date: "2026-11-11", invoice: "26-27/0001", amount: 300, mode: "Cash" }),
    row("s3", { date: "2026-11-11", invoice: "26-27/0002", amount: 1000, mode: "UPI" }),
    row("s4", { date: "2026-11-11", invoice: "CN/26-27/0001", amount: -100, mode: "Cash" }),
    row("s5", { date: "2026-11-11", amount: 200, payment: "Unpaid" }), // typed by hand, no invoice
    row("s6", { date: "2026-11-10", invoice: "26-27/0000", amount: 999, mode: "Cash" }),
  ];
  const exps = [row("e1", { date: "2026-11-11", amount: 50, mode: "Cash" }), row("e2", { date: "2026-11-11", amount: 900, mode: "UPI" })];
  const d = dayTotals(sales, exps, "2026-11-11", 1000);
  assert(d.bills === 4 && d.sales === 2000 && d.returns === 100, "day bills " + JSON.stringify(d));
  assert(d.byMode.Cash === 700 && d.byMode.UPI === 1000 && d.byMode.Credit === 200, "by mode");
  assert(d.cashExpenses === 50 && d.expectedCash === 1650, "drawer = opening + cash sales − cash expenses");
  const qb = quoteToBill(row("q1", { customer: "Asha", phone: "9876543210", item: "amul milk 1l", quantity: 3, amount: 198, gst_rate: "5" }), items);
  assert(qb.lines[0].itemId === "i1" && qb.lines[0].rate === 66 && qb.lines[0].qty === 3 && qb.lines[0].gst === 5 && qb.customer === "Asha", "quote → bill " + JSON.stringify(qb));
  assert(quoteToBill(row("q2", { item: "Service call", amount: 500 }), items).lines[0].itemId === undefined, "one-off quote line");
  const sl = [row("l1", { phone: "98765 43210", amount: 1250 }), row("l2", { phone: "9876543210", amount: -250 }), row("l3", { amount: 900 })];
  const pb = pointsBalance(sl, [row("c", { phone: "9876543210", points_redeemed: 4 })]);
  assert(pb["9876543210"] === 6 && Object.keys(pb).length === 1, "points " + JSON.stringify(pb));
  const dl = discountWithPoints([{ name: "x", qty: 1, rate: 200 }], "10%", 50);
  assert(dl.used === 50 && priceBill([{ name: "x", qty: 1, rate: 200 }], dl.discount).total === 130, "points on top of 10% " + JSON.stringify(dl));
  assert(discountWithPoints([{ name: "x", qty: 1, rate: 40 }], "", 500).used === 40, "cannot go below zero");
  assert(overLimit(800, 300, 1000) === 100 && overLimit(800, 200, 1000) === 0 && overLimit(5000, 100, 0) === 0, "credit limit");
  assert(openingCash([row("c1", { date: "2026-11-09", counted: 800 }), row("c2", { date: "2026-11-10", counted: 1000 }), row("c3", { date: "2026-11-11", counted: 5 })], "2026-11-11") === 1000, "opening = last close before");

  assert(billNo(billPrefix("sale", "2026-11-11", "VJA"), 3) === "VJA/26-27/0003" && billPrefix("preturn", "2026-11-11") === "DN/26-27/", "own prefix, debit note");

  const batches = [
    row("b1", { name: "Curd", barcode: "C1", on_hand: 5, expiry: "2026-11-20" }), row("b2", { name: "Curd", barcode: "C1", on_hand: 5, expiry: "2026-11-14" }),
    row("b3", { name: "Curd", barcode: "C1", on_hand: 5, expiry: "2026-11-01" }), row("b4", { name: "Curd", barcode: "C1", on_hand: 0, expiry: "2026-11-12" }),
  ];
  assert(findItems(batches, "c1", 8, "2026-11-11").map((r) => r.id).join() === "b2,b1,b4,b3", "fefo: soonest with stock, empty, expired last");
  assert(isExpired(batches[2], "2026-11-11") && !isExpired(batches[0], "2026-11-11"), "expired");
  const ws = row("w", { name: "Rice 25kg", price: 1500, wholesale_price: 1400, wholesale_min: 5, unit_cost: 1300 });
  assert(autoRate(ws, 4) === 1500 && autoRate(ws, 5) === 1400 && autoRate(ws, 5, "purchase") === 1300, "wholesale from min qty");
  assert(toLine(ws, 1, "sale", 1450).rate === 1450 && toLine(ws, 1, "purchase", 1450).rate === 1300, "customer's last rate");
  const hist = [row("h1", { date: "2026-11-01", phone: "9876543210", item: "Rice 25kg", quantity: 2, amount: 2900 }),
    row("h2", { date: "2026-11-05", phone: "+91 98765 43210", item: "rice 25kg", quantity: 1, amount: 1420 })];
  assert(lastRates(hist, "9876543210")["rice 25kg"].rate === 1420, "latest rate wins");
  const inv = [row("i1", { invoice: "26-27/0009", item: "Curd", quantity: 3 }), row("i2", { against: "26-27/0009", item: "Curd", quantity: -1 })];
  assert(returnable(inv, "26-27/0009").curd === 2, "returnable = sold − returned");
  const cl: (CartLine & { offerPct?: number })[] = [{ itemId: "w", name: "Rice", qty: 1, rate: 1500, disc: 30, offerPct: 25 }];
  assert(cashierCheck(cl, 0, [ws], { maxDiscount: 5 }) === "", "offer part of a discount doesn't count");
  assert(cashierCheck(cl, 100, [ws], { maxDiscount: 5 }).includes("over your limit"), "hand discount over the limit");
  assert(cashierCheck([{ itemId: "w", name: "Rice", qty: 1, rate: 1450 }], 0, [ws], { priceEdit: false }).includes("below the list price"), "price lock");
  assert(cashierCheck([{ itemId: "w", name: "Rice", qty: 5, rate: 1400 }], 0, [ws], { priceEdit: false }) === "", "wholesale rate is a list rate");
  const pr = billProfit(priceBill([{ name: "x", qty: 2, rate: 118, gst: 18, cost: 60 }]).lines);
  assert(pr.profit === 80 && pr.pct === 40 && pr.known, "profit " + JSON.stringify(pr));

  const bc = code128Svg("RX-1");
  assert(bc.width === 10 + 11 * 6 + 13 + 10 && bc.d.startsWith("M10 0h2"), "code128 width " + bc.width);
  console.log("pos self-check ok");
}
