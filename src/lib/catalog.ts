/**
 * What a business can be built from: industries and their categories, module templates, the KPI
 * library, default AI roles, starter automations, and `recommend()` which turns onboarding answers
 * into a full workspace config. Pure data + functions, used by onboarding (client) and the server.
 */
import {
  slug, uid,
  type AiRole, type Area, type Automation, type BusinessConfig, type Field, type ForecastDef, type KpiDef,
  type ModuleDef, type Profile, type TeamRole, type Theme, type Widget,
} from "@/lib/model";

/* ---------------- fields ---------------- */

const f = (key: string, label: string, type: Field["type"] = "text", extra: Partial<Field> = {}): Field => ({ key, label, type, ...extra });
const sel = (key: string, label: string, options: string[], extra: Partial<Field> = {}) => f(key, label, "select", { options, ...extra });
const date = (key = "date", label = "Date") => f(key, label, "date", { required: true });

/** Amounts are GST-inclusive; the rate splits them into taxable value and tax in Reports and invoices. */
const GST_RATE = sel("gst_rate", "GST %", ["0", "5", "12", "18", "28"], { default: "0" });
/** How a bill was paid; the counter's day close totals by it. Credit = on the customer's account. */
/** Sale documents that don't move stock or money until converted into a bill. */
const DOC_TYPE = sel("doc_type", "Document", ["Quotation", "Proforma invoice", "Sale order", "Delivery challan"], { default: "Quotation" });
const MODE = sel("mode", "Paid by", ["Cash", "UPI", "Card", "Credit"], { default: "Cash" });
/** What the billing counter needs on a stock item: a scannable code and the tax it sells at. */
const COUNTER_STOCK = [f("barcode", "Barcode"), GST_RATE, f("hsn", "HSN"), f("mrp", "MRP", "money"),
  f("wholesale_price", "Wholesale price", "money"), f("wholesale_min", "Wholesale from qty", "number"),
  f("expiry", "Expiry", "date"), f("batch", "Batch"), f("location", "Location"), f("variant_of", "Variant of (product group)"),
  f("track_serial", "Track serial / IMEI", "boolean")];
/** What the counter writes on a sale line beyond the basics: the invoice a return is against, the unit's serial, when a credit bill is due, TCS collected. */
const COUNTER_SALE = [f("against", "Against invoice"), f("serial", "Serial / IMEI"), f("due", "Due date", "date"), f("tcs", "TCS collected", "money")];
/** Customer fields for credit, GST, groups and referrals. */
const CUSTOMER_EXTRA = [f("credit_limit", "Credit limit", "money"), f("points_redeemed", "Loyalty points used", "number"),
  f("payment_terms", "Payment terms (days)", "number"), f("group", "Customer group"), f("gstin", "GSTIN"), f("referred_by", "Referred by")];

/** Fields each optional feature adds to Stock. Switching a feature off hides them; the values stay on the records. */
export const FEATURE_FIELDS: Record<"certificates" | "nutrition", Field[]> = {
  certificates: [f("certificate", "Certificate link (lab report, FSSAI, ISI…)"), f("certificate_by", "Certified by"), f("certificate_until", "Certificate valid until", "date")],
  nutrition: [f("ingredients", "Ingredients", "longtext"), f("nutrition", "Nutrition per serving (Energy 120 kcal; Protein 24 g)", "longtext"),
    f("serving", "Serving size"), sel("veg", "Veg / non-veg", ["Veg", "Non-veg"]), f("allergens", "Allergens"), f("how_to_use", "How to use", "longtext"),
    f("fssai", "FSSAI licence no.")],
};

/** Adds the fields of switched-on features to Stock and takes off those of switched-off ones. Returns true on a change. */
export function applyFeatures(b: Pick<BusinessConfig, "modules"> & { features?: { certificates?: boolean; nutrition?: boolean } }) {
  const inv = b.modules.find((m) => m.id === "inventory");
  if (!inv) return false;
  let changed = false;
  for (const [k, fields] of Object.entries(FEATURE_FIELDS) as [keyof typeof FEATURE_FIELDS, Field[]][]) {
    const on = !!b.features?.[k];
    for (const fld of fields) {
      const has = inv.fields.some((x) => x.key === fld.key);
      if (on && !has) { inv.fields.push({ ...fld }); changed = true; }
      if (!on && has) { inv.fields = inv.fields.filter((x) => x.key !== fld.key); changed = true; }
    }
  }
  return changed;
}

/** Accounts a journal entry can use: the books' fixed accounts plus the usual expense heads. */
const JOURNAL_ACCOUNTS = ["Cash", "Bank", "Capital", "Drawings", "Opening balances", "Loans", "Debtors", "Creditors", "Stock", "Fixed assets",
  "Other income", "Rent", "Utilities", "Supplies", "Marketing", "Transport", "Maintenance", "Professional fees", "Bad debts", "Other"];

/* ---------------- module templates ---------------- */

type Tpl = Omit<ModuleDef, "enabled">;
const tpl = (id: string, name: string, icon: string, group: string, description: string, fields: Field[], dateField?: string): Tpl =>
  ({ id, name, icon, group, description, fields, dateField });

export const MODULE_TEMPLATES: Tpl[] = [
  tpl("sales", "Sales", "receipt", "Sales & customers", "Invoices and bills: what was sold, to whom, for how much.", [
    date(), f("invoice", "Invoice no."), f("customer", "Customer"), f("item", "Item / service"),
    sel("category", "Category", ["General"]), f("quantity", "Qty", "number", { default: "1" }),
    f("amount", "Amount", "money", { required: true }), f("cost", "Cost of goods", "money"),
    sel("payment", "Payment", ["Paid", "Unpaid", "Part-paid"], { default: "Paid" }), MODE,
    sel("channel", "Channel", ["Walk-in", "Phone", "Online", "Wholesale"], { default: "Walk-in" }),
    GST_RATE, f("hsn", "HSN / SAC"), f("phone", "Customer phone", "phone"), f("customer_gstin", "Customer GSTIN"), ...COUNTER_SALE,
  ], "date"),
  tpl("quotes", "Quotations & orders", "clipboard", "Sales & customers", "Estimates, proforma invoices, sale orders and delivery challans. None touch stock or money until billed at the counter.", [
    date(), DOC_TYPE, f("quote_no", "Quote no."), f("customer", "Customer", "text", { required: true }), f("phone", "Customer phone", "phone"),
    f("item", "Item / service"), f("quantity", "Qty", "number", { default: "1" }), f("amount", "Quote amount", "money", { required: true }),
    GST_RATE, f("valid_until", "Valid until", "date"),
    sel("status", "Status", ["Draft", "Sent", "Accepted", "Rejected", "Expired"], { default: "Draft" }), f("note", "Terms / note"),
  ], "date"),
  tpl("orders", "Online orders", "shopping-cart", "Sales & customers", "Orders from your website, marketplaces and social.", [
    date(), f("order_id", "Order ID"), sel("channel", "Channel", ["Website", "Marketplace", "Social", "App"], { default: "Website" }),
    f("customer", "Customer"), f("amount", "Order value", "money", { required: true }), f("shipping", "Shipping cost", "money"),
    sel("status", "Status", ["Placed", "Shipped", "Delivered", "Returned", "Cancelled"], { default: "Placed" }),
  ], "date"),
  tpl("offers", "Offers & coupons", "star", "Sales & customers", "Coupons, combos and near-expiry offers the counter applies by itself.", [
    f("name", "Offer", "text", { required: true }), sel("kind", "Type", ["Coupon", "Combo", "Near-expiry"], { default: "Coupon" }),
    f("code", "Coupon code"), f("percent", "% off", "number"), f("amount", "Flat off", "money"), f("min_bill", "Minimum bill", "money"),
    f("items", "Items (SKU*qty, comma separated)"), f("price", "Combo price", "money"),
    f("starts", "Starts", "date"), f("ends", "Ends", "date"), sel("active", "Active", ["Yes", "No"], { default: "Yes" }),
  ]),
  tpl("customers", "Customers", "contact", "Sales & customers", "Who buys from you and how to reach them.", [
    date("since", "Customer since"), f("name", "Name", "text", { required: true }), f("phone", "Phone", "phone"),
    f("email", "Email", "email"), sel("segment", "Segment", ["New", "Regular", "VIP", "Wholesale"], { default: "New" }), f("city", "City"),
    ...CUSTOMER_EXTRA,
  ], "since"),
  tpl("leads", "Pipeline", "target", "Sales & customers", "Enquiries and deals, from first contact to won or lost.", [
    date(), f("name", "Lead", "text", { required: true }), sel("source", "Source", ["Referral", "Walk-in", "Website", "Social", "Ads", "Other"]),
    sel("stage", "Stage", ["New", "Contacted", "Proposal", "Won", "Lost"], { default: "New" }), f("value", "Deal value", "money"),
    f("owner", "Owner"), f("follow_up", "Next follow-up", "date"),
  ], "date"),
  tpl("appointments", "Bookings", "calendar-check", "Sales & customers", "Appointments and sessions with their outcome.", [
    date(), f("customer", "Customer", "text", { required: true }), f("service", "Service"), f("staff", "Staff"),
    f("amount", "Amount", "money"), sel("status", "Status", ["Booked", "Completed", "No-show", "Cancelled"], { default: "Completed" }),
  ], "date"),
  tpl("reservations", "Reservations", "bed", "Sales & customers", "Room bookings by check-in date, nights and rate.", [
    date("date", "Check-in"), f("guest", "Guest", "text", { required: true }), sel("room_type", "Room type", ["Standard", "Deluxe", "Suite"]),
    f("nights", "Nights", "number", { default: "1", required: true }), f("rate", "Rate / night", "money", { required: true }),
    sel("channel", "Channel", ["Direct", "OTA", "Walk-in", "Corporate"], { default: "Direct" }),
    sel("status", "Status", ["Confirmed", "Checked-in", "Completed", "Cancelled"], { default: "Confirmed" }),
  ], "date"),
  tpl("enrollments", "Enrollments", "graduation-cap", "Sales & customers", "Students, courses and fees collected.", [
    date(), f("student", "Student", "text", { required: true }), f("course", "Course"), f("fee", "Fee", "money", { required: true }),
    f("paid", "Paid", "money"), sel("status", "Status", ["Active", "Completed", "Dropped"], { default: "Active" }),
  ], "date"),
  tpl("daybook", "Daily register", "utensils", "Operations", "One line per day: covers, sales, food cost and waste.", [
    date(), f("covers", "Covers", "number", { required: true }), f("food_sales", "Food sales", "money", { required: true }),
    f("bev_sales", "Beverage sales", "money"), f("food_cost", "Food cost", "money"), f("waste", "Waste", "money"),
  ], "date"),
  tpl("inventory", "Stock", "boxes", "Operations", "Products on hand against reorder levels.", [
    f("sku", "SKU"), f("name", "Product", "text", { required: true }), sel("category", "Category", ["General"]),
    f("on_hand", "On hand", "number", { required: true }), f("reorder", "Reorder at", "number"),
    f("unit_cost", "Unit cost", "money"), f("price", "Price", "money"), f("supplier", "Supplier"), ...COUNTER_STOCK,
  ]),
  tpl("purchases", "Purchases", "truck", "Operations", "Purchase orders to suppliers and their status.", [
    date(), f("po", "PO no."), f("supplier", "Supplier", "text", { required: true }), f("item", "Item"),
    f("quantity", "Qty", "number"), f("amount", "Amount", "money", { required: true }),
    sel("status", "Status", ["Ordered", "Received", "Returned", "Cancelled"], { default: "Ordered" }), f("expected", "Expected", "date"),
    GST_RATE, f("supplier_gstin", "Supplier GSTIN"),
  ], "date"),
  tpl("production", "Production", "factory", "Operations", "Work orders: planned, produced and rejected units.", [
    date(), f("product", "Product", "text", { required: true }), f("planned", "Planned", "number"),
    f("produced", "Produced", "number", { required: true }), f("rejected", "Rejected", "number", { default: "0" }),
    f("line", "Line / machine"), f("cost", "Cost", "money"),
  ], "date"),
  tpl("projects", "Projects", "folder", "Operations", "Client projects with budget, billing and cost.", [
    date("start", "Start"), f("name", "Project", "text", { required: true }), f("client", "Client"), f("due", "Due", "date"),
    f("budget", "Budget", "money"), f("billed", "Billed", "money"), f("cost", "Cost", "money"),
    sel("status", "Status", ["Planned", "Active", "On hold", "Done"], { default: "Active" }),
  ], "start"),
  tpl("timesheets", "Timesheets", "clock", "People", "Hours by person and project, billable or not.", [
    date(), f("person", "Person", "text", { required: true }), f("project", "Project"),
    f("hours", "Hours", "number", { required: true }), sel("billable", "Billable", ["Yes", "No"], { default: "Yes" }),
  ], "date"),
  tpl("shipments", "Shipments", "route", "Operations", "Trips and consignments with cost, revenue and timeliness.", [
    date(), f("ref", "Reference"), f("origin", "From"), f("destination", "To"), f("distance", "Distance (km)", "number"),
    f("revenue", "Revenue", "money", { required: true }), f("cost", "Cost", "money"), sel("on_time", "On time", ["Yes", "No"], { default: "Yes" }),
  ], "date"),
  tpl("harvest", "Harvest & produce", "sprout", "Operations", "What was harvested or produced, its cost and sale value.", [
    date(), f("crop", "Crop / product", "text", { required: true }), f("plot", "Plot / unit"),
    f("quantity", "Quantity (kg)", "number", { required: true }), f("cost", "Cost", "money"), f("sold", "Sold for", "money"),
  ], "date"),
  tpl("expenses", "Expenses", "wallet", "Finance", "Every rupee out: rent, utilities, supplies, marketing.", [
    date(), sel("category", "Category", ["Rent", "Utilities", "Supplies", "Marketing", "Transport", "Maintenance", "Professional fees", "Other"]),
    f("vendor", "Paid to"), f("amount", "Amount", "money", { required: true }),
    sel("mode", "Mode", ["Cash", "UPI", "Bank", "Card"], { default: "UPI" }), f("note", "Note"),
  ], "date"),
  tpl("dayclose", "Day close", "vault", "Finance", "End-of-day Z reports: what the drawer should hold against what was counted.", [
    date(), f("bills", "Bills", "number"), f("sales", "Sales", "money"), f("returns", "Returns", "money"), f("opening", "Opening cash", "money"),
    f("cash", "Cash sales", "money"), f("cash_expenses", "Cash expenses", "money"), f("expected", "Cash expected", "money"),
    f("counted", "Cash counted", "money", { required: true }), f("difference", "Over / short", "money"),
    f("upi", "UPI", "money"), f("card", "Card", "money"), f("credit", "On credit", "money"), f("closed_by", "Closed by"), f("note", "Note"),
  ], "date"),
  tpl("payments", "Payments", "banknote", "Finance", "Money received from customers and paid to suppliers, with TDS and cheques.", [
    date(), sel("direction", "Direction", ["In", "Out"], { default: "In" }), f("party", "Customer / supplier", "text", { required: true }),
    f("phone", "Phone", "phone"), f("amount", "Amount", "money", { required: true }), sel("mode", "Mode", ["Cash", "UPI", "Bank", "Card", "Cheque"], { default: "UPI" }),
    f("against", "Against invoice / PO"), f("tds", "TDS deducted", "money"), f("cheque_no", "Cheque no."),
    sel("cheque_status", "Cheque status", ["Not deposited", "Deposited", "Cleared", "Bounced"]), f("note", "Note"),
  ], "date"),
  tpl("journal", "Journal entries", "folder", "Finance", "Adjustments between accounts: opening balances, owner's capital and drawings, loans, write-offs.", [
    date(), sel("debit", "Debit account", JOURNAL_ACCOUNTS, { required: true }), sel("credit", "Credit account", JOURNAL_ACCOUNTS, { required: true }),
    f("amount", "Amount", "money", { required: true }), f("note", "Narration"),
  ], "date"),
  tpl("assets", "Fixed assets", "package", "Finance", "Equipment, furniture and vehicles, depreciated month by month.", [
    date("date", "Bought on"), f("name", "Asset", "text", { required: true }), f("cost", "Cost", "money", { required: true }),
    f("life_years", "Useful life (years)", "number", { default: "5" }), sel("paid_by", "Paid by", ["Cash", "Bank", "UPI", "Card"], { default: "Bank" }),
  ], "date"),
  tpl("employees", "Team", "users", "People", "Who works here, their role and pay.", [
    f("joined", "Joined", "date"), f("name", "Name", "text", { required: true }), f("role", "Role"), f("department", "Department"),
    f("salary", "Monthly salary", "money"), sel("status", "Status", ["Active", "Probation", "On leave", "Exited"], { default: "Active" }),
  ]),
  tpl("payroll", "Payroll", "banknote", "People", "Monthly pay runs: gross, deductions, net.", [
    date("date", "Pay date"), f("employee", "Employee", "text", { required: true }), f("gross", "Gross", "money", { required: true }),
    f("deductions", "Deductions", "money"), f("net", "Net", "money"), sel("status", "Status", ["Paid", "Pending"], { default: "Paid" }),
  ], "date"),
];

export const ICONS = [
  "receipt", "shopping-cart", "contact", "target", "calendar-check", "bed", "graduation-cap", "utensils", "boxes", "truck",
  "factory", "folder", "clock", "route", "sprout", "wallet", "users", "banknote", "clipboard", "wrench", "star", "package", "heart", "briefcase", "vault",
];

/**
 * Brings a workspace made before the billing counter up to what it needs: the payment-mode field on Sales, barcode /
 * GST / HSN on Stock, the Day close module, and bill counts by invoice. Adds only what is missing, never renames or
 * removes the owner's own fields. Returns true when it changed something.
 */
export function ensureCounter(b: Pick<BusinessConfig, "modules" | "kpis">) {
  let changed = false;
  const need: Record<string, Field[]> = {
    sales: [MODE, ...COUNTER_SALE], inventory: COUNTER_STOCK, quotes: [DOC_TYPE],
    customers: CUSTOMER_EXTRA,
  };
  for (const mod of b.modules) for (const fld of need[mod.id] ?? [])
    if (!mod.fields.some((x) => x.key === fld.key)) { mod.fields.push({ ...fld }); changed = true; }
  const pur = b.modules.find((x) => x.id === "purchases")?.fields.find((x) => x.key === "status");
  if (pur?.options && !pur.options.includes("Returned")) { pur.options.splice(pur.options.indexOf("Cancelled") >>> 0, 0, "Returned"); changed = true; }
  for (const id of ["dayclose", "quotes", "offers", "payments", "journal", "assets"]) if (!b.modules.some((x) => x.id === id)) {
    const t = MODULE_TEMPLATES.find((x) => x.id === id)!;
    b.modules.push({ ...structuredClone(t), enabled: false });
    changed = true;
  }
  for (const kpi of b.kpis) for (const ref of Object.values(kpi.metrics))
    if ((kpi.id === "bills" || kpi.id === "avg_bill") && ref.module === "sales" && ref.agg === "count" && !ref.where?.length) {
      Object.assign(ref, { agg: "distinct", field: "invoice" });
      changed = true;
    }
  return changed;
}

/* ---------------- KPI library ---------------- */

const m = (module: string, agg: KpiDef["metrics"][string]["agg"], field?: string, where?: KpiDef["metrics"][string]["where"]) =>
  ({ module, agg, field, where });
const k = (id: string, name: string, unit: KpiDef["unit"], area: Area, metrics: KpiDef["metrics"], formula: string, higherIsBetter = true, description = ""): KpiDef =>
  ({ id, name, unit, area, metrics, formula, higherIsBetter, description });

/** A counter bill is several Sales lines sharing an invoice number; records without one count once each. */
const BILLS = m("sales", "distinct", "invoice");
const NOT_CANCELLED = [{ field: "status", op: "ne" as const, value: "Cancelled" }];

export const KPI_LIBRARY: KpiDef[] = [
  k("revenue", "Revenue", "money", "sales", { rev: m("sales", "sum", "amount") }, "rev", true, "Total billed in the period."),
  k("gross_profit", "Gross profit", "money", "finance", { rev: m("sales", "sum", "amount"), cogs: m("sales", "sum", "cost") }, "rev - cogs"),
  k("gross_margin", "Gross margin", "pct", "finance", { rev: m("sales", "sum", "amount"), cogs: m("sales", "sum", "cost") }, "(rev - cogs) / rev * 100"),
  k("avg_bill", "Average bill", "money", "sales", { rev: m("sales", "sum", "amount"), n: BILLS }, "rev / n"),
  k("bills", "Bills raised", "number", "sales", { n: BILLS }, "n"),
  k("receivables", "Unpaid sales", "money", "finance", { due: m("sales", "sum", "amount", [{ field: "payment", op: "ne", value: "Paid" }]) }, "due", false, "Billed but not yet collected."),
  k("expenses_total", "Operating expenses", "money", "finance", { exp: m("expenses", "sum", "amount") }, "exp", false),
  k("net_profit", "Net profit", "money", "finance", { rev: m("sales", "sum", "amount"), cogs: m("sales", "sum", "cost"), exp: m("expenses", "sum", "amount") }, "rev - cogs - exp"),
  k("net_margin", "Net margin", "pct", "finance", { rev: m("sales", "sum", "amount"), cogs: m("sales", "sum", "cost"), exp: m("expenses", "sum", "amount") }, "(rev - cogs - exp) / rev * 100"),
  k("stock_value", "Stock value", "money", "operations", { v: m("inventory", "sum", "on_hand * unit_cost") }, "v", false, "Cash held on the shelves, at cost."),
  k("stockout_rate", "Stock-out rate", "pct", "operations", { out: m("inventory", "count", undefined, [{ field: "on_hand", op: "lte", value: "0" }]), all: m("inventory", "count") }, "out / all * 100", false),
  k("below_reorder", "Items to reorder", "number", "operations", { n: m("inventory", "count", undefined, [{ field: "on_hand", op: "lte", value: "@reorder" }]) }, "n", false),
  k("purchase_spend", "Purchase spend", "money", "operations", { p: m("purchases", "sum", "amount", NOT_CANCELLED) }, "p", false),
  k("new_customers", "New customers", "number", "customers", { n: m("customers", "count") }, "n"),
  k("pipeline_value", "Open pipeline", "money", "customers", { v: m("leads", "sum", "value", [{ field: "stage", op: "ne", value: "Won|Lost" }]) }, "v"),
  k("win_rate", "Win rate", "pct", "customers", { won: m("leads", "count", undefined, [{ field: "stage", op: "eq", value: "Won" }]), lost: m("leads", "count", undefined, [{ field: "stage", op: "eq", value: "Lost" }]) }, "won / (won + lost) * 100"),
  k("headcount", "Headcount", "number", "people", { n: m("employees", "count", undefined, [{ field: "status", op: "ne", value: "Exited" }]) }, "n"),
  k("salary_bill", "Monthly salary bill", "money", "people", { s: m("employees", "sum", "salary", [{ field: "status", op: "ne", value: "Exited" }]) }, "s", false),
  k("payroll_cost", "Payroll cost", "money", "people", { g: m("payroll", "sum", "gross") }, "g", false),
  k("payroll_ratio", "Payroll to revenue", "pct", "people", { g: m("payroll", "sum", "gross"), rev: m("sales", "sum", "amount") }, "g / rev * 100", false),
  k("revenue_per_employee", "Revenue per employee", "money", "people", { rev: m("sales", "sum", "amount"), n: m("employees", "count", undefined, [{ field: "status", op: "ne", value: "Exited" }]) }, "rev / n"),
  k("utilization", "Billable utilisation", "pct", "people", { b: m("timesheets", "sum", "hours", [{ field: "billable", op: "eq", value: "Yes" }]), all: m("timesheets", "sum", "hours") }, "b / all * 100"),
  k("project_billing", "Project billing", "money", "sales", { b: m("projects", "sum", "billed") }, "b"),
  k("project_margin", "Project margin", "pct", "finance", { b: m("projects", "sum", "billed"), c: m("projects", "sum", "cost") }, "(b - c) / b * 100"),
  k("bookings", "Bookings", "number", "sales", { n: m("appointments", "count", undefined, NOT_CANCELLED) }, "n"),
  k("booking_revenue", "Booking revenue", "money", "sales", { r: m("appointments", "sum", "amount", [{ field: "status", op: "eq", value: "Completed" }]) }, "r"),
  k("avg_ticket", "Average ticket", "money", "sales", { r: m("appointments", "sum", "amount", [{ field: "status", op: "eq", value: "Completed" }]), n: m("appointments", "count", undefined, [{ field: "status", op: "eq", value: "Completed" }]) }, "r / n"),
  k("no_show_rate", "No-show rate", "pct", "operations", { ns: m("appointments", "count", undefined, [{ field: "status", op: "eq", value: "No-show" }]), n: m("appointments", "count") }, "ns / n * 100", false),
  k("yield", "Production yield", "pct", "operations", { p: m("production", "sum", "produced"), pl: m("production", "sum", "planned") }, "p / pl * 100"),
  k("rejection_rate", "Rejection rate", "pct", "operations", { r: m("production", "sum", "rejected"), p: m("production", "sum", "produced") }, "r / p * 100", false),
  k("unit_cost", "Cost per unit", "money", "operations", { c: m("production", "sum", "cost"), p: m("production", "sum", "produced") }, "c / p", false),
  k("units_produced", "Units produced", "number", "operations", { p: m("production", "sum", "produced") }, "p"),
  k("order_revenue", "Order revenue", "money", "sales", { r: m("orders", "sum", "amount", [{ field: "status", op: "ne", value: "Cancelled|Returned" }]) }, "r"),
  k("aov", "Average order value", "money", "sales", { r: m("orders", "sum", "amount"), n: m("orders", "count") }, "r / n"),
  k("return_rate", "Return rate", "pct", "operations", { ret: m("orders", "count", undefined, [{ field: "status", op: "eq", value: "Returned" }]), n: m("orders", "count") }, "ret / n * 100", false),
  k("shipping_share", "Shipping as % of sales", "pct", "operations", { s: m("orders", "sum", "shipping"), r: m("orders", "sum", "amount") }, "s / r * 100", false),
  k("shipment_revenue", "Freight revenue", "money", "sales", { r: m("shipments", "sum", "revenue") }, "r"),
  k("on_time", "On-time delivery", "pct", "operations", { y: m("shipments", "count", undefined, [{ field: "on_time", op: "eq", value: "Yes" }]), n: m("shipments", "count") }, "y / n * 100"),
  k("cost_per_km", "Cost per km", "money", "operations", { c: m("shipments", "sum", "cost"), d: m("shipments", "sum", "distance") }, "c / d", false),
  k("trip_margin", "Trip margin", "pct", "finance", { r: m("shipments", "sum", "revenue"), c: m("shipments", "sum", "cost") }, "(r - c) / r * 100"),
  k("enrollment_count", "New enrollments", "number", "sales", { n: m("enrollments", "count") }, "n"),
  k("fee_revenue", "Fees collected", "money", "sales", { p: m("enrollments", "sum", "paid") }, "p"),
  k("fee_collection", "Fee collection", "pct", "finance", { p: m("enrollments", "sum", "paid"), f: m("enrollments", "sum", "fee") }, "p / f * 100"),
  k("covers", "Covers", "number", "sales", { c: m("daybook", "sum", "covers") }, "c"),
  k("restaurant_revenue", "Restaurant sales", "money", "sales", { s: m("daybook", "sum", "food_sales + bev_sales") }, "s"),
  k("spend_per_cover", "Spend per cover", "money", "sales", { s: m("daybook", "sum", "food_sales + bev_sales"), c: m("daybook", "sum", "covers") }, "s / c"),
  k("food_cost_pct", "Food cost %", "pct", "operations", { fc: m("daybook", "sum", "food_cost"), fs: m("daybook", "sum", "food_sales") }, "fc / fs * 100", false),
  k("waste_pct", "Waste %", "pct", "operations", { w: m("daybook", "sum", "waste"), fc: m("daybook", "sum", "food_cost") }, "w / fc * 100", false),
  k("room_nights", "Room nights", "number", "sales", { n: m("reservations", "sum", "nights", NOT_CANCELLED) }, "n"),
  k("room_revenue", "Room revenue", "money", "sales", { r: m("reservations", "sum", "rate * nights", NOT_CANCELLED) }, "r"),
  k("adr", "Average daily rate", "money", "sales", { r: m("reservations", "sum", "rate * nights", NOT_CANCELLED), n: m("reservations", "sum", "nights", NOT_CANCELLED) }, "r / n"),
  k("cancellation_rate", "Cancellation rate", "pct", "operations", { c: m("reservations", "count", undefined, [{ field: "status", op: "eq", value: "Cancelled" }]), n: m("reservations", "count") }, "c / n * 100", false),
  k("harvest_qty", "Harvest (kg)", "number", "operations", { q: m("harvest", "sum", "quantity") }, "q"),
  k("harvest_margin", "Produce margin", "pct", "finance", { s: m("harvest", "sum", "sold"), c: m("harvest", "sum", "cost") }, "(s - c) / s * 100"),
];

export const kpiModules = (kpi: KpiDef) => [...new Set(Object.values(kpi.metrics).map((x) => x.module))];

/* ---------------- industries ---------------- */

type Category = { name: string; tags?: string[]; extraFields?: Record<string, Field[]> };
export type Industry = {
  id: string;
  name: string;
  blurb: string;
  icon: string;
  categories: Category[];
  modules: string[];
  kpis: string[];
  /** headline KPI: the one forecast by default and drawn large on the dashboard */
  headline: string;
  rename?: Record<string, string>;
  roles: string[];
  channels: string[];
};

const expiry = { inventory: [f("expiry", "Expiry", "date"), f("batch", "Batch")] };

export const INDUSTRIES: Industry[] = [
  {
    id: "retail", name: "Retail store", icon: "store", blurb: "Shops selling to walk-in customers",
    categories: [
      { name: "Grocery & supermarket", tags: ["Staples", "Fresh", "Dairy", "Packaged foods", "Household", "Personal care"], extraFields: expiry },
      { name: "Apparel & fashion", tags: ["Men", "Women", "Kids", "Footwear", "Accessories"], extraFields: { inventory: [f("size", "Size"), f("colour", "Colour")] } },
      { name: "Electronics & mobiles", tags: ["Mobiles", "Accessories", "Appliances", "Repairs"], extraFields: { sales: [f("serial", "Serial / IMEI")] } },
      { name: "Pharmacy", tags: ["Prescription", "OTC", "Wellness", "Devices"], extraFields: expiry },
      { name: "Hardware & paints", tags: ["Tools", "Paints", "Plumbing", "Electricals"] },
      { name: "Books & stationery", tags: ["Books", "Stationery", "Office", "Gifts"] },
      { name: "Jewellery", tags: ["Gold", "Silver", "Diamond", "Imitation"], extraFields: { sales: [f("weight", "Weight (g)", "number")] } },
    ],
    modules: ["sales", "inventory", "purchases", "expenses", "customers", "employees", "payroll", "offers"],
    kpis: ["revenue", "gross_margin", "avg_bill", "net_profit", "stock_value", "below_reorder", "stockout_rate", "receivables", "expenses_total", "new_customers"],
    headline: "revenue", roles: ["gm", "cfo", "coo", "hr", "cto"], channels: ["Walk-in", "Phone", "Online", "Wholesale"],
  },
  {
    id: "restaurant", name: "Restaurant & food", icon: "utensils", blurb: "Cafés, restaurants, kitchens, bakeries",
    categories: [
      { name: "Café" }, { name: "Casual dining" }, { name: "Quick service" }, { name: "Cloud kitchen" }, { name: "Bakery & sweets" }, { name: "Bar & lounge" },
    ],
    modules: ["daybook", "purchases", "inventory", "expenses", "employees", "payroll", "customers"],
    kpis: ["restaurant_revenue", "covers", "spend_per_cover", "food_cost_pct", "waste_pct", "expenses_total", "purchase_spend", "payroll_cost"],
    headline: "restaurant_revenue", rename: { inventory: "Ingredients", purchases: "Supplies" }, roles: ["gm", "cfo", "coo", "hr", "cto"],
    channels: ["Dine-in", "Takeaway", "Delivery apps", "Catering"],
  },
  {
    id: "manufacturing", name: "Manufacturing", icon: "factory", blurb: "Making goods on a shop floor",
    categories: [
      { name: "Food processing", extraFields: expiry }, { name: "Textiles & garments" }, { name: "Engineering & fabrication" },
      { name: "Plastics & packaging" }, { name: "Furniture" }, { name: "Chemicals" },
    ],
    modules: ["production", "sales", "purchases", "inventory", "expenses", "employees", "payroll"],
    kpis: ["units_produced", "yield", "rejection_rate", "unit_cost", "revenue", "gross_margin", "stock_value", "purchase_spend", "receivables"],
    headline: "revenue", rename: { inventory: "Materials & stock" }, roles: ["gm", "cfo", "coo", "hr", "cto"], channels: ["Direct", "Distributors", "Export", "Tender"],
  },
  {
    id: "wholesale", name: "Wholesale & distribution", icon: "truck", blurb: "Buying in bulk, selling to retailers",
    categories: [{ name: "FMCG distribution" }, { name: "Pharma distribution", extraFields: expiry }, { name: "Building materials" }, { name: "Agri commodities" }, { name: "Auto parts" }],
    modules: ["sales", "purchases", "inventory", "customers", "expenses", "employees", "payroll"],
    kpis: ["revenue", "gross_margin", "receivables", "stock_value", "below_reorder", "purchase_spend", "avg_bill", "net_profit"],
    headline: "revenue", roles: ["gm", "cfo", "coo", "hr", "cto"], channels: ["Retailers", "Institutions", "Online B2B"],
  },
  {
    id: "services", name: "Professional services", icon: "briefcase", blurb: "Agencies, consultants, IT and accounting firms",
    categories: [{ name: "Marketing agency" }, { name: "IT services" }, { name: "Consulting" }, { name: "Accounting / CA firm" }, { name: "Architecture & design" }, { name: "Legal" }],
    modules: ["projects", "timesheets", "leads", "customers", "sales", "expenses", "employees", "payroll"],
    kpis: ["revenue", "utilization", "project_margin", "pipeline_value", "win_rate", "receivables", "payroll_ratio", "revenue_per_employee"],
    headline: "revenue", rename: { sales: "Invoices", customers: "Clients" }, roles: ["gm", "cfo", "coo", "hr", "cto", "cmo"], channels: ["Referral", "Retainer", "Tender", "Inbound"],
  },
  {
    id: "healthcare", name: "Clinic & healthcare", icon: "heart", blurb: "Clinics, dental, diagnostics, therapy",
    categories: [{ name: "General clinic" }, { name: "Dental" }, { name: "Diagnostics lab" }, { name: "Physiotherapy" }, { name: "Veterinary" }],
    modules: ["appointments", "sales", "customers", "inventory", "expenses", "employees", "payroll"],
    kpis: ["bookings", "booking_revenue", "avg_ticket", "no_show_rate", "revenue", "new_customers", "expenses_total", "stock_value"],
    headline: "booking_revenue", rename: { appointments: "Appointments", customers: "Patients", sales: "Billing", inventory: "Medicines & supplies" },
    roles: ["gm", "cfo", "coo", "hr", "cto"], channels: ["Walk-in", "Appointment", "Tele-consult", "Home visit"],
  },
  {
    id: "ecommerce", name: "E-commerce & D2C", icon: "shopping-cart", blurb: "Selling online through your site and marketplaces",
    categories: [{ name: "Fashion" }, { name: "Beauty & personal care" }, { name: "Home & kitchen" }, { name: "Handicrafts" }, { name: "Packaged foods", extraFields: expiry }],
    modules: ["orders", "inventory", "purchases", "customers", "expenses", "employees"],
    kpis: ["order_revenue", "aov", "return_rate", "shipping_share", "stock_value", "stockout_rate", "new_customers", "expenses_total"],
    headline: "order_revenue", roles: ["gm", "cfo", "coo", "cto", "cmo"], channels: ["Website", "Marketplace", "Social", "App"],
  },
  {
    id: "education", name: "Education & coaching", icon: "graduation-cap", blurb: "Coaching centres, pre-schools, training",
    categories: [{ name: "Coaching centre" }, { name: "Pre-school" }, { name: "Skill training" }, { name: "Music & arts" }, { name: "Tuition" }],
    modules: ["enrollments", "leads", "expenses", "employees", "payroll"],
    kpis: ["enrollment_count", "fee_revenue", "fee_collection", "win_rate", "pipeline_value", "expenses_total", "payroll_cost"],
    headline: "fee_revenue", rename: { leads: "Admissions enquiries" }, roles: ["gm", "cfo", "hr", "cmo", "cto"], channels: ["Walk-in", "Online", "School tie-ups"],
  },
  {
    id: "construction", name: "Construction & contracting", icon: "wrench", blurb: "Contractors, interiors, civil and MEP works",
    categories: [{ name: "Residential contractor" }, { name: "Interior fit-out" }, { name: "Civil works" }, { name: "Electrical & plumbing" }],
    modules: ["projects", "purchases", "expenses", "timesheets", "employees", "payroll", "leads"],
    kpis: ["project_billing", "project_margin", "purchase_spend", "expenses_total", "payroll_cost", "pipeline_value", "win_rate"],
    headline: "project_billing", rename: { projects: "Sites & projects", purchases: "Materials" }, roles: ["gm", "cfo", "coo", "hr", "cto"], channels: ["Direct", "Builder", "Tender"],
  },
  {
    id: "wellness", name: "Salon, spa & fitness", icon: "star", blurb: "Salons, spas, gyms and studios",
    categories: [{ name: "Salon" }, { name: "Spa" }, { name: "Gym" }, { name: "Yoga & dance studio" }],
    modules: ["appointments", "sales", "customers", "inventory", "expenses", "employees", "payroll"],
    kpis: ["bookings", "booking_revenue", "avg_ticket", "no_show_rate", "new_customers", "revenue", "expenses_total"],
    headline: "booking_revenue", rename: { sales: "Product sales", customers: "Clients" }, roles: ["gm", "cfo", "coo", "hr", "cmo"], channels: ["Walk-in", "Booked", "Membership"],
  },
  {
    id: "logistics", name: "Logistics & transport", icon: "route", blurb: "Trucking, courier, warehousing, movers",
    categories: [{ name: "Trucking" }, { name: "Courier" }, { name: "Warehousing" }, { name: "Packers & movers" }],
    modules: ["shipments", "customers", "expenses", "employees", "payroll"],
    kpis: ["shipment_revenue", "on_time", "cost_per_km", "trip_margin", "expenses_total", "payroll_cost"],
    headline: "shipment_revenue", rename: { customers: "Clients" }, roles: ["gm", "cfo", "coo", "hr", "cto"], channels: ["Contract", "Spot", "Platform"],
  },
  {
    id: "hospitality", name: "Hotels & stays", icon: "bed", blurb: "Hotels, homestays, hostels, resorts",
    categories: [{ name: "Hotel" }, { name: "Homestay" }, { name: "Hostel" }, { name: "Resort" }],
    modules: ["reservations", "expenses", "inventory", "employees", "payroll", "customers"],
    kpis: ["room_revenue", "room_nights", "adr", "cancellation_rate", "expenses_total", "payroll_cost"],
    headline: "room_revenue", rename: { customers: "Guests", inventory: "Supplies" }, roles: ["gm", "cfo", "coo", "hr", "cmo"], channels: ["Direct", "OTA", "Corporate", "Walk-in"],
  },
  {
    id: "agriculture", name: "Agriculture & dairy", icon: "sprout", blurb: "Farms, dairies, poultry, agri-processing",
    categories: [{ name: "Farm" }, { name: "Dairy" }, { name: "Poultry" }, { name: "Agri-processing" }, { name: "Nursery" }],
    modules: ["harvest", "sales", "purchases", "expenses", "employees"],
    kpis: ["harvest_qty", "harvest_margin", "revenue", "expenses_total", "purchase_spend"],
    headline: "revenue", rename: { purchases: "Inputs" }, roles: ["gm", "cfo", "coo", "hr"], channels: ["Mandi", "Direct", "FPO", "Processor"],
  },
  {
    id: "other", name: "Something else", icon: "clipboard", blurb: "Start general and shape it yourself",
    categories: [{ name: "General" }],
    modules: ["sales", "expenses", "customers", "employees"],
    kpis: ["revenue", "expenses_total", "net_profit", "avg_bill", "new_customers"],
    headline: "revenue", roles: ["gm", "cfo", "coo", "hr", "cto"], channels: ["Direct", "Online"],
  },
];

export const GOALS = [
  "Grow revenue", "Improve margins", "Control costs", "Keep shelves full", "Collect cash faster",
  "Win more customers", "Build a strong team", "Open another location", "Run on autopilot",
];

/* ---------------- AI roles ---------------- */

export const ROLE_LIBRARY: Omit<AiRole, "enabled">[] = [
  {
    id: "gm", name: "Mira", title: "General Manager", icon: "compass",
    mandate: "Runs the business week to week. Connects what sales, operations, money and people are telling you, and keeps everyone on the few things that matter this week.",
    responsibilities: ["Weekly business review", "Sets the week's three priorities", "Chases overdue tasks across the team", "Flags conflicts between departments"],
    areas: ["sales", "finance", "operations", "people", "customers"], kpis: [], autonomy: "draft", tone: "Direct and practical",
  },
  {
    id: "cfo", name: "Arjun", title: "Chief Financial Officer", icon: "landmark",
    mandate: "Owns profit and cash. Watches margins, costs, collections and payroll, and tells you before a cash crunch, not after.",
    responsibilities: ["Margin and cost watch", "Collections follow-up", "Cash runway and spend approvals", "Pricing and discount checks", "GST and month-end close reminders"],
    areas: ["finance", "sales"], kpis: [], autonomy: "draft", tone: "Precise, numbers first",
  },
  {
    id: "coo", name: "Kavya", title: "Chief Operating Officer", icon: "settings",
    mandate: "Makes the work run smoothly: stock, suppliers, production, delivery and service quality. Turns problems into checklists and reorders.",
    responsibilities: ["Stock and reorder planning", "Supplier follow-ups", "Throughput, waste and quality", "Daily operating checklist"],
    areas: ["operations"], kpis: [], autonomy: "act", tone: "Calm and process-minded",
  },
  {
    id: "cto", name: "Dev", title: "Chief Technology Officer", icon: "cpu",
    mandate: "Keeps your systems and data in shape. Spots gaps in the records, automates repetitive work, and recommends tools that pay for themselves.",
    responsibilities: ["Data quality checks (missing days, blank fields)", "Builds automations for repetitive work", "Digital channel and tooling advice", "Backups and access hygiene"],
    areas: ["operations", "finance", "sales", "people", "customers"], kpis: [], autonomy: "act", tone: "Plain-spoken, no jargon",
  },
  {
    id: "hr", name: "Neha", title: "Head of People", icon: "users",
    mandate: "Looks after the team: hiring, pay, productivity and compliance. Spots burnout and attrition risk early and keeps payroll clean.",
    responsibilities: ["Payroll and statutory reminders (PF, ESI, PT)", "Hiring plans against workload", "Productivity and attendance patterns", "Onboarding and exits"],
    areas: ["people"], kpis: [], autonomy: "draft", tone: "Warm but firm",
  },
  {
    id: "cmo", name: "Rhea", title: "Chief Marketing Officer", icon: "megaphone",
    mandate: "Brings customers in and back again. Reads the pipeline and customer base, and plans campaigns sized to your budget.",
    responsibilities: ["Customer growth and retention", "Pipeline and conversion", "Campaign ideas within budget", "Reviews and referrals"],
    areas: ["customers", "sales"], kpis: [], autonomy: "advise", tone: "Energetic, idea-led",
  },
];

export const AREA_LABEL: Record<Area, string> = { finance: "Money", sales: "Sales", operations: "Operations", people: "People", customers: "Customers" };

export const AUTONOMY: { value: AiRole["autonomy"]; label: string; about: string }[] = [
  { value: "advise", label: "Advise", about: "Reads your books and coaches you. Changes nothing." },
  { value: "draft", label: "Draft", about: "Creates tasks and drafts automations for you to approve." },
  { value: "act", label: "Act", about: "Creates tasks, switches on automations and sets targets itself." },
];

/* ---------------- theme ---------------- */

export const ACCENTS = [
  { name: "Indigo", value: "#3538cd" }, { name: "Teal", value: "#0e7490" }, { name: "Emerald", value: "#067647" },
  { name: "Saffron", value: "#c2410c" }, { name: "Crimson", value: "#b42318" }, { name: "Plum", value: "#7e22ce" }, { name: "Slate", value: "#334155" },
];
export const DEFAULT_THEME: Theme = { accent: "#3538cd", mode: "light", density: "comfortable", font: "public-sans", radius: "soft", sidebar: "left" };

/* ---------------- recommend: answers → workspace ---------------- */

export type Answers = {
  industry: string;
  category: string;
  city: string;
  country: string;
  currency: string;
  fiscalStart: number;
  profile: Profile;
};

export const DEFAULT_PROFILE: Profile = {
  size: "2–10", locations: 1, sells: "products", stock: true, credit: false, payroll: true, channels: [], goals: ["Grow revenue"],
};

export const industryById = (id: string) => INDUSTRIES.find((i) => i.id === id) ?? INDUSTRIES[INDUSTRIES.length - 1];

export function buildModules(a: Answers): ModuleDef[] {
  const ind = industryById(a.industry);
  const cat = ind.categories.find((c) => c.name === a.category);
  const p = a.profile;
  let ids = [...ind.modules];
  if (!p.stock) ids = ids.filter((x) => x !== "inventory" && x !== "purchases");
  else if (!ids.includes("inventory") && p.sells !== "services") ids.push("inventory");
  if (!p.payroll) ids = ids.filter((x) => x !== "payroll" && x !== "employees" && x !== "timesheets");
  if (p.goals.includes("Win more customers") && !ids.includes("leads")) ids.push("leads");

  const locations = p.locations > 1 ? Array.from({ length: p.locations }, (_, i) => (i === 0 ? "Main" : `Location ${i + 1}`)) : null;

  return MODULE_TEMPLATES.map((t) => {
    let fields = t.fields.map((x) => ({ ...x }));
    if (cat?.tags) fields = fields.map((x) => (x.key === "category" && t.id !== "expenses" ? { ...x, options: cat.tags } : x));
    if (t.id === "sales" || t.id === "orders") {
      const ch = p.channels.length ? p.channels : ind.channels;
      fields = fields.map((x) => (x.key === "channel" ? { ...x, options: ch, default: ch[0] } : x));
    }
    if (p.credit === false && t.id === "sales") fields = fields.map((x) => (x.key === "payment" ? { ...x, default: "Paid" } : x));
    fields.push(...(cat?.extraFields?.[t.id] ?? []).filter((x) => !fields.some((y) => y.key === x.key)).map((x) => ({ ...x })));
    if (locations && t.dateField && !fields.some((x) => x.key === "location"))
      fields.splice(1, 0, sel("location", "Location", locations, { default: "Main" }));
    return { ...t, name: ind.rename?.[t.id] ?? t.name, fields, enabled: ids.includes(t.id) };
  }).sort((x, y) => (ids.indexOf(x.id) + 1 || 99) - (ids.indexOf(y.id) + 1 || 99));
}

const GOAL_KPIS: Record<string, string[]> = {
  "Improve margins": ["gross_margin", "net_margin", "food_cost_pct", "project_margin", "trip_margin"],
  "Control costs": ["expenses_total", "payroll_ratio", "unit_cost", "cost_per_km"],
  "Keep shelves full": ["below_reorder", "stockout_rate", "stock_value"],
  "Collect cash faster": ["receivables", "fee_collection"],
  "Win more customers": ["new_customers", "pipeline_value", "win_rate"],
  "Build a strong team": ["headcount", "payroll_cost", "revenue_per_employee", "utilization"],
};

export function buildKpis(a: Answers, modules: ModuleDef[]): KpiDef[] {
  const ind = industryById(a.industry);
  const on = new Set(modules.filter((x) => x.enabled).map((x) => x.id));
  const wanted = [...ind.kpis, ...a.profile.goals.flatMap((g) => GOAL_KPIS[g] ?? [])];
  if (a.profile.credit) wanted.push("receivables");
  return [...new Set(wanted)]
    .filter((id) => a.profile.credit || id !== "receivables")
    .map((id) => KPI_LIBRARY.find((x) => x.id === id))
    .filter((x): x is KpiDef => !!x && kpiModules(x).every((mod) => on.has(mod)))
    .map((x) => structuredClone(x));
}

export function availableKpis(modules: ModuleDef[]) {
  const on = new Set(modules.filter((x) => x.enabled).map((x) => x.id));
  return KPI_LIBRARY.filter((x) => kpiModules(x).every((mod) => on.has(mod)));
}

/** The business's KPIs plus library KPIs its modules can already compute (for comparisons it hasn't set up). */
export const measurableKpis = (b: { kpis: KpiDef[]; modules: ModuleDef[] }) =>
  [...b.kpis, ...availableKpis(b.modules).filter((x) => !b.kpis.some((k) => k.id === x.id))];

export function defaultForecast(kpi: KpiDef, grain: ForecastDef["grain"] = "month"): ForecastDef {
  return {
    id: uid("fc_"), name: `${kpi.name} outlook`, kpi: kpi.id, grain, horizon: grain === "day" ? 28 : grain === "week" ? 12 : 6,
    model: "auto", season: "auto", confidence: 90, transform: "none", selectBy: "smape",
    scenarios: [{ name: "Downside", pct: -10 }, { name: "Upside", pct: 10 }],
  };
}

export function buildRoles(a: Answers): AiRole[] {
  const ind = industryById(a.industry);
  return ROLE_LIBRARY.map((r) => ({
    ...structuredClone(r),
    enabled: ind.roles.includes(r.id) && !(r.id === "hr" && !a.profile.payroll),
  }));
}

export function buildAutomations(modules: ModuleDef[], kpis: KpiDef[], profile: Profile): Automation[] {
  const on = (id: string) => modules.some((x) => x.id === id && x.enabled);
  const auto = (name: string, trigger: Automation["trigger"], conditions: Automation["conditions"], actions: Automation["actions"], enabled = true): Automation =>
    ({ id: uid("au_"), name, enabled, trigger, conditions, actions, createdBy: "template", runs: 0 });
  const out: Automation[] = [
    auto("Weekly business review", { type: "schedule", every: "week" }, [], [{ type: "task", title: "Prepare this week's business review", assignee: "ai:gm" }]),
  ];
  if (on("inventory"))
    out.push(auto("Reorder when stock runs low", { type: "record", module: "inventory" }, [{ field: "on_hand", op: "lte", value: "@reorder" }],
      [{ type: "task", title: "Reorder {{name}} (on hand {{on_hand}}, reorder at {{reorder}})", assignee: "ai:coo" }]));
  if (on("sales") && profile.credit)
    out.push(auto("Chase unpaid bills", { type: "record", module: "sales" }, [{ field: "payment", op: "ne", value: "Paid" }],
      [{ type: "task", title: "Collect {{amount}} from {{customer}} (bill {{invoice}})", assignee: "ai:cfo" }]));
  if (on("sales"))
    out.push(auto("Celebrate a big sale", { type: "record", module: "sales" }, [{ field: "amount", op: "gte", value: "50000" }],
      [{ type: "notify", message: "Big sale: {{amount}} to {{customer}}" }], false));
  if (on("expenses"))
    out.push(auto("Review large expenses", { type: "record", module: "expenses" }, [{ field: "amount", op: "gte", value: "25000" }],
      [{ type: "task", title: "Review {{category}} expense of {{amount}} paid to {{vendor}}", assignee: "ai:cfo" }]));
  if (on("leads"))
    out.push(auto("Follow up new enquiries", { type: "record", module: "leads" }, [{ field: "stage", op: "eq", value: "New" }],
      [{ type: "task", title: "Call {{name}} ({{source}}) within a day" }]));
  if (on("appointments"))
    out.push(auto("Win back no-shows", { type: "record", module: "appointments" }, [{ field: "status", op: "eq", value: "No-show" }],
      [{ type: "task", title: "Reschedule {{customer}} for {{service}}" }]));
  if (on("production"))
    out.push(auto("Quality alert on rejections", { type: "record", module: "production" }, [{ field: "rejected", op: "gt", value: "0" }],
      [{ type: "notify", message: "{{rejected}} rejected on {{product}} ({{line}})" }]));
  const margin = kpis.find((x) => x.unit === "pct" && x.area === "finance");
  if (margin)
    out.push(auto(`Alert if ${margin.name.toLowerCase()} drops`, { type: "kpi", kpi: margin.id, op: "lt", value: 15 }, [],
      [{ type: "task", title: `${margin.name} fell below 15%: find out why`, assignee: "ai:cfo" }]));
  return out;
}

export function buildDashboard(kpis: KpiDef[], headline: string, roles: AiRole[]): Widget[] {
  const head = kpis.find((x) => x.id === headline) ?? kpis[0];
  const tiles = kpis.slice(0, 4).map((x): Widget => ({ id: uid("w_"), type: "kpi", w: 1, h: 1, kpi: x.id }));
  const gm = roles.find((r) => r.enabled)?.id;
  return [
    ...tiles,
    ...(head ? [{ id: uid("w_"), type: "trend", w: 3, h: 2, kpi: head.id } as Widget] : []),
    { id: uid("w_"), type: "tasks", w: 1, h: 2 },
    ...(head ? [{ id: uid("w_"), type: "forecast", w: 2, h: 2, kpi: head.id } as Widget] : []),
    ...(gm ? [{ id: uid("w_"), type: "ai", w: 2, h: 2, role: gm } as Widget] : []),
    { id: uid("w_"), type: "activity", w: 2, h: 2 },
    ...kpis.slice(4, 6).map((x): Widget => ({ id: uid("w_"), type: "kpi", w: 1, h: 1, kpi: x.id })),
  ];
}

export function buildTeamRoles(modules: ModuleDef[]): TeamRole[] {
  const ids = modules.map((x) => x.id);
  const fin = ids.filter((x) => ["sales", "expenses", "purchases", "payroll", "orders", "projects"].includes(x));
  const ops = modules.filter((x) => x.group !== "Finance" && x.id !== "payroll" && x.id !== "employees").map((x) => x.id);
  return [
    { id: "owner", name: "Owner", access: ["*"] },
    { id: "manager", name: "Manager", access: [...ids, "dashboard", "analytics", "forecasting", "reports", "ai", "automations", "tasks"] },
    { id: "accountant", name: "Accountant", access: [...fin, "dashboard", "analytics", "forecasting", "reports", "tasks"] },
    { id: "staff", name: "Staff", access: [...ops, "dashboard", "tasks"] },
    // for the owner's CA: sees the books and GST reports, can't change anything
    { id: "ca", name: "CA (view only)", access: [...fin, "customers", "inventory", "expenses", "dayclose", "dashboard", "analytics", "reports"].filter((x) => x === "dashboard" || x === "analytics" || x === "reports" || ids.includes(x)), readonly: true },
  ];
}

export function recommend(a: Answers): Omit<BusinessConfig, "name"> {
  const ind = industryById(a.industry);
  const modules = buildModules(a);
  const kpis = buildKpis(a, modules);
  const aiRoles = buildRoles(a);
  const head = kpis.find((x) => x.id === ind.headline) ?? kpis[0];
  const daily = modules.some((x) => x.enabled && (x.id === "daybook" || x.id === "sales"));
  const breakdownField = modules.find((x) => x.enabled && x.id === (head ? Object.values(head.metrics)[0].module : ""));
  return {
    industry: ind.id,
    category: a.category,
    city: a.city,
    country: a.country,
    currency: a.currency,
    locale: a.currency === "INR" ? "en-IN" : "en-US",
    fiscalStart: a.fiscalStart,
    profile: a.profile,
    modules,
    kpis,
    forecasts: head ? [defaultForecast(head, "month"), ...(daily ? [defaultForecast(head, "day")] : [])] : [],
    analytics: {
      grain: "month",
      compareTo: "previous",
      anomalyZ: 3,
      breakdowns: breakdownField
        ? breakdownField.fields.filter((x) => x.type === "select").slice(0, 2).map((x) => ({ module: breakdownField.id, field: x.key }))
        : [],
    },
    aiRoles,
    automations: buildAutomations(modules, kpis, a.profile),
    dashboard: buildDashboard(kpis, ind.headline, aiRoles),
    theme: { ...DEFAULT_THEME },
    roles: buildTeamRoles(modules),
  };
}

/** A blank custom module the owner can shape. */
export function blankModule(name: string): ModuleDef {
  return {
    id: slug(name) + "_" + uid().slice(0, 4), name, icon: "clipboard", group: "Custom", description: "", enabled: true, custom: true,
    fields: [date(), f("title", "Title", "text", { required: true }), f("amount", "Amount", "money")], dateField: "date",
  };
}

export const COUNTRIES = [
  { name: "India", currency: "INR" }, { name: "United Arab Emirates", currency: "AED" }, { name: "Singapore", currency: "SGD" },
  { name: "United Kingdom", currency: "GBP" }, { name: "United States", currency: "USD" }, { name: "Nepal", currency: "NPR" },
  { name: "Sri Lanka", currency: "LKR" }, { name: "Bangladesh", currency: "BDT" }, { name: "Kenya", currency: "KES" }, { name: "Other", currency: "USD" },
];

/** Plain-text description of an automation, for server-rendered lists. */
export function describeTriggerText(a: Automation, b: { modules: ModuleDef[]; kpis: KpiDef[] }) {
  const t = a.trigger;
  const when = t.type === "record" ? `When a ${b.modules.find((m) => m.id === t.module)?.name ?? t.module} record is saved`
    : t.type === "schedule" ? `Every ${t.every}`
    : `When ${b.kpis.find((k) => k.id === t.kpi)?.name ?? t.kpi} is ${t.op === "lt" ? "below" : "above"} ${t.value}`;
  const cond = a.conditions.length ? ` where ${a.conditions.map((c) => `${c.field} ${c.op} ${c.value ?? ""}`.trim()).join(" and ")}` : "";
  const then = a.actions.map((x) => x.type === "task" ? `create task “${x.title}”` : x.type === "notify" ? `post “${x.message}”`
    : x.type === "message" ? `${x.channel === "email" ? "email" : "WhatsApp"} ${x.to}` : `set ${x.field} to ${x.value}`).join(", ");
  return `${when}${cond} → ${then}`;
}
