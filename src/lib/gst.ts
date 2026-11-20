/**
 * GST from recorded sales and purchases. Amounts are GST-inclusive (what the customer paid); the rate splits
 * them into taxable value and tax. Supply is inter-state (IGST) when the party's GSTIN state code differs from the
 * business's; otherwise intra-state (CGST + SGST, half each). Self-check: `node src/lib/gst.ts`
 */
import type { RecordRow } from "./model";

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, "")) || 0);

export function split(amount: number, rate: number) {
  const taxable = r2(amount / (1 + rate / 100));
  return { taxable, tax: r2(amount - taxable) };
}

export const stateOf = (gstin?: unknown) => (typeof gstin === "string" && /^\d{2}/.test(gstin.trim()) ? gstin.trim().slice(0, 2) : "");

export type TaxLine = { taxable: number; cgst: number; sgst: number; igst: number; total: number; count: number };
const blank = (): TaxLine => ({ taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0, count: 0 });

function add(line: TaxLine, amount: number, rate: number, inter: boolean) {
  const { taxable, tax } = split(amount, rate);
  line.taxable = r2(line.taxable + taxable);
  if (inter) line.igst = r2(line.igst + tax);
  else { line.cgst = r2(line.cgst + tax / 2); line.sgst = r2(line.sgst + tax / 2); }
  line.total = r2(line.total + amount);
  line.count++;
}

/** One sale's tax breakdown, for an invoice. */
export function invoiceTax(data: Record<string, unknown>, businessState?: string) {
  const rate = num(data.gst_rate), amount = num(data.amount);
  const party = stateOf(data.customer_gstin);
  const inter = !!party && !!businessState && party !== businessState;
  const line = blank();
  add(line, amount, rate, inter);
  return { ...line, rate, inter };
}

export type GstSummary = {
  outward: Record<string, TaxLine>; // by rate
  b2b: TaxLine;
  b2c: TaxLine;
  hsn: { hsn: string; rate: number; line: TaxLine }[];
  inward: Record<string, TaxLine>; // input tax credit, by rate
  outputTax: number;
  inputTax: number;
  payable: number;
};

const inMonth = (row: RecordRow, field: string, month: string) => String(row.data[field] ?? row.at).slice(0, 7) === month;

export function gstSummary(sales: RecordRow[], purchases: RecordRow[], month: string, businessState?: string): GstSummary {
  const outward: Record<string, TaxLine> = {}, inward: Record<string, TaxLine> = {};
  const b2b = blank(), b2c = blank();
  const hsn = new Map<string, { hsn: string; rate: number; line: TaxLine }>();
  for (const s of sales) {
    if (!inMonth(s, "date", month)) continue;
    const rate = num(s.data.gst_rate), amount = num(s.data.amount);
    const party = stateOf(s.data.customer_gstin);
    const inter = !!party && !!businessState && party !== businessState;
    add((outward[rate] ??= blank()), amount, rate, inter);
    add(party ? b2b : b2c, amount, rate, inter);
    const code = String(s.data.hsn ?? "").trim() || "—";
    const k = `${code}|${rate}`;
    if (!hsn.has(k)) hsn.set(k, { hsn: code, rate, line: blank() });
    add(hsn.get(k)!.line, amount, rate, inter);
  }
  for (const p of purchases) {
    if (!inMonth(p, "date", month) || String(p.data.status ?? "") === "Cancelled") continue;
    const rate = num(p.data.gst_rate);
    // input tax credit needs a registered supplier; without a GSTIN the tax is a cost, not a credit
    if (!rate || !stateOf(p.data.supplier_gstin)) continue;
    const inter = !!businessState && stateOf(p.data.supplier_gstin) !== businessState;
    add((inward[rate] ??= blank()), num(p.data.amount), rate, inter);
  }
  const tax = (l: TaxLine) => l.cgst + l.sgst + l.igst;
  const outputTax = r2(Object.values(outward).reduce((t, l) => t + tax(l), 0));
  const inputTax = r2(Object.values(inward).reduce((t, l) => t + tax(l), 0));
  return {
    outward, inward, b2b, b2c, outputTax, inputTax, payable: r2(Math.max(0, outputTax - inputTax)),
    hsn: [...hsn.values()].sort((a, b) => b.line.total - a.line.total),
  };
}

/* ---------------- GSTR-1 JSON for the GST offline tool ---------------- */

const dmy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/**
 * Outward supplies in the GSTR-1 offline-tool JSON shape: B2B invoices by buyer GSTIN, B2C summarised by
 * place of supply and rate, and the HSN summary. Check it in the offline tool before filing.
 * ponytail: returns (negative bills) are netted into their slab instead of going in the credit-note tables (cdnr/cdnur).
 */
export function gstr1(sales: RecordRow[], month: string, gstin: string, businessState: string) {
  const inv = new Map<string, { ctin: string; pos: string; date: string; rows: RecordRow[] }>();
  const b2cs = new Map<string, { sply_ty: string; rt: number; typ: string; pos: string; txval: number; iamt: number; camt: number; samt: number; csamt: number }>();
  const hsn = new Map<string, { hsn_sc: string; qty: number; val: number; txval: number; iamt: number; camt: number; samt: number; rt: number }>();
  for (const s of sales) {
    if (!inMonth(s, "date", month)) continue;
    const rate = num(s.data.gst_rate), amount = num(s.data.amount), party = stateOf(s.data.customer_gstin);
    const pos = party || businessState, inter = pos !== businessState;
    const { taxable, tax } = split(amount, rate);
    const t = inter ? { iamt: tax, camt: 0, samt: 0 } : { iamt: 0, camt: r2(tax / 2), samt: r2(tax / 2) };
    if (party) {
      const no = String(s.data.invoice ?? "").trim() || s.id;
      const g = inv.get(no) ?? inv.set(no, { ctin: String(s.data.customer_gstin).trim().toUpperCase(), pos, date: String(s.data.date ?? s.at).slice(0, 10), rows: [] }).get(no)!;
      g.rows.push(s);
    } else {
      const k = `${pos}|${rate}`;
      const b = b2cs.get(k) ?? b2cs.set(k, { sply_ty: inter ? "INTER" : "INTRA", rt: rate, typ: "OE", pos, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 }).get(k)!;
      b.txval = r2(b.txval + taxable); b.iamt = r2(b.iamt + t.iamt); b.camt = r2(b.camt + t.camt); b.samt = r2(b.samt + t.samt);
    }
    const code = String(s.data.hsn ?? "").trim() || "NA", hk = `${code}|${rate}`;
    const h = hsn.get(hk) ?? hsn.set(hk, { hsn_sc: code, qty: 0, val: 0, txval: 0, iamt: 0, camt: 0, samt: 0, rt: rate }).get(hk)!;
    h.qty += num(s.data.quantity); h.val = r2(h.val + amount); h.txval = r2(h.txval + taxable);
    h.iamt = r2(h.iamt + t.iamt); h.camt = r2(h.camt + t.camt); h.samt = r2(h.samt + t.samt);
  }
  const byBuyer = new Map<string, object[]>();
  for (const [inum, g] of inv) {
    const slabs = new Map<number, { txval: number; iamt: number; camt: number; samt: number }>();
    for (const r of g.rows) {
      const rate = num(r.data.gst_rate), { taxable, tax } = split(num(r.data.amount), rate), inter = g.pos !== businessState;
      const x = slabs.get(rate) ?? slabs.set(rate, { txval: 0, iamt: 0, camt: 0, samt: 0 }).get(rate)!;
      x.txval = r2(x.txval + taxable);
      if (inter) x.iamt = r2(x.iamt + tax); else { x.camt = r2(x.camt + tax / 2); x.samt = r2(x.samt + tax / 2); }
    }
    const list = byBuyer.get(g.ctin) ?? byBuyer.set(g.ctin, []).get(g.ctin)!;
    list.push({
      inum, idt: dmy(g.date), val: r2(g.rows.reduce((t, r) => t + num(r.data.amount), 0)), pos: g.pos, rchrg: "N", inv_typ: "R",
      itms: [...slabs].map(([rt, x], i) => ({ num: i + 1, itm_det: { rt, ...x, csamt: 0 } })),
    });
  }
  return {
    gstin, fp: month.slice(5, 7) + month.slice(0, 4),
    b2b: [...byBuyer].map(([ctin, i]) => ({ ctin, inv: i })),
    b2cs: [...b2cs.values()],
    hsn: { data: [...hsn.values()].map((h, i) => ({ num: i + 1, hsn_sc: h.hsn_sc, uqc: "NOS", qty: r2(h.qty), val: h.val, txval: h.txval, iamt: h.iamt, camt: h.camt, samt: h.samt, csamt: 0, rt: h.rt })) },
  };
}

/* ---------------- GSTR-9 (annual) ---------------- */

/**
 * The year in one place for GSTR-9: each month's taxable value, output tax, input credit and tax paid in cash,
 * plus the year's HSN summary. `startMonth` is the first month of the financial year, `YYYY-MM`.
 */
export function gstr9(sales: RecordRow[], purchases: RecordRow[], startMonth: string, businessState?: string) {
  const y = +startMonth.slice(0, 4), m0 = +startMonth.slice(5, 7);
  const months = Array.from({ length: 12 }, (_, i) => { const t = m0 - 1 + i; return `${y + Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; });
  const hsn = new Map<string, { hsn: string; rate: number; line: TaxLine }>();
  const rows = months.map((month) => {
    const g = gstSummary(sales, purchases, month, businessState);
    for (const h of g.hsn) {
      const k = `${h.hsn}|${h.rate}`, cur = hsn.get(k) ?? hsn.set(k, { hsn: h.hsn, rate: h.rate, line: blank() }).get(k)!;
      for (const f of ["taxable", "cgst", "sgst", "igst", "total"] as const) cur.line[f] = r2(cur.line[f] + h.line[f]);
      cur.line.count += h.line.count;
    }
    const taxable = r2(Object.values(g.outward).reduce((t, l) => t + l.taxable, 0));
    return { month, taxable, b2b: g.b2b.taxable, b2c: g.b2c.taxable, outputTax: g.outputTax, inputTax: g.inputTax, payable: g.payable };
  });
  const sum = (k: "taxable" | "b2b" | "b2c" | "outputTax" | "inputTax" | "payable") => r2(rows.reduce((t, r) => t + r[k], 0));
  return {
    months: rows, hsn: [...hsn.values()].sort((a, b) => b.line.total - a.line.total),
    totals: { taxable: sum("taxable"), b2b: sum("b2b"), b2c: sum("b2c"), outputTax: sum("outputTax"), inputTax: sum("inputTax"), payable: sum("payable") },
  };
}

/* ---------------- e-way bill JSON ---------------- */

export type Transport = { vehicle?: string; distance?: number; mode?: number; transporter?: string; transporterId?: string; fromPin?: string; toPin?: string; toPlace?: string };

/**
 * One e-way bill for a sale invoice, in the shape ewaybillgst.gov.in → e-Waybill → Bulk generation accepts. Needed
 * when goods over ₹50,000 move. `lines` are the invoice's Sales records. Ported from FitSecret's gstjson.js.
 * ponytail: field names follow the portal's published bulk schema; check the first file on the portal before relying on it.
 */
export function ewayJson(lines: RecordRow[], biz: { name: string; gstin?: string; state?: string; city?: string }, t: Transport = {}) {
  const d = lines[0]?.data ?? {};
  const ctin = String(d.customer_gstin ?? "").trim().toUpperCase();
  const toState = stateOf(ctin) || biz.state || "";
  const inter = !!toState && toState !== biz.state;
  const items = lines.map((r, i) => {
    const rate = num(r.data.gst_rate), { taxable } = split(num(r.data.amount), rate);
    return { itemNo: i + 1, productName: String(r.data.item ?? "Goods"), productDesc: String(r.data.item ?? "Goods"), hsnCode: Number(r.data.hsn) || 0,
      quantity: num(r.data.quantity) || 1, qtyUnit: "NOS", taxableAmount: taxable,
      sgstRate: inter ? 0 : rate / 2, cgstRate: inter ? 0 : rate / 2, igstRate: inter ? rate : 0, cessRate: 0, cessNonadvol: 0 };
  });
  const taxes = lines.map((r) => invoiceTax(r.data, biz.state));
  const tot = (k: "taxable" | "cgst" | "sgst" | "igst" | "total") => r2(taxes.reduce((s, x) => s + x[k], 0));
  const date = String(d.date ?? "");
  const main = [...items].sort((a, b) => b.taxableAmount - a.taxableAmount)[0];
  return {
    version: "1.0.0621",
    billLists: [{
      userGstin: (biz.gstin ?? "").toUpperCase(), supplyType: "O", subSupplyType: 1, subSupplyDesc: "", docType: "INV",
      docNo: String(d.invoice ?? ""), docDate: `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`,
      fromGstin: (biz.gstin ?? "").toUpperCase(), fromTrdName: biz.name, fromAddr1: "", fromAddr2: "", fromPlace: biz.city ?? "",
      fromPincode: Number(t.fromPin) || 0, fromStateCode: Number(biz.state) || 0, actualFromStateCode: Number(biz.state) || 0,
      toGstin: ctin || "URP", toTrdName: String(d.customer ?? ""), toAddr1: "", toAddr2: "", toPlace: t.toPlace ?? "",
      toPincode: Number(t.toPin) || 0, toStateCode: Number(toState) || 0, actualToStateCode: Number(toState) || 0,
      transactionType: 1, totalValue: tot("taxable"), cgstValue: tot("cgst"), sgstValue: tot("sgst"), igstValue: tot("igst"), cessValue: 0, cessNonAdvolValue: 0,
      otherValue: r2(tot("total") - tot("taxable") - tot("cgst") - tot("sgst") - tot("igst")), totInvValue: tot("total"),
      transMode: Number(t.mode) || 1, transDistance: Number(t.distance) || 0, transporterName: t.transporter ?? "", transporterId: (t.transporterId ?? "").toUpperCase(),
      transDocNo: "", transDocDate: "", vehicleNo: (t.vehicle ?? "").replace(/\s/g, "").toUpperCase(), vehicleType: "R",
      mainHsnCode: main?.hsnCode ?? 0, itemList: items,
    }],
  };
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("gst.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
  assert(split(118, 18).taxable === 100 && split(118, 18).tax === 18, "inclusive split");
  const row = (data: Record<string, unknown>): RecordRow => ({ id: Math.random().toString(), at: "2026-09-01", by: "t", data: data as RecordRow["data"] });
  const sales = [
    row({ date: "2026-09-03", amount: 1180, gst_rate: "18", hsn: "1006" }),
    row({ date: "2026-09-04", amount: 1050, gst_rate: "5", customer_gstin: "27AAAAA0000A1Z5", hsn: "0402" }), // same state: CGST+SGST
    row({ date: "2026-09-05", amount: 1180, gst_rate: "18", customer_gstin: "29BBBBB1111B1Z5" }), // Karnataka: IGST
    row({ date: "2026-08-30", amount: 999, gst_rate: "18" }), // other month
  ];
  const purchases = [
    row({ date: "2026-09-02", amount: 590, gst_rate: "18", supplier_gstin: "27CCCCC2222C1Z5" }),
    row({ date: "2026-09-02", amount: 590, gst_rate: "18" }), // unregistered supplier: no credit
  ];
  const g = gstSummary(sales, purchases, "2026-09", "27");
  assert(g.outward["18"].taxable === 2000 && g.outward["18"].igst === 180 && g.outward["18"].cgst === 90, "18% slab " + JSON.stringify(g.outward["18"]));
  assert(g.outward["5"].cgst === 25 && g.outward["5"].sgst === 25, "5% slab");
  assert(g.b2b.count === 2 && g.b2c.count === 1, "b2b/b2c");
  assert(g.inputTax === 90 && g.outputTax === 410 && g.payable === 320, `net ${g.outputTax} - ${g.inputTax} = ${g.payable}`);
  assert(invoiceTax(sales[2].data, "27").inter, "inter-state invoice");
  const j = gstr1(sales.map((x, i) => ({ ...x, id: "s" + i, data: { ...x.data, invoice: i < 3 ? "INV" + i : "", quantity: 1 } })), "2026-09", "27AAAAA0000A1Z5", "27");
  assert(j.fp === "092026" && j.b2b.length === 2, "gstr1 buyers " + JSON.stringify(j.b2b.map((b) => b.ctin)));
  const inter = (j.b2b.find((b) => b.ctin.startsWith("29"))!.inv[0] as { itms: { itm_det: { iamt: number } }[] }).itms[0].itm_det;
  assert(inter.iamt === 180, "gstr1 igst");
  assert(j.b2cs.length === 1 && j.b2cs[0].txval === 1000 && j.b2cs[0].camt === 90 && j.b2cs[0].sply_ty === "INTRA", "gstr1 b2cs " + JSON.stringify(j.b2cs));
  assert(j.hsn.data.reduce((t, h) => t + h.val, 0) === 3410, "hsn covers all September sales");
  const y9 = gstr9(sales, purchases, "2026-04", "27");
  assert(y9.months.length === 12 && y9.months[0].month === "2026-04" && y9.months[11].month === "2027-03", "FY months");
  assert(Math.abs(y9.totals.outputTax - 562.39) <= 0.01 && y9.totals.inputTax === 90 && y9.totals.taxable === 3846.61, "year totals " + JSON.stringify(y9.totals));
  const ew = ewayJson([row({ date: "2026-09-05", invoice: "INV2", customer: "Blr Traders", amount: 1180, gst_rate: "18", customer_gstin: "29BBBBB1111B1Z5", hsn: "1006", quantity: 2 })],
    { name: "Shop", gstin: "27AAAAA0000A1Z5", state: "27" }, { vehicle: "mh 12 ab 1234", distance: 840 });
  const e = ew.billLists[0];
  assert(e.docDate === "05/09/2026" && e.toStateCode === 29 && e.igstValue === 180 && e.itemList[0].igstRate === 18 && e.vehicleNo === "MH12AB1234", "eway " + JSON.stringify(e));
  console.log("gst self-check ok");
}
