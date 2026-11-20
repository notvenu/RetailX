/**
 * Spreadsheet imports: guess which column is which field from the headers that Tally, Vyapar, Busy, Excel and Indian
 * bank statements use, and turn bank-statement debits into categorised expenses. Pure. Self-check: `node src/lib/importers.ts`
 */
import type { ModuleDef } from "./model";

/** Header words other tools use for each of our field keys (lower-case, compared after stripping punctuation). */
const SYNONYMS: Record<string, string[]> = {
  date: ["date", "voucher date", "invoice date", "bill date", "txn date", "transaction date", "value date", "posting date", "vch date"],
  invoice: ["invoice no", "invoice number", "bill no", "voucher no", "vch no", "inv no", "ref no", "reference"],
  customer: ["party name", "party", "customer name", "buyer", "particulars", "ledger", "name of party", "client"],
  item: ["item name", "item", "product", "product name", "description of goods", "stock item"],
  quantity: ["qty", "quantity", "billed qty", "actual qty"],
  amount: ["total amount", "amount", "grand total", "invoice value", "net amount", "total", "value", "bill amount"],
  cost: ["cost", "purchase value", "cogs"],
  gst_rate: ["gst rate", "gst %", "tax rate", "igst rate", "rate of tax"],
  hsn: ["hsn", "hsn code", "hsn/sac", "sac"],
  customer_gstin: ["gstin", "party gstin", "gstin/uin", "customer gstin", "buyer gstin"],
  supplier_gstin: ["supplier gstin", "seller gstin", "gstin/uin"],
  phone: ["phone", "mobile", "contact", "phone no", "mobile no"],
  payment: ["payment status", "status", "paid/unpaid"],
  supplier: ["supplier", "supplier name", "vendor", "party name", "seller"],
  vendor: ["paid to", "vendor", "payee", "narration", "description", "particulars"],
  category: ["category", "expense head", "ledger", "group"],
  name: ["name", "item name", "product name", "stock item", "employee name"],
  on_hand: ["closing stock", "closing qty", "stock", "qty in hand", "available", "on hand", "balance qty"],
  unit_cost: ["rate", "purchase price", "cost price", "unit cost"],
  price: ["sale price", "mrp", "selling price", "price"],
  note: ["narration", "remarks", "note", "notes", "description"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%/ ]+/g, " ").replace(/\s+/g, " ").trim();

/** For each header column, the field it fills (or null). Exact key/label matches first, then known synonyms. */
export function autoMap(header: string[], mod: ModuleDef): (string | null)[] {
  const used = new Set<string>();
  const pick = (h: string): string | null => {
    const n = norm(h);
    const direct = mod.fields.find((f) => !used.has(f.key) && (norm(f.key.replace(/_/g, " ")) === n || norm(f.label) === n));
    if (direct) return direct.key;
    const syn = mod.fields.find((f) => !used.has(f.key) && (SYNONYMS[f.key] ?? []).includes(n));
    return syn?.key ?? null;
  };
  return header.map((h) => { const k = pick(h); if (k) used.add(k); return k; });
}

/* ---------------- bank statements ---------------- */

const RULES: [RegExp, string][] = [
  [/\brent\b|lease|landlord/i, "Rent"],
  [/electric|msedcl|bescom|tneb|tata power|adani elec|water|gas|airtel|jio|vodafone|vi\b|bsnl|broadband|internet/i, "Utilities"],
  [/salary|wages|payroll|\bpf\b|esic/i, "Salaries"],
  [/google ads|facebook|meta|instagram|ads|advert|marketing|printing|pamphlet/i, "Marketing"],
  [/petrol|diesel|fuel|hpcl|iocl|bpcl|uber|ola|rapido|transport|freight|courier|delhivery|porter/i, "Transport"],
  [/repair|service|maintenance|plumb|electrician/i, "Maintenance"],
  [/\bca\b|chartered|legal|advocate|consult|audit|professional/i, "Professional fees"],
  [/packag|stationery|supplies|amazon|flipkart|dmart|metro|udaan/i, "Supplies"],
];

export function categorize(text: string, options: string[] = []): string {
  const hit = RULES.find(([re]) => re.test(text))?.[1] ?? "Other";
  return options.length && !options.includes(hit) ? (options.includes("Other") ? "Other" : options[0]) : hit;
}

export const looksLikeBankStatement = (header: string[]) => {
  const h = header.map(norm);
  return h.some((x) => /withdrawal|debit|dr\b/.test(x)) && h.some((x) => /narration|description|particulars|remarks/.test(x));
};

/** Bank statement rows → expense rows (debits only). Credits are money in, not expenses, so they're skipped. */
export function bankToExpenses(header: string[], rows: string[][], categoryOptions: string[] = []) {
  const h = header.map(norm);
  const col = (re: RegExp) => h.findIndex((x) => re.test(x));
  const iDate = col(/^(txn |transaction |value )?date$|^date/), iDesc = col(/narration|description|particulars|remarks/);
  const iDebit = col(/withdrawal|debit|^dr\b/);
  const iMode = col(/mode|type|channel/);
  const out: Record<string, string>[] = [];
  for (const r of rows) {
    const debit = parseFloat(String(r[iDebit] ?? "").replace(/[^0-9.]/g, ""));
    if (!(debit > 0)) continue;
    const desc = String(r[iDesc] ?? "").trim();
    const mode = /upi/i.test(desc) ? "UPI" : /neft|imps|rtgs|ach/i.test(desc) ? "Bank" : /pos|card/i.test(desc) ? "Card" : /atm|cash/i.test(desc) ? "Cash" : String(r[iMode] ?? "Bank");
    out.push({
      date: String(r[iDate] ?? ""),
      amount: String(debit),
      category: categorize(desc, categoryOptions),
      vendor: desc.replace(/^(UPI|NEFT|IMPS|RTGS|POS|ACH)[-/ ]*/i, "").split(/[/-]/).filter(Boolean).slice(0, 2).join(" ").slice(0, 60),
      mode,
      note: desc.slice(0, 200),
    });
  }
  return out;
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("importers.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
  const sales: ModuleDef = { id: "sales", name: "Sales", icon: "", group: "", description: "", enabled: true, dateField: "date", fields: [
    { key: "date", label: "Date", type: "date" }, { key: "invoice", label: "Invoice no.", type: "text" }, { key: "customer", label: "Customer", type: "text" },
    { key: "amount", label: "Amount", type: "money" }, { key: "gst_rate", label: "GST %", type: "select" }, { key: "hsn", label: "HSN / SAC", type: "text" },
  ] };
  // a Vyapar-style sale report header
  const m = autoMap(["Date", "Invoice No", "Party Name", "Total Amount", "Tax Rate", "HSN/SAC", "Payment Type"], sales);
  assert(m.join() === "date,invoice,customer,amount,gst_rate,hsn,", "vyapar map " + m.join());
  // a Tally day book header
  assert(autoMap(["Vch Date", "Particulars", "Vch No.", "Value"], sales).join() === "date,customer,invoice,amount", "tally map");
  const header = ["Txn Date", "Narration", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"];
  const exp = bankToExpenses(header, [
    ["01/09/2026", "NEFT-LANDLORD SHARMA-SEPT RENT", "45,000.00", "", "1,20,000"],
    ["03/09/2026", "UPI/MSEDCL/electricity bill", "6,210.00", "", "1,13,790"],
    ["04/09/2026", "UPI/RAHUL/payment received", "", "2,500.00", "1,16,290"],
  ], ["Rent", "Utilities", "Other"]);
  assert(exp.length === 2 && exp[0].category === "Rent" && exp[1].category === "Utilities" && exp[1].mode === "UPI" && exp[0].amount === "45000", "bank " + JSON.stringify(exp));
  assert(looksLikeBankStatement(header), "detect bank statement");
  console.log("importers self-check ok");
}
