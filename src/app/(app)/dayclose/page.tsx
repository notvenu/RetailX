import Link from "next/link";
import { requireArea } from "@/lib/session";
import { money } from "@/lib/format";
import { todayIso } from "@/lib/metrics";
import { dayTotals, openingCash } from "@/lib/pos";
import { DayCloseForm } from "@/components/DayCloseForm";
import { DataTable, FigureRow, Figure, PageHeader, Section, btnGhost } from "@/components/ui";

export const metadata = { title: "Day close · RetailX" };

/** Z report: what each payment mode took today, what the drawer should hold, and what was counted. */
export default async function DayClosePage({ searchParams }: PageProps<"/dayclose">) {
  const { business: b } = await requireArea("sales");
  const sp = await searchParams;
  const today = todayIso();
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const closes = b.records.dayclose ?? [];
  const opening = openingCash(closes, date);
  const d = dayTotals(b.records.sales ?? [], b.records.expenses ?? [], date, opening);
  const fmt = { currency: b.currency, locale: b.locale };
  const m = (n: number) => money(n, fmt);
  const done = closes.filter((r) => r.data.date === date).sort((x, y) => y.at.localeCompare(x.at));
  const recent = [...closes].sort((x, y) => String(y.data.date).localeCompare(String(x.data.date)) || y.at.localeCompare(x.at)).slice(0, 14);

  return (
    <>
      <PageHeader title="Day close" meta="At closing time: count the drawer, check UPI and card against the settlement, then close the day."
        actions={<>
          <form className="flex items-center gap-2"><input type="date" name="date" defaultValue={date} max={today} aria-label="Day" className="rounded-sm border border-rule-strong bg-surface px-2 py-1 text-[0.82rem]" /><button className={btnGhost}>Show</button></form>
          <Link className={btnGhost} href="/pos">Counter</Link>
        </>} />

      <div className="mt-6">
        <FigureRow>
          <Figure label="Sales" value={m(d.sales)} />
          <Figure label="Bills" value={String(d.bills)} />
          <Figure label="Returns" value={m(d.returns)} />
          <Figure label="On credit" value={m(d.byMode.Credit)} />
        </FigureRow>
      </div>

      <Section title="By payment mode" className="mt-8">
        <DataTable rows={[
          { k: "Cash", v: d.byMode.Cash, note: "drawer: see below" },
          { k: "UPI", v: d.byMode.UPI, note: "check against today's UPI settlement" },
          { k: "Card", v: d.byMode.Card, note: "check against the card machine's batch total" },
          { k: "Credit", v: d.byMode.Credit, note: "now owed by customers" },
        ]} getKey={(r) => r.k} columns={[
          { key: "k", header: "Mode", render: (r) => r.k },
          { key: "note", header: "", render: (r) => <span className="text-ink-faint">{r.note}</span> },
          { key: "v", header: "Net of returns", align: "right", render: (r) => m(r.v) },
        ]} />
      </Section>

      <Section title="Cash drawer" className="mt-8">
        <DayCloseForm date={date} opening={opening} cashSales={d.byMode.Cash} cashExpenses={d.cashExpenses} fmt={fmt} closedBefore={done.length > 0} />
        {done.length ? <p className="mt-3 text-[0.8rem] text-ink-soft">Closed {done.length > 1 ? `${done.length} times` : ""} by {String(done[0].data.closed_by ?? done[0].by)} · cash {Number(done[0].data.difference) ? `${Number(done[0].data.difference) > 0 ? "over" : "short"} by ${m(Math.abs(Number(done[0].data.difference)))}` : "matched"}. You can close again if more sales come in.</p> : null}
      </Section>

      {recent.length ? (
        <Section title="Recent closes" className="mt-8">
          <DataTable rows={recent} getKey={(r) => r.id} columns={[
            { key: "date", header: "Day", render: (r) => <Link className="hover:underline" href={`/dayclose?date=${r.data.date}`}>{String(r.data.date)}</Link> },
            { key: "sales", header: "Sales", align: "right", render: (r) => m(Number(r.data.sales) || 0) },
            { key: "expected", header: "Cash expected", align: "right", render: (r) => m(Number(r.data.expected) || 0) },
            { key: "counted", header: "Counted", align: "right", render: (r) => m(Number(r.data.counted) || 0) },
            { key: "diff", header: "Over / short", align: "right", render: (r) => { const x = Number(r.data.difference) || 0; return <span className={x < 0 ? "text-bad" : x > 0 ? "text-good" : "text-ink-faint"}>{x ? m(x) : "✓"}</span>; } },
            { key: "by", header: "Closed by", render: (r) => String(r.data.closed_by ?? r.by) },
          ]} />
        </Section>
      ) : null}
    </>
  );
}
