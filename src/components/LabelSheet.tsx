"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { money, type Fmt } from "@/lib/format";
import { code128Svg } from "@/lib/pos";
import { btnPrimary, btnQuiet, control } from "@/components/ui";

type Item = { id: string; name: string; code: string; price: number; onHand: number; category: string };

function Bars({ code }: { code: string }) {
  try {
    const b = code128Svg(code);
    return <svg viewBox={`0 0 ${b.width} ${b.height}`} preserveAspectRatio="none" className="h-10 w-full" role="img" aria-label={`Barcode ${code}`}><path d={b.d} fill="#000" /></svg>;
  } catch {
    return <p className="text-[0.6rem] text-bad">Code has characters a barcode can't hold</p>;
  }
}

/** Pick items and copies, print on A4 label sheets (3 across) or a label printer (the browser's page size decides). */
export function LabelSheet({ items, fmt, shop }: { items: Item[]; fmt: Fmt; shop: string }) {
  const [q, setQ] = useState("");
  const [copies, setCopies] = useState<Record<string, number>>({});
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return s ? items.filter((i) => `${i.name} ${i.code} ${i.category}`.toLowerCase().includes(s)) : items; }, [items, q]);
  const labels = items.flatMap((i) => Array.from({ length: copies[i.id] ?? 0 }, (_, k) => ({ ...i, k })));
  const setN = (id: string, n: number) => setCopies((c) => ({ ...c, [id]: Math.max(0, Math.min(500, n)) }));

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <input className={`${control} w-64`} placeholder="Find items" aria-label="Find items" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={btnQuiet} onClick={() => setCopies((c) => ({ ...c, ...Object.fromEntries(shown.filter((i) => i.code).map((i) => [i.id, Math.max(1, i.onHand)])) }))}>One per unit in stock</button>
        <button className={btnQuiet} onClick={() => setCopies((c) => ({ ...c, ...Object.fromEntries(shown.filter((i) => i.code).map((i) => [i.id, 1])) }))}>One each</button>
        <button className={btnQuiet} onClick={() => setCopies({})}>Clear</button>
        <button className={`${btnPrimary} ml-auto`} disabled={!labels.length} onClick={() => window.print()}><Printer className="size-3.5" /> Print {labels.length} label{labels.length === 1 ? "" : "s"}</button>
      </div>
      <ul className="mt-3 max-h-[45vh] divide-y divide-rule overflow-y-auto border-y border-rule print:hidden">
        {shown.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-1 py-1.5 text-[0.84rem]">
            <span className="min-w-0 flex-1 truncate"><span className="text-ink">{i.name}</span> <span className="text-[0.72rem] text-ink-faint">{i.code || "no barcode or SKU: add one in Stock"}</span></span>
            <span className="tabular-nums text-ink-soft">{money(i.price, fmt)}</span>
            <input type="number" min={0} aria-label={`Copies of ${i.name}`} disabled={!i.code} className={`${control} w-20 text-right tabular-nums`} value={copies[i.id] ?? 0} onChange={(e) => setN(i.id, parseInt(e.target.value) || 0)} />
          </li>
        ))}
      </ul>
      {labels.length ? (
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 print:mt-0 print:grid-cols-3 print:gap-1">
          {labels.map((l) => (
            <div key={l.id + l.k} className="break-inside-avoid rounded-sm border border-rule bg-white p-2 text-center text-black print:rounded-none print:border-[#ccc]">
              <p className="truncate text-[0.6rem] uppercase tracking-[0.08em] text-[#555]">{shop}</p>
              <p className="truncate text-[0.78rem] font-medium">{l.name}</p>
              <Bars code={l.code} />
              <p className="flex justify-between text-[0.68rem] tabular-nums"><span>{l.code}</span><span className="font-semibold">{money(l.price, fmt)}</span></p>
            </div>
          ))}
        </div>
      ) : <p className="mt-6 text-center text-[0.84rem] text-ink-faint print:hidden">Set how many labels of each item to print.</p>}
    </div>
  );
}
