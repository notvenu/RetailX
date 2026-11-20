"use client";

import { useMemo, useState } from "react";
import { stockPlan } from "@/lib/planning";
import { explainLine } from "@/lib/insights";
import type { Business } from "@/lib/model";
import { DataTable, Empty, Label, Note, Section, StatusPill } from "@/components/ui";

const slider = "w-40 accent-[var(--color-accent)]";

/** Move the supplier's delay and demand, see which products run out before stock arrives, and why. */
export function WhatIf({ ready, data, today }: { ready: boolean; data: Pick<Business, "modules" | "records">; today: string }) {
  const [lead, setLead] = useState(3);
  const [delay, setDelay] = useState(0);
  const [demand, setDemand] = useState(0);
  const lines = useMemo(() => {
    if (!ready) return [];
    const k = 1 + demand / 100;
    // stockPlan forecasts demand itself, so scale what it returns: demand and spare stock move with sales, cover shrinks.
    return stockPlan({ ...data, cash: undefined, events: [] }, { leadDays: lead + delay, reviewDays: 7, service: 0.95 }, today)
      .filter((l) => l.status !== "no sales")
      .map((l) => {
        const d = Math.round(l.demand * k), s = Math.ceil(l.safety * k), cover = l.coverDays == null ? null : l.coverDays / k;
        const reorder = Math.max(0, Math.ceil(d + s - l.onHand));
        const out = cover != null && cover < lead + delay;
        return { l: { ...l, demand: d, safety: s, avgDaily: l.avgDaily * k, coverDays: cover, reorder, status: out ? "order" as const : reorder > 0 ? "watch" as const : "ok" as const }, out, short: out && cover != null ? Math.ceil((lead + delay - cover) * l.avgDaily * k) : 0 };
      })
      .sort((a, b) => Number(b.out) - Number(a.out) || b.short - a.short);
  }, [ready, data, lead, delay, demand, today]);

  if (!ready) return <Empty title="Needs Stock and Sales">Switch on both modules in Settings. The simulator reads demand from sales whose item matches a stock product&apos;s name.</Empty>;
  const risky = lines.filter((x) => x.out);
  return (
    <Section title="What if…" meta={`${risky.length} of ${lines.length} products would run out before stock arrives`}>
      <div className="grid gap-5 sm:grid-cols-3">
        <Label text="Normal supplier wait" hint="Days from ordering to stock on the shelf">
          <div className="flex items-center gap-2"><input type="range" min={1} max={21} value={lead} onChange={(e) => setLead(+e.target.value)} className={slider} /><span className="text-[0.85rem] font-semibold tabular-nums">{lead} d</span></div>
        </Label>
        <Label text="Supplier is late by" hint="Slide right to see what a delay costs you">
          <div className="flex items-center gap-2"><input type="range" min={0} max={14} value={delay} onChange={(e) => setDelay(+e.target.value)} className={slider} /><span className="text-[0.85rem] font-semibold tabular-nums">+{delay} d</span></div>
        </Label>
        <Label text="Demand changes by" hint="A sale or festival up, a slow month down">
          <div className="flex items-center gap-2"><input type="range" min={-30} max={100} step={5} value={demand} onChange={(e) => setDemand(+e.target.value)} className={slider} /><span className="text-[0.85rem] font-semibold tabular-nums">{demand > 0 ? "+" : ""}{demand}%</span></div>
        </Label>
      </div>
      <div className="mt-5">
        <DataTable
          getKey={(x) => x.l.id}
          rows={lines}
          empty="No products with sales yet."
          columns={[
            { key: "n", header: "Product", render: ({ l }) => <div><span className="font-medium">{l.name}</span><p className="mt-0.5 max-w-[46ch] text-[0.72rem] text-ink-faint">{explainLine(l, lead + delay)}</p></div> },
            { key: "h", header: "On hand", align: "right", render: ({ l }) => l.onHand },
            { key: "c", header: "Days of cover", align: "right", render: ({ l }) => (l.coverDays == null ? "—" : l.coverDays.toFixed(1)) },
            { key: "s", header: "Short by", align: "right", render: (x) => (x.short ? <span className="font-semibold text-accent">{x.short}</span> : "—") },
            { key: "o", header: "Order", align: "right", render: ({ l }) => (l.reorder ? l.reorder : "—") },
            { key: "st", header: "", render: (x) => <StatusPill>{x.out ? "Runs out" : x.l.status === "watch" ? "Order soon" : "Safe"}</StatusPill> },
          ]}
        />
      </div>
      <Note>Short by = units you would be missing between running out and the late delivery arriving, at this demand. Estimates from the last 8 weeks of sales.</Note>
    </Section>
  );
}
