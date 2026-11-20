"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startExpiryOffer } from "@/app/actions";
import { failed } from "@/lib/result";
import { btnGhost } from "@/components/ui";

export type ExpiryRow = { id: string; name: string; batch: string; daysLeft: number; qty: number; status: string; pct: number; price: string; offerPrice: string; recovered: string; advice: string };

/** Near-expiry stock with the offer that clears it profitably; one tap puts it live at the counter. */
export function ExpiryOffers({ rows, canAct }: { rows: ExpiryRow[]; canAct: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Record<string, string>>({});
  const router = useRouter();
  const go = (id: string) => start(async () => {
    const r = await startExpiryOffer(id);
    setMsg((m) => ({ ...m, [id]: failed(r) ? r.__error : `Live: ${r.pct}% off at the counter` }));
    if (!failed(r)) router.refresh();
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[0.84rem]">
        <thead>
          <tr className="border-b border-rule text-left text-[0.66rem] uppercase tracking-[0.1em] text-ink-faint">
            <th className="py-2 font-semibold">Product</th><th className="font-semibold">Expires</th><th className="text-right font-semibold">On hand</th>
            <th className="text-right font-semibold">Offer</th><th className="text-right font-semibold">Recovers</th><th className="pl-4 font-semibold">What to do</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-rule/70 align-top">
              <td className="py-2 pr-2"><span className="font-medium text-ink">{r.name}</span>{r.batch ? <span className="block text-[0.72rem] text-ink-faint">Batch {r.batch}</span> : null}</td>
              <td className="py-2">{r.daysLeft < 0 ? <span className="font-semibold text-bad">expired</span> : `in ${r.daysLeft} d`}</td>
              <td className="py-2 text-right tabular-nums">{r.qty}</td>
              <td className="py-2 text-right tabular-nums">{r.pct ? <>{r.pct}% · {r.offerPrice}<span className="block text-[0.72rem] text-ink-faint line-through">{r.price}</span></> : "—"}</td>
              <td className="py-2 text-right tabular-nums">{r.pct ? r.recovered : "—"}</td>
              <td className="py-2 pl-4 text-[0.8rem] text-ink-soft">
                {r.advice}
                {r.status === "suggested" && canAct ? <div className="mt-1"><button className={`${btnGhost} px-2 py-1 text-[0.76rem]`} disabled={pending} onClick={() => go(r.id)}>Put {r.pct}% off live</button></div> : null}
                {msg[r.id] ? <p className="mt-1 text-[0.76rem] font-medium text-good">{msg[r.id]}</p> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
