"use client";

import { useMemo, useState, useTransition } from "react";
import { runAutopilotNow, saveAutoOrder, saveRecord } from "@/app/actions";
import type { AutoOrder } from "@/lib/autoorder";
import { stockPlan } from "@/lib/planning";
import { explainLine } from "@/lib/insights";
import { waLink } from "@/lib/links";
import { failed } from "@/lib/result";
import type { Business } from "@/lib/model";
import { btnGhost, btnPrimary, control, DataTable, Empty, Label, Section, Segmented, StatusPill, Toggle } from "@/components/ui";

const SAY = { order: "Order now", watch: "Order soon", ok: "Enough", "no sales": "No sales yet" } as const;

export function StockPlanner({ ready, data, today, auto }: { ready: boolean; data: Pick<Business, "modules" | "records">; today: string; auto?: AutoOrder | null | false }) {
  const [lead, setLead] = useState(auto ? auto.leadDays || 3 : 3);
  const [review, setReview] = useState(7);
  const [service, setService] = useState(0.95);
  const [placed, setPlaced] = useState<Record<string, true>>({});
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  // restock autopilot (owner only; `auto === false` hides it, null = never set up)
  const suppliers = useMemo(() => [...new Set((data.records.inventory ?? []).map((r) => String(r.data.supplier ?? "").trim()).filter(Boolean))].sort(), [data]);
  const [ap, setAp] = useState<AutoOrder>(auto || { enabled: false, weeklyCap: 10000, suppliers: [], leadDays: 3 });
  const [apMsg, setApMsg] = useState<{ ok?: string; error?: string }>({});
  const lines = useMemo(() => (ready ? stockPlan({ ...data, cash: undefined, events: [] }, { leadDays: lead, reviewDays: review, service }, today) : []), [ready, data, lead, review, service, today]);

  if (!ready) return <div className="mt-8"><Empty title="Needs Stock and Sales">Switch on both modules in Settings. Demand is read from sales whose item matches a stock product&apos;s name.</Empty></div>;
  const toOrder = lines.filter((l) => l.reorder > 0);
  const canPo = data.modules.some((m) => m.id === "purchases" && m.enabled);
  // items already on an open order: offering "Place order" again would order them twice
  const onOrder = new Set((data.records.purchases ?? []).filter((r) => r.data.status === "Ordered").map((r) => String(r.data.item ?? "").trim().toLowerCase()));
  const unitCost = (id: string) => Number(data.records.inventory?.find((r) => r.id === id)?.data.unit_cost) || 0;
  /** One tap: the suggested quantity becomes an Ordered purchase, to be received later at the counter's Stock in. */
  const place = (l: (typeof lines)[number]) => start(async () => {
    setErr("");
    const r = await saveRecord("purchases", {
      date: today, supplier: l.supplier ?? "Unassigned", item: l.name, quantity: String(l.reorder),
      amount: String(Math.round(l.reorder * unitCost(l.id) * 100) / 100), status: "Ordered",
      expected: new Date(Date.parse(today) + lead * 864e5).toISOString().slice(0, 10),
    });
    if (failed(r)) setErr(r.__error); else setPlaced((p) => ({ ...p, [l.id]: true }));
  });
  const poText = toOrder.filter((l) => l.status === "order").map((l) => `• ${l.name}: ${l.reorder}${l.supplier ? ` (${l.supplier})` : ""}`).join("\n");
  return (
    <>
      <Section title="How you restock">
        <div className="grid gap-5 sm:grid-cols-3">
          <Label text="Supplier lead time" hint="Days from ordering to stock on the shelf">
            <div className="flex items-center gap-2"><input type="range" min={1} max={30} value={lead} onChange={(e) => setLead(+e.target.value)} className="w-40 accent-[var(--color-accent)]" /><span className="text-[0.85rem] font-semibold tabular-nums">{lead} d</span></div>
          </Label>
          <Label text="Order every" hint="How often you place orders">
            <div className="flex items-center gap-2"><input type="range" min={1} max={30} value={review} onChange={(e) => setReview(+e.target.value)} className="w-40 accent-[var(--color-accent)]" /><span className="text-[0.85rem] font-semibold tabular-nums">{review} d</span></div>
          </Label>
          <Label text="Never run out on" hint="Higher means more safety stock">
            <Segmented label="Service level" value={service} onChange={setService} options={[0.9, 0.95, 0.98, 0.99].map((v) => ({ value: v, label: `${Math.round(v * 100)}% of days` }))} />
          </Label>
        </div>
      </Section>
      <Section title="What to order" meta={`${toOrder.length} of ${lines.length} products`}>
        <DataTable
          getKey={(l) => l.id}
          rows={lines}
          empty="No stock items yet."
          columns={[
            { key: "n", header: "Product", render: (l) => <span className="font-medium">{l.name}{l.supplier ? <span className="ml-2 text-[0.72rem] font-normal text-ink-faint">{l.supplier}</span> : null}</span> },
            { key: "h", header: "On hand", align: "right", render: (l) => l.onHand },
            { key: "a", header: "Sells / day", align: "right", render: (l) => (l.avgDaily ? l.avgDaily.toFixed(1) : "—") },
            { key: "c", header: "Days of cover", align: "right", render: (l) => (l.coverDays == null ? "—" : Math.floor(l.coverDays)) },
            { key: "d", header: `Demand, next ${lead + review} d`, align: "right", render: (l) => l.demand || "—" },
            { key: "s", header: "Safety stock", align: "right", render: (l) => l.safety || "—" },
            { key: "o", header: "Order", align: "right", render: (l) => (l.reorder ? <span className="font-semibold text-accent">{l.reorder}</span> : "—") },
            { key: "st", header: "", render: (l) => <StatusPill>{SAY[l.status]}</StatusPill> },
            ...(canPo ? [{ key: "po", header: "", render: (l: (typeof lines)[number]) => l.reorder > 0
              ? placed[l.id] ? <span className="text-[0.75rem] text-good">Ordered</span>
                : onOrder.has(l.name.trim().toLowerCase()) ? <span className="text-[0.75rem] text-ink-soft">On order</span>
                : <button type="button" className={`${btnGhost} px-2 py-1 text-[0.75rem]`} disabled={pending} onClick={() => place(l)}>Place order</button>
              : null }] : []),
          ]}
        />
        {err ? <p role="alert" className="mt-2 text-[0.8rem] text-bad">{err}</p> : null}
        {auto !== false && canPo ? (
          <div className="mt-6 border-t border-rule pt-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[0.85rem] font-semibold text-ink">Autopilot</p>
                <p className="mt-0.5 max-w-[62ch] text-[0.78rem] text-ink-soft">Places the &ldquo;order now&rdquo; lines as Ordered purchases by itself, only from suppliers you tick, never above the weekly cap, never twice for an item that already has an open order. It never pays anyone; you receive the stock at the counter as usual.</p>
              </div>
              <Toggle on={ap.enabled} onChange={(enabled) => setAp({ ...ap, enabled })} label="Autopilot on" />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Label text="Most to order in a week" hint="At cost, across all autopilot orders">
                <input inputMode="numeric" aria-label="Autopilot weekly cap" className={`${control} w-40 text-right tabular-nums`} value={ap.weeklyCap || ""} onChange={(e) => setAp({ ...ap, weeklyCap: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
              </Label>
              <Label text="Suppliers it may order from">
                <div className="flex flex-wrap gap-3 pt-1">
                  {suppliers.length ? suppliers.map((s) => (
                    <label key={s} className="flex items-center gap-1.5 text-[0.82rem]">
                      <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={ap.suppliers.includes(s)}
                        onChange={() => setAp({ ...ap, suppliers: ap.suppliers.includes(s) ? ap.suppliers.filter((x) => x !== s) : [...ap.suppliers, s] })} /> {s}
                    </label>
                  )) : <span className="text-[0.78rem] text-ink-faint">Give your stock items a Supplier first.</span>}
                </div>
              </Label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" className={btnPrimary} disabled={pending} onClick={() => start(async () => {
                const r = await saveAutoOrder({ ...ap, leadDays: lead });
                setApMsg(failed(r) ? { error: r.__error } : { ok: ap.enabled ? "Autopilot is on. It runs once a day with the scheduler (/api/cron)." : "Autopilot is off." });
              })}>Save autopilot</button>
              {auto && auto.enabled ? <button type="button" className={btnGhost} disabled={pending} onClick={() => start(async () => {
                const r = await runAutopilotNow();
                setApMsg(failed(r) ? { error: r.__error } : { ok: r.placed ? `Placed ${r.placed} order${r.placed > 1 ? "s" : ""}. See Purchases.` : "Nothing to order right now." });
              })}>Run now</button> : null}
              {apMsg.error ? <span role="alert" className="text-[0.8rem] text-bad">{apMsg.error}</span> : null}
              {apMsg.ok ? <span role="status" className="text-[0.8rem] text-good">{apMsg.ok}</span> : null}
            </div>
          </div>
        ) : null}
        {poText ? <p className="mt-3"><a className={`${btnGhost} px-2.5 py-1 text-[0.78rem]`} target="_blank" rel="noreferrer" href={waLink("", `Order list for the next ${lead} days:
${poText}`)}>Share urgent order list on WhatsApp</a></p> : null}
        <details className="mt-3 text-[0.78rem] text-ink-soft"><summary className="cursor-pointer">Why these quantities?</summary>
          <ul className="mt-2 space-y-1.5">{toOrder.slice(0, 12).map((l) => <li key={l.id}><span className="font-medium text-ink">{l.name}.</span> {explainLine(l, lead)}</li>)}</ul>
        </details>
        <p className="mt-2 text-[0.75rem] text-ink-faint">
          Demand: each product&apos;s last 8 weeks of sales (by Item name) forecast with a weekly pattern over lead time + order cycle. Order = demand + safety stock − on hand.
        </p>
      </Section>
    </>
  );
}
