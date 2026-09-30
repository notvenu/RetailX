/**
 * The books of Nandan Provisions, an illustrative single-store MSME, for September 2026.
 * Monthly closes, the September day book and product ledger live in ml/data and reach the app
 * through ml/retailx.py -> src/data/ml.json; registers below (staff, customers, suppliers, orders,
 * invoices, expenses) are entered here. The business is illustrative, not a real company.
 */
import { moneyCompact } from "@/lib/format";
import ml from "@/data/ml.json";

export const ORG = {
  name: "Nandan Provisions",
  legalName: "Nandan Provisions (partnership firm)",
  industry: "Neighbourhood supermarket · Udyam-registered micro enterprise",
  location: "Baner Road, Pune",
  currency: "INR",
  fiscalYear: "FY 2026–27",
  asOf: "30 Sep 2026",
};

export type Branch = {
  id: string;
  name: string;
  code: string;
  city: string;
  sizeSqft: number;
  openingDate: string;
  status: "Active" | "Ramp-up";
  health: number; // 0–100 Store Health Score
  managerName: string;
};

export const BRANCHES: Branch[] = [
  { id: "s_baner", name: "Baner Road", code: "BNR", city: "Pune", sizeSqft: 2200, openingDate: "2018-06-15", status: "Active", health: 76, managerName: "Sneha Patil" },
];

/* ---- Monthly P&L (Oct 2025 – Sep 2026, oldest → newest), all in INR ---- */
type PnlRow = {
  month: string;
  revenue: number;
  cogs: number;
  opex: number;
  otherIncome: number;
  tax: number;
};
const TAX_RATE = 0.312; // ponytail: partnership firm, 30% + 4% cess on positive monthly profit; swap for the ledger's tax lines
export const PNL: PnlRow[] = ml.ledger.pnl.map((r) => {
  const preTax = r.revenue - r.cogs - r.opex + r.otherIncome;
  return { ...r, tax: Math.round(Math.max(0, preTax) * TAX_RATE) };
});

export function derive(r: PnlRow) {
  const grossProfit = r.revenue - r.cogs;
  const operatingProfit = grossProfit - r.opex;
  const netProfit = operatingProfit + r.otherIncome - r.tax;
  return {
    grossProfit,
    grossMargin: (grossProfit / r.revenue) * 100,
    operatingProfit,
    operatingMargin: (operatingProfit / r.revenue) * 100,
    netProfit,
    netMargin: (netProfit / r.revenue) * 100,
  };
}

const cur = PNL[PNL.length - 1];
const prev = PNL[PNL.length - 2];
const dCur = derive(cur);
const dPrev = derive(prev);
const fyToDate = PNL.slice(-ml.ledger.fyMonths);

export type Kpi = {
  code: string;
  label: string;
  value: number;
  display: string;
  target: number;
  previous: number;
  unit: "money" | "pct" | "ratio" | "days" | "score";
  higherIsBetter: boolean;
  series: number[];
  note: string;
};

const K = ml.ledger.kpis;
const last = (s: number[]) => s[s.length - 1];
const prior = (s: number[]) => s[s.length - 2];
export const KPIS: Kpi[] = [
  {
    code: "revenue", label: "Total revenue", value: cur.revenue,
    display: moneyCompact(cur.revenue), target: last(K.revenueTarget), previous: prev.revenue,
    unit: "money", higherIsBetter: true, series: PNL.map((r) => r.revenue),
    note: "Current month, all sales including credit accounts.",
  },
  {
    code: "gross_margin", label: "Gross profit margin", value: dCur.grossMargin,
    display: dCur.grossMargin.toFixed(1) + "%", target: 19.5, previous: dPrev.grossMargin,
    unit: "pct", higherIsBetter: true, series: PNL.map((r) => derive(r).grossMargin),
    note: "Revenue less cost of goods, as % of revenue.",
  },
  {
    code: "operating_profit", label: "Operating profit", value: dCur.operatingProfit,
    display: moneyCompact(dCur.operatingProfit), target: 130_000, previous: dPrev.operatingProfit,
    unit: "money", higherIsBetter: true, series: PNL.map((r) => derive(r).operatingProfit),
    note: "Gross profit less operating expenses.",
  },
  {
    code: "net_margin", label: "Net profit margin", value: dCur.netMargin,
    display: dCur.netMargin.toFixed(1) + "%", target: 2.5, previous: dPrev.netMargin,
    unit: "pct", higherIsBetter: true, series: PNL.map((r) => derive(r).netMargin),
    note: "Bottom line after other income and tax.",
  },
  {
    code: "sales_target", label: "Sales target achievement", value: last(K.salesTargetPct),
    display: last(K.salesTargetPct).toFixed(1) + "%", target: 100, previous: prior(K.salesTargetPct),
    unit: "pct", higherIsBetter: true, series: K.salesTargetPct,
    note: "Actual revenue vs the month's budget.",
  },
  {
    code: "avg_bill", label: "Average bill value", value: last(K.avgBill),
    display: `₹${last(K.avgBill)}`, target: 255, previous: prior(K.avgBill),
    unit: "money", higherIsBetter: true, series: K.avgBill,
    note: "Revenue ÷ number of bills.",
  },
  {
    code: "inv_turnover", label: "Inventory turnover", value: last(K.invTurnover),
    display: last(K.invTurnover).toFixed(1) + "×", target: 13, previous: prior(K.invTurnover),
    unit: "ratio", higherIsBetter: true, series: K.invTurnover,
    note: "Annualised cost of goods ÷ month-end stock at cost.",
  },
  {
    code: "dio", label: "Days inventory outstanding", value: last(K.dio),
    display: `${last(K.dio)} d`, target: 28, previous: prior(K.dio),
    unit: "days", higherIsBetter: false, series: K.dio,
    note: "Days of sales the month-end stock would cover.",
  },
  {
    code: "stockout", label: "Stock-out rate", value: last(K.stockoutPct),
    display: last(K.stockoutPct).toFixed(1) + "%", target: 2, previous: prior(K.stockoutPct),
    unit: "pct", higherIsBetter: false, series: K.stockoutPct,
    note: "Share of products unavailable during trading hours.",
  },
  {
    code: "roce", label: "Return on capital employed", value: last(K.roce),
    display: last(K.roce).toFixed(1) + "%", target: 25, previous: prior(K.roce),
    unit: "pct", higherIsBetter: true, series: K.roce,
    note: "Operating profit, 3-month average annualised ÷ capital employed.",
  },
  {
    code: "ccc", label: "Cash conversion cycle", value: last(K.ccc),
    display: `${last(K.ccc)} d`, target: 18, previous: prior(K.ccc),
    unit: "days", higherIsBetter: false, series: K.ccc,
    note: "Days of stock + days receivable − days payable.",
  },
  {
    code: "rev_per_emp", label: "Revenue per employee", value: last(K.revPerEmployee),
    display: moneyCompact(last(K.revPerEmployee)), target: 260_000, previous: prior(K.revPerEmployee),
    unit: "money", higherIsBetter: true, series: K.revPerEmployee,
    note: "Monthly revenue ÷ headcount.",
  },
];

export const SUMMARY = {
  ytdRevenue: fyToDate.reduce((s, r) => s + r.revenue, 0), // financial year to date (from April)
  revenueGrowth: ((cur.revenue - prev.revenue) / prev.revenue) * 100,
  grossProfit: dCur.grossProfit,
  operatingExpenses: cur.opex,
  netProfit: dCur.netProfit,
  breakEvenAchievement: ml.ledger.breakEvenPct,
  cashOnHand: ml.ledger.balances.cash,
  receivables: ml.ledger.balances.receivables,
  payables: ml.ledger.balances.payables,
};

/* ---- Revenue mix by category, current month ---- */
export const CATEGORY_MONTH = ml.ledger.categoryMonth;

/* ---- Sales & CRM ---- */
export const SALES = [
  { invoice: "NP/26-27/14873", date: "30 Sep", branch: "Baner Road", customer: "Walk-in", lines: 9, total: 1_246, marginPct: 18.7, status: "Paid" },
  { invoice: "NP/26-27/14872", date: "30 Sep", branch: "Baner Road", customer: "Annapurna Mess, Balewadi", lines: 14, total: 18_640, marginPct: 11.9, status: "Unpaid" },
  { invoice: "NP/26-27/14871", date: "30 Sep", branch: "Baner Road", customer: "Walk-in", lines: 4, total: 386, marginPct: 24.1, status: "Paid" },
  { invoice: "NP/26-27/14870", date: "30 Sep", branch: "Baner Road", customer: "TechPark Pantry Services", lines: 22, total: 9_870, marginPct: 17.2, status: "Unpaid" },
  { invoice: "NP/26-27/14869", date: "29 Sep", branch: "Baner Road", customer: "Walk-in", lines: 17, total: 2_318, marginPct: 20.4, status: "Paid" },
  { invoice: "NP/26-27/14868", date: "29 Sep", branch: "Baner Road", customer: "Brew Street Café", lines: 8, total: 4_215, marginPct: 16.8, status: "Paid" },
  { invoice: "NP/26-27/14867", date: "29 Sep", branch: "Baner Road", customer: "Walk-in", lines: 6, total: 742, marginPct: 22.6, status: "Paid" },
  { invoice: "NP/26-27/14866", date: "29 Sep", branch: "Baner Road", customer: "Moraya Caterers", lines: 31, total: 26_450, marginPct: 13.4, status: "Part-paid" },
];

// last 90 days = Jul–Sep 2026; walk-in is the closes' revenue and bills less the four accounts
export const CUSTOMERS = [
  { name: "Annapurna Mess, Balewadi", type: "Credit", since: "2021", revenue90d: 214_600, orders90d: 38, outstanding: 46_000 },
  { name: "Moraya Caterers", type: "Credit", since: "2023", revenue90d: 192_300, orders90d: 9, outstanding: 52_000 },
  { name: "TechPark Pantry Services", type: "Contract", since: "2024", revenue90d: 138_900, orders90d: 13, outstanding: 20_500 },
  { name: "Brew Street Café", type: "Wholesale", since: "2025", revenue90d: 86_400, orders90d: 24, outstanding: 0 },
  { name: "Walk-in (aggregate)", type: "Retail", since: "—", revenue90d: 8_505_050, orders90d: 35_984, outstanding: 0 },
];

/* ---- Inventory ---- */
export type Product = {
  sku: string; name: string; category: string; onHand: number; reorder: number;
  units30d: number; revenue30d: number; marginPct: number;
  forecast16d: number | null; // units, next 16 days (ml/retailx.py)
  suggestedOrder: number | null; // units to cover the forecast + 95% safety stock
};
// Stock, September actuals and the demand forecast come from ml/retailx.py.
export const PRODUCTS: Product[] = [...ml.products].sort((a, b) => b.revenue30d - a.revenue30d);

export function stockStatus(p: { onHand: number; reorder: number }) {
  if (p.onHand <= p.reorder * 0.4) return "Critical" as const;
  if (p.onHand <= p.reorder) return "Reorder" as const;
  return "Healthy" as const;
}

/* ---- Procurement ---- */
export const SUPPLIERS = [
  { name: "Shree Datta Traders", terms: "Net 15", onTimePct: 96, openPos: 2, payable: 348_000 },
  { name: "Sai Agencies", terms: "Net 21", onTimePct: 93, openPos: 1, payable: 186_500 },
  { name: "Vighnaharta Dry Fruits", terms: "Net 15", onTimePct: 90, openPos: 1, payable: 151_000 },
  { name: "Mahalaxmi Oil Depot", terms: "Net 7", onTimePct: 97, openPos: 1, payable: 112_000 },
  { name: "Jai Malhar Sugar & Jaggery", terms: "Net 7", onTimePct: 94, openPos: 0, payable: 100_000 },
  { name: "Baner Dairy Agency", terms: "Weekly", onTimePct: 88, openPos: 1, payable: 64_500 },
];

export const PURCHASE_ORDERS = [
  { po: "PO-0918", supplier: "Shree Datta Traders", branch: "Baner Road", ordered: "29 Sep", expected: "02 Oct", total: 184_600, status: "In transit" },
  { po: "PO-0917", supplier: "Baner Dairy Agency", branch: "Baner Road", ordered: "28 Sep", expected: "29 Sep", total: 12_900, status: "Overdue" },
  { po: "PO-0916", supplier: "Vighnaharta Dry Fruits", branch: "Baner Road", ordered: "28 Sep", expected: "06 Oct", total: 246_000, status: "In transit" },
  { po: "PO-0915", supplier: "Sai Agencies", branch: "Baner Road", ordered: "26 Sep", expected: "30 Sep", total: 96_400, status: "Received" },
  { po: "PO-0914", supplier: "Mahalaxmi Oil Depot", branch: "Baner Road", ordered: "25 Sep", expected: "26 Sep", total: 58_300, status: "Received" },
  { po: "PO-0913", supplier: "Jai Malhar Sugar & Jaggery", branch: "Baner Road", ordered: "22 Sep", expected: "24 Sep", total: 41_200, status: "Received" },
];

/* ---- Finance ---- */
export const EXPENSES = ml.ledger.expenses;

export const EXPENSE_ENTRIES = [
  { date: "2026-09-28", category: "Electricity and water", vendor: "MSEDCL", branch: "Baner Road", method: "Bank", amount: 41_280 },
  { date: "2026-09-24", category: "Marketing", vendor: "Shivam Printers (Ganeshotsav banners)", branch: "Baner Road", method: "UPI", amount: 12_800 },
  { date: "2026-09-10", category: "Other operating", vendor: "Omkar Power Solutions (generator repair)", branch: "Baner Road", method: "UPI", amount: 6_800 },
  { date: "2026-09-05", category: "Rent", vendor: "Deshpande Properties", branch: "Baner Road", method: "Bank", amount: 165_000 },
  { date: "2026-09-03", category: "Other operating", vendor: "Green Pack Industries (carry bags)", branch: "Baner Road", method: "Bank", amount: 11_200 },
];

export const RECEIVABLES_AGEING = [
  { bucket: "Current", amount: 84_000 },
  { bucket: "1–30 days", amount: 28_000 },
  { bucket: "31–60 days", amount: 6_500 },
  { bucket: "60+ days", amount: 0 },
];

/* ---- HR & Payroll ---- */
export const EMPLOYEES = [
  { code: "E-001", name: "Sneha Patil", branch: "Baner Road", dept: "Operations", designation: "Store Manager", joined: "2019-06-03", monthlyCTC: 38_000, status: "Active" },
  { code: "E-002", name: "Rahul Joshi", branch: "Baner Road", dept: "Accounts", designation: "Accounts & Billing Supervisor", joined: "2020-01-13", monthlyCTC: 29_000, status: "Active" },
  { code: "E-003", name: "Ganesh Pawar", branch: "Baner Road", dept: "Billing", designation: "Senior Cashier", joined: "2019-03-18", monthlyCTC: 19_500, status: "Active" },
  { code: "E-004", name: "Mahesh Kamble", branch: "Baner Road", dept: "Warehouse", designation: "Storekeeper", joined: "2020-11-02", monthlyCTC: 18_000, status: "Active" },
  { code: "E-005", name: "Pooja Shinde", branch: "Baner Road", dept: "Billing", designation: "Cashier", joined: "2022-07-11", monthlyCTC: 17_000, status: "Active" },
  { code: "E-006", name: "Vikas Jadhav", branch: "Baner Road", dept: "Sales floor", designation: "Store Associate, staples", joined: "2021-02-08", monthlyCTC: 15_500, status: "Active" },
  { code: "E-007", name: "Sunita More", branch: "Baner Road", dept: "Sales floor", designation: "Store Associate, dairy & fresh", joined: "2023-05-15", monthlyCTC: 15_000, status: "Active" },
  { code: "E-008", name: "Rohit Salunkhe", branch: "Baner Road", dept: "Delivery", designation: "Delivery Associate", joined: "2023-10-09", monthlyCTC: 15_000, status: "Active" },
  { code: "E-009", name: "Akash Gaikwad", branch: "Baner Road", dept: "Sales floor", designation: "Store Associate", joined: "2024-08-19", monthlyCTC: 14_500, status: "Active" },
  { code: "E-010", name: "Imran Shaikh", branch: "Baner Road", dept: "Delivery", designation: "Delivery Associate", joined: "2025-04-07", monthlyCTC: 14_500, status: "Active" },
  { code: "E-011", name: "Kavita Deshmukh", branch: "Baner Road", dept: "Housekeeping", designation: "Housekeeping", joined: "2024-01-22", monthlyCTC: 12_500, status: "Active" },
  { code: "E-012", name: "Omkar Bhosale", branch: "Baner Road", dept: "Sales floor", designation: "Trainee Associate", joined: "2026-08-18", monthlyCTC: 12_000, status: "Probation" },
];

// gross = CTC ₹2,21,000 + ₹7,000 Ganeshotsav overtime; deductions = employee PF, ESIC and professional tax
export const PAYROLL_RUN = {
  period: "September 2026",
  headcount: EMPLOYEES.length,
  gross: 228_000,
  deductions: 17_325,
  net: 210_675,
  status: "Approved",
};

/* ---- Analytics: forecasting ---- */
export type ForecastPoint = {
  x: string;
  actual: number | null;
  predicted: number | null;
  lower: number | null;
  upper: number | null;
};
// Forecast, model card and anomaly log are generated by ml/retailx.py (python ml/retailx.py).
export const REVENUE_FORECAST: ForecastPoint[] = ml.revenueForecast;

export const FORECAST_MODEL = ml.forecastModel;

export const ANOMALIES = ml.anomalies as (Omit<(typeof ml.anomalies)[number], "severity"> & {
  severity: "High" | "Medium" | "Low";
})[];

/* ---- Decision support: existing recommendations ---- */
export const RECOMMENDATIONS = [
  {
    title: "Lock promotion edits at the till",
    driver: "On 17 Sep a dry-fruit 'Buy 2 Get 1' ran across the whole category: discount 6.8% against 2.2% on a usual Thursday, margin 15.9% against 19.4%, about ₹3,700 of margin given away in one day.",
    action: "Require the manager's PIN for promotion changes, and check the price file before festival weeks.",
    impact: "Protects about 0.3 pt of margin in festival months",
    risk: "Low" as const,
    confidence: 0.8,
  },
  {
    title: "Put the billing counter on backup power",
    driver: "The 8 Sep power cut (11:05–15:40) cut sales to ₹58,400 against ₹96,450 on a usual Tuesday: about ₹38,000 of sales and ₹7,300 of margin lost. The generator did not start.",
    action: "Fit a 2 kVA inverter for the tills, scanner and lights (about ₹45,000) and test-run the generator every Monday.",
    impact: "Pays back in about six outages",
    risk: "Low" as const,
    confidence: 0.72,
  },
  {
    title: "Open a back-up milk supplier",
    driver: "Milk ran out on 29 Sep when the dairy agency's tanker did not come: stock-out rate 9.4%, 78 packets of demand lost, and the shelf was short again until 10:30 the next day.",
    action: "Open an account with a second dairy agency, and hold one day's buffer (about 110 packets) when a strike or festival is announced.",
    impact: "Keeps the store's most frequent purchase on the shelf",
    risk: "Low" as const,
    confidence: 0.7,
  },
  {
    title: "Plan Diwali stock outside the forecast",
    driver: "The revenue forecast has only twelve months of history and cannot see Diwali (8 Nov 2026). Last Diwali month, Oct 2025, sold ₹36.8 L, 23% above the year's monthly average.",
    action: "Raise dry fruit, ghee, oil and sugar orders from 20 Oct using last Diwali's mix, and keep about ₹6 L of cash free for the extra stock.",
    impact: "Avoids festival stock-outs like 13 Sep's coconut and jaggery",
    risk: "Medium" as const,
    confidence: 0.65,
  },
];

export const ACTIVITY = [
  { when: "10:42", who: "Sneha Patil", what: "Approved payroll run — September 2026", where: "HR & Payroll" },
  { when: "09:05", who: "System", what: "Closed September 2026 books and recomputed 12 KPIs", where: "Analytics" },
  { when: "Yesterday", who: "Mahesh Kamble", what: "Received PO-0915 from Sai Agencies", where: "Procurement" },
  { when: "Yesterday", who: "System", what: "Flagged stock-out: milk not delivered on 29 Sep (High)", where: "Analytics" },
  { when: "2 days ago", who: "Anand Kulkarni", what: "Opened branch evaluation — second store, Wakad", where: "Branch evaluation" },
];
