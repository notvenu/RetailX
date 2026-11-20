"use client";

import { useState } from "react";
import { Truck } from "lucide-react";
import { ewayJson, type Transport } from "@/lib/gst";
import type { RecordRow } from "@/lib/model";
import { btnGhost, control } from "@/components/ui";

/** Transport details, then the e-way bill JSON for this invoice to upload on ewaybillgst.gov.in (bulk generation). */
export function EwayBill({ lines, biz }: { lines: RecordRow[]; biz: { name: string; gstin?: string; state?: string; city?: string } }) {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState<Transport>({ mode: 1 });
  const set = (p: Partial<Transport>) => setT((x) => ({ ...x, ...p }));
  if (!open) return <button className={btnGhost} onClick={() => setOpen(true)}><Truck className="size-3.5" /> E-way bill</button>;
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(ewayJson(lines, biz, t), null, 2)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: `EWB_${String(lines[0]?.data.invoice ?? "invoice").replace(/\W+/g, "-")}.json` }).click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="grid w-full gap-2 rounded-sm border border-rule bg-surface p-3 text-[0.8rem] sm:grid-cols-3 print:hidden">
      <input className={control} aria-label="Vehicle number" placeholder="Vehicle no. (MH12AB1234)" value={t.vehicle ?? ""} onChange={(e) => set({ vehicle: e.target.value })} />
      <input className={control} aria-label="Distance in km" inputMode="numeric" placeholder="Distance (km)" value={t.distance ?? ""} onChange={(e) => set({ distance: Number(e.target.value) || undefined })} />
      <select className={control} aria-label="Transport mode" value={t.mode} onChange={(e) => set({ mode: +e.target.value })}>
        <option value={1}>Road</option><option value={2}>Rail</option><option value={3}>Air</option><option value={4}>Ship</option>
      </select>
      <input className={control} aria-label="Your pincode" inputMode="numeric" placeholder="From pincode" value={t.fromPin ?? ""} onChange={(e) => set({ fromPin: e.target.value })} />
      <input className={control} aria-label="Delivery pincode" inputMode="numeric" placeholder="To pincode" value={t.toPin ?? ""} onChange={(e) => set({ toPin: e.target.value })} />
      <input className={control} aria-label="Delivery place" placeholder="To place" value={t.toPlace ?? ""} onChange={(e) => set({ toPlace: e.target.value })} />
      <input className={control} aria-label="Transporter name" placeholder="Transporter (optional)" value={t.transporter ?? ""} onChange={(e) => set({ transporter: e.target.value })} />
      <input className={control} aria-label="Transporter ID" placeholder="Transporter GSTIN / ID" value={t.transporterId ?? ""} onChange={(e) => set({ transporterId: e.target.value })} />
      <button className={btnGhost} onClick={download} disabled={!t.distance}>Download JSON</button>
      <p className="text-ink-faint sm:col-span-3">Needed when goods over ₹50,000 move. Upload on ewaybillgst.gov.in → e-Waybill → Bulk generation.</p>
    </div>
  );
}
