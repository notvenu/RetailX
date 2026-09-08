/**
 * Sample data for the RetailX prototype. All figures are synthetic and must be
 * presented as sample data, not real business results (see PRODUCT.md).
 */
import { MONTHS } from "@/lib/format";

export const ORG = {
  name: "Kirana & Co. Retail",
  legalName: "Kirana & Co. Retail Pvt. Ltd.",
  industry: "Multi-format grocery & general retail",
  currency: "INR",
  fiscalYear: "FY 2024–25",
  asOf: "30 Sep 2025",
};

export type Branch = {
  id: string;
  name: string;
  code: string;
  city: string;
  sizeSqft: number;
  openingDate: string;
  status: "Active" | "Ramp-up";
  health: number; // 0–100 Store/Branch Health Score
  managerName: string;
};

export const BRANCHES: Branch[] = [
  { id: "b_central", name: "Central Market", code: "CEN", city: "Pune", sizeSqft: 2400, openingDate: "2019-04-11", status: "Active", health: 82, managerName: "Devan Mehta" },
  { id: "b_river", name: "Riverside", code: "RIV", city: "Pune", sizeSqft: 1800, openingDate: "2021-08-02", status: "Active", health: 74, managerName: "Leela Iyer" },
  { id: "b_uptown", name: "Uptown", code: "UPT", city: "Mumbai", sizeSqft: 3100, openingDate: "2022-11-19", status: "Active", health: 68, managerName: "Rohit Sha" },
  { id: "b_airport", name: "Airport Road", code: "AIR", city: "Mumbai", sizeSqft: 1500, openingDate: "2025-02-01", status: "Ramp-up", health: 51, managerName: "Nadia Khan" },
];

/* ---- Monthly P&L (12 months, oldest → newest), all in INR ---- */
type PnlRow = {
  month: string;
  revenue: number;
  cogs: number;
  opex: number;
  otherIncome: number;
  tax: number;
};
const RAW_PNL: Omit<PnlRow, "month">[] = [
  { revenue: 6_120_000, cogs: 4_040_000, opex: 1_520_000, otherIncome: 24_000, tax: 118_000 },
  { revenue: 6_480_000, cogs: 4_270_000, opex: 1_545_000, otherIncome: 21_000, tax: 132_000 },
  { revenue: 7_950_000, cogs: 5_210_000, opex: 1_690_000, otherIncome: 30_000, tax: 214_000 },
  { revenue: 6_640_000, cogs: 4_360_000, opex: 1_560_000, otherIncome: 26_000, tax: 150_000 },
  { revenue: 6_210_000, cogs: 4_150_000, opex: 1_540_000, otherIncome: 19_000, tax: 121_000 },
  { revenue: 6_890_000, cogs: 4_490_000, opex: 1_575_000, otherIncome: 28_000, tax: 168_000 },
  { revenue: 7_020_000, cogs: 4_560_000, opex: 1_600_000, otherIncome: 27_000, tax: 176_000 },
  { revenue: 7_240_000, cogs: 4_690_000, opex: 1_628_000, otherIncome: 25_000, tax: 188_000 },
  { revenue: 7_010_000, cogs: 4_610_000, opex: 1_640_000, otherIncome: 22_000, tax: 170_000 },
  { revenue: 7_530_000, cogs: 4_880_000, opex: 1_665_000, otherIncome: 31_000, tax: 202_000 },
  { revenue: 7_780_000, cogs: 5_010_000, opex: 1_690_000, otherIncome: 29_000, tax: 214_000 },
  { revenue: 7_460_000, cogs: 4_840_000, opex: 1_705_000, otherIncome: 24_000, tax: 195_000 },
];

export const PNL: PnlRow[] = RAW_PNL.map((r, i) => ({ month: MONTHS[i], ...r }));

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
const ytdRevenue = PNL.reduce((s, r) => s + r.revenue, 0);

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

const revSeries = PNL.map((r) => r.revenue);
export const KPIS: Kpi[] = [
  {
    code: "revenue", label: "Total revenue", value: cur.revenue,
    display: "₹74.6 L", target: 7_600_000, previous: prev.revenue,
    unit: "money", higherIsBetter: true, series: revSeries,
    note: "Current month, all branches.",
  },
  {
    code: "gross_margin", label: "Gross profit margin", value: dCur.grossMargin,
    display: dCur.grossMargin.toFixed(1) + "%", target: 34, previous: dPrev.grossMargin,
    unit: "pct", higherIsBetter: true, series: PNL.map((r) => derive(r).grossMargin),
    note: "Revenue less cost of goods, as % of revenue.",
  },
  {
    code: "operating_profit", label: "Operating profit", value: dCur.operatingProfit,
    display: "₹9.15 L", target: 1_000_000, previous: dPrev.operatingProfit,
    unit: "money", higherIsBetter: true, series: PNL.map((r) => derive(r).operatingProfit),
    note: "Gross profit less operating expenses.",
  },
  {
    code: "net_margin", label: "Net profit margin", value: dCur.netMargin,
    display: dCur.netMargin.toFixed(1) + "%", target: 7.5, previous: dPrev.netMargin,
    unit: "pct", higherIsBetter: true, series: PNL.map((r) => derive(r).netMargin),
    note: "Bottom line after other income and tax.",
  },
  {
    code: "sales_target", label: "Sales target achievement", value: 98.2,
    display: "98.2%", target: 100, previous: 101.4,
    unit: "pct", higherIsBetter: true,
    series: [96, 99, 118, 101, 95, 104, 103, 101, 97, 104, 106, 98.2],
    note: "Actual revenue vs branch targets.",
  },
  {
    code: "avg_bill", label: "Average bill value", value: 742,
    display: "₹742", target: 720, previous: 731,
    unit: "money", higherIsBetter: true,
    series: [688, 701, 733, 712, 705, 719, 724, 728, 726, 735, 739, 742],
    note: "Revenue ÷ number of bills.",
  },
  {
    code: "inv_turnover", label: "Inventory turnover", value: 9.4,
    display: "9.4×", target: 10, previous: 9.1,
    unit: "ratio", higherIsBetter: true,
    series: [8.2, 8.4, 8.9, 8.7, 8.6, 8.9, 9.0, 9.1, 9.0, 9.2, 9.3, 9.4],
    note: "Annualised COGS ÷ average inventory.",
  },
  {
    code: "dio", label: "Days inventory outstanding", value: 38,
    display: "38 d", target: 35, previous: 40,
    unit: "days", higherIsBetter: false,
    series: [46, 45, 43, 44, 43, 42, 41, 40, 41, 39, 39, 38],
    note: "Average days stock is held before sale.",
  },
  {
    code: "stockout", label: "Stock-out rate", value: 3.6,
    display: "3.6%", target: 2.5, previous: 3.1,
    unit: "pct", higherIsBetter: false,
    series: [4.9, 4.5, 5.2, 4.1, 3.8, 3.5, 3.3, 3.1, 3.4, 3.2, 3.4, 3.6],
    note: "Share of SKUs unavailable during trading hours.",
  },
  {
    code: "roce", label: "Return on capital employed", value: 21.3,
    display: "21.3%", target: 22, previous: 20.6,
    unit: "pct", higherIsBetter: true,
    series: [17, 17.4, 18.1, 18.6, 19, 19.3, 19.8, 20.1, 20.2, 20.6, 21, 21.3],
    note: "Operating profit ÷ capital employed, annualised.",
  },
  {
    code: "ccc", label: "Cash conversion cycle", value: 24,
    display: "24 d", target: 20, previous: 26,
    unit: "days", higherIsBetter: false,
    series: [33, 32, 30, 31, 29, 28, 27, 26, 27, 25, 25, 24],
    note: "DIO + days receivable − days payable.",
  },
  {
    code: "rev_per_emp", label: "Revenue per employee", value: 168_000,
    display: "₹1.68 L", target: 175_000, previous: 164_000,
    unit: "money", higherIsBetter: true,
    series: [148, 151, 158, 154, 152, 157, 159, 161, 160, 164, 166, 168].map((x) => x * 1000),
    note: "Monthly revenue ÷ active headcount.",
  },
];

export const SUMMARY = {
  ytdRevenue,
  revenueGrowth: ((cur.revenue - prev.revenue) / prev.revenue) * 100,
  grossProfit: dCur.grossProfit,
  operatingExpenses: cur.opex,
  netProfit: dCur.netProfit,
  breakEvenAchievement: 112.4,
  paybackMonthsPortfolio: 17,
  cashOnHand: 4_820_000,
  receivables: 2_140_000,
  payables: 3_060_000,
};

/* ---- Per-branch current month (revenue, margin, footfall) ---- */
export const BRANCH_MONTH = [
  { branch: "Central Market", revenue: 2_760_000, grossMarginPct: 29.4, footfall: 41_200 },
  { branch: "Riverside", revenue: 1_880_000, grossMarginPct: 28.1, footfall: 24_600 },
  { branch: "Uptown", revenue: 2_190_000, grossMarginPct: 25.2, footfall: 33_800 },
  { branch: "Airport Road", revenue: 630_000, grossMarginPct: 24.8, footfall: 11_400 },
];

/* ---- Sales & CRM ---- */
export const SALES = [
  { invoice: "INV-24817", date: "30 Sep", branch: "Central Market", customer: "Walk-in", lines: 14, total: 8_240, marginPct: 27.4, status: "Paid" },
  { invoice: "INV-24816", date: "30 Sep", branch: "Uptown", customer: "Sunrise Cafe", lines: 32, total: 41_900, marginPct: 22.1, status: "Paid" },
  { invoice: "INV-24815", date: "30 Sep", branch: "Riverside", customer: "Walk-in", lines: 6, total: 2_180, marginPct: 31.0, status: "Paid" },
  { invoice: "INV-24814", date: "29 Sep", branch: "Uptown", customer: "GreenLeaf Hotels", lines: 58, total: 96_420, marginPct: 19.8, status: "Part-paid" },
  { invoice: "INV-24813", date: "29 Sep", branch: "Central Market", customer: "Walk-in", lines: 9, total: 5_610, marginPct: 28.9, status: "Paid" },
  { invoice: "INV-24812", date: "29 Sep", branch: "Airport Road", customer: "Walk-in", lines: 4, total: 1_260, marginPct: 33.5, status: "Paid" },
  { invoice: "INV-24811", date: "28 Sep", branch: "Riverside", customer: "Metro Catering", lines: 44, total: 62_300, marginPct: 20.4, status: "Unpaid" },
  { invoice: "INV-24810", date: "28 Sep", branch: "Central Market", customer: "Walk-in", lines: 11, total: 7_040, marginPct: 26.7, status: "Paid" },
];

export const CUSTOMERS = [
  { name: "GreenLeaf Hotels", type: "Wholesale", since: "2020", revenue90d: 1_284_000, orders90d: 41, outstanding: 96_420 },
  { name: "Sunrise Cafe", type: "Wholesale", since: "2022", revenue90d: 612_000, orders90d: 63, outstanding: 0 },
  { name: "Metro Catering", type: "Wholesale", since: "2021", revenue90d: 548_000, orders90d: 28, outstanding: 62_300 },
  { name: "City Hospital Canteen", type: "Contract", since: "2023", revenue90d: 402_000, orders90d: 12, outstanding: 18_900 },
  { name: "Walk-in (aggregate)", type: "Retail", since: "—", revenue90d: 14_960_000, orders90d: 61_540, outstanding: 0 },
];

/* ---- Inventory ---- */
export const PRODUCTS = [
  { sku: "GR-RICE-05", name: "Sona Masoori Rice 5 kg", category: "Staples", units90d: 8_420, revenue90d: 3_704_000, marginPct: 18.2, onHand: 640, reorder: 500 },
  { sku: "GR-ATTA-10", name: "Whole Wheat Atta 10 kg", category: "Staples", units90d: 6_110, revenue90d: 2_749_000, marginPct: 17.4, onHand: 210, reorder: 400 },
  { sku: "BV-TEA-250", name: "Assam CTC Tea 250 g", category: "Beverages", units90d: 12_900, revenue90d: 1_806_000, marginPct: 34.1, onHand: 1_180, reorder: 600 },
  { sku: "OL-SUNF-1L", name: "Sunflower Oil 1 L", category: "Staples", units90d: 9_240, revenue90d: 1_663_000, marginPct: 12.6, onHand: 90, reorder: 350 },
  { sku: "SN-BISC-MX", name: "Assorted Biscuits (case)", category: "Snacks", units90d: 4_260, revenue90d: 1_150_000, marginPct: 29.7, onHand: 520, reorder: 300 },
  { sku: "HC-SOAP-4X", name: "Bath Soap 4-pack", category: "Home care", units90d: 5_980, revenue90d: 897_000, marginPct: 26.3, onHand: 410, reorder: 300 },
  { sku: "DA-MILK-1L", name: "Toned Milk 1 L", category: "Dairy", units90d: 22_400, revenue90d: 1_344_000, marginPct: 8.9, onHand: 60, reorder: 200 },
  { sku: "SP-TURM-200", name: "Turmeric Powder 200 g", category: "Spices", units90d: 3_120, revenue90d: 421_000, marginPct: 38.4, onHand: 300, reorder: 150 },
];

export function stockStatus(p: { onHand: number; reorder: number }) {
  if (p.onHand <= p.reorder * 0.4) return "Critical" as const;
  if (p.onHand <= p.reorder) return "Reorder" as const;
  return "Healthy" as const;
}

/* ---- Procurement ---- */
export const SUPPLIERS = [
  { name: "Deccan Foodgrains", terms: "Net 30", onTimePct: 94, openPos: 3, payable: 1_240_000 },
  { name: "Nilgiri Tea Estates", terms: "Net 15", onTimePct: 98, openPos: 1, payable: 186_000 },
  { name: "Konkan Oils Ltd.", terms: "Net 45", onTimePct: 88, openPos: 2, payable: 902_000 },
  { name: "Sahyadri Dairy Co-op", terms: "Net 7", onTimePct: 91, openPos: 4, payable: 372_000 },
  { name: "Metro Home Products", terms: "Net 30", onTimePct: 96, openPos: 1, payable: 358_000 },
];

export const PURCHASE_ORDERS = [
  { po: "PO-3391", supplier: "Deccan Foodgrains", branch: "Central Market", ordered: "27 Sep", expected: "04 Oct", total: 612_000, status: "In transit" },
  { po: "PO-3390", supplier: "Sahyadri Dairy Co-op", branch: "Uptown", ordered: "26 Sep", expected: "29 Sep", total: 148_000, status: "Received" },
  { po: "PO-3389", supplier: "Konkan Oils Ltd.", branch: "Riverside", ordered: "25 Sep", expected: "08 Oct", total: 331_000, status: "In transit" },
  { po: "PO-3388", supplier: "Nilgiri Tea Estates", branch: "Central Market", ordered: "24 Sep", expected: "01 Oct", total: 186_000, status: "In transit" },
  { po: "PO-3387", supplier: "Metro Home Products", branch: "Uptown", ordered: "22 Sep", expected: "27 Sep", total: 358_000, status: "Received" },
  { po: "PO-3386", supplier: "Deccan Foodgrains", branch: "Airport Road", ordered: "20 Sep", expected: "26 Sep", total: 274_000, status: "Overdue" },
];

/* ---- Finance ---- */
export const EXPENSES = [
  { category: "Rent & occupancy", month: 486_000, ytd: 5_640_000, share: 28.5 },
  { category: "Payroll & benefits", month: 712_000, ytd: 8_310_000, share: 41.8 },
  { category: "Utilities", month: 138_000, ytd: 1_520_000, share: 8.1 },
  { category: "Logistics & delivery", month: 164_000, ytd: 1_840_000, share: 9.6 },
  { category: "Marketing", month: 96_000, ytd: 980_000, share: 5.6 },
  { category: "Maintenance & repairs", month: 61_000, ytd: 690_000, share: 3.6 },
  { category: "Other operating", month: 48_000, ytd: 520_000, share: 2.8 },
];

export const EXPENSE_ENTRIES = [
  { date: "2025-09-28", category: "Logistics & delivery", vendor: "QuickHaul Transport", branch: "Uptown", method: "Bank", amount: 42_600 },
  { date: "2025-09-26", category: "Maintenance & repairs", vendor: "CoolAir Services", branch: "Central Market", method: "UPI", amount: 18_900 },
  { date: "2025-09-24", category: "Marketing", vendor: "Pulse Digital", branch: "All branches", method: "Card", amount: 61_000 },
  { date: "2025-09-22", category: "Utilities", vendor: "MSEDCL", branch: "Riverside", method: "Bank", amount: 24_300 },
];

export const RECEIVABLES_AGEING = [
  { bucket: "Current", amount: 1_390_000 },
  { bucket: "1–30 days", amount: 452_000 },
  { bucket: "31–60 days", amount: 198_000 },
  { bucket: "60+ days", amount: 100_000 },
];

/* ---- HR & Payroll ---- */
export const EMPLOYEES = [
  { code: "E-018", name: "Devan Mehta", branch: "Central Market", dept: "Operations", designation: "Operations Manager", joined: "2019-05-02", monthlyCTC: 92_000, status: "Active" },
  { code: "E-031", name: "Leela Iyer", branch: "Riverside", dept: "Operations", designation: "Store Manager", joined: "2021-08-16", monthlyCTC: 68_000, status: "Active" },
  { code: "E-044", name: "Rohit Sha", branch: "Uptown", dept: "Operations", designation: "Store Manager", joined: "2022-11-21", monthlyCTC: 66_000, status: "Active" },
  { code: "E-052", name: "Priya Nair", branch: "Central Market", dept: "Finance", designation: "Accounts Lead", joined: "2020-02-10", monthlyCTC: 74_000, status: "Active" },
  { code: "E-067", name: "Sam Fernandes", branch: "Central Market", dept: "Sales floor", designation: "Store Associate", joined: "2023-06-19", monthlyCTC: 27_000, status: "Active" },
  { code: "E-071", name: "Nadia Khan", branch: "Airport Road", dept: "Operations", designation: "Store Manager", joined: "2025-01-20", monthlyCTC: 64_000, status: "Probation" },
  { code: "E-078", name: "Ivan D'Souza", branch: "Uptown", dept: "Warehouse", designation: "Inventory Clerk", joined: "2024-03-11", monthlyCTC: 31_000, status: "Active" },
];

export const PAYROLL_RUN = {
  period: "September 2025",
  headcount: 63,
  gross: 3_960_000,
  deductions: 512_000,
  net: 3_448_000,
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
export const REVENUE_FORECAST: ForecastPoint[] = [
  { x: "Apr", actual: 7_020_000, predicted: 7_010_000, lower: 6_760_000, upper: 7_260_000 },
  { x: "May", actual: 7_240_000, predicted: 7_120_000, lower: 6_850_000, upper: 7_390_000 },
  { x: "Jun", actual: 7_010_000, predicted: 7_180_000, lower: 6_900_000, upper: 7_460_000 },
  { x: "Jul", actual: 7_530_000, predicted: 7_360_000, lower: 7_060_000, upper: 7_660_000 },
  { x: "Aug", actual: 7_780_000, predicted: 7_560_000, lower: 7_240_000, upper: 7_880_000 },
  { x: "Sep", actual: 7_460_000, predicted: 7_640_000, lower: 7_300_000, upper: 7_980_000 },
  { x: "Oct", actual: null, predicted: 7_720_000, lower: 7_330_000, upper: 8_110_000 },
  { x: "Nov", actual: null, predicted: 7_910_000, lower: 7_440_000, upper: 8_380_000 },
  { x: "Dec", actual: null, predicted: 9_180_000, lower: 8_520_000, upper: 9_840_000 },
  { x: "Jan", actual: null, predicted: 7_650_000, lower: 6_980_000, upper: 8_320_000 },
];

export const FORECAST_MODEL = {
  name: "Holt–Winters (additive, 12-month seasonality)",
  target: "Monthly revenue, organisation-wide",
  trainedOn: "36 months",
  validation: "Rolling-origin, 6 folds",
  mape: 3.1,
  rmse: 214_000,
  mae: 176_000,
  bias: -0.4,
};

export const ANOMALIES = [
  { metric: "Stock-out rate", branch: "Uptown", date: "28 Sep", actual: "6.1%", expected: "3.2%", deviation: "+91%", severity: "High" as const, status: "Open" },
  { metric: "Gross margin", branch: "Airport Road", date: "26 Sep", actual: "24.8%", expected: "31.0%", deviation: "−6.2 pts", severity: "High" as const, status: "Open" },
  { metric: "Footfall", branch: "Riverside", date: "24 Sep", actual: "1,910", expected: "2,540", deviation: "−24.8%", severity: "Medium" as const, status: "Investigating" },
  { metric: "Shrinkage", branch: "Central Market", date: "21 Sep", actual: "₹41,200", expected: "₹18,000", deviation: "+129%", severity: "Medium" as const, status: "Open" },
  { metric: "Avg. discount", branch: "Uptown", date: "19 Sep", actual: "9.4%", expected: "6.0%", deviation: "+3.4 pts", severity: "Low" as const, status: "Resolved" },
];

/* ---- Decision support: existing recommendations ---- */
export const RECOMMENDATIONS = [
  {
    title: "Reprice sunflower oil & toned milk",
    driver: "Gross margin 31.9% vs 34% target; both SKUs sit below 13% line margin on rising cost.",
    action: "Lift shelf price 3–4% and shift promo spend to tea & spices where elasticity is lower.",
    impact: "+0.6 pt gross margin",
    risk: "Low" as const,
    confidence: 0.78,
  },
  {
    title: "Rebalance Uptown safety stock",
    driver: "Stock-out rate 6.1% and a 91% deviation anomaly; lost-sales estimate ₹2.1 L/month.",
    action: "Raise reorder points on top 20 SKUs by 15% and add a mid-week replenishment slot.",
    impact: "−2.5 pt stock-out rate",
    risk: "Low" as const,
    confidence: 0.71,
  },
  {
    title: "Hold the Airport Road marketing top-up",
    driver: "Ramp-up branch is 6.2 pts under margin plan; extra spend won't fix a cost problem.",
    action: "Defer the ₹1.5 L launch top-up one quarter; fix supplier terms and staffing first.",
    impact: "Protects ₹1.5 L cash",
    risk: "Medium" as const,
    confidence: 0.64,
  },
];

export const ACTIVITY = [
  { when: "10:42", who: "Priya Nair", what: "Approved payroll run — September 2025", where: "HR & Payroll" },
  { when: "09:18", who: "System", what: "Flagged stock-out anomaly at Uptown (High)", where: "Analytics" },
  { when: "Yesterday", who: "Devan Mehta", what: "Received PO-3390 from Sahyadri Dairy Co-op", where: "Procurement" },
  { when: "Yesterday", who: "Asha Rao", what: "Opened branch evaluation — Hinjawadi Phase 2", where: "Branch evaluation" },
  { when: "2 days ago", who: "System", what: "Recomputed 12 KPIs for period ending 30 Sep", where: "Analytics" },
];
