"use client";

import { useState } from "react";
import { FileScan } from "lucide-react";
import { nameOf, parseBill, type DraftLine } from "@/lib/billparse";
import type { RecordRow } from "@/lib/model";
import type { CartLine } from "@/lib/pos";
import { btnGhost, btnPrimary, control } from "@/components/ui";

type Row = DraftLine & { use: boolean; name: string };
export type Scanned = { lines: CartLine[]; supplier: string; gstin: string; billNo: string };

/**
 * Photo of a supplier bill → stock-in lines, with free OCR in the browser (Tesseract; ~15 MB downloaded the first
 * time, then cached). Every line is reviewed before it reaches the bill; nothing is saved from here.
 */
export function ScanBill({ items, ownGstin, onDone }: { items: RecordRow[]; ownGstin?: string; onDone: (s: Scanned) => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [head, setHead] = useState({ supplier: "", gstin: "", billNo: "" });

  const scan = async (file: File) => {
    setErr(""); setBusy(0);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, { logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") setBusy(m.progress); } });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      const b = parseBill(data.text, items, ownGstin);
      if (!b.lines.length) { setErr("No item lines found. Try a flatter, brighter photo, or type the lines in."); return; }
      const first = data.text.split(/\r?\n/).map((x: string) => x.trim()).find((x: string) => /[a-z]{3}/i.test(x)) ?? "";
      setHead({ supplier: first.replace(/gstin.*$/i, "").trim().slice(0, 60), gstin: b.gstin ?? "", billNo: b.no ?? "" });
      setRows(b.lines.map((l) => ({ ...l, use: true, name: l.itemId ? String(items.find((i) => i.id === l.itemId)?.data.name ?? "") : nameOf(l.text) })));
    } catch {
      setErr("The scanner couldn't start. It needs internet the first time to download the reader.");
    } finally { setBusy(null); }
  };
  const upd = (i: number, p: Partial<Row>) => setRows((r) => r!.map((x, j) => (j === i ? { ...x, ...p } : x)));

  if (!rows) return (
    <span className="inline-flex items-center gap-2">
      <label className={`${btnGhost} cursor-pointer`}>
        <FileScan className="size-3.5" /> {busy != null ? `Reading… ${Math.round(busy * 100)}%` : "Scan supplier bill"}
        <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy != null} onChange={(e) => { const f = e.target.files?.[0]; if (f) void scan(f); e.target.value = ""; }} />
      </label>
      {err ? <span className="text-[0.76rem] text-bad">{err}</span> : null}
    </span>
  );
  return (
    <div className="mt-3 grid gap-2 rounded-sm border border-rule bg-surface p-3 text-[0.8rem]">
      <p className="font-semibold text-ink">Check what the scan read{head.billNo ? ` · bill ${head.billNo}` : ""}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={control} aria-label="Supplier" placeholder="Supplier" value={head.supplier} onChange={(e) => setHead({ ...head, supplier: e.target.value })} />
        <input className={control} aria-label="Supplier GSTIN" placeholder="Supplier GSTIN" value={head.gstin} onChange={(e) => setHead({ ...head, gstin: e.target.value.toUpperCase() })} />
      </div>
      <table className="w-full">
        <thead><tr className="text-left text-[0.66rem] uppercase tracking-[0.1em] text-ink-faint"><th /><th className="py-1">Item</th><th className="w-16">Qty</th><th className="w-24">Rate</th><th className="w-16">GST %</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-rule/70 align-top">
              <td className="py-1.5 pr-1"><input type="checkbox" aria-label={`Use line ${i + 1}`} checked={r.use} onChange={(e) => upd(i, { use: e.target.checked })} className="size-4 accent-[var(--color-accent)]" /></td>
              <td className="py-1 pr-2">
                <select className={`${control} w-full`} aria-label={`Line ${i + 1} stock item`} value={r.itemId ?? ""} onChange={(e) => upd(i, { itemId: e.target.value || null, name: e.target.value ? String(items.find((x) => x.id === e.target.value)?.data.name ?? "") : nameOf(r.text) })}>
                  <option value="">Not in stock list: {nameOf(r.text)}</option>
                  {items.map((it) => <option key={it.id} value={it.id}>{String(it.data.name)}</option>)}
                </select>
                <span className="block truncate text-[0.7rem] text-ink-faint" title={r.text}>{r.text}{r.expiry ? ` · exp ${r.expiry}` : ""}{r.guessed ? " · qty guessed, check it" : ""}</span>
              </td>
              <td className="py-1 pr-2"><input className={`${control} w-full text-right`} aria-label={`Line ${i + 1} quantity`} value={r.qty} onChange={(e) => upd(i, { qty: Number(e.target.value) || 0 })} /></td>
              <td className="py-1 pr-2"><input className={`${control} w-full text-right`} aria-label={`Line ${i + 1} rate before GST`} value={r.rate} onChange={(e) => upd(i, { rate: Number(e.target.value) || 0 })} /></td>
              <td className="py-1"><input className={`${control} w-full text-right`} aria-label={`Line ${i + 1} GST`} value={r.gst ?? ""} onChange={(e) => upd(i, { gst: e.target.value === "" ? null : Number(e.target.value) })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[0.74rem] text-ink-faint">Rates are before GST, as bills print them; the bill adds GST. Lines not in your stock list come in as one-off lines: add them to Stock to track them.</p>
      <div className="flex gap-2">
        <button className={btnPrimary} onClick={() => {
          onDone({
            supplier: head.supplier, gstin: head.gstin, billNo: head.billNo,
            lines: rows.filter((r) => r.use && r.qty > 0).map((r) => ({ itemId: r.itemId ?? undefined, name: r.name, qty: r.qty, rate: Math.round(r.rate * (1 + (r.gst ?? 0) / 100) * 100) / 100, gst: r.gst ?? 0, hsn: r.hsn ?? undefined })),
          });
          setRows(null);
        }}>Add {rows.filter((r) => r.use).length} lines to the bill</button>
        <button className={btnGhost} onClick={() => setRows(null)}>Discard</button>
      </div>
    </div>
  );
}
