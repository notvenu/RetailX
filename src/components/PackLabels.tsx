"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { parseNutrition } from "@/lib/extras";
import { money, type Fmt } from "@/lib/format";
import { btnPrimary, btnQuiet, control } from "@/components/ui";

export type PackItem = {
  id: string; name: string; price: number; mrp: number; batch: string; expiry: string;
  ingredients: string; nutrition: string; serving: string; veg: string; allergens: string; howTo: string; fssai: string;
  certificate: string; certBy: string; certUntil: string;
};

/** The FSSAI-style veg / non-veg mark: a square with a dot, green or brown. */
const Mark = ({ veg }: { veg: string }) => !veg ? null : (
  <span aria-label={veg} title={veg} className="inline-grid size-3.5 place-items-center border-2" style={{ borderColor: veg === "Veg" ? "#1a7f37" : "#7a3e00" }}>
    <span className="size-1.5 rounded-full" style={{ background: veg === "Veg" ? "#1a7f37" : "#7a3e00" }} />
  </span>
);

function CertQr({ url }: { url: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => { let live = true; import("qrcode").then((Q) => Q.toDataURL(url, { margin: 0, width: 96 })).then((d) => { if (live) setSrc(d); }, () => {}); return () => { live = false; }; }, [url]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="QR code to the certificate" width={56} height={56} /> : null;
}

/**
 * Pack labels with what the switched-on features hold: nutrition per serving, ingredients, allergens, veg mark and
 * FSSAI number (Nutrition labels), and a QR to the lab report or certificate (Product certificates).
 */
export function PackLabels({ items, fmt, shop, nutrition, certificates }: { items: PackItem[]; fmt: Fmt; shop: string; nutrition: boolean; certificates: boolean }) {
  const [q, setQ] = useState("");
  const [copies, setCopies] = useState<Record<string, number>>({});
  const ready = items.filter((i) => (nutrition && (i.nutrition || i.ingredients)) || (certificates && i.certificate));
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return s ? ready.filter((i) => i.name.toLowerCase().includes(s)) : ready; }, [ready, q]);
  const labels = ready.flatMap((i) => Array.from({ length: copies[i.id] ?? 0 }, (_, k) => ({ ...i, k })));
  const m = (n: number) => money(n, fmt);
  if (!ready.length) return <p className="mt-6 text-[0.86rem] text-ink-soft">No stock item has {nutrition ? "nutrition or ingredients" : ""}{nutrition && certificates ? " or " : ""}{certificates ? "a certificate link" : ""} yet. Add them on the Stock page, then print here.</p>;
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <input className={`${control} w-64`} placeholder="Find items" aria-label="Find items" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={btnQuiet} onClick={() => setCopies((c) => ({ ...c, ...Object.fromEntries(shown.map((i) => [i.id, 1])) }))}>One each</button>
        <button className={btnQuiet} onClick={() => setCopies({})}>Clear</button>
        <button className={`${btnPrimary} ml-auto`} disabled={!labels.length} onClick={() => window.print()}><Printer className="size-3.5" /> Print {labels.length} pack label{labels.length === 1 ? "" : "s"}</button>
      </div>
      <ul className="mt-3 max-h-[35vh] divide-y divide-rule overflow-y-auto border-y border-rule print:hidden">
        {shown.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-1 py-1.5 text-[0.84rem]">
            <span className="min-w-0 flex-1 truncate text-ink">{i.name}</span>
            <input type="number" min={0} aria-label={`Pack labels for ${i.name}`} className={`${control} w-20 text-right tabular-nums`} value={copies[i.id] ?? 0} onChange={(e) => setCopies((c) => ({ ...c, [i.id]: Math.max(0, Math.min(200, parseInt(e.target.value) || 0)) }))} />
          </li>
        ))}
      </ul>
      {labels.length ? (
        <div className="mt-6 grid gap-2 sm:grid-cols-2 print:mt-0 print:grid-cols-2 print:gap-1">
          {labels.map((l) => {
            const rows = nutrition ? parseNutrition(l.nutrition) : [];
            return (
              <article key={l.id + l.k} className="break-inside-avoid rounded-sm border border-[#999] bg-white p-3 text-[0.68rem] leading-snug text-black print:rounded-none">
                <header className="flex items-start justify-between gap-2 border-b border-black pb-1">
                  <div className="min-w-0"><p className="text-[0.86rem] font-semibold">{l.name}</p><p className="text-[#444]">{shop}</p></div>
                  {nutrition ? <Mark veg={l.veg} /> : null}
                </header>
                {nutrition && rows.length ? (
                  <table className="mt-1 w-full border-collapse">
                    <caption className="text-left font-semibold">Nutrition{l.serving ? ` per ${l.serving}` : " per serving"}</caption>
                    <tbody>{rows.map((r) => <tr key={r.name} className="border-b border-[#ccc]"><td className="py-0.5">{r.name}</td><td className="py-0.5 text-right tabular-nums">{r.value}</td></tr>)}</tbody>
                  </table>
                ) : null}
                {nutrition && l.ingredients ? <p className="mt-1"><span className="font-semibold">Ingredients: </span>{l.ingredients}</p> : null}
                {nutrition && l.allergens ? <p className="mt-0.5"><span className="font-semibold">Allergens: </span>{l.allergens}</p> : null}
                {nutrition && l.howTo ? <p className="mt-0.5"><span className="font-semibold">How to use: </span>{l.howTo}</p> : null}
                <footer className="mt-1.5 flex items-end justify-between gap-2 border-t border-black pt-1">
                  <div>
                    {l.mrp || l.price ? <p className="font-semibold">MRP {m(l.mrp || l.price)} (incl. of all taxes)</p> : null}
                    {l.batch ? <p>Batch {l.batch}</p> : null}
                    {l.expiry ? <p>Best before {l.expiry}</p> : null}
                    {nutrition && l.fssai ? <p>FSSAI Lic. No. {l.fssai}</p> : null}
                    {certificates && l.certificate ? <p>Certified{l.certBy ? ` by ${l.certBy}` : ""}{l.certUntil ? ` · valid until ${l.certUntil}` : ""}</p> : null}
                  </div>
                  {certificates && l.certificate ? <div className="text-center"><CertQr url={l.certificate} /><p className="text-[0.55rem]">Scan for the report</p></div> : null}
                </footer>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
