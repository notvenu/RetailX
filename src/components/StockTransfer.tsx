"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { transferStock } from "@/app/actions";
import type { RecordRow } from "@/lib/model";
import { failed } from "@/lib/result";
import { btnGhost, btnPrimary, control } from "@/components/ui";

const where = (r: RecordRow) => String(r.data.location || "Main");

/** Moves stock between branches and warehouses: one item, from its location to another, in one step. */
export function StockTransfer({ items, locations }: { items: RecordRow[]; locations: string[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ id: "", to: "", qty: "" });
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const it = items.find((r) => r.id === f.id);
  if (!open) return <button className={`${btnGhost} mt-4`} onClick={() => setOpen(true)}><ArrowRightLeft className="size-3.5" /> Transfer stock between locations</button>;
  return (
    <div className="mt-4 grid gap-2 rounded-sm border border-rule bg-surface p-3 text-[0.82rem] sm:grid-cols-[2fr_1fr_100px_auto]">
      <select className={control} aria-label="Item to move" value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })}>
        <option value="">Item and where it is now…</option>
        {items.filter((r) => Number(r.data.on_hand) > 0).map((r) => <option key={r.id} value={r.id}>{String(r.data.name)} · {where(r)} · {Number(r.data.on_hand)} on hand{r.data.batch ? ` · ${r.data.batch}` : ""}</option>)}
      </select>
      <input className={control} aria-label="Move to location" list="rx-locs" placeholder="To location" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
      <datalist id="rx-locs">{locations.filter((l) => !it || l !== where(it)).map((l) => <option key={l} value={l} />)}</datalist>
      <input className={control} aria-label="Quantity to move" inputMode="decimal" placeholder="Qty" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
      <button className={btnPrimary} disabled={pending} onClick={() => start(async () => {
        const r = await transferStock(f.id, f.to, Number(f.qty));
        if (failed(r)) return setMsg({ error: r.__error });
        setMsg({ ok: `Moved ${f.qty} to ${f.to}.` }); setF({ id: "", to: "", qty: "" }); router.refresh();
      })}>Move</button>
      {msg.error ? <p className="text-bad sm:col-span-4">{msg.error}</p> : msg.ok ? <p className="text-good sm:col-span-4">{msg.ok}</p> : null}
    </div>
  );
}
