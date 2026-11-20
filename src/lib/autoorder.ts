/**
 * Autopilot for restocking, with guardrails: for suppliers the owner trusts, place the planner's "order now" lines as
 * Ordered purchases without anyone clicking, up to a weekly spend cap. It never pays anything (an order is a
 * promise to buy, received later at the counter), never touches a supplier that isn't on the list, and never
 * doubles up on an item that already has an open order. Pure; the runner is src/lib/autorun.ts.
 * Self-check: `node src/lib/autoorder.ts`
 */
import { stockPlan } from "./planning.ts";
import type { Business, RecordRow } from "./model";

export type AutoOrder = { enabled: boolean; weeklyCap: number; suppliers: string[]; leadDays: number };
export const AUTO_BY = "Autopilot";

const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, "")) || 0);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

export type AutoResult = { place: Record<string, string | number>[]; spent: number; left: number; skipped: string[] };

export function autoOrders(b: Pick<Business, "modules" | "records">, cfg: AutoOrder, today: string): AutoResult {
  const out: AutoResult = { place: [], spent: 0, left: 0, skipped: [] };
  if (!cfg.enabled || cfg.weeklyCap <= 0 || !cfg.suppliers.length) return out;
  const trusted = new Set(cfg.suppliers.map((s) => s.trim().toLowerCase()));
  const purchases: RecordRow[] = b.records.purchases ?? [];
  const weekAgo = addDays(today, -7), monthAgo = addDays(today, -30);
  const used = purchases.filter((r) => r.by === AUTO_BY && String(r.data.date ?? r.at).slice(0, 10) >= weekAgo && r.data.status !== "Cancelled")
    .reduce((s, r) => s + num(r.data.amount), 0);
  let left = cfg.weeklyCap - used;
  const open = new Set(purchases.filter((r) => r.data.status === "Ordered" && String(r.data.date ?? r.at).slice(0, 10) >= monthAgo)
    .map((r) => `${String(r.data.supplier ?? "").trim().toLowerCase()}|${String(r.data.item ?? "").trim().toLowerCase()}`));
  const cost = new Map((b.records.inventory ?? []).map((r) => [r.id, num(r.data.unit_cost)]));
  for (const l of stockPlan({ ...b, cash: undefined, events: [] }, { leadDays: cfg.leadDays, reviewDays: 7, service: 0.95 }, today)) {
    if (l.status !== "order" || l.reorder <= 0 || !l.supplier || !trusted.has(l.supplier.trim().toLowerCase())) continue;
    if (open.has(`${l.supplier.trim().toLowerCase()}|${l.name.trim().toLowerCase()}`)) continue;
    const amount = Math.round(l.reorder * (cost.get(l.id) ?? 0) * 100) / 100;
    if (!amount) { out.skipped.push(`${l.name}: no unit cost, can't price the order`); continue; }
    if (amount > left) { out.skipped.push(`${l.name}: ${amount} is over what is left of this week's cap (${Math.max(0, Math.round(left))})`); continue; }
    left -= amount; out.spent += amount;
    out.place.push({ date: today, supplier: l.supplier, item: l.name, quantity: l.reorder, amount, status: "Ordered", expected: addDays(today, cfg.leadDays) });
  }
  out.spent = Math.round(out.spent * 100) / 100;
  out.left = Math.max(0, Math.round(left * 100) / 100);
  return out;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("autoorder.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
  const row = (id: string, data: Record<string, unknown>, by = "u"): RecordRow => ({ id, at: "2026-11-19T00:00:00Z", by, data: data as RecordRow["data"] });
  const T = "2026-11-19";
  const day = (n: number) => addDays(T, -n);
  const sales = (item: string, perDay: number) => Array.from({ length: 56 }, (_, i) => row(`s${item}${i}`, { date: day(i + 1), item, quantity: perDay, amount: perDay * 10 }));
  const inv = [
    row("1", { name: "Rice", on_hand: 5, unit_cost: 40, supplier: "Acme" }),
    row("2", { name: "Oil", on_hand: 5, unit_cost: 100, supplier: "Acme" }),
    row("3", { name: "Salt", on_hand: 2, unit_cost: 10, supplier: "Stranger" }),
    row("4", { name: "Tea", on_hand: 1, supplier: "Acme" }),
  ];
  const b = { modules: [], records: { inventory: inv, sales: [...sales("Rice", 2), ...sales("Oil", 2), ...sales("Salt", 2), ...sales("Tea", 2)], purchases: [] as RecordRow[] } } as unknown as Pick<Business, "modules" | "records">;
  const cfg: AutoOrder = { enabled: true, weeklyCap: 5000, suppliers: ["acme"], leadDays: 3 };

  const r = autoOrders(b, cfg, T);
  const names = r.place.map((p) => p.item);
  assert(names.includes("Rice") && names.includes("Oil"), "orders trusted-supplier lines " + JSON.stringify(r));
  assert(!names.includes("Salt"), "never touches a supplier not on the list");
  assert(r.skipped.some((s) => s.startsWith("Tea")), "unpriced item is skipped, not guessed");
  assert(r.spent <= 5000 && r.spent + r.left === 5000, "stays inside the cap " + r.spent);

  b.records.purchases = [row("p", { date: T, supplier: "Acme", item: "Rice", status: "Ordered", amount: 100 })];
  assert(!autoOrders(b, cfg, T).place.some((p) => p.item === "Rice"), "no second order while one is open");

  b.records.purchases = [row("p2", { date: T, supplier: "Acme", item: "Other", status: "Ordered", amount: 4990 }, AUTO_BY)];
  const tight = autoOrders(b, cfg, T);
  assert(tight.place.length === 0 && tight.skipped.length >= 2, "cap already used this week " + JSON.stringify(tight));
  assert(autoOrders(b, { ...cfg, enabled: false }, T).place.length === 0 && autoOrders(b, { ...cfg, suppliers: [] }, T).place.length === 0, "off or no suppliers = nothing");
  console.log("autoorder self-check ok");
}
