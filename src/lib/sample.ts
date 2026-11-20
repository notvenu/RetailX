/**
 * Sample records for a new workspace, so the owner can explore every screen before entering real data.
 * Shaped by each module's own fields: dates spread over the last ~6 months with a weekly rhythm and gentle growth,
 * money scaled by what the field is (a bill, a salary, a cost), choices drawn from the field's options.
 * Every row is marked `sample` and can be removed in one click. Deterministic for a given seed.
 */
import type { Field, ModuleDef, RecordRow, Value } from "./model";

const uid = (p: string) => p + Math.random().toString(36).slice(2, 10); // local copy so the self-check runs under plain node

const NAMES = ["Asha", "Rohit", "Meera", "Imran", "Kavita", "Suresh", "Neha", "Arjun", "Fatima", "Vikram", "Pooja", "Rahul", "Sana", "Deepak", "Lata", "Manoj"];
const SURN = ["Sharma", "Patil", "Iyer", "Khan", "Reddy", "Das", "Joshi", "Nair", "Singh", "Gupta", "Mehta", "Rao"];
const PRODUCTS = ["Basmati rice 5kg", "Sunflower oil 1L", "Toor dal 1kg", "Tea 500g", "Detergent 1kg", "Soap pack", "Biscuits", "Milk 1L", "Paneer 200g", "Atta 10kg", "Sugar 1kg", "Shampoo"];

function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const DAY_SHAPE = [1.3, 0.85, 0.8, 0.9, 1.0, 1.15, 1.45]; // Sun..Sat
/** A typical month's spend per expense category for a small shop. */
const EXPENSE: Record<string, number> = { Rent: 45000, Utilities: 7000, Supplies: 1500, Marketing: 2500, Transport: 1200, Maintenance: 1800, "Professional fees": 5000, Other: 900 };

function moneyScale(key: string): number {
  if (/salary|gross|net|payroll/.test(key)) return 22000;
  if (/rent/.test(key)) return 60000;
  if (/budget|billed|fee/.test(key)) return 45000;
  if (/rate/.test(key)) return 3200;
  if (/unit_cost|price/.test(key)) return 180;
  if (/shipping/.test(key)) return 80;
  if (/deduction/.test(key)) return 2500;
  return 1800;
}

function value(f: Field, r: () => number, ctx: { date: string; level: number; i: number }, mod: ModuleDef, row: Record<string, Value>): Value | undefined {
  if (f.type === "date") return f.key === mod.dateField ? ctx.date : undefined;
  // pricing rules and links the owner sets on purpose: random ones would change what the counter charges
  if (/^(mrp|wholesale_price|wholesale_min|tds|percent|min_bill)$/.test(f.key) ) return undefined;
  if (f.type === "select") {
    const opts = f.options ?? [];
    if (!opts.length) return undefined;
    // the default (e.g. "Paid", "Completed") is the usual case; others are rarer
    if (f.default && r() < 0.8) return f.default;
    return opts[Math.floor(Math.pow(r(), 1.6) * opts.length)];
  }
  if (f.type === "money") {
    if (/cost|cogs/.test(f.key) && typeof row.amount === "number") return Math.round((row.amount as number) * (0.68 + r() * 0.12));
    if (f.key === "net" && typeof row.gross === "number") return Math.round((row.gross as number) * 0.88);
    if (f.key === "paid" && typeof row.fee === "number") return r() < 0.75 ? row.fee : Math.round((row.fee as number) * 0.5);
    if (f.key === "sold" && typeof row.cost === "number") return Math.round((row.cost as number) * (1.2 + r() * 0.4));
    if (mod.id === "expenses" && typeof row.category === "string") return Math.round((EXPENSE[row.category] ?? 1500) * (0.85 + r() * 0.3));
    // purchase orders restock several days of sales at once
    return Math.round((mod.id === "purchases" ? 32000 : moneyScale(f.key)) * ctx.level * (0.5 + r()));
  }
  if (f.type === "number") {
    if (/on_hand/.test(f.key)) return Math.floor(r() * 60);
    if (/reorder/.test(f.key)) return 10 + Math.floor(r() * 15);
    if (/covers/.test(f.key)) return Math.round(90 * ctx.level * (0.7 + r() * 0.6));
    if (/hours/.test(f.key)) return 2 + Math.round(r() * 6);
    if (/nights/.test(f.key)) return 1 + Math.floor(r() * 3);
    if (/distance/.test(f.key)) return 40 + Math.round(r() * 400);
    if (/rejected/.test(f.key)) return r() < 0.7 ? 0 : Math.ceil(r() * 8);
    if (/planned|produced/.test(f.key)) return Math.round(200 * ctx.level * (0.85 + r() * 0.3));
    return 1 + Math.floor(r() * 5);
  }
  if (f.type === "phone") return "9" + String(Math.floor(r() * 1e9)).padStart(9, "0");
  if (f.type === "email") return undefined;
  if (f.type === "longtext") return undefined;
  // text
  // a few business customers and registered suppliers; everyone else is a walk-in (B2C)
  if (/gstin/.test(f.key)) return r() < (mod.id === "purchases" ? 0.8 : 0.08) ? `${String(10 + Math.floor(r() * 25))}AABC${"PQRST"[Math.floor(r() * 5)]}${1000 + Math.floor(r() * 8999)}F1Z5` : undefined;
  if (f.key === "hsn") return ["1006", "0402", "0901", "3401", "1905", "1101", "1507", "0713"][Math.floor(r() * 8)];
  if (/item|product|crop/.test(f.key) || (f.key === "name" && mod.id === "inventory")) return mod.id === "inventory" ? PRODUCTS[ctx.i % PRODUCTS.length] : PRODUCTS[Math.floor(r() * PRODUCTS.length)];
  if (/customer|name|guest|student|person|employee|client|lead|owner|staff/.test(f.key)) return `${NAMES[Math.floor(r() * NAMES.length)]} ${SURN[Math.floor(r() * SURN.length)]}`;
  if (/invoice|po|order_id|ref|sku/.test(f.key)) return `${f.key.slice(0, 3).toUpperCase()}-${1000 + ctx.i}`;
  if (/supplier|vendor/.test(f.key)) return ["Shree Traders", "Metro Wholesale", "Annapurna Supplies", "City Distributors"][Math.floor(r() * 4)];
  return undefined;
}

export function sampleRecords(modules: ModuleDef[], days = 180, seed = 42): Record<string, RecordRow[]> {
  const r = rng(seed);
  const out: Record<string, RecordRow[]> = {};
  const today = new Date();
  const back = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
  const recent = `${back.getFullYear()}-${String(back.getMonth() + 1).padStart(2, "0")}-${String(back.getDate()).padStart(2, "0")}`;
  // offers, payments, journals and assets are decisions the owner makes; made-up ones would change real totals
  const skip = new Set(["offers", "payments", "journal", "assets"]);
  for (const mod of modules.filter((m) => m.enabled && !skip.has(m.id))) {
    const rows: RecordRow[] = [];
    const make = (date: string, level: number, i: number, preset: Record<string, Value> = {}) => {
      const data: Record<string, Value> = { ...preset };
      for (const f of mod.fields) {
        if (f.key in preset) continue;
        const v = value(f, r, { date, level, i }, mod, data);
        if (v !== undefined && v !== "") data[f.key] = v;
      }
      // credit sales older than a month have been collected
      if (typeof data.payment === "string" && data.payment !== "Paid" && date && date < recent) data.payment = "Paid";
      rows.push({ id: uid("r_"), at: new Date().toISOString(), by: "Sample data", data, sample: true });
    };
    if (!mod.dateField) {
      const n = mod.id === "employees" ? 6 : PRODUCTS.length;
      for (let i = 0; i < n; i++) make("", 1, i);
    } else {
      // how many records a typical day has, by kind of register
      const perDay = mod.id === "sales" || mod.id === "orders" ? 6 : mod.id === "appointments" ? 5 : mod.id === "daybook" || mod.id === "production" || mod.id === "timesheets" ? 1 : mod.id === "payroll" ? 0 : 0.35;
      let i = 0;
      for (let d = days; d >= 1; d--) {
        const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
        const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
        const level = DAY_SHAPE[dt.getDay()] * (1 + (days - d) * 0.002);
        if (mod.id === "payroll" || mod.id === "expenses") {
          // monthly lines on the 1st, plus a few ad-hoc expenses
          if (dt.getDate() === 1) {
            if (mod.id === "payroll") for (let k = 0; k < 6; k++) make(date, 1, i++);
            else for (const category of ["Rent", "Utilities", "Professional fees"]) make(date, 1, i++, { category });
          }
          if (mod.id === "expenses" && r() < 0.25) make(date, 1, i++, { category: ["Supplies", "Marketing", "Transport", "Maintenance", "Other"][Math.floor(r() * 5)] });
          continue;
        }
        let n = perDay * level;
        while (n > 0) { if (n >= 1 || r() < n) make(date, level, i++); n -= 1; }
      }
    }
    out[mod.id] = rows;
  }
  return out;
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("sample.ts")) {
  const mods: ModuleDef[] = [
    { id: "sales", name: "Sales", icon: "", group: "", description: "", enabled: true, dateField: "date", fields: [
      { key: "date", label: "Date", type: "date" }, { key: "amount", label: "Amount", type: "money" }, { key: "cost", label: "Cost", type: "money" },
      { key: "payment", label: "Payment", type: "select", options: ["Paid", "Unpaid"], default: "Paid" }, { key: "customer", label: "Customer", type: "text" }] },
    { id: "inventory", name: "Stock", icon: "", group: "", description: "", enabled: true, fields: [{ key: "name", label: "Product", type: "text" }, { key: "on_hand", label: "On hand", type: "number" }] },
  ];
  const s = sampleRecords(mods);
  const sales = s.sales;
  if (!(sales.length > 300 && sales.every((x) => x.sample && (x.data.cost as number) < (x.data.amount as number)))) throw new Error("sales shape");
  if (s.inventory.length !== 12 || new Set(s.inventory.map((x) => x.data.name)).size !== 12 || s.inventory.some((x) => "date" in x.data)) throw new Error("register shape");
  const paid = sales.filter((x) => x.data.payment === "Paid").length / sales.length;
  if (paid < 0.85) throw new Error("old credit sales are collected " + paid);
  console.log(`sample self-check ok · ${sales.length} sales, ${s.inventory.length} stock items`);
}
