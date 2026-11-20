/**
 * Turns the OCR text of a supplier bill into a draft stock-in: supplier GSTIN, bill no, date and item lines matched to
 * the stock list (ported from FitSecret's billparse.js). The text comes from Tesseract in the browser, so it is free
 * and heuristic: every line lands in a review screen before anything is saved. Self-check: `node src/lib/billparse.ts`
 */
import type { RecordRow } from "./model";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const GSTIN = /\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/g;
const SKIP = /\b(sub\s*total|total|grand|cgst|sgst|igst|taxable|round|amount in words|rupees|bank|ifsc|a\/c|account|declaration|signatory|terms|balance|received|discount\s*amt|freight)\b/i;
const MONTHS: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const UNIT = /^\d+(\.\d+)?(kg|g|gm|gms|lb|lbs|ml|l|ltr|pcs|pc|caps|tabs|s)$/i;

export const words = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9.]+/g, " ").split(" ").filter((w) => w.length > 1 || /\d/.test(w));

/** Share of the item's name words found in the line (0..1) and how many matched. */
export function matchScore(line: string, name: string) {
  const have = new Set(words(line)), want = [...new Set(words(name))];
  if (!want.length) return { score: 0, hit: 0 };
  const hit = want.filter((w) => have.has(w) || [...have].some((h) => h.length > 3 && (w.startsWith(h) || h.startsWith(w)))).length;
  return { score: hit / want.length, hit };
}

/** Needs 2+ shared words and 60% of the name; on a tie the more specific item wins. A barcode on the line wins outright. */
export function bestItem(line: string, items: RecordRow[]) {
  let best: RecordRow | null = null, top = { score: 0, hit: 0 };
  for (const it of items) {
    const bc = String(it.data.barcode ?? "");
    if (bc.length >= 6 && line.includes(bc)) return { item: it, score: 1 };
    const m = matchScore(line, `${it.data.brand ?? ""} ${it.data.name ?? ""}`);
    if (m.score > top.score || (m.score === top.score && m.hit > top.hit)) { best = it; top = m; }
  }
  return { item: top.score >= 0.6 && top.hit >= 2 ? best : null, score: r2(top.score) };
}

function expiryOf(line: string) {
  let m = line.match(/\b(0?[1-9]|1[0-2])[/\-.](\d{2}|\d{4})\b(?![/\-.]\d)/);
  let mon: number, yr: number;
  if (m) { mon = +m[1]; yr = +m[2]; }
  else if ((m = line.toUpperCase().match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\s\-/.']*(\d{2}|\d{4})\b/))) { mon = MONTHS[m[1]]; yr = +m[2]; }
  else return null;
  if (yr < 100) yr += 2000;
  if (yr < 2020 || yr > 2045) return null;
  return `${yr}-${String(mon).padStart(2, "0")}-${new Date(yr, mon, 0).getDate()}`; // MM/YY on a pack = end of that month
}

export type BillLine = { qty: number; rate: number; gst: number | null; hsn: string | null; batch: string | null; expiry: string | null; amount: number; guessed?: boolean };

/** One bill row → qty, rate (before GST), GST %, HSN, batch, expiry: rate is whatever makes qty × rate (± GST) ≈ the row amount. */
export function parseLine(line: string): BillLine | null {
  const exp = expiryOf(line);
  const clean = line.replace(/\b(0?[1-9]|1[0-2])[/\-.](\d{2}|\d{4})\b/g, " ");
  const gm = clean.match(/\b(0|5|12|18|28|40)(?:\.0+)?\s*%/);
  const tokens = clean.split(/\s+/).filter(Boolean);
  const hsn = tokens.find((t) => /^(\d{4}|\d{6}|\d{8})$/.test(t) && !/^0/.test(t) && !/^20[2-4]\d$/.test(t)) ?? null;
  const batch = tokens.find((t) => /^[A-Z0-9-]{4,14}$/i.test(t) && /[A-Z]/i.test(t) && /\d/.test(t) && !UNIT.test(t)) ?? null;
  const nums = tokens.filter((t) => t !== hsn && !UNIT.test(t) && /^\d[\d,]*(\.\d+)?$/.test(t)).map((t) => +t.replace(/,/g, ""));
  if (!nums.length) return null;
  const amount = nums[nums.length - 1], g = gm ? +gm[1] : null;
  const close = (a: number, b: number) => b > 0 && Math.abs(a - b) / b < 0.03;
  for (let i = 0; i < nums.length - 1; i++) {
    const q = nums[i];
    if (!(Number.isInteger(q) && q > 0 && q < 1000)) continue;
    for (let j = i + 1; j < nums.length - 1; j++) {
      const r = nums[j];
      if (close(q * r, amount) || (g != null && close(q * r * (1 + g / 100), amount))) return { qty: q, rate: r, gst: g, hsn, batch, expiry: exp, amount };
    }
  }
  const q = nums.find((x) => Number.isInteger(x) && x > 0 && x < 500 && x !== amount) ?? 1;
  return { qty: q, rate: r2(amount / q), gst: g, hsn, batch, expiry: exp, amount, guessed: true };
}

export type DraftLine = BillLine & { text: string; itemId: string | null; score: number };

export function parseBill(text: string, items: RecordRow[] = [], ownGstin = "") {
  const raw = String(text || "");
  const up = raw.toUpperCase().replace(/O(?=\d)/g, "0"); // OCR reads 0 as O inside numbers
  const gstin = [...new Set(up.match(GSTIN) ?? [])].find((g) => g !== ownGstin.toUpperCase()) ?? null;
  const no = raw.match(/(?:invoice|inv|bill)\s*(?:no|number|#)?\s*[.:#-]?\s*([A-Z0-9][A-Z0-9/-]{1,20})/i)?.[1] ?? null;
  const dm = raw.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  let date: string | null = null;
  if (dm) {
    const y = dm[3].length === 2 ? 2000 + +dm[3] : +dm[3];
    if (+dm[2] >= 1 && +dm[2] <= 12 && +dm[1] >= 1 && +dm[1] <= 31) date = `${y}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
  }
  const lines: DraftLine[] = [];
  for (const l of raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
    if (SKIP.test(l) || !/[a-z]{3}/i.test(l)) continue;
    const p = parseLine(l);
    if (!p || !(p.amount > 0)) continue;
    const { item, score } = bestItem(l, items);
    // a row needs a stock match, or a qty × rate pair and enough words to be a product name
    if (!item && (p.guessed || words(l).filter((w) => /[a-z]{3}/.test(w)).length < 2)) continue;
    lines.push({ ...p, text: l, itemId: item?.id ?? null, score });
  }
  return { gstin, no, date, lines };
}

/** The product-name part of a bill row, for a line with no stock match. */
export const nameOf = (text: string) => text.replace(/\b\d[\d,./%-]*\b/g, " ").replace(/\b(nos|pcs|pc|kg|g|ml|ltr)\b/gi, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Item";

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("billparse.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
  const row = (id: string, data: Record<string, string>): RecordRow => ({ id, at: "", by: "", data });
  const items = [row("a", { name: "Amul Taaza Milk 1L", barcode: "8901262010016" }), row("b", { name: "Tata Salt 1kg" }), row("c", { name: "Fortune Sunflower Oil 1L" })];
  const text = `METRO WHOLESALE  GSTIN 27AABCM1234F1Z5
Invoice No: MW/2611/0042   Date: 14/11/2026
Amul Taaza Milk 1L 0401 B2611X 12 25.00 300.00
TATA SALT 1KG 2501 5% 10 22.86 240.00
Fortune Sunflower Oil 1L 1512 11/27 18% 6 150.00 1062.00
Sub Total 1602.00
CGST 9% 48.60`;
  const b = parseBill(text, items, "27ZZZZZ9999Z1Z9");
  assert(b.gstin === "27AABCM1234F1Z5" && b.no === "MW/2611/0042" && b.date === "2026-11-14", "header " + JSON.stringify(b));
  assert(b.lines.length === 3, "three item rows, totals skipped " + b.lines.length);
  assert(b.lines[0].itemId === "a" && b.lines[0].qty === 12 && b.lines[0].rate === 25 && b.lines[0].batch === "B2611X", "milk " + JSON.stringify(b.lines[0]));
  assert(b.lines[1].itemId === "b" && b.lines[1].gst === 5 && b.lines[1].qty === 10, "salt with GST " + JSON.stringify(b.lines[1]));
  assert(b.lines[2].itemId === "c" && b.lines[2].expiry === "2027-11-30" && b.lines[2].rate === 150 && b.lines[2].gst === 18, "oil expiry " + JSON.stringify(b.lines[2]));
  assert(nameOf("Kissan Jam 500g 2007 4 90.00 360.00") === "Kissan Jam 500g", "name of an unmatched row: " + nameOf("Kissan Jam 500g 2007 4 90.00 360.00"));
  console.log("billparse self-check ok");
}
