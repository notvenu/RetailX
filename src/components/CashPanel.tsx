"use client";

import { useState, useTransition } from "react";
import { saveConfig } from "@/app/actions";
import { fmtUnit, money, type Fmt } from "@/lib/format";
import type { CashPlan } from "@/lib/planning";
import { todayIso } from "@/lib/metrics";
import { LineChart } from "@/components/charts";
import { DataTable, Section, btnPrimary, control } from "@/components/ui";
import { orAlert } from "@/lib/result";

export function CashPanel({ plan, cash, fmt, canEdit }: { plan: CashPlan | null; cash?: { balance: number; asOf: string }; fmt: Fmt; canEdit: boolean }) {
  const [balance, setBalance] = useState(cash ? String(cash.balance) : "");
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const m = (n: number) => money(Math.round(n), fmt);

  const form = canEdit ? (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { await orAlert(saveConfig({ cash: { balance: Number(balance) || 0, asOf: todayIso() } })); }); }}>
      <label className="flex flex-col gap-1">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Cash and bank balance today</span>
        <input inputMode="decimal" className={`${control} w-48 text-right tabular-nums`} value={balance} onChange={(e) => setBalance(e.target.value.replace(/[^0-9.-]/g, ""))} placeholder="250000" />
      </label>
      <button className={btnPrimary} disabled={pending || !balance}>{cash ? "Update" : "Start forecast"}</button>
    </form>
  ) : null;

  if (!plan) return <Section title="Cash flow"><p className="mb-4 text-[0.85rem] text-ink-soft">Enter today&apos;s cash and bank balance to see the next 13 weeks.</p>{form ?? <p className="text-[0.8rem] text-ink-faint">Ask the owner to enter the opening balance.</p>}</Section>;

  const runOut = plan.runOutWeek ? plan.weeks.find((w) => w.start === plan.runOutWeek) : null;
  return (
    <>
      <Section title="13-week cash flow" meta={form ? undefined : `Opening ${m(plan.opening)}`}>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-6">
          <dl className="grid grid-cols-3 gap-6 text-[0.85rem]">
            <div><dt className="text-ink-faint">Cash now</dt><dd className="text-[1.25rem] font-semibold tabular-nums text-ink">{m(plan.opening)}</dd></div>
            <div><dt className="text-ink-faint">Lowest point</dt><dd className={`text-[1.25rem] font-semibold tabular-nums ${plan.lowest < 0 ? "text-bad" : "text-ink"}`}>{m(plan.lowest)}</dd></div>
            <div><dt className="text-ink-faint">Runway</dt><dd className={`text-[1.25rem] font-semibold ${runOut ? "text-bad" : "text-good"}`}>{runOut ? `Short in week of ${runOut.label}` : "13+ weeks"}</dd></div>
          </dl>
          {form}
        </div>
        <LineChart points={[{ x: "Now", actual: plan.opening }, ...plan.weeks.map((w) => ({ x: w.label, actual: w.balance }))]} valueFormat={(n) => fmtUnit(n, "money", fmt, true)} height={220} />
      </Section>
      <Section title="Week by week" meta="Click a week for its lines">
        <DataTable
          getKey={(w) => w.start}
          rows={plan.weeks}
          rowClassName={(w) => (w.balance < 0 ? "bg-bad-wash" : "")}
          columns={[
            { key: "w", header: "Week of", render: (w) => <button className="text-left text-accent hover:underline" onClick={() => setOpen(open === w.start ? null : w.start)}>{w.label}</button> },
            { key: "i", header: "Money in", align: "right", render: (w) => m(w.inflow) },
            { key: "o", header: "Money out", align: "right", render: (w) => m(w.outflow) },
            { key: "n", header: "Net", align: "right", render: (w) => <span className={w.net < 0 ? "text-bad" : "text-good"}>{m(w.net)}</span> },
            { key: "b", header: "Balance", align: "right", render: (w) => <span className="font-semibold">{m(w.balance)}</span> },
          ]}
        />
        {open ? (
          <ul className="mt-3 max-w-md divide-y divide-rule border border-rule bg-panel/40 px-3 text-[0.8rem]">
            {plan.weeks.find((w) => w.start === open)!.lines.map((l, i) => (
              <li key={i} className="flex justify-between py-1.5"><span className="text-ink-soft">{l.label}</span><span className={`tabular-nums ${l.amount < 0 ? "text-bad" : "text-good"}`}>{m(l.amount)}</span></li>
            ))}
          </ul>
        ) : null}
      </Section>
      <Section title="Assumptions">
        <ul className="space-y-1 text-[0.8rem] text-ink-soft">{plan.assumptions.map((a) => <li key={a}>• {a}</li>)}</ul>
      </Section>
    </>
  );
}
