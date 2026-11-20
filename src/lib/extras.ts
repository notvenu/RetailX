/**
 * Customer and accounting extras ported from FitSecret: payment terms and due dates, Tally masters import, Verify My
 * Data, staff incentive and referral reports, TCS with the Form 27EQ quarter summary, and nutrition-label parsing.
 * Pure: the counter, Reports, Books and the label sheet all use these. Self-check: `node src/lib/extras.ts`
 */
import type { RecordRow, Value } from "./model";

const n = (v: Value | undefined) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, "")) || 0);
const s = (v: Value | undefined) => String(v ?? "").trim();
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const ph10 = (v: Value | undefined) => s(v).replace(/\D/g, "").slice(-10);
export const addDays = (iso: string, d: number) => new Date(Date.parse(iso + "T00:00:00Z") + d * 864e5).toISOString().slice(0, 10);

/* ---------------- payment terms ---------------- */

/** The customer a sale belongs to: by phone, else by name. */
export function customerOf(sale: Record<string, Value>, customers: RecordRow[]) {
  const p = ph10(sale.phone);
  return customers.find((c) => (p.length === 10 && ph10(c.data.phone) === p) || (!!s(sale.customer) && s(c.data.name).toLowerCase() === s(sale.customer).toLowerCase()));
}

/** When a credit bill falls due: the bill date plus the customer's payment terms (days); none = due on the day. */
export const dueDate = (date: string, termsDays: number) => addDays(date, Math.max(0, Math.round(termsDays) || 0));

/** Unpaid bills past their due date, oldest first, with how many days overdue. */
export function overdue(sales: RecordRow[], today: string) {
  return sales.filter((r) => r.data.payment && s(r.data.payment) !== "Paid" && n(r.data.amount) > 0)
    .map((r) => ({ row: r, due: s(r.data.due) || s(r.data.date), late: 0 }))
    .map((x) => ({ ...x, late: Math.round((Date.parse(today) - Date.parse(x.due)) / 864e5) }))
    .filter((x) => x.late > 0).sort((a, b) => b.late - a.late);
}

/* ---------------- Tally masters import ---------------- */

const unesc = (v: string) => v.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c)).trim();
const tag = (xml: string, t: string) => { const m = xml.match(new RegExp(`<${t.replace(".", "\\.")}(?:\\s[^>]*)?>([^<]*)</${t.replace(".", "\\.")}>`)); return m ? unesc(m[1]) : ""; };
const tags = (xml: string, t: string) => [...xml.matchAll(new RegExp(`<${t}(?:\\s[^>]*)?>([^<]*)</${t}>`, "g"))].map((m) => unesc(m[1]));
const blocks = (xml: string, t: string) => [...xml.matchAll(new RegExp(`<${t} NAME="([^"]*)"[^>]*>([\\s\\S]*?)</${t}>`, "g"))].map((m) => [unesc(m[1]), m[2]] as const);
const numIn = (v: string) => { const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m ? +m[0] : 0; };

/** A Tally XML export (List of Accounts / Stock Items) to plain rows. Sniffs whether it is Tally at all. */
export const isTallyXml = (text: string) => /<ENVELOPE>/i.test(text) && /<(LEDGER|STOCKITEM) NAME=/i.test(text);

/**
 * Tally masters as rows keyed by RetailX field: debtors become customers, creditors suppliers (for Purchases), stock
 * items Stock rows with HSN, GST rate, cost and opening quantity. Opening balances come back too, for a journal entry.
 */
export function parseTallyMasters(xml: string) {
  const parties = blocks(xml, "LEDGER").map(([name, b]) => ({ name, b, parent: tag(b, "PARENT") })).filter((x) => /sundry (debtors|creditors)/i.test(x.parent));
  const party = (x: { name: string; b: string }) => ({
    name: x.name, phone: tag(x.b, "LEDGERMOBILE") || tag(x.b, "LEDGERPHONE"), email: tag(x.b, "EMAIL"), gstin: (tag(x.b, "PARTYGSTIN") || tag(x.b, "GSTIN")).toUpperCase(),
    city: tags(x.b, "ADDRESS").slice(-1)[0] ?? "", opening: numIn(tag(x.b, "OPENINGBALANCE")),
  });
  const customers = parties.filter((x) => /debtors/i.test(x.parent)).map(party);
  const suppliers = parties.filter((x) => /creditors/i.test(x.parent)).map(party);
  const items = blocks(xml, "STOCKITEM").map(([name, b]) => {
    const qty = numIn(tag(b, "OPENINGBALANCE")), value = Math.abs(numIn(tag(b, "OPENINGVALUE")));
    const rates = Object.fromEntries([...b.matchAll(/<GSTRATEDUTYHEAD>([^<]*)<\/GSTRATEDUTYHEAD>[\s\S]*?<GSTRATE>([^<]*)<\/GSTRATE>/g)].map((m) => [m[1].trim(), numIn(m[2])]));
    const gst = rates["Integrated Tax"] ?? rates.IGST ?? (rates["Central Tax"] ?? 0) * 2;
    return { name, category: tag(b, "PARENT").replace(/^Primary$/, ""), hsn: tag(b, "HSNCODE"), gst_rate: gst ? String(gst) : "",
      unit_cost: numIn(tag(b, "OPENINGRATE")) || (qty ? r2(value / qty) : 0), on_hand: qty, mrp: numIn(tag(b, "MRPRATE")) };
  });
  return { customers, suppliers, items };
}

/* ---------------- Verify My Data ---------------- */

export type Issue = { level: "fix" | "check"; area: string; text: string; count: number; link?: string };

/** Things that make the books, GST or stock wrong, worst first. Each says what is wrong and where to fix it. */
export function verifyData(records: Record<string, RecordRow[]>, today: string, biz: { gstin?: string }): Issue[] {
  const out: Issue[] = [];
  const add = (level: Issue["level"], area: string, text: string, rows: unknown[], link?: string) => { if (rows.length) out.push({ level, area, text, count: rows.length, link }); };
  const sales = records.sales ?? [], stock = records.inventory ?? [], purchases = records.purchases ?? [], customers = records.customers ?? [];
  add("fix", "Stock", "items below zero on hand: a sale or transfer went out without stock coming in", stock.filter((r) => n(r.data.on_hand) < 0), "/m/inventory");
  add("fix", "Sales", "sales dated in the future", sales.filter((r) => s(r.data.date) > today), "/m/sales");
  add("fix", "Stock", "items with no selling price", stock.filter((r) => !(n(r.data.price) > 0)), "/m/inventory");
  if (biz.gstin) add("fix", "GST", "sales without a GST rate (each bill needs one for GSTR-1)", sales.filter((r) => s(r.data.gst_rate) === "" && n(r.data.amount) !== 0), "/m/sales");
  add("fix", "GST", "customer GSTINs that don't look right (15 characters, 2-digit state first)", sales.filter((r) => s(r.data.customer_gstin) && !/^\d{2}[A-Z0-9]{13}$/.test(s(r.data.customer_gstin).toUpperCase())), "/m/sales");
  add("check", "Stock", "items with no cost, so profit on them is overstated", stock.filter((r) => !(n(r.data.unit_cost) > 0)), "/m/inventory");
  add("check", "Stock", "items with no HSN code (GST returns ask for it)", biz.gstin ? stock.filter((r) => !s(r.data.hsn)) : [], "/m/inventory");
  add("check", "GST", "purchases with GST but no supplier GSTIN: no input credit on these", purchases.filter((r) => n(r.data.gst_rate) > 0 && !s(r.data.supplier_gstin) && s(r.data.status) !== "Cancelled"), "/m/purchases");
  add("check", "Purchases", "orders still open after 30 days: received, or should they be cancelled?", purchases.filter((r) => s(r.data.status) === "Ordered" && s(r.data.date) < addDays(today, -30)), "/m/purchases");
  add("check", "Customers", "unpaid bills more than a year old: collect or write off", sales.filter((r) => r.data.payment && s(r.data.payment) !== "Paid" && s(r.data.date) < addDays(today, -365)), "/m/sales");
  const phones = new Map<string, number>();
  for (const c of customers) { const p = ph10(c.data.phone); if (p.length === 10) phones.set(p, (phones.get(p) ?? 0) + 1); }
  add("check", "Customers", "phone numbers on more than one customer: points and dues split between them", [...phones.values()].filter((x) => x > 1), "/m/customers");
  const seen = new Map<string, Set<string>>();
  for (const r of sales) { const inv = s(r.data.invoice); if (inv) (seen.get(inv) ?? seen.set(inv, new Set()).get(inv)!).add(s(r.data.date)); }
  add("fix", "Sales", "invoice numbers used on more than one day", [...seen.values()].filter((d) => d.size > 1), "/m/sales");
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "fix" ? -1 : 1));
}

/* ---------------- staff incentive & referrals ---------------- */

/** Sales by who billed them (counter login), returns netted, with the incentive at `pct` % of net sales. */
export function staffReport(sales: RecordRow[], from: string, to: string, pct = 0) {
  const m = new Map<string, { who: string; bills: Set<string>; sales: number; returns: number }>();
  for (const r of sales) {
    const d = s(r.data.date); if (d < from || d > to || r.by === "Sample data" || r.by === "Import") continue;
    const x = m.get(r.by) ?? m.set(r.by, { who: r.by, bills: new Set(), sales: 0, returns: 0 }).get(r.by)!;
    const a = n(r.data.amount);
    if (a >= 0) { x.sales += a; x.bills.add(s(r.data.invoice) || r.id); } else x.returns -= a;
  }
  return [...m.values()].map((x) => ({ who: x.who, bills: x.bills.size, sales: r2(x.sales), returns: r2(x.returns), net: r2(x.sales - x.returns), incentive: r2(((x.sales - x.returns) * pct) / 100) }))
    .sort((a, b) => b.net - a.net);
}

/** Customers each referrer brought (Customers → Referred by) and what they bought in the period; commission at `pct` %. */
export function referralReport(sales: RecordRow[], customers: RecordRow[], from: string, to: string, pct = 0) {
  const out = new Map<string, { referrer: string; customers: number; sales: number }>();
  for (const c of customers) {
    const ref = s(c.data.referred_by); if (!ref) continue;
    const x = out.get(ref.toLowerCase()) ?? out.set(ref.toLowerCase(), { referrer: ref, customers: 0, sales: 0 }).get(ref.toLowerCase())!;
    x.customers++;
    for (const r of sales) { const d = s(r.data.date); if (d >= from && d <= to && customerOf(r.data, [c])) x.sales += n(r.data.amount); }
  }
  return [...out.values()].map((x) => ({ ...x, sales: r2(x.sales), commission: r2((x.sales * pct) / 100) })).sort((a, b) => b.sales - a.sales);
}

/* ---------------- TCS and Form 27EQ ---------------- */

/** TCS on a bill: `rate` % of the bill total (GST included, as the law reads "sale consideration"). */
export const tcsOn = (total: number, rate: number) => (rate > 0 ? r2((total * rate) / 100) : 0);

/** Form 27EQ: TCS collected per quarter of the financial year starting `fyStart` (YYYY-MM), by customer. */
export function form27EQ(sales: RecordRow[], fyStart: string) {
  const y = +fyStart.slice(0, 4), m0 = +fyStart.slice(5, 7);
  const qOf = (d: string) => { const k = (+d.slice(0, 4) - y) * 12 + (+d.slice(5, 7) - m0); return k >= 0 && k < 12 ? Math.floor(k / 3) + 1 : 0; };
  const q = [1, 2, 3, 4].map((i) => ({ quarter: `Q${i}`, collected: 0, received: 0, parties: new Map<string, { name: string; gstin: string; received: number; tcs: number }>() }));
  for (const r of sales) {
    const t = n(r.data.tcs); if (!t) continue;
    const k = qOf(s(r.data.date)); if (!k) continue;
    const Q = q[k - 1], key = s(r.data.customer_gstin) || s(r.data.customer) || "Walk-in";
    const p = Q.parties.get(key) ?? Q.parties.set(key, { name: s(r.data.customer) || "Walk-in", gstin: s(r.data.customer_gstin), received: 0, tcs: 0 }).get(key)!;
    p.tcs = r2(p.tcs + t); p.received = r2(p.received + n(r.data.amount) + t);
    Q.collected = r2(Q.collected + t); Q.received = r2(Q.received + n(r.data.amount) + t);
  }
  return q.map((x) => ({ quarter: x.quarter, collected: x.collected, received: x.received, parties: [...x.parties.values()].sort((a, b) => b.tcs - a.tcs) }));
}

/* ---------------- nutrition labels ---------------- */

/** "Energy 120 kcal; Protein 24 g, Fat 1.5g" → rows for a nutrition table. Free text without numbers is kept whole. */
export function parseNutrition(text: string) {
  return String(text ?? "").split(/[;\n,]+/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = x.match(/^(.*?)[\s:=-]*(\d+(?:\.\d+)?\s*(?:kcal|kj|mg|mcg|µg|g|%|iu)?)$/i);
    return m && m[1] ? { name: m[1].trim(), value: m[2].replace(/\s+/g, " ").trim() } : { name: x, value: "" };
  });
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("extras.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
  const row = (id: string, data: Record<string, Value>, by = "Ravi"): RecordRow => ({ id, at: "", by, data });
  assert(dueDate("2026-11-20", 15) === "2026-12-05" && dueDate("2026-11-20", 0) === "2026-11-20", "due date");
  const od = overdue([row("a", { date: "2026-10-01", due: "2026-10-31", amount: 500, payment: "Unpaid" }), row("b", { date: "2026-11-19", due: "2026-12-04", amount: 300, payment: "Unpaid" }),
    row("c", { date: "2026-09-01", amount: 200, payment: "Paid" })], "2026-11-20");
  assert(od.length === 1 && od[0].row.id === "a" && od[0].late === 20, "only past-due unpaid " + JSON.stringify(od.map((x) => x.late)));

  const xml = `<ENVELOPE><BODY><TALLYMESSAGE>
<LEDGER NAME="Ravi &amp; Sons" RESERVEDNAME=""><PARENT>Sundry Debtors</PARENT><LEDGERMOBILE>9876543210</LEDGERMOBILE><PARTYGSTIN>27aabcr1234f1z5</PARTYGSTIN><ADDRESS.LIST><ADDRESS>Shop 4</ADDRESS><ADDRESS>Nashik</ADDRESS></ADDRESS.LIST><OPENINGBALANCE>-1500.00</OPENINGBALANCE></LEDGER>
<LEDGER NAME="Metro Wholesale"><PARENT>Sundry Creditors</PARENT></LEDGER><LEDGER NAME="Cash"><PARENT>Cash-in-Hand</PARENT></LEDGER>
<STOCKITEM NAME="Tata Salt 1kg"><PARENT>Staples</PARENT><HSNCODE>2501</HSNCODE><OPENINGBALANCE>40 Nos</OPENINGBALANCE><OPENINGVALUE>-800.00</OPENINGVALUE><GSTDETAILS.LIST><STATEWISEDETAILS.LIST><RATEDETAILS.LIST><GSTRATEDUTYHEAD>Integrated Tax</GSTRATEDUTYHEAD><GSTRATE>5</GSTRATE></RATEDETAILS.LIST></STATEWISEDETAILS.LIST></GSTDETAILS.LIST></STOCKITEM>
</TALLYMESSAGE></BODY></ENVELOPE>`;
  assert(isTallyXml(xml) && !isTallyXml("name,phone"), "sniff");
  const t = parseTallyMasters(xml);
  assert(t.customers.length === 1 && t.customers[0].name === "Ravi & Sons" && t.customers[0].gstin === "27AABCR1234F1Z5" && t.customers[0].city === "Nashik" && t.customers[0].opening === -1500, "debtor " + JSON.stringify(t.customers));
  assert(t.suppliers[0].name === "Metro Wholesale" && t.items[0].on_hand === 40 && t.items[0].unit_cost === 20 && t.items[0].gst_rate === "5" && t.items[0].hsn === "2501", "items " + JSON.stringify(t.items));

  const issues = verifyData({
    inventory: [row("i1", { name: "A", on_hand: -2, price: 10, unit_cost: 5, hsn: "1" }), row("i2", { name: "B", on_hand: 1 })],
    sales: [row("s1", { date: "2026-11-01", invoice: "X/1", amount: 10, gst_rate: "5" }), row("s2", { date: "2026-11-02", invoice: "X/1", amount: 5 })],
    customers: [row("c1", { phone: "9876543210" }), row("c2", { phone: "+91 98765 43210" })],
  }, "2026-11-20", { gstin: "27AAAAA0000A1Z5" });
  const has = (t: string) => issues.some((x) => x.text.includes(t));
  assert(has("below zero") && has("no selling price") && has("without a GST rate") && has("more than one day") && has("more than one customer") && has("no cost"), "verify " + JSON.stringify(issues.map((x) => x.text)));
  assert(issues[0].level === "fix" && issues[issues.length - 1].level === "check", "fixes first");

  const sales = [row("1", { date: "2026-11-02", invoice: "A1", amount: 1000, phone: "9000000001" }, "Ravi"), row("2", { date: "2026-11-02", invoice: "A1", amount: 500 }, "Ravi"),
    row("3", { date: "2026-11-03", invoice: "CN1", amount: -200 }, "Ravi"), row("4", { date: "2026-11-03", invoice: "A2", amount: 300, customer: "Sita" }, "Meena"),
    row("5", { date: "2026-10-01", invoice: "A0", amount: 999 }, "Meena")];
  const st = staffReport(sales, "2026-11-01", "2026-11-30", 2);
  assert(st[0].who === "Ravi" && st[0].bills === 1 && st[0].net === 1300 && st[0].incentive === 26 && st[1].net === 300, "staff " + JSON.stringify(st));
  const ref = referralReport(sales, [row("c", { name: "Anil", phone: "9000000001", referred_by: "Kiran" }), row("d", { name: "Sita", referred_by: "kiran" })], "2026-11-01", "2026-11-30", 5);
  assert(ref.length === 1 && ref[0].customers === 2 && ref[0].sales === 1300 && ref[0].commission === 65, "referral " + JSON.stringify(ref));

  assert(tcsOn(1_000_000, 0.1) === 1000 && tcsOn(500, 0) === 0, "tcs");
  const eq = form27EQ([row("t", { date: "2026-05-10", customer: "Big Buyer", customer_gstin: "29AAAAA1111A1Z5", amount: 100000, tcs: 100 }), row("u", { date: "2026-12-01", amount: 5000, tcs: 5 })], "2026-04");
  assert(eq[0].collected === 100 && eq[0].parties[0].gstin === "29AAAAA1111A1Z5" && eq[2].collected === 5 && eq[1].collected === 0, "27EQ " + JSON.stringify(eq.map((q) => q.collected)));
  const nu = parseNutrition("Energy 120 kcal; Protein: 24 g\nFat 1.5g, Contains milk");
  assert(nu.length === 4 && nu[0].value === "120 kcal" && nu[1].name === "Protein" && nu[2].value === "1.5g" && nu[3].value === "", "nutrition " + JSON.stringify(nu));
  console.log("extras self-check ok");
}
