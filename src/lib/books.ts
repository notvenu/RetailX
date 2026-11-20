/**
 * Accounting from the records the shop already keeps: every sale, purchase, expense, pay run, payment, journal entry
 * and fixed asset becomes double-entry postings, so the trial balance always balances. From those: profit & loss, a
 * balance sheet, ledgers and a bank reconciliation. Ported in spirit from FitSecret's Accounting (Chart of Accounts,
 * Journal Entries, Trial Balance, Balance Sheet) and Cash & Bank → Reconcile, without a separate set of books to keep.
 * Self-check: `node src/lib/books.ts`
 */
import type { RecordRow, Value } from "./model";

const n = (v: Value | undefined) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, "")) || 0);
const s = (v: Value | undefined) => String(v ?? "").trim();
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export type Kind = "asset" | "liability" | "equity" | "income" | "expense";
export type Posting = { date: string; account: string; dr: number; cr: number; ref: string; module: string; id: string; memo: string };

/** The chart of accounts: fixed accounts by name, expense categories and journal accounts fall in by kind. */
export const ACCOUNTS: Record<string, Kind> = {
  Cash: "asset", Bank: "asset", "Cheques in hand": "asset", Debtors: "asset", Stock: "asset", "Input GST": "asset",
  "TDS receivable": "asset", "Fixed assets": "asset", "Accumulated depreciation": "asset",
  Creditors: "liability", "Output GST": "liability", "Salaries payable": "liability", "PF / ESI payable": "liability",
  "TDS payable": "liability", "TCS payable": "liability", Loans: "liability",
  Capital: "equity", Drawings: "equity", "Opening balances": "equity",
  Sales: "income", "Other income": "income", "Cash over / short": "income",
  "Cost of goods sold": "expense", Salaries: "expense", Depreciation: "expense",
};
export const kindOf = (account: string): Kind => ACCOUNTS[account] ?? (/income|interest received|discount received/i.test(account) ? "income" : "expense");

/** Where money paid by a mode lands. UPI and card settle into the bank; an uncleared cheque sits in hand. */
export const moneyAccount = (mode: Value | undefined, chequeStatus?: Value) => {
  const m = s(mode).toLowerCase();
  if (m === "cheque") return s(chequeStatus) === "Cleared" ? "Bank" : "Cheques in hand";
  return m === "cash" || !m ? "Cash" : "Bank";
};

const taxSplit = (amount: number, rate: number) => { const taxable = r2(amount / (1 + rate / 100)); return { taxable, tax: r2(amount - taxable) }; };
const months = (from: string, to: string) => Math.max(0, (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5, 7) - +from.slice(5, 7)));

/** Every record as postings, up to and including `asOf`. */
export function postings(records: Record<string, RecordRow[]>, asOf: string): Posting[] {
  const out: Posting[] = [];
  const post = (r: RecordRow, module: string, date: string, ref: string, memo: string, lines: [string, number][]) => {
    for (const [account, amt] of lines) {
      const a = r2(amt);
      if (a) out.push({ date, account, dr: a > 0 ? a : 0, cr: a < 0 ? -a : 0, ref, module, id: r.id, memo });
    }
  };
  const upto = (r: RecordRow, f = "date") => { const d = s(r.data[f]) || r.at.slice(0, 10); return d <= asOf ? d : null; };

  for (const r of records.sales ?? []) {
    const date = upto(r); if (!date) continue;
    const amt = n(r.data.amount), { taxable, tax } = taxSplit(amt, n(r.data.gst_rate)), cost = n(r.data.cost), tcs = n(r.data.tcs);
    const paid = !r.data.payment || s(r.data.payment) === "Paid";
    post(r, "sales", date, s(r.data.invoice), s(r.data.customer) || "Sale", [
      [paid ? moneyAccount(r.data.mode === "Credit" ? "Cash" : r.data.mode) : "Debtors", amt + tcs], ["Sales", -taxable], ["Output GST", -tax], ["TCS payable", -tcs],
      ["Cost of goods sold", cost], ["Stock", -cost],
    ]);
  }
  for (const r of records.purchases ?? []) {
    const st = s(r.data.status);
    if (st !== "Received" && st !== "Returned") continue;
    const date = upto(r); if (!date) continue;
    const amt = n(r.data.amount), { taxable, tax } = taxSplit(amt, n(r.data.gst_rate));
    post(r, "purchases", date, s(r.data.po), s(r.data.supplier) || "Purchase", [["Stock", taxable], ["Input GST", tax], ["Creditors", -amt]]);
  }
  for (const r of records.expenses ?? []) {
    const date = upto(r); if (!date) continue;
    const amt = n(r.data.amount);
    post(r, "expenses", date, "", s(r.data.vendor) || s(r.data.category), [[s(r.data.category) || "Other expenses", amt], [moneyAccount(r.data.mode), -amt]]);
  }
  for (const r of records.payroll ?? []) {
    const date = upto(r); if (!date) continue;
    const gross = n(r.data.gross), net = n(r.data.net) || r2(gross - n(r.data.deductions));
    post(r, "payroll", date, "", s(r.data.employee), [["Salaries", gross], [s(r.data.status) === "Pending" ? "Salaries payable" : "Cash", -net], ["PF / ESI payable", -(gross - net)]]);
  }
  for (const r of records.payments ?? []) {
    const date = upto(r); if (!date) continue;
    if (s(r.data.cheque_status) === "Bounced") continue; // a bounced cheque never paid anything
    const amt = n(r.data.amount), tds = n(r.data.tds), cash = moneyAccount(r.data.mode, r.data.cheque_status);
    const memo = `${s(r.data.party)}${r.data.against ? ` against ${s(r.data.against)}` : ""}`;
    if (s(r.data.direction) === "Out") post(r, "payments", date, s(r.data.against), memo, [["Creditors", amt + tds], [cash, -amt], ["TDS payable", -tds]]);
    else post(r, "payments", date, s(r.data.against), memo, [[cash, amt], ["TDS receivable", tds], ["Debtors", -(amt + tds)]]);
  }
  for (const r of records.journal ?? []) {
    const date = upto(r); if (!date) continue;
    const amt = n(r.data.amount);
    post(r, "journal", date, "", s(r.data.note) || "Journal", [[s(r.data.debit) || "Suspense", amt], [s(r.data.credit) || "Suspense", -amt]]);
  }
  for (const r of records.assets ?? []) {
    const date = upto(r); if (!date) continue;
    const cost = n(r.data.cost), life = n(r.data.life_years);
    post(r, "assets", date, "", s(r.data.name), [["Fixed assets", cost], [moneyAccount(r.data.paid_by), -cost]]);
    // straight line, by whole months held, never below zero book value
    if (life > 0) {
      const dep = r2(Math.min(cost, (cost / (life * 12)) * months(date, asOf)));
      post(r, "assets", asOf, "", `Depreciation on ${s(r.data.name)}`, [["Depreciation", dep], ["Accumulated depreciation", -dep]]);
    }
  }
  for (const r of records.dayclose ?? []) {
    const date = upto(r); if (!date) continue;
    const diff = n(r.data.difference);
    post(r, "dayclose", date, "", "Drawer count", [["Cash", diff], ["Cash over / short", -diff]]);
  }
  return out;
}

export type TbRow = { account: string; kind: Kind; dr: number; cr: number; balance: number };

/** Trial balance: debit and credit totals per account. Balance is debit-positive. */
export function trialBalance(ps: Posting[]): TbRow[] {
  const m = new Map<string, TbRow>();
  for (const p of ps) {
    const row = m.get(p.account) ?? { account: p.account, kind: kindOf(p.account), dr: 0, cr: 0, balance: 0 };
    row.dr = r2(row.dr + p.dr); row.cr = r2(row.cr + p.cr); row.balance = r2(row.dr - row.cr);
    m.set(p.account, row);
  }
  const order: Kind[] = ["asset", "liability", "equity", "income", "expense"];
  return [...m.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.account.localeCompare(b.account));
}

/** Profit & loss between two dates (inclusive): income and expense accounts only. */
export function profitLoss(ps: Posting[], from: string, to: string) {
  const tb = trialBalance(ps.filter((p) => p.date >= from && p.date <= to));
  const income = tb.filter((r) => r.kind === "income").map((r) => ({ account: r.account, amount: r2(-r.balance) }));
  const expense = tb.filter((r) => r.kind === "expense").map((r) => ({ account: r.account, amount: r.balance }));
  const sales = income.find((x) => x.account === "Sales")?.amount ?? 0, cogs = expense.find((x) => x.account === "Cost of goods sold")?.amount ?? 0;
  const ti = r2(income.reduce((t, x) => t + x.amount, 0)), te = r2(expense.reduce((t, x) => t + x.amount, 0));
  return { income, expense, totalIncome: ti, totalExpense: te, grossProfit: r2(sales - cogs), netProfit: r2(ti - te) };
}

/**
 * Balance sheet as of a date. Profit to date is carried into equity, so assets = liabilities + equity whenever the
 * postings balance (always). Accounts that end up negative because opening balances were never entered (cash before
 * the first record, stock bought before RetailX) are listed with a note rather than hidden.
 */
export function balanceSheet(ps: Posting[]) {
  const tb = trialBalance(ps);
  const pick = (k: Kind, sign: 1 | -1) => tb.filter((r) => r.kind === k && r.balance).map((r) => ({ account: r.account, amount: r2(sign * r.balance) }));
  const assets = pick("asset", 1), liabilities = pick("liability", -1), equity = pick("equity", -1);
  const profit = r2(-tb.filter((r) => r.kind === "income" || r.kind === "expense").reduce((t, r) => t + r.balance, 0));
  if (profit) equity.push({ account: "Profit to date", amount: profit });
  const ta = r2(assets.reduce((t, x) => t + x.amount, 0)), tl = r2(liabilities.reduce((t, x) => t + x.amount, 0)), te = r2(equity.reduce((t, x) => t + x.amount, 0));
  const negatives = [...assets.filter((x) => x.amount < 0).map((x) => x.account), ...liabilities.filter((x) => x.amount < 0).map((x) => x.account)];
  return { assets, liabilities, equity, totalAssets: ta, totalLiabilities: tl, totalEquity: te, balanced: Math.abs(ta - tl - te) < 0.05, negatives };
}

/* ---------------- bank reconciliation ---------------- */

export type BankLine = { date: string; text: string; amount: number };

const isoOf = (v: string) => {
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2}|[A-Za-z]{3})[/.-](\d{2,4})/);
  if (!m) return "";
  const mon = /\d/.test(m[2]) ? +m[2] : "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(m[2].toLowerCase()) / 3 + 1;
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return mon >= 1 && mon <= 12 ? `${y}-${String(mon).padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
};
const cells = (line: string) => {
  const out: string[] = []; let cur = "", q = false;
  for (const c of line) { if (c === '"') q = !q; else if (c === "," && !q) { out.push(cur); cur = ""; } else cur += c; }
  return [...out, cur].map((x) => x.trim());
};

/**
 * A bank statement CSV as signed lines (money in positive). Finds the header row and its Date, Narration and either
 * Debit / Credit (Withdrawal / Deposit) or a single Amount column, as Indian banks export them.
 */
export function parseBankCsv(text: string): BankLine[] {
  const rows = text.split(/\r?\n/).map(cells).filter((r) => r.some(Boolean));
  const hi = rows.findIndex((r) => r.some((c) => /date/i.test(c)) && r.some((c) => /debit|credit|withdraw|deposit|amount/i.test(c)));
  if (hi < 0) return [];
  const h = rows[hi].map((c) => c.toLowerCase());
  const col = (re: RegExp) => h.findIndex((c) => re.test(c));
  const di = col(/date/), ti = col(/narration|description|particular|remark|details/), dr = col(/debit|withdraw/), cr = col(/credit|deposit/), am = col(/^amount|amount\b/);
  const num = (v?: string) => parseFloat(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0;
  const out: BankLine[] = [];
  for (const r of rows.slice(hi + 1)) {
    const date = isoOf(r[di] ?? "");
    if (!date) continue;
    const amount = dr >= 0 || cr >= 0 ? num(r[cr]) - num(r[dr]) : num(r[am]);
    if (amount) out.push({ date, text: r[ti] ?? "", amount: r2(amount) });
  }
  return out;
}

/**
 * Matches statement lines to the books' bank postings: same amount (within ₹1), dates within `days`, closest date
 * first, each used once. What is left on either side is what to look into.
 */
export function reconcile(bank: BankLine[], ps: Posting[], days = 3) {
  const book = ps.filter((p) => p.account === "Bank").map((p, i) => ({ i, p, amount: r2(p.dr - p.cr), used: false }));
  const gap = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
  const matched: { bank: BankLine; book: Posting }[] = [], bankOnly: BankLine[] = [];
  for (const l of [...bank].sort((a, b) => a.date.localeCompare(b.date))) {
    const hit = book.filter((x) => !x.used && Math.abs(x.amount - l.amount) <= 1 && gap(x.p.date, l.date) <= days).sort((a, b) => gap(a.p.date, l.date) - gap(b.p.date, l.date))[0];
    if (hit) { hit.used = true; matched.push({ bank: l, book: hit.p }); } else bankOnly.push(l);
  }
  const from = bank.reduce((m, l) => (l.date < m ? l.date : m), "9999"), to = bank.reduce((m, l) => (l.date > m ? l.date : m), "0000");
  const bookOnly = book.filter((x) => !x.used && x.p.date >= from && x.p.date <= to).map((x) => x.p);
  return { matched, bankOnly, bookOnly };
}

/* ---------------- Tally export ---------------- */

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const TALLY_GROUP: Record<Kind, string> = { asset: "Current Assets", liability: "Current Liabilities", equity: "Capital Account", income: "Sales Accounts", expense: "Indirect Expenses" };
const SPECIAL: Record<string, string> = {
  Cash: "Cash-in-Hand", Bank: "Bank Accounts", "Cheques in hand": "Bank Accounts", Debtors: "Sundry Debtors", Creditors: "Sundry Creditors",
  "Input GST": "Duties & Taxes", "Output GST": "Duties & Taxes", "TDS receivable": "Duties & Taxes", "TDS payable": "Duties & Taxes",
  "PF / ESI payable": "Duties & Taxes", "TCS payable": "Duties & Taxes", "Fixed assets": "Fixed Assets", "Accumulated depreciation": "Fixed Assets", Stock: "Stock-in-Hand",
  "Cost of goods sold": "Purchase Accounts", Loans: "Loans (Liability)",
};
const VCH: Record<string, string> = { sales: "Sales", purchases: "Purchase", expenses: "Payment", payroll: "Journal", payments: "Receipt", journal: "Journal", assets: "Journal", dayclose: "Journal" };

/**
 * Tally Prime / ERP 9 import XML (Gateway of Tally → Import → Transactions): ledgers, then one voucher per bill or
 * record. Tally signs: debit negative, credit positive; each voucher sums to zero.
 */
export function tallyXml(ps: Posting[], company = "") {
  const accounts = [...new Set(ps.map((p) => p.account))];
  const ledgers = accounts.map((a) => `<TALLYMESSAGE><LEDGER NAME="${esc(a)}" ACTION="Create"><NAME.LIST><NAME>${esc(a)}</NAME></NAME.LIST><PARENT>${esc(SPECIAL[a] ?? TALLY_GROUP[kindOf(a)])}</PARENT></LEDGER></TALLYMESSAGE>`);
  const groups = new Map<string, Posting[]>();
  for (const p of ps) { const k = `${p.module}|${p.ref || p.id}|${p.date}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(p); }
  const vouchers = [...groups.values()].map((list) => {
    const p0 = list[0], type = p0.module === "payments" && list.some((p) => p.account === "Creditors" && p.dr) ? "Payment" : VCH[p0.module] ?? "Journal";
    const net = new Map<string, number>();
    for (const p of list) net.set(p.account, r2((net.get(p.account) ?? 0) + p.dr - p.cr));
    const entries = [...net].filter(([, v]) => v).map(([a, v]) =>
      `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(a)}</LEDGERNAME><ISDEEMEDPOSITIVE>${v > 0 ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${(-v).toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`).join("");
    return `<TALLYMESSAGE><VOUCHER VCHTYPE="${type}" ACTION="Create"><DATE>${p0.date.replace(/-/g, "")}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME>` +
      `<VOUCHERNUMBER>${esc(p0.ref)}</VOUCHERNUMBER><NARRATION>${esc(p0.memo)}</NARRATION>${entries}</VOUCHER></TALLYMESSAGE>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA>` +
    `<REQUESTDESC><REPORTNAME>All Masters</REPORTNAME>${company ? `<STATICVARIABLES><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES>` : ""}</REQUESTDESC>` +
    `<REQUESTDATA>\n${[...ledgers, ...vouchers].join("\n")}\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("books.ts")) {
  const assert = (c: boolean, m: string) => { if (!c) throw new Error(m); };
  const row = (id: string, data: Record<string, Value>): RecordRow => ({ id, at: "2026-11-01T10:00:00Z", by: "t", data });
  const recs: Record<string, RecordRow[]> = {
    sales: [
      row("s1", { date: "2026-11-02", invoice: "26-27/0001", amount: 1180, gst_rate: "18", cost: 600, payment: "Paid", mode: "Cash" }),
      row("s2", { date: "2026-11-03", invoice: "26-27/0002", amount: 500, gst_rate: "0", cost: 300, payment: "Unpaid", mode: "Credit", customer: "Asha" }),
      row("s3", { date: "2026-11-04", invoice: "26-27/0003", amount: 236, gst_rate: "18", cost: 100, payment: "Paid", mode: "UPI" }),
    ],
    purchases: [row("p1", { date: "2026-11-01", po: "GRN/1", amount: 1120, gst_rate: "12", status: "Received", supplier: "Metro" }),
      row("p2", { date: "2026-11-01", amount: 999, status: "Ordered" })],
    expenses: [row("e1", { date: "2026-11-05", category: "Rent", amount: 300, mode: "UPI" })],
    payroll: [row("y1", { date: "2026-11-30", employee: "Ravi", gross: 15000, net: 13200, status: "Paid" })],
    payments: [row("q1", { date: "2026-11-06", direction: "In", party: "Asha", amount: 450, tds: 50, mode: "Cheque", cheque_status: "Not deposited" }),
      row("q2", { date: "2026-11-07", direction: "Out", party: "Metro", amount: 1120, mode: "Bank" }),
      row("q3", { date: "2026-11-07", direction: "In", party: "Ravi", amount: 900, mode: "Cheque", cheque_status: "Bounced" })],
    journal: [row("j1", { date: "2026-11-01", debit: "Cash", credit: "Capital", amount: 20000, note: "Opening cash" })],
    assets: [row("a1", { date: "2026-05-01", name: "Fridge", cost: 12000, life_years: 5, paid_by: "Bank" })],
    dayclose: [row("d1", { date: "2026-11-02", difference: -20 })],
  };
  const ps = postings(recs, "2026-11-30");
  const tb = trialBalance(ps);
  const dr = r2(tb.reduce((t, x) => t + x.dr, 0)), cr = r2(tb.reduce((t, x) => t + x.cr, 0));
  assert(dr === cr, `trial balance balances ${dr} vs ${cr}`);
  const bal = (a: string) => tb.find((x) => x.account === a)?.balance ?? 0;
  assert(bal("Output GST") === -216, "output GST 180 + 36 = 216 " + bal("Output GST"));
  assert(bal("Input GST") === 120 && bal("Creditors") === 0, "input GST, supplier paid");
  assert(bal("Debtors") === 0 && bal("TDS receivable") === 50 && bal("Cheques in hand") === 450, "cheque in hand, TDS, Asha settled");
  assert(bal("Fixed assets") === 12000 && bal("Accumulated depreciation") === -1200 && bal("Depreciation") === 1200, "6 months at 200 = 1200");
  assert(bal("Cash over / short") === 20 && !ps.some((p) => p.id === "q3"), "drawer short, bounced cheque ignored");
  const pl = profitLoss(ps, "2026-11-01", "2026-11-30");
  // sales 1000 + 500 + 200 = 1700; cogs 1000; rent 300; salaries 15000; depreciation 1200 (posted on 30 Nov); short 20
  assert(pl.grossProfit === 700 && pl.netProfit === 700 - 300 - 15000 - 1200 - 20, "P&L " + JSON.stringify(pl));
  const bs = balanceSheet(ps);
  assert(bs.balanced, "balance sheet balances " + JSON.stringify(bs));
  assert(bs.negatives.includes("Stock") === false && bs.negatives.includes("Bank"), "bank went negative: opening balance missing " + bs.negatives);

  const csv = `Bank statement\nTxn Date,Narration,Withdrawal Amt.,Deposit Amt.,Balance\n04/11/2026,UPI-ASHA,,236.00,1000\n05-Nov-2026,RENT,300.00,,700\n08/11/2026,INT CREDIT,,12.50,712.5`;
  const bank = parseBankCsv(csv);
  assert(bank.length === 3 && bank[0].amount === 236 && bank[1].amount === -300 && bank[1].date === "2026-11-05", "bank csv " + JSON.stringify(bank));
  const rec = reconcile(bank, ps);
  assert(rec.matched.length === 2 && rec.bankOnly[0].text === "INT CREDIT", "two matched, interest not in books");
  assert(rec.bookOnly.some((p) => p.memo.includes("Metro")), "supplier payment not on this statement");
  const xml = tallyXml(ps, "Demo");
  assert(xml.includes('<LEDGER NAME="Output GST"') && xml.includes("<VOUCHERNUMBER>26-27/0001</VOUCHERNUMBER>") && xml.includes("Sundry Debtors"), "tally xml");
  const v1 = xml.split("<VOUCHER ").find((v) => v.includes("26-27/0001"))!;
  const sum = [...v1.matchAll(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].reduce((t, m) => t + +m[1], 0);
  assert(Math.abs(sum) < 0.01, "voucher sums to zero " + sum);
  console.log("books self-check ok");
}
