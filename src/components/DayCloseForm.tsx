"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeDay } from "@/app/actions";
import { money, type Fmt } from "@/lib/format";
import { NOTES, r2 } from "@/lib/pos";
import { failed } from "@/lib/result";
import { btnGhost, btnPrimary, control, Label } from "@/components/ui";

/** Count the drawer by notes (or type the total), see over / short against what the books expect, close the day. */
export function DayCloseForm({ date, opening: open0, cashSales, cashExpenses, fmt, closedBefore }: {
  date: string; opening: number; cashSales: number; cashExpenses: number; fmt: Fmt; closedBefore: boolean;
}) {
  const [opening, setOpening] = useState(String(open0));
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const m = (n: number) => money(n, fmt);

  const fromNotes = r2(NOTES.reduce((s, n) => s + n * (parseInt(notes[n] ?? "") || 0), 0));
  const counted = typed !== "" ? parseFloat(typed) || 0 : fromNotes;
  const anyCount = typed !== "" || fromNotes > 0;
  const expected = r2((parseFloat(opening) || 0) + cashSales - cashExpenses);
  const diff = r2(counted - expected);

  const close = () => {
    if (!anyCount) return setMsg({ error: "Count the cash in the drawer first." });
    if (diff && !confirm(`Cash is ${diff > 0 ? "over" : "short"} by ${m(Math.abs(diff))}. Close the day with this difference?`)) return;
    start(async () => {
      const r = await closeDay({ date, opening: parseFloat(opening) || 0, counted, note });
      if (failed(r)) return setMsg({ error: r.__error });
      setMsg({ ok: `Day closed · cash ${diff ? `${diff > 0 ? "over" : "short"} by ${m(Math.abs(diff))}` : "matched"}. Saved to Day close.` });
      setNotes({}); setTyped(""); setNote("");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="grid content-start gap-4">
        <dl className="grid gap-1.5 text-[0.86rem]">
          <div className="flex items-center justify-between gap-4"><dt className="text-ink-soft">Opening cash</dt>
            <dd><input inputMode="decimal" aria-label="Opening cash" className={`${control} w-32 text-right tabular-nums`} value={opening} onChange={(e) => setOpening(e.target.value)} /></dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">+ Cash sales (net of cash refunds)</dt><dd className="tabular-nums">{m(cashSales)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">− Expenses paid in cash</dt><dd className="tabular-nums">{m(cashExpenses)}</dd></div>
          <div className="flex justify-between border-t border-rule pt-1.5 font-semibold"><dt>Should be in the drawer</dt><dd className="tabular-nums">{m(expected)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">Counted</dt><dd className="tabular-nums">{anyCount ? m(counted) : "—"}</dd></div>
          <div className="flex justify-between text-[1rem] font-semibold"><dt>Over / short</dt>
            <dd className={`tabular-nums ${!anyCount ? "text-ink-faint" : diff < 0 ? "text-bad" : diff > 0 ? "text-good" : "text-good"}`}>{!anyCount ? "—" : diff ? `${diff > 0 ? "+" : ""}${m(diff)}` : "Matched ✓"}</dd></div>
        </dl>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label text="Or type the total counted"><input inputMode="decimal" className={`${control} text-right tabular-nums`} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={fromNotes ? String(fromNotes) : "0"} /></Label>
          <Label text="Note (optional)"><input className={control} value={note} onChange={(e) => setNote(e.target.value)} placeholder="₹50 given for tea" /></Label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={btnPrimary} disabled={pending} onClick={close}>{pending ? "Closing…" : closedBefore ? "Close again" : "Close the day"}</button>
          <button className={btnGhost} onClick={() => window.print()}>Print Z report</button>
          <span aria-live="polite" className="text-[0.8rem]">{msg.error ? <span className="text-bad">{msg.error}</span> : msg.ok ? <span className="text-good">{msg.ok}</span> : null}</span>
        </div>
      </div>
      <fieldset className="grid content-start gap-1 print:hidden">
        <legend className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Count notes &amp; coins</legend>
        {NOTES.map((n) => (
          <label key={n} className="flex items-center gap-2 text-[0.84rem]">
            <span className="w-12 text-right tabular-nums">{fmt.currency === "INR" ? "₹" : ""}{n}</span><span className="text-ink-faint">×</span>
            <input inputMode="numeric" aria-label={`Number of ${n}s`} className={`${control} w-20 py-1 text-right tabular-nums`} value={notes[n] ?? ""}
              onChange={(e) => { setTyped(""); setNotes({ ...notes, [n]: e.target.value.replace(/\D/g, "") }); }} />
            <span className="ml-auto tabular-nums text-ink-faint">{notes[n] ? m(n * (parseInt(notes[n]) || 0)) : ""}</span>
          </label>
        ))}
        <div className="mt-1 flex justify-between border-t border-rule pt-1.5 text-[0.84rem] font-semibold"><span>From notes</span><span className="tabular-nums">{m(fromNotes)}</span></div>
      </fieldset>
    </div>
  );
}
