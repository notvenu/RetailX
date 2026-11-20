"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowDownUp, ChevronUp, Columns3, Download, FileText, Filter, History, MessageCircle, Pencil, Plus, Receipt, RotateCcw, Save, Search, Trash2, Upload, X,
} from "lucide-react";
import { deleteRecord, deleteView, deletedRecords, importRecords, importTally, recordHistory, restoreRecord, saveRecord, saveView } from "@/app/actions";
import { isTallyXml } from "@/lib/extras";
import { ago, dateShort, fmtUnit, money, type Fmt } from "@/lib/format";
import { autoMap, bankToExpenses, looksLikeBankStatement } from "@/lib/importers";
import { upiLink, waLink } from "@/lib/links";
import { matches, toNum, todayIso as today } from "@/lib/metrics";
import { uid, type Condition, type Field, type ModuleDef, type RecordRow, type SavedView } from "@/lib/model";
import { Conditions } from "@/components/config/kpis";
import { useT } from "@/components/lang";
import { DataTable, Empty, StatusPill, btnGhost, btnPrimary, btnQuiet, control, type Column } from "@/components/ui";
import { failed, ok, orAlert } from "@/lib/result";

const PAGE = 50;

/** RFC 4180-ish: quoted fields, doubled quotes, commas/tabs/newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === "," || ch === "\t") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function display(f: Field, v: unknown, fmt: Fmt) {
  if (v == null || v === "") return <span className="text-ink-faint">—</span>;
  if (f.type === "money") return fmtUnit(toNum(v as number), "money", fmt);
  if (f.type === "number") return fmtUnit(toNum(v as number), "number", fmt);
  if (f.type === "date") return dateShort(String(v));
  if (f.type === "boolean") return v === true ? "Yes" : "";
  if (f.type === "select" && /status|stage|payment|on_time|billable/.test(f.key)) return <StatusPill>{String(v)}</StatusPill>;
  return <span className="line-clamp-2">{String(v)}</span>;
}

type Biz = { name: string; upiId?: string };

export function RecordsPanel({ module: mod, rows, fmt, views, biz, autoAdd }: {
  module: ModuleDef; rows: RecordRow[]; fmt: Fmt; views: SavedView[]; biz: Biz; autoAdd?: boolean;
}) {
  const tr = useT();
  const blank = useMemo(() => Object.fromEntries(mod.fields.map((f) => [f.key, f.default ?? (f.type === "date" && f.key === mod.dateField ? today() : "")])), [mod]);
  const [open, setOpen] = useState(true);
  const [values, setValues] = useState<Record<string, string>>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const [undo, setUndo] = useState<{ id: string; label: string } | null>(null);
  const [page, setPage] = useState(0);
  const [panel, setPanel] = useState<"import" | "bin" | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const firstRef = useRef<HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement>(null);

  // the current view: search, filters, columns, sort (saved views restore all four)
  const [view, setView] = useState<SavedView>({ id: "", name: "", q: "", where: [] });
  const [tools, setTools] = useState<"filter" | "columns" | null>(null);
  const columnsShown = view.columns?.length ? mod.fields.filter((f) => view.columns!.includes(f.key)) : mod.fields.slice(0, 8);

  useEffect(() => { if (autoAdd) firstRef.current?.focus(); }, [autoAdd]);

  const filtered = useMemo(() => {
    const s = (view.q ?? "").trim().toLowerCase();
    let list = rows.filter((r) => matches(r.data, view.where) && (!s || Object.values(r.data).some((v) => String(v).toLowerCase().includes(s))));
    const k = view.sort?.field ?? mod.dateField;
    if (k) {
      const dir = view.sort?.dir === "asc" ? 1 : -1;
      const type = mod.fields.find((f) => f.key === k)?.type;
      list = [...list].sort((a, b) => dir * (type === "money" || type === "number" ? toNum(a.data[k]) - toNum(b.data[k]) : String(a.data[k] ?? "").localeCompare(String(b.data[k] ?? ""))) || b.at.localeCompare(a.at));
    }
    return list;
  }, [rows, view, mod.dateField, mod.fields]);

  const totals = useMemo(
    () => mod.fields.filter((f) => f.type === "money").slice(0, 3).map((f) => ({ f, sum: filtered.reduce((s, r) => s + toNum(r.data[f.key]), 0) })),
    [filtered, mod.fields],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      try {
        const row = ok(await saveRecord(mod.id, values, editing ?? undefined));
        if (!editing) setAdded((a) => [row.id, ...a]);
        setEditing(null);
        // keep the date and choices from the last entry: the next one is usually the same day / branch
        setValues((v) => ({ ...blank, ...Object.fromEntries(mod.fields.filter((f) => f.type === "date" || f.type === "select").map((f) => [f.key, v[f.key]])) }));
        firstRef.current?.focus();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  const edit = (r: RecordRow) => {
    setEditing(r.id);
    setOpen(true);
    setValues(Object.fromEntries(mod.fields.map((f) => [f.key, String(r.data[f.key] ?? "")])));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = (r: RecordRow) =>
    start(async () => {
      await orAlert(deleteRecord(mod.id, r.id));
      setUndo({ id: r.id, label: String(Object.values(r.data).find((v) => typeof v === "string" && v.length > 1) ?? "Record") });
    });

  const exportCsv = () => {
    const lines = [mod.fields.map((f) => csvCell(f.label)).join(","), ...filtered.map((r) => mod.fields.map((f) => csvCell(r.data[f.key])).join(","))];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${mod.name.toLowerCase().replace(/\W+/g, "-")}-${today()}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const isSales = mod.id === "sales";
  const reminder = (r: RecordRow) => {
    const phone = String(r.data.phone ?? "");
    const amt = toNum(r.data.amount);
    if (!phone || r.data.payment === "Paid" || !amt) return null;
    const pay = biz.upiId ? `\nPay by UPI: ${upiLink({ upiId: biz.upiId, payee: biz.name, amount: amt, note: `Bill ${r.data.invoice ?? ""}` })}` : "";
    return waLink(phone, `Namaste ${r.data.customer ?? ""}, a gentle reminder from ${biz.name}: ${money(amt, fmt)} is due on bill ${r.data.invoice ?? ""} dated ${r.data.date ?? ""}.${pay}\nThank you!`);
  };

  const quoteLink = (r: RecordRow) => {
    const phone = String(r.data.phone ?? "");
    const amt = toNum(r.data.amount);
    if (!phone || !amt) return null;
    const until = r.data.valid_until ? ` Valid until ${r.data.valid_until}.` : "";
    return waLink(phone, `Namaste ${r.data.customer ?? ""}, here is your quotation ${r.data.quote_no ?? ""} from ${biz.name}: ${r.data.item ?? "as discussed"}${r.data.quantity ? ` × ${r.data.quantity}` : ""}, ${money(amt, fmt)}${Number(r.data.gst_rate) ? ` incl. ${r.data.gst_rate}% GST` : ""}.${until}${r.data.note ? `
${r.data.note}` : ""}
Reply YES to confirm. Thank you!`);
  };

  const columns: Column<RecordRow>[] = [
    ...columnsShown.map((f) => ({
      key: f.key,
      header: f.label,
      align: f.type === "money" || f.type === "number" ? ("right" as const) : undefined,
      render: (r: RecordRow) => (
        <>
          {display(f, r.data[f.key], fmt)}
          {r.sample && f === columnsShown[0] ? <span className="ml-1.5 rounded-sm bg-panel px-1 text-[0.6rem] uppercase text-ink-faint">sample</span> : null}
        </>
      ),
    })),
    {
      key: "_", header: "", width: isSales ? "8.5rem" : "6rem", render: (r) => {
        const remind = isSales ? reminder(r) : mod.id === "quotes" ? quoteLink(r) : null;
        return (
          <span className="flex justify-end gap-0.5">
            {remind ? <a className={btnQuiet} href={remind} target="_blank" rel="noreferrer" aria-label={isSales ? "Send payment reminder on WhatsApp" : "Send quotation on WhatsApp"} title={isSales ? "WhatsApp reminder" : "Send quote on WhatsApp"}><MessageCircle className="size-3.5 text-good" /></a> : null}
            {mod.id === "quotes" && r.data.status !== "Accepted" && r.data.status !== "Rejected" ? <Link className={btnQuiet} href={`/pos?quote=${r.id}`} aria-label="Bill this quotation at the counter" title="Bill at the counter"><Receipt className="size-3.5" /></Link> : null}
            {isSales ? <Link className={btnQuiet} href={`/invoice/${r.id}`} target="_blank" aria-label="Invoice" title="Invoice"><FileText className="size-3.5" /></Link> : null}
            <button className={btnQuiet} aria-label="Edit" title="Edit" onClick={() => edit(r)}><Pencil className="size-3.5" /></button>
            <button className={btnQuiet} aria-label={tr("rec.history")} title={tr("rec.history")} onClick={() => setHistory(history === r.id ? null : r.id)}><History className="size-3.5" /></button>
            <button className={btnQuiet} aria-label="Delete" title="Delete" disabled={pending} onClick={() => remove(r)}><Trash2 className="size-3.5" /></button>
          </span>
        );
      },
    },
  ];

  const sortField = view.sort?.field ?? mod.dateField ?? "";

  return (
    <div>
      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => { setOpen((o) => !o); setEditing(null); setValues(blank); }} aria-expanded={open} className={open ? btnGhost : btnPrimary}>
              {open ? <ChevronUp className="size-3.5" /> : <Plus className="size-3.5" />} {open ? tr("rec.hide") : tr("rec.add")}
            </button>
            <button className={btnGhost} aria-pressed={panel === "import"} onClick={() => setPanel(panel === "import" ? null : "import")}><Upload className="size-3.5" /> {tr("rec.import")}</button>
            <button className={btnGhost} onClick={exportCsv} disabled={!rows.length}><Download className="size-3.5" /> {tr("rec.export")}</button>
            <button className={btnGhost} aria-pressed={panel === "bin"} onClick={() => setPanel(panel === "bin" ? null : "bin")}><Trash2 className="size-3.5" /> {tr("rec.bin")}</button>
          </div>
          {added.length ? <span className="text-[0.78rem] text-good">{added.length} {tr("rec.added")}</span> : null}
        </div>

        {undo ? (
          <p role="status" className="mb-3 flex items-center justify-between gap-3 rounded-sm border border-rule bg-panel px-3 py-2 text-[0.8rem] text-ink-soft">
            <span>“{undo.label}” moved to the recycle bin.</span>
            <button className="font-medium text-accent hover:underline" onClick={() => start(async () => { await orAlert(restoreRecord(mod.id, undo.id)); setUndo(null); })}>{tr("rec.undo")}</button>
          </p>
        ) : null}

        {panel === "import" ? <Importer mod={mod} onDone={() => setPanel(null)} /> : null}
        {panel === "bin" ? <Bin mod={mod} fmt={fmt} onClose={() => setPanel(null)} /> : null}

        {open ? (
          <form onSubmit={submit} className={`mb-4 border p-3 ${editing ? "border-accent/40 bg-accent-wash/40" : "border-rule bg-panel/50"}`}>
            {editing ? <p className="mb-2 text-[0.78rem] font-medium text-accent">Editing a record. Saving runs your automations again.</p> : null}
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:flex sm:flex-wrap sm:items-end">
              {mod.fields.map((f, i) => (
                <label key={f.key} className={`flex flex-col gap-1 ${f.type === "longtext" ? "col-span-2 w-full" : "min-w-0 sm:min-w-[8.5rem] sm:flex-1"}`}>
                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                    {f.label}{f.required ? <span className="text-bad"> *</span> : null}
                  </span>
                  {f.type === "select" ? (
                    <select ref={i === 0 ? firstRef : undefined} required={f.required} value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={`${control} py-2 sm:py-1.5`}>
                      <option value="">{tr("rec.select")}</option>
                      {f.options?.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : f.type === "boolean" ? (
                    <input type="checkbox" aria-label={f.label} checked={values[f.key] === "true"} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked ? "true" : "" }))}
                      className="my-1.5 size-4 accent-[var(--color-accent)]" />
                  ) : f.type === "longtext" ? (
                    <textarea ref={i === 0 ? firstRef : undefined} rows={2} required={f.required} value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={control} />
                  ) : (
                    <input
                      ref={i === 0 ? firstRef : undefined}
                      required={f.required}
                      type={f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
                      inputMode={f.type === "money" || f.type === "number" ? "decimal" : f.type === "phone" ? "tel" : undefined}
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: f.type === "money" || f.type === "number" ? e.target.value.replace(/[^0-9.-]/g, "") : e.target.value }))}
                      className={`${control} py-2 sm:py-1.5 ${f.type === "money" || f.type === "number" ? "text-right tabular-nums" : ""}`}
                    />
                  )}
                </label>
              ))}
              <div className="col-span-2 flex gap-2">
                {editing ? <button type="button" className={btnQuiet} onClick={() => { setEditing(null); setValues(blank); }}>{tr("rec.cancel")}</button> : null}
                <button type="submit" disabled={pending} className={`${btnPrimary} flex-1 py-2.5 sm:flex-none sm:py-1.5`}>{editing ? tr("rec.save") : <><Plus className="size-3.5" /> {tr("rec.addbtn")}</>}</button>
              </div>
            </div>
            {error ? <p role="alert" className="mt-2 text-[0.8rem] text-bad">{error}</p> : null}
          </form>
        ) : null}
      </section>

      {rows.length ? (
        <section className="mt-6">
          <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-rule pb-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
              <input aria-label={tr("rec.search")} className={`${control} w-48 pl-7`} placeholder={tr("rec.search")} value={view.q ?? ""} onChange={(e) => { setView({ ...view, q: e.target.value }); setPage(0); }} />
            </label>
            <button className={btnQuiet} aria-pressed={tools === "filter"} onClick={() => setTools(tools === "filter" ? null : "filter")}>
              <Filter className="size-3.5" /> Filter{view.where.length ? ` (${view.where.length})` : ""}
            </button>
            <button className={btnQuiet} aria-pressed={tools === "columns"} onClick={() => setTools(tools === "columns" ? null : "columns")}><Columns3 className="size-3.5" /> Columns</button>
            <label className="flex items-center gap-1 text-[0.78rem] text-ink-soft">
              <ArrowDownUp className="size-3.5" />
              <select aria-label="Sort by" className={`${control} py-1`} value={sortField} onChange={(e) => setView({ ...view, sort: { field: e.target.value, dir: view.sort?.dir ?? "desc" } })}>
                {mod.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <button className={btnQuiet} onClick={() => setView({ ...view, sort: { field: sortField, dir: view.sort?.dir === "asc" ? "desc" : "asc" } })}>{view.sort?.dir === "asc" ? "↑" : "↓"}</button>
            </label>
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              <span className="text-[0.72rem] text-ink-faint">{tr("rec.views")}:</span>
              {views.map((v) => (
                <span key={v.id} className={`inline-flex items-center rounded-full border text-[0.74rem] ${view.id === v.id ? "border-accent bg-accent-wash text-accent" : "border-rule-strong text-ink-soft"}`}>
                  <button className="py-0.5 pl-2.5 pr-1" onClick={() => setView(v)}>{v.name}</button>
                  <button aria-label={`Delete view ${v.name}`} className="pr-1.5 opacity-60 hover:opacity-100" onClick={() => start(async () => { await orAlert(deleteView(mod.id, v.id)); })}><X className="size-3" /></button>
                </span>
              ))}
              <button className={btnQuiet} onClick={() => {
                const name = prompt("Name this view", view.name || "My view")?.trim();
                if (name) start(async () => { const v = { ...view, id: view.id || uid("v_"), name }; await orAlert(saveView(mod.id, v)); setView(v); });
              }}><Save className="size-3.5" /> {tr("rec.saveview")}</button>
              {view.id || view.where.length || view.q || view.columns ? <button className={btnQuiet} onClick={() => setView({ id: "", name: "", q: "", where: [] })}>Clear</button> : null}
            </span>
          </div>
          {tools === "filter" ? (
            <div className="mb-3 border border-rule bg-panel/40 p-3">
              <Conditions module={mod} conditions={view.where} onChange={(where: Condition[]) => { setView({ ...view, where }); setPage(0); }} />
            </div>
          ) : null}
          {tools === "columns" ? (
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 border border-rule bg-panel/40 p-3 text-[0.8rem]">
              {mod.fields.map((f) => (
                <label key={f.key} className="flex items-center gap-1.5 text-ink-soft">
                  <input type="checkbox" className="accent-[var(--color-accent)]" checked={columnsShown.includes(f)}
                    onChange={(e) => setView({ ...view, columns: (e.target.checked ? [...columnsShown, f] : columnsShown.filter((x) => x !== f)).map((x) => x.key) })} />
                  {f.label}
                </label>
              ))}
            </div>
          ) : null}
          <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-[0.78rem] text-ink-soft">
            <span><span className="font-semibold text-ink">{filtered.length.toLocaleString("en-IN")}</span> {tr("rec.records")}</span>
            {totals.map((t) => <span key={t.f.key}>{t.f.label} <span className="font-semibold tabular-nums text-ink">{fmtUnit(t.sum, "money", fmt)}</span></span>)}
          </div>
          {history ? <HistoryPanel mod={mod} id={history} fmt={fmt} onClose={() => setHistory(null)} /> : null}
          <DataTable columns={columns} rows={filtered.slice(page * PAGE, page * PAGE + PAGE)} getKey={(r) => r.id}
            rowClassName={(r) => (added.includes(r.id) ? "bg-accent-wash" : editing === r.id || history === r.id ? "bg-panel" : "")} />
          {filtered.length > PAGE ? (
            <div className="mt-3 flex items-center justify-end gap-2 text-[0.78rem] text-ink-soft">
              <button className={btnQuiet} disabled={!page} onClick={() => setPage(page - 1)}>Previous</button>
              <span>{page + 1} / {Math.ceil(filtered.length / PAGE)}</span>
              <button className={btnQuiet} disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          ) : null}
        </section>
      ) : (
        <div className="mt-8">
          <Empty title={tr("rec.empty")}>
            Add your first record above, or import a spreadsheet from Excel, Tally, Vyapar, Busy or your bank. History you import powers your KPIs, forecasts and AI briefings straight away.
          </Empty>
        </div>
      )}
    </div>
  );
}

type AuditRow = Awaited<ReturnType<typeof recordHistory>>[number];

function HistoryPanel({ mod, id, fmt, onClose }: { mod: ModuleDef; id: string; fmt: Fmt; onClose: () => void }) {
  const [items, setItems] = useState<AuditRow[] | null>(null);
  useEffect(() => { recordHistory(mod.id, id).then(setItems).catch(() => setItems([])); }, [mod.id, id]);
  const label = (k: string) => mod.fields.find((f) => f.key === k)?.label ?? k;
  const show = (k: string, v: unknown) => { const f = mod.fields.find((x) => x.key === k); return f?.type === "money" ? money(toNum(v as number), fmt) : String(v ?? "—"); };
  return (
    <div className="mb-3 border border-rule bg-panel/40 p-3 text-[0.8rem]">
      <div className="mb-2 flex justify-between"><span className="font-medium text-ink">History of this record</span><button aria-label="Close history" onClick={onClose}><X className="size-3.5 text-ink-faint" /></button></div>
      {!items ? <p className="text-ink-faint">Loading…</p> : !items.length ? <p className="text-ink-faint">No changes recorded (it was added before the audit trail existed, or imported).</p> : (
        <ol className="space-y-2">
          {items.map((e) => {
            const before = (e.before ?? {}) as Record<string, unknown>, after = (e.after ?? {}) as Record<string, unknown>;
            const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => String(before[k] ?? "") !== String(after[k] ?? ""));
            return (
              <li key={e.id}>
                <span className="text-ink">{e.summary}</span> <span suppressHydrationWarning className="text-ink-faint">· {e.actor} · {ago(e.at)}</span>
                {e.action === "update" && changed.length ? (
                  <ul className="mt-0.5 pl-3 text-[0.75rem] text-ink-soft">
                    {changed.map((k) => <li key={k}>{label(k)}: <s className="text-ink-faint">{show(k, before[k])}</s> → {show(k, after[k])}</li>)}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

type Deleted = Awaited<ReturnType<typeof deletedRecords>>[number];

function Bin({ mod, fmt, onClose }: { mod: ModuleDef; fmt: Fmt; onClose: () => void }) {
  const tr = useT();
  const [items, setItems] = useState<Deleted[] | null>(null);
  const [pending, start] = useTransition();
  const load = () => deletedRecords(mod.id).then(setItems).catch(() => setItems([]));
  useEffect(() => { void load(); }, [mod.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = mod.fields.find((f) => f.type === "text")?.key, amount = mod.fields.find((f) => f.type === "money")?.key;
  return (
    <div className="mb-4 border border-rule bg-panel/50 p-4">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <p className="text-[0.88rem] font-medium text-ink">{tr("rec.bin")}</p>
          <p className="text-[0.76rem] text-ink-faint">Deleted records stay here for 30 days, then they&apos;re gone for good.</p>
        </div>
        <button className={btnQuiet} aria-label="Close recycle bin" onClick={onClose}><X className="size-4" /></button>
      </div>
      {!items ? <p className="text-[0.8rem] text-ink-faint">Loading…</p> : !items.length ? <p className="text-[0.8rem] text-ink-faint">Empty.</p> : (
        <ul className="divide-y divide-rule text-[0.8rem]">
          {items.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="truncate text-ink-soft">
                {String((first && r.data[first]) || (mod.dateField && r.data[mod.dateField]) || r.id)}
                {amount && r.data[amount] ? ` · ${money(toNum(r.data[amount]), fmt)}` : ""}
                <span suppressHydrationWarning className="ml-2 text-ink-faint">{tr("rec.deleted")} {ago(r.deletedAt)}</span>
              </span>
              <button className={btnQuiet} disabled={pending} onClick={() => start(async () => { await orAlert(restoreRecord(mod.id, r.id)); await load(); })}>
                <RotateCcw className="size-3.5" /> {tr("rec.restore")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Importer({ mod, onDone }: { mod: ModuleDef; onDone: () => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ added: number; skipped: string[] } | null>(null);
  const [tallyMsg, setTallyMsg] = useState("");
  const [pending, start] = useTransition();
  // a Tally masters XML (customers or stock) imports in one go, without column mapping
  const tally = (mod.id === "customers" || mod.id === "inventory") && isTallyXml(text);
  const parsed = useMemo(() => (tally ? [] : parseCsv(text)), [text, tally]);
  const header = useMemo(() => parsed[0] ?? [], [parsed]);
  const bank = mod.id === "expenses" && looksLikeBankStatement(header);
  const [map, setMap] = useState<(string | null)[]>([]);
  useEffect(() => setMap(autoMap(header, mod)), [header, mod]);
  const body = parsed.slice(1);

  const rowsToImport = (): Record<string, string>[] =>
    bank
      ? bankToExpenses(header, body, mod.fields.find((f) => f.key === "category")?.options ?? [])
      : body.map((cells) => Object.fromEntries(map.map((k, i) => [k, cells[i] ?? ""]).filter(([k]) => k)) as Record<string, string>);

  return (
    <div className="mb-4 space-y-3 border border-rule bg-panel/50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.88rem] font-medium text-ink">Import {mod.name.toLowerCase()} from a spreadsheet</p>
          <p className="text-[0.76rem] text-ink-faint">
            Paste rows from Excel or Google Sheets, or choose a CSV exported from Tally, Vyapar, Busy or your bank. Column names are matched
            automatically; fix any below. Dates as DD/MM/YYYY or YYYY-MM-DD.{mod.id === "expenses" ? " A bank statement becomes expenses: debits only, categorised from the narration." : ""}
          </p>
        </div>
        <button className={btnQuiet} aria-label="Close import" onClick={onDone}><X className="size-4" /></button>
      </div>
      {mod.id === "customers" || mod.id === "inventory" ? <p className="text-[0.76rem] text-ink-faint">From Tally: Display More Reports → List of Accounts (or Stock Items) → Export as XML, then choose that file. Customers and stock items come in together; names already here are skipped.</p> : null}
      <input type="file" accept=".csv,text/csv,.tsv,.txt,.xml,text/xml" className="text-[0.8rem] text-ink-soft" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setText(await file.text()); }} />
      <textarea rows={5} className={`${control} w-full font-mono text-[0.75rem]`} placeholder={mod.fields.map((f) => f.label).join(",")} value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} />
      {tally ? (
        <div className="grid gap-2">
          <p className="text-[0.8rem] text-accent">Looks like a Tally export.</p>
          <button className={`${btnPrimary} w-fit`} disabled={pending} onClick={() => start(async () => {
            const r = await importTally(text);
            if (failed(r)) return setTallyMsg(r.__error);
            setTallyMsg(`Imported ${r.customers} customers and ${r.items} stock items${r.skipped ? `, skipped ${r.skipped} already here` : ""}.${r.openingDues ? ` Customers owed ${r.openingDues} in Tally: add it as a journal entry (debit Debtors, credit Opening balances) so Books carries it.` : ""}`);
            setText("");
          })}><Upload className="size-3.5" /> {pending ? "Importing…" : "Import from Tally"}</button>
        </div>
      ) : null}
      {tallyMsg ? <p className="text-[0.8rem] text-ink">{tallyMsg}</p> : null}
      {header.length && bank ? (
        <p className="text-[0.8rem] text-accent">Looks like a bank statement: {rowsToImport().length} debits will become expenses.</p>
      ) : header.length ? (
        <div>
          <p className="mb-1.5 text-[0.78rem] text-ink-soft">{body.length} rows · {map.filter(Boolean).length} of {header.length} columns matched</p>
          <div className="flex flex-wrap gap-2">
            {header.map((h, i) => (
              <label key={i} className="flex items-center gap-1.5 rounded-sm border border-rule bg-surface px-2 py-1 text-[0.75rem]">
                <span className="max-w-[9rem] truncate text-ink-soft" title={h}>{h || `Column ${i + 1}`}</span>→
                <select aria-label={`Field for ${h}`} className={`${control} py-0.5 text-[0.75rem] ${map[i] ? "" : "text-ink-faint"}`} value={map[i] ?? ""}
                  onChange={(e) => setMap(map.map((m, j) => (j === i ? e.target.value || null : m)))}>
                  <option value="">Skip</option>
                  {mod.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      {result ? (
        <div className="text-[0.8rem]">
          <p className="text-good">Imported {result.added} records.</p>
          {result.skipped.map((s) => <p key={s} className="text-bad">{s}</p>)}
        </div>
      ) : null}
      <button className={btnPrimary} disabled={pending || !body.length || (!bank && !map.some(Boolean))}
        onClick={() => start(async () => { const r = await orAlert(importRecords(mod.id, rowsToImport())); if (!failed(r)) { setResult(r); setText(""); } })}>
        <Upload className="size-3.5" /> {pending ? "Importing…" : `Import ${bank ? rowsToImport().length : body.length} rows`}
      </button>
    </div>
  );
}
