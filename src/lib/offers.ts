/**
 * Offers at the counter (ported from FitSecret's offers.js): coupons, combos (a set of items for one price) and
 * near-expiry offers (a % off one stock batch until it expires, never below cost + a minimum margin). They live in the
 * Offers module as ordinary records, and the counter and the server price them with the same functions here.
 * Self-check: `node src/lib/offers.ts`
 */
import type { RecordRow, Value } from "./model";
import { billDiscount, priceBill, r2, type CartLine } from "./pos.ts";

const n = (v: Value | undefined) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, "")) || 0);
const s = (v: Value | undefined) => String(v ?? "").trim();
const days = (from: string, to: string) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 864e5);

/** Switched on, and today inside its start/end dates. */
export const liveOffers = (offers: RecordRow[], today: string) => offers.filter((o) =>
  s(o.data.active || "Yes") !== "No" && (!s(o.data.starts) || s(o.data.starts) <= today) && (!s(o.data.ends) || s(o.data.ends) >= today));

/** A stock item by SKU, barcode or exact name (case-insensitive). */
export function itemByRef(items: RecordRow[], ref: string) {
  const k = ref.trim().toLowerCase();
  return k ? items.find((r) => [r.data.sku, r.data.barcode, r.data.name].some((v) => v != null && String(v).trim().toLowerCase() === k)) : undefined;
}

/** "SKU1*2, Amul Butter" → [{ item, qty }]. Unknown references are returned in `missing`. */
export function parseItems(spec: string, items: RecordRow[]) {
  const list: { item: RecordRow; qty: number }[] = [], missing: string[] = [];
  for (const part of spec.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(/^(.+?)\s*[*x×]\s*(\d+)$/i);
    const ref = m ? m[1] : part, qty = m ? Math.max(1, +m[2]) : 1;
    const it = itemByRef(items, ref);
    if (it) list.push({ item: it, qty }); else missing.push(ref);
  }
  return { list, missing };
}

/* ---------------- combos ---------------- */

/** Saving from the live combos on a bill: each unit counts towards one combo only, biggest saving first. */
export function comboDiscount(lines: CartLine[], combos: RecordRow[], items: RecordRow[]) {
  const left = new Map<string, number>(), price = new Map<string, number>();
  for (const l of lines) if (l.itemId) { left.set(l.itemId, (left.get(l.itemId) ?? 0) + l.qty); price.set(l.itemId, l.rate); }
  const ranked = combos.map((c) => {
    const { list, missing } = parseItems(s(c.data.items), items);
    const value = list.reduce((t, x) => (price.has(x.item.id) ? t + price.get(x.item.id)! * x.qty : NaN), 0);
    return { c, list, saving: missing.length || list.length < 2 ? 0 : r2(value - n(c.data.price)) };
  }).filter((x) => x.saving > 0).sort((a, b) => b.saving - a.saving);
  const applied: { name: string; sets: number; saving: number }[] = [];
  let total = 0;
  for (const { c, list, saving } of ranked) {
    const sets = Math.min(...list.map((x) => Math.floor((left.get(x.item.id) ?? 0) / x.qty)));
    if (!(sets > 0)) continue;
    for (const x of list) left.set(x.item.id, left.get(x.item.id)! - sets * x.qty);
    applied.push({ name: s(c.data.name), sets, saving: r2(sets * saving) });
    total = r2(total + sets * saving);
  }
  return { total, applied };
}

/* ---------------- coupons ---------------- */

/** What a coupon code takes off `amount` (the bill after other discounts). Throws a message for the cashier. */
export function couponOff(code: string, offers: RecordRow[], amount: number, today: string) {
  const c = offers.find((o) => s(o.data.kind) === "Coupon" && s(o.data.code).toUpperCase() === code.trim().toUpperCase());
  if (!c) throw new Error(`No coupon ${code.trim().toUpperCase()}.`);
  if (!liveOffers([c], today).length) throw new Error(`Coupon ${s(c.data.code).toUpperCase()} isn't active today.`);
  if (n(c.data.min_bill) > amount) throw new Error(`Coupon ${s(c.data.code).toUpperCase()} needs a bill of at least ${n(c.data.min_bill)}.`);
  const off = n(c.data.percent) > 0 ? (amount * Math.min(n(c.data.percent), 90)) / 100 : n(c.data.amount);
  return { offer: c, off: r2(Math.min(Math.max(off, 0), amount)) };
}

/* ---------------- near-expiry offers ---------------- */

/** [days left or fewer, % off]: the closer the expiry, the bigger the offer. */
export const EXPIRY_STEPS: [number, number][] = [[15, 35], [30, 25], [60, 15], [90, 10]];
export const MIN_MARGIN = 5;

export type ExpiryAdvice = {
  item: RecordRow; daysLeft: number; status: "expired" | "suggested" | "live" | "return"; pct: number; offerPrice: number; recovered: number; advice: string;
};

/**
 * Stock batches expiring within 90 days: a suggested % off that grows as expiry nears but never prices below cost +
 * 5% (cost is before GST, prices include it). Batches that can't be discounted profitably are flagged for return to
 * the supplier; expired ones must come off the shelf.
 */
export function expiryAdvice(items: RecordRow[], offers: RecordRow[], today: string): ExpiryAdvice[] {
  const live = liveOffers(offers, today).filter((o) => s(o.data.kind) === "Near-expiry");
  const out: ExpiryAdvice[] = [];
  for (const it of items) {
    const exp = s(it.data.expiry), qty = n(it.data.on_hand), price = n(it.data.price);
    if (!exp || !(qty > 0)) continue;
    const left = days(today, exp);
    if (left > 90) continue;
    const base = { item: it, daysLeft: left, pct: 0, offerPrice: price, recovered: 0 };
    if (left < 0) { out.push({ ...base, status: "expired", advice: "Expired: take it off the shelf and return it or write it off. Billing refuses it." }); continue; }
    const o = live.find((x) => itemByRef([it], s(x.data.items)));
    if (o) { const pct = n(o.data.percent); out.push({ ...base, status: "live", pct, offerPrice: r2(price * (1 - pct / 100)), recovered: r2(price * (1 - pct / 100) * qty), advice: `${pct}% off is live at the counter.` }); continue; }
    const target = (EXPIRY_STEPS.find(([d]) => left <= d) ?? EXPIRY_STEPS[EXPIRY_STEPS.length - 1])[1];
    const cost = n(it.data.unit_cost), gst = n(it.data.gst_rate);
    const floor = cost * (1 + MIN_MARGIN / 100) * (1 + gst / 100);
    const room = cost > 0 && price > 0 ? Math.max(0, (1 - floor / price) * 100) : Math.min(target, 10);
    const pct = Math.floor(Math.min(target, room));
    if (pct < 3) { out.push({ ...base, status: "return", advice: `Even ${target}% off would sell below cost + ${MIN_MARGIN}%. Ask the supplier to take it back or exchange it.` }); continue; }
    const offerPrice = Math.round(price * (1 - pct / 100));
    out.push({ ...base, status: "suggested", pct, offerPrice, recovered: r2(offerPrice * qty), advice: `${pct}% off clears it before expiry and still keeps a margin.` });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** The % a live near-expiry offer gives this stock item, or 0. */
export function expiryPct(itemId: string | undefined, live: RecordRow[], items: RecordRow[]) {
  if (!itemId) return 0;
  const it = items.find((x) => x.id === itemId);
  if (!it) return 0;
  return Math.max(0, ...live.filter((o) => s(o.data.kind) === "Near-expiry" && itemByRef([it], s(o.data.items))).map((o) => n(o.data.percent)));
}

/* ---------------- the whole bill ---------------- */

export type Applied = {
  lines: (CartLine & { offerPct?: number })[];
  /** bill discount, as a plain amount: typed + combos + coupon */
  discount: string;
  typed: number; combo: number; coupon: number; couponCode?: string;
  combos: { name: string; sets: number; saving: number }[];
};

/**
 * Near-expiry % on the lines (the bigger of the offer and the cashier's own discount), then the typed bill discount,
 * combos and a coupon on what is left. Throws on a coupon that doesn't apply.
 */
export function applyOffers(lines: CartLine[], typed: string, offers: RecordRow[], items: RecordRow[], today: string, coupon = ""): Applied {
  const live = liveOffers(offers, today);
  const ls = lines.map((l) => { const p = expiryPct(l.itemId, live, items); return p ? { ...l, disc: Math.max(l.disc ?? 0, p), offerPct: p } : l; });
  const sub = priceBill(ls).total;
  const typedOff = billDiscount(typed, sub);
  const combo = comboDiscount(ls, live.filter((o) => s(o.data.kind) === "Combo"), items);
  const left = r2(Math.max(0, sub - typedOff - combo.total));
  const cp = coupon.trim() ? couponOff(coupon, offers, left, today) : null;
  return {
    lines: ls, discount: String(r2(typedOff + combo.total + (cp?.off ?? 0))), typed: typedOff, combo: combo.total, coupon: cp?.off ?? 0,
    couponCode: cp ? s(cp.offer.data.code).toUpperCase() : undefined, combos: combo.applied,
  };
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("offers.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
  const row = (id: string, data: Record<string, Value>): RecordRow => ({ id, at: "2026-11-01T10:00:00Z", by: "t", data });
  const items = [
    row("w", { sku: "WHEY", name: "Whey 1kg", price: 2000, unit_cost: 1500, gst_rate: 18, on_hand: 4 }),
    row("s", { sku: "SHAKER", name: "Shaker", price: 300, unit_cost: 100, gst_rate: 18, on_hand: 9 }),
    row("m", { sku: "MILK", name: "Milk", price: 60, unit_cost: 50, gst_rate: 0, on_hand: 10, expiry: "2026-11-25" }),
    row("b", { sku: "BREAD", name: "Bread", price: 50, unit_cost: 20, gst_rate: 0, on_hand: 5, expiry: "2026-11-20" }),
    row("x", { sku: "OLD", name: "Old jam", price: 100, unit_cost: 50, on_hand: 2, expiry: "2026-11-01" }),
  ];
  const offers = [
    row("o1", { name: "Starter pack", kind: "Combo", items: "WHEY, SHAKER", price: 2100, active: "Yes" }),
    row("o2", { name: "Ten off", kind: "Coupon", code: "TEN", percent: 10, min_bill: 1000, active: "Yes" }),
    row("o3", { name: "Bread clear", kind: "Near-expiry", items: "BREAD", percent: 30, active: "Yes" }),
    row("o4", { name: "Old", kind: "Coupon", code: "OLD", amount: 50, ends: "2026-10-01", active: "Yes" }),
  ];
  const lines: CartLine[] = [{ itemId: "w", name: "Whey", qty: 2, rate: 2000 }, { itemId: "s", name: "Shaker", qty: 1, rate: 300 }, { itemId: "b", name: "Bread", qty: 2, rate: 50, disc: 10 }];
  const a = applyOffers(lines, "", offers, items, "2026-11-12", "ten");
  assert(a.combo === 200 && a.combos[0].sets === 1, "one combo set (only one shaker) " + JSON.stringify(a.combos));
  assert(a.lines[2].disc === 30 && a.lines[2].offerPct === 30, "near-expiry beats the cashier's 10%");
  // sub = 4000 + 300 + 70 = 4370; combo 200 → 4170; coupon 10% = 417
  assert(a.coupon === 417 && a.discount === String(617) && a.couponCode === "TEN", "coupon on what is left " + JSON.stringify(a));
  assert(priceBill(a.lines, a.discount).total === 3753, "bill total");
  let threw = ""; try { applyOffers(lines, "", offers, items, "2026-11-12", "OLD"); } catch (e) { threw = (e as Error).message; }
  assert(threw.includes("isn't active"), "expired coupon refused: " + threw);
  threw = ""; try { couponOff("TEN", offers, 500, "2026-11-12"); } catch (e) { threw = (e as Error).message; }
  assert(threw.includes("at least 1000"), "minimum bill");
  assert(parseItems("whey*2, nope", items).missing[0] === "nope" && parseItems("whey*2", items).list[0].qty === 2, "item spec");

  const adv = expiryAdvice(items, offers, "2026-11-12");
  assert(adv[0].item.id === "x" && adv[0].status === "expired", "expired first");
  assert(adv.find((x) => x.item.id === "b")!.status === "live", "bread offer is live");
  // milk: 13 days left → 35% target, but cost 50 × 1.05 = 52.5 → room 12.5% → 12%
  const milk = adv.find((x) => x.item.id === "m")!;
  assert(milk.status === "suggested" && milk.pct === 12 && milk.offerPrice === 53, "never below cost + 5% " + JSON.stringify(milk));
  assert(expiryAdvice([row("t", { name: "Thin", price: 51, unit_cost: 50, on_hand: 1, expiry: "2026-11-20" })], [], "2026-11-12")[0].status === "return", "no room → return");
  console.log("offers self-check ok");
}
