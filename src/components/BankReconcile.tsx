"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchOnModules } from "@/app/actions";
import { parseBankCsv, reconcile, type Posting } from "@/lib/books";
import { money, type Fmt } from "@/lib/format";
import { failed } from "@/lib/result";
import { btnGhost, control } from "@/components/ui";

/**
 * Bank statement CSV against the books' bank postings, in the browser: the statement never leaves the device.
 * Matched lines are done; the two "only" lists are what to chase (bank charges, interest, a payment not recorded).
 */
export function BankReconcile({ bank, fmt }: { bank: Posting[]; fmt: Fmt }) {
  const [text, setText] = useState("");
  const m = (n: number) => money(n, fmt);
  const lines = text ? parseBankCsv(text) : [];
  const r = lines.length ? reconcile(lines, bank) : null;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className={`${btnGhost} cursor-pointer`}>
          Choose statement CSV
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
        </label>
        <span className="text-[0.78rem] text-ink-soft">Or paste it below. Download it from net banking as CSV (Excel: save as CSV).</span>
      </div>
      <textarea aria-label="Bank statement CSV" className={`${control} h-28 font-mono text-[0.74rem]`} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={"Date,Narration,Withdrawal,Deposit,Balance\n04/11/2026,UPI-ASHA,,236.00,1000"} />
      {text && !lines.length ? <p className="text-[0.8rem] text-bad">No dated rows found. The file needs a header with Date and Debit/Credit (or Amount) columns.</p> : null}
      {r ? (
        <>
          <p className="text-[0.86rem] text-ink">
            <span className="font-semibold">{r.matched.length}</span> of {lines.length} statement lines match the books.
            {r.bankOnly.length ? <> <span className="font-semibold text-bad">{r.bankOnly.length}</span> are in the bank but not the books.</> : null}
            {r.bookOnly.length ? <> <span className="font-semibold text-bad">{r.bookOnly.length}</span> are in the books but not on this statement.</> : null}
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <List title="In the bank, not in the books" hint="Bank charges, interest, a UPI payment never billed, or a supplier paid without a Payments entry."
              rows={r.bankOnly.map((l) => ({ k: `${l.date}${l.text}${l.amount}`, date: l.date, text: l.text, amount: m(l.amount) }))} />
            <List title="In the books, not in the bank" hint="A cheque not yet cleared, a UPI sale recorded on the wrong date, or money marked Bank that went to cash."
              rows={r.bookOnly.map((p) => ({ k: `${p.id}${p.date}`, date: p.date, text: `${p.ref ? p.ref + " · " : ""}${p.memo}`, amount: m(p.dr - p.cr) }))} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function List({ title, hint, rows }: { title: string; hint: string; rows: { k: string; date: string; text: string; amount: string }[] }) {
  return (
    <section>
      <h3 className="text-[0.84rem] font-semibold text-ink">{title} <span className="font-normal text-ink-faint">· {rows.length}</span></h3>
      <p className="text-[0.74rem] text-ink-faint">{hint}</p>
      {rows.length ? (
        <ul className="mt-2 divide-y divide-rule text-[0.8rem]">
          {rows.slice(0, 100).map((x) => <li key={x.k} className="flex justify-between gap-3 py-1.5"><span className="min-w-0 truncate"><span className="text-ink-faint">{x.date}</span> {x.text}</span><span className="shrink-0 tabular-nums">{x.amount}</span></li>)}
        </ul>
      ) : <p className="mt-2 text-[0.8rem] text-good">Nothing. All matched.</p>}
    </section>
  );
}

/** One button that switches on the finance modules the books read from. */
export function SwitchOn({ ids, label }: { ids: string[]; label: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const router = useRouter();
  return (
    <span>
      <button className={btnGhost} disabled={pending} onClick={() => start(async () => { const r = await switchOnModules(ids); if (failed(r)) setErr(r.__error); else router.refresh(); })}>{label}</button>
      {err ? <span className="ml-2 text-[0.78rem] text-bad">{err}</span> : null}
    </span>
  );
}
