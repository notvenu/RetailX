"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { DataTable, StatusPill, type Column } from "@/components/ui";
import { money, num, pct } from "@/lib/format";
import {
  SALES, PRODUCTS, PURCHASE_ORDERS, EMPLOYEES, EXPENSE_ENTRIES,
  BRANCHES, SUPPLIERS, EXPENSES, stockStatus,
} from "@/lib/mock";

const PREFIX = "retailx:v1:";

function useCollection<T>(storageKey: string, seed: T[]) {
  const key = PREFIX + storageKey;
  const [rows, setRows] = useState<T[]>(seed);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        setRows(JSON.parse(raw) as T[]);
        setDirty(true);
      }
    } catch {
      /* private mode / disabled storage — stay on seed */
    }
  }, [key]);

  const add = (rec: T) => {
    setRows((prev) => {
      const next = [rec, ...prev];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    setDirty(true);
  };

  const reset = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setRows(seed);
    setDirty(false);
  };

  return { rows, add, reset, dirty };
}

export type FormField = {
  name: string;
  label: string;
  type: "text" | "number" | "money" | "select" | "date";
  options?: string[];
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
};

export function CollectionPanel<T>({
  title,
  meta,
  storageKey,
  seed,
  columns,
  getKey,
  fields,
  build,
  addLabel,
  role,
}: {
  title: string;
  meta?: string;
  storageKey: string;
  seed: T[];
  columns: Column<T>[];
  getKey: (row: T, i: number) => string | number;
  fields: FormField[];
  build: (values: Record<string, string>) => T;
  addLabel: string;
  /** who is entering the record — stamped into the confirmation line */
  role?: string;
}) {
  const { rows, add, reset, dirty } = useCollection(storageKey, seed);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  const blank = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? ""])),
    [fields],
  );

  const start = () => {
    setValues(blank);
    setError(null);
    setOpen(true);
    setJustAdded(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing = fields.filter((f) => f.required && !String(values[f.name] ?? "").trim());
    if (missing.length) {
      setError(`Fill in: ${missing.map((f) => f.label).join(", ")}.`);
      return;
    }
    add(build(values));
    setOpen(false);
    setJustAdded(true);
  };

  return (
    <section className="mt-10 first:mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-2">
        <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">
          {title}
        </h2>
        <div className="flex items-center gap-3 text-[0.78rem]">
          {meta ? <span className="text-ink-faint">{meta}</span> : null}
          {dirty ? (
            <button onClick={reset} className="text-ink-faint underline-offset-2 hover:text-ink hover:underline">
              Reset
            </button>
          ) : null}
          <button
            onClick={() => (open ? setOpen(false) : start())}
            className="inline-flex items-center gap-1 rounded-[4px] bg-accent px-2.5 py-1 text-[0.76rem] font-medium text-white transition-colors hover:bg-accent-hover"
          >
            {open ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            {open ? "Cancel" : addLabel}
          </button>
        </div>
      </div>

      {open ? (
        <form
          onSubmit={submit}
          className="mb-4 grid gap-x-5 gap-y-3 border border-rule bg-panel/50 p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {fields.map((f) => (
            <label key={f.name} className="flex flex-col gap-1">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                {f.label}
                {f.required ? <span className="text-bad"> *</span> : null}
              </span>
              {f.type === "select" ? (
                <select
                  name={f.name}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  className="rounded-[4px] border border-rule-strong bg-white px-2 py-1.5 text-[0.82rem] text-ink outline-none focus-visible:border-accent"
                >
                  <option value="">Select…</option>
                  {f.options?.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  name={f.name}
                  type={f.type === "date" ? "date" : "text"}
                  inputMode={f.type === "money" || f.type === "number" ? "numeric" : undefined}
                  placeholder={f.placeholder}
                  value={
                    f.type === "money" && values[f.name]
                      ? Number(String(values[f.name]).replace(/[^0-9]/g, "") || 0).toLocaleString("en-IN")
                      : values[f.name] ?? ""
                  }
                  onChange={(e) => {
                    const raw =
                      f.type === "money" || f.type === "number"
                        ? e.target.value.replace(/[^0-9.]/g, "")
                        : e.target.value;
                    setValues((v) => ({ ...v, [f.name]: raw }));
                  }}
                  className="rounded-[4px] border border-rule-strong bg-white px-2 py-1.5 text-[0.82rem] tabular-nums text-ink outline-none focus-visible:border-accent"
                />
              )}
            </label>
          ))}

          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="rounded-[4px] bg-accent px-4 py-1.5 text-[0.8rem] font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Save record
            </button>
            {error ? <span className="text-[0.78rem] text-bad">{error}</span> : null}
          </div>
        </form>
      ) : null}

      {justAdded ? (
        <p className="mb-3 rounded-[4px] border border-good/25 bg-good-wash px-3 py-1.5 text-[0.78rem] text-good">
          Record added{role ? ` by ${role}` : ""} and saved to this browser.
        </p>
      ) : null}

      <DataTable columns={columns} rows={rows} getKey={getKey} />
    </section>
  );
}

/* ============================================================
   Module presets — client-side, so render/build functions never
   cross the server→client boundary. Server pages pass only `role`.
   ============================================================ */

type RoleProp = { role?: string };
const branchNames = BRANCHES.map((b) => b.name);

export function SalesInvoices({ role }: RoleProp) {
  type Invoice = (typeof SALES)[number];
  return (
    <CollectionPanel<Invoice>
      title="Invoices"
      meta="recorded invoices save to this browser"
      storageKey="sales"
      seed={SALES}
      role={role}
      addLabel="Record invoice"
      getKey={(r, i) => `${r.invoice}-${i}`}
      fields={[
        { name: "customer", label: "Customer", type: "text", required: true, placeholder: "Walk-in" },
        { name: "branch", label: "Branch", type: "select", options: branchNames, required: true },
        { name: "date", label: "Date", type: "text", placeholder: "Today" },
        { name: "lines", label: "Line items", type: "number", required: true },
        { name: "total", label: "Invoice total", type: "money", required: true },
        { name: "marginPct", label: "Margin %", type: "number" },
        { name: "status", label: "Payment", type: "select", options: ["Paid", "Part-paid", "Unpaid"] },
      ]}
      build={(v) => ({
        invoice: "INV-" + Date.now().toString().slice(-5),
        date: v.date?.trim() || "Today",
        branch: v.branch,
        customer: v.customer,
        lines: Number(v.lines) || 0,
        total: Number(v.total) || 0,
        marginPct: Number(v.marginPct) || 0,
        status: v.status || "Paid",
      })}
      columns={[
        { key: "inv", header: "Invoice", render: (r) => <span className="font-medium">{r.invoice}</span> },
        { key: "date", header: "Date", render: (r) => <span className="text-ink-soft">{r.date}</span> },
        { key: "branch", header: "Branch", render: (r) => r.branch },
        { key: "cust", header: "Customer", render: (r) => r.customer },
        { key: "lines", header: "Lines", align: "right", render: (r) => r.lines },
        { key: "total", header: "Total", align: "right", render: (r) => money(r.total) },
        { key: "margin", header: "Margin", align: "right", render: (r) => pct(r.marginPct) },
        { key: "status", header: "Payment", align: "right", render: (r) => <StatusPill>{r.status}</StatusPill> },
      ]}
    />
  );
}

export function InventoryProducts({ role }: RoleProp) {
  type Product = (typeof PRODUCTS)[number];
  const cats = ["Staples", "Beverages", "Snacks", "Home care", "Dairy", "Spices"];
  return (
    <CollectionPanel<Product>
      title="Stock status by SKU"
      meta="reorder logic: on-hand vs reorder level"
      storageKey="products"
      seed={PRODUCTS}
      role={role}
      addLabel="Add product"
      getKey={(r, i) => `${r.sku}-${i}`}
      fields={[
        { name: "sku", label: "SKU", type: "text", required: true, placeholder: "GR-RICE-05" },
        { name: "name", label: "Product name", type: "text", required: true },
        { name: "category", label: "Category", type: "select", options: cats, required: true },
        { name: "onHand", label: "On hand", type: "number", required: true },
        { name: "reorder", label: "Reorder at", type: "number", required: true },
        { name: "units90d", label: "Units sold 90d", type: "number" },
        { name: "revenue90d", label: "Revenue 90d", type: "money" },
        { name: "marginPct", label: "Margin %", type: "number" },
      ]}
      build={(v) => ({
        sku: v.sku.toUpperCase(),
        name: v.name,
        category: v.category,
        onHand: Number(v.onHand) || 0,
        reorder: Number(v.reorder) || 0,
        units90d: Number(v.units90d) || 0,
        revenue90d: Number(v.revenue90d) || 0,
        marginPct: Number(v.marginPct) || 0,
      })}
      columns={[
        { key: "sku", header: "SKU", render: (r) => <span className="font-mono text-[0.78rem] text-ink-soft">{r.sku}</span> },
        { key: "name", header: "Product", render: (r) => <span className="font-medium">{r.name}</span> },
        { key: "cat", header: "Category", render: (r) => <span className="text-ink-soft">{r.category}</span> },
        { key: "onhand", header: "On hand", align: "right", render: (r) => num(r.onHand) },
        { key: "reorder", header: "Reorder at", align: "right", render: (r) => <span className="text-ink-soft">{num(r.reorder)}</span> },
        { key: "units", header: "Units 90d", align: "right", render: (r) => num(r.units90d) },
        { key: "rev", header: "Revenue 90d", align: "right", render: (r) => money(r.revenue90d) },
        { key: "margin", header: "Margin", align: "right", render: (r) => pct(r.marginPct) },
        { key: "status", header: "Status", align: "right", render: (r) => <StatusPill>{stockStatus(r)}</StatusPill> },
      ]}
    />
  );
}

export function PurchaseOrdersPanel({ role }: RoleProp) {
  type PO = (typeof PURCHASE_ORDERS)[number];
  return (
    <CollectionPanel<PO>
      title="Purchase orders"
      meta="raised orders save to this browser"
      storageKey="purchase-orders"
      seed={PURCHASE_ORDERS}
      role={role}
      addLabel="Raise PO"
      getKey={(r, i) => `${r.po}-${i}`}
      fields={[
        { name: "supplier", label: "Supplier", type: "select", options: SUPPLIERS.map((s) => s.name), required: true },
        { name: "branch", label: "Deliver to", type: "select", options: branchNames, required: true },
        { name: "ordered", label: "Order date", type: "text", placeholder: "Today" },
        { name: "expected", label: "Expected", type: "text", placeholder: "e.g. 08 Oct" },
        { name: "total", label: "Order value", type: "money", required: true },
        { name: "status", label: "Status", type: "select", options: ["In transit", "Received", "Overdue"] },
      ]}
      build={(v) => ({
        po: "PO-" + Date.now().toString().slice(-4),
        supplier: v.supplier,
        branch: v.branch,
        ordered: v.ordered?.trim() || "Today",
        expected: v.expected?.trim() || "TBC",
        total: Number(v.total) || 0,
        status: v.status || "In transit",
      })}
      columns={[
        { key: "po", header: "PO", render: (r) => <span className="font-medium">{r.po}</span> },
        { key: "supplier", header: "Supplier", render: (r) => r.supplier },
        { key: "branch", header: "Branch", render: (r) => <span className="text-ink-soft">{r.branch}</span> },
        { key: "ordered", header: "Ordered", render: (r) => <span className="text-ink-soft">{r.ordered}</span> },
        { key: "expected", header: "Expected", render: (r) => r.expected },
        { key: "total", header: "Value", align: "right", render: (r) => money(r.total) },
        { key: "status", header: "Status", align: "right", render: (r) => <StatusPill>{r.status}</StatusPill> },
      ]}
    />
  );
}

export function ExpensesPanel({ role }: RoleProp) {
  type ExpenseEntry = (typeof EXPENSE_ENTRIES)[number];
  return (
    <CollectionPanel<ExpenseEntry>
      title="Logged expenses"
      meta="entries save to this browser"
      storageKey="expenses"
      seed={EXPENSE_ENTRIES}
      role={role}
      addLabel="Log expense"
      getKey={(r, i) => `${r.date}-${r.vendor}-${i}`}
      fields={[
        { name: "date", label: "Date", type: "date" },
        { name: "category", label: "Category", type: "select", options: EXPENSES.map((e) => e.category), required: true },
        { name: "vendor", label: "Vendor / payee", type: "text", required: true },
        { name: "branch", label: "Branch", type: "select", options: ["All branches", ...branchNames], required: true },
        { name: "method", label: "Paid via", type: "select", options: ["Cash", "Bank", "Card", "UPI"] },
        { name: "amount", label: "Amount", type: "money", required: true },
      ]}
      build={(v) => ({
        date: v.date || new Date().toISOString().slice(0, 10),
        category: v.category,
        vendor: v.vendor,
        branch: v.branch,
        method: v.method || "Bank",
        amount: Number(v.amount) || 0,
      })}
      columns={[
        { key: "date", header: "Date", render: (r) => <span className="text-ink-soft">{r.date}</span> },
        { key: "cat", header: "Category", render: (r) => r.category },
        { key: "vendor", header: "Vendor", render: (r) => <span className="font-medium">{r.vendor}</span> },
        { key: "branch", header: "Branch", render: (r) => <span className="text-ink-soft">{r.branch}</span> },
        { key: "method", header: "Via", render: (r) => <span className="text-ink-soft">{r.method}</span> },
        { key: "amount", header: "Amount", align: "right", render: (r) => money(r.amount) },
      ]}
    />
  );
}

export function EmployeesPanel({ role }: RoleProp) {
  type Employee = (typeof EMPLOYEES)[number];
  const depts = ["Operations", "Finance", "Sales floor", "Warehouse", "Admin"];
  return (
    <CollectionPanel<Employee>
      title="Employee master"
      meta="new joiners save to this browser"
      storageKey="employees"
      seed={EMPLOYEES}
      role={role}
      addLabel="Add employee"
      getKey={(r, i) => `${r.code}-${i}`}
      fields={[
        { name: "code", label: "Employee code", type: "text", required: true, placeholder: "E-081" },
        { name: "name", label: "Full name", type: "text", required: true },
        { name: "branch", label: "Branch", type: "select", options: branchNames, required: true },
        { name: "dept", label: "Department", type: "select", options: depts, required: true },
        { name: "designation", label: "Designation", type: "text", required: true },
        { name: "joined", label: "Joining date", type: "date" },
        { name: "monthlyCTC", label: "Monthly CTC", type: "money", required: true },
        { name: "status", label: "Status", type: "select", options: ["Active", "Probation"] },
      ]}
      build={(v) => ({
        code: v.code.toUpperCase(),
        name: v.name,
        branch: v.branch,
        dept: v.dept,
        designation: v.designation,
        joined: v.joined || new Date().toISOString().slice(0, 10),
        monthlyCTC: Number(v.monthlyCTC) || 0,
        status: v.status || "Probation",
      })}
      columns={[
        { key: "code", header: "Code", render: (r) => <span className="font-mono text-[0.78rem] text-ink-soft">{r.code}</span> },
        { key: "name", header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
        { key: "branch", header: "Branch", render: (r) => r.branch },
        { key: "dept", header: "Department", render: (r) => <span className="text-ink-soft">{r.dept}</span> },
        { key: "role", header: "Designation", render: (r) => r.designation },
        { key: "joined", header: "Joined", render: (r) => <span className="text-ink-soft">{r.joined}</span> },
        { key: "ctc", header: "Monthly CTC", align: "right", render: (r) => money(r.monthlyCTC) },
        { key: "status", header: "Status", align: "right", render: (r) => <StatusPill>{r.status}</StatusPill> },
      ]}
    />
  );
}
