import { requireArea } from "@/lib/session";
import { money } from "@/lib/format";
import { todayIso } from "@/lib/metrics";
import { waLink } from "@/lib/links";
import { counterExceptions, customerValue, deadStock, expiring, receivables, supplierScorecard } from "@/lib/insights";
import { DataTable, Empty, Figure, FigureRow, Note, PageHeader, Section } from "@/components/ui";
import { WhatIf } from "@/components/WhatIf";
import { ExpiryOffers } from "@/components/ExpiryOffers";
import { expiryAdvice } from "@/lib/offers";

const wa = "text-accent underline-offset-2 hover:underline";

export default async function InsightsPage() {
  const { business: b, can } = await requireArea("analytics");
  const fmt = { currency: b.currency, locale: b.locale };
  const m = (n: number) => money(n, fmt);
  const today = todayIso();
  const on = (id: string) => b.modules.some((x) => x.id === id && x.enabled);
  const sales = on("sales") ? b.records.sales ?? [] : [];
  const stock = on("inventory") ? b.records.inventory ?? [] : [];
  const purchases = on("purchases") ? b.records.purchases ?? [] : [];

  const dues = receivables(sales, today, on("payments") ? b.records.payments ?? [] : []);
  const owed = dues.reduce((s, d) => s + d.owed, 0), old = dues.reduce((s, d) => s + d.b90, 0);
  const dead = deadStock(stock, sales, today);
  const soon = expiring(stock, sales, today);
  const stuck = dead.reduce((s, d) => s + d.value, 0);
  const suppliers = supplierScorecard(purchases, today);
  const flags = counterExceptions(sales, b.records.dayclose ?? []);
  const { best, lapsed } = customerValue(sales, today);
  const clear = expiryAdvice(stock, b.records.offers ?? [], today).map((x) => ({
    id: x.item.id, name: String(x.item.data.name ?? ""), batch: String(x.item.data.batch ?? ""), daysLeft: x.daysLeft, qty: Number(x.item.data.on_hand) || 0,
    status: x.status, pct: x.pct, price: m(Number(x.item.data.price) || 0), offerPrice: m(x.offerPrice), recovered: m(x.recovered), advice: x.advice,
  }));

  return (
    <>
      <PageHeader title="Insights" meta="What your own books say needs attention: money owed, stock that is stuck, suppliers slipping, customers going quiet." />

      <FigureRow>
        <Figure label="Owed to you" value={m(owed)} higherIsBetter={false} />
        <Figure label="Owed over 60 days" value={m(old)} higherIsBetter={false} />
        <Figure label="Cash stuck in idle stock" value={m(stuck)} higherIsBetter={false} />
        <Figure label="Quiet regulars" value={String(lapsed.length)} higherIsBetter={false} />
      </FigureRow>

      <Section title="Who owes you" meta={`${dues.length} customers`}>
        <DataTable
          getKey={(d) => d.key}
          rows={dues}
          empty="Nobody owes you anything. Sales not marked Paid, or billed on Credit, show up here."
          columns={[
            { key: "n", header: "Customer", render: (d) => <span className="font-medium">{d.name}</span> },
            { key: "o", header: "Owed", align: "right", render: (d) => m(d.owed) },
            { key: "d", header: "Overdue", align: "right", render: (d) => (d.overdue > 0.5 ? <span className="font-semibold text-bad">{m(d.overdue)}</span> : "—") },
            { key: "a", header: "0–30 d", align: "right", render: (d) => (d.b30 ? m(d.b30) : "—") },
            { key: "b", header: "31–60 d", align: "right", render: (d) => (d.b60 ? m(d.b60) : "—") },
            { key: "c", header: "60+ d", align: "right", render: (d) => (d.b90 ? <span className="font-semibold text-accent">{m(d.b90)}</span> : "—") },
            { key: "w", header: "", render: (d) => d.phone
              ? <a className={wa} target="_blank" rel="noreferrer" href={waLink(d.phone, `Namaste ${d.name}, a gentle reminder from ${b.name}: ${m(d.owed)} is pending${d.oldestDays > 30 ? `, the oldest bill ${d.oldestDays} days old` : ""}. Thank you!`)}>Remind on WhatsApp</a>
              : <span className="text-ink-faint">no phone</span> },
          ]}
        />
        <Note>A sale counts as owed until you mark it Paid or record a payment. Age runs from each bill&apos;s date; overdue is past the due date from the customer&apos;s payment terms (Customers → Payment terms).</Note>
      </Section>

      <Section title="Stock that is not moving" meta="in stock, nothing sold for 60 days">
        {!on("inventory") ? <Empty title="Stock module is off">Switch it on in Settings.</Empty> : (
          <DataTable
            getKey={(d) => d.id}
            rows={dead}
            empty="Everything in stock has sold in the last 60 days."
            columns={[
              { key: "n", header: "Product", render: (d) => <span className="font-medium">{d.name}</span> },
              { key: "h", header: "On hand", align: "right", render: (d) => d.onHand },
              { key: "v", header: "Cash tied up (at cost)", align: "right", render: (d) => (d.value ? m(d.value) : "—") },
              { key: "l", header: "Last sold", render: (d) => (d.lastSold ? `${d.idleDays} days ago` : "never recorded") },
              { key: "g", header: "Margin", align: "right", render: (d) => (d.margin == null ? "—" : `${d.margin}%`) },
              { key: "s", header: "Try", render: (d) => (d.margin != null && d.margin >= 25 ? "Clear with a 10–15% discount" : "Bundle with a fast seller, or return to supplier") },
            ]}
          />
        )}
      </Section>

      {soon.length ? (
        <Section title="Expiring soon" meta={`${m(soon.reduce((s, e) => s + e.value, 0))} at cost will still be on the shelf at expiry`}>
          <DataTable
            getKey={(e) => e.id}
            rows={soon}
            columns={[
              { key: "n", header: "Product", render: (e) => <span className="font-medium">{e.name}</span> },
              { key: "x", header: "Expires", render: (e) => (e.daysLeft < 0 ? <span className="font-semibold text-accent">expired {-e.daysLeft} d ago</span> : `in ${e.daysLeft} d`) },
              { key: "h", header: "On hand", align: "right", render: (e) => e.onHand },
              { key: "s", header: "Sells / day", align: "right", render: (e) => (e.perDay ? e.perDay.toFixed(1) : "—") },
              { key: "r", header: "Unsold by then", align: "right", render: (e) => <span className="font-semibold">{e.atRisk}</span> },
              { key: "v", header: "At cost", align: "right", render: (e) => (e.value ? m(e.value) : "—") },
            ]}
          />
          <Note>Discount or move these first. &ldquo;Unsold by then&rdquo; assumes sales continue at the last 8 weeks&apos; pace.</Note>
        </Section>
      ) : null}

      {b.features?.certificates ? (() => {
        const certs = stock.filter((r) => r.data.certificate_until && String(r.data.certificate_until) <= new Date(Date.parse(today) + 30 * 864e5).toISOString().slice(0, 10))
          .sort((x, y) => String(x.data.certificate_until).localeCompare(String(y.data.certificate_until)));
        const none = stock.filter((r) => Number(r.data.on_hand) > 0 && !r.data.certificate).length;
        return (
          <Section title="Certificates" meta={`${certs.length} running out within 30 days · ${none} in-stock items without one`}>
            <DataTable getKey={(r) => r.id} rows={certs} empty="Every certificate is valid for at least another 30 days." columns={[
              { key: "n", header: "Product", render: (r) => <span className="font-medium">{String(r.data.name)}</span> },
              { key: "b", header: "Certified by", render: (r) => String(r.data.certificate_by ?? "—") },
              { key: "u", header: "Valid until", render: (r) => (String(r.data.certificate_until) < today ? <span className="font-semibold text-bad">expired {String(r.data.certificate_until)}</span> : String(r.data.certificate_until)) },
              { key: "l", header: "", render: (r) => (/^https?:\/\//.test(String(r.data.certificate ?? "")) ? <a className={wa} href={String(r.data.certificate)} target="_blank" rel="noreferrer">Open</a> : "—") },
            ]} />
            <Note>Ask the supplier or lab for the renewed report and update the link on the Stock item: printed labels point to it.</Note>
          </Section>
        );
      })() : null}

      {clear.length ? (
        <Section title="Near-expiry offers" meta="a discount that clears the batch before it expires, never below cost + 5%">
          <ExpiryOffers rows={clear} canAct={can("inventory")} />
        </Section>
      ) : null}

      <WhatIf ready={on("inventory") && on("sales")} data={{ modules: b.modules, records: { sales: b.records.sales ?? [], inventory: b.records.inventory ?? [] } }} today={today} />

      <Section title="Suppliers" meta="by spend">
        {!on("purchases") ? <Empty title="Purchases module is off">Switch it on in Settings to see how suppliers perform.</Empty> : (
          <DataTable
            getKey={(s) => s.name}
            rows={suppliers}
            empty="No purchases recorded yet."
            columns={[
              { key: "n", header: "Supplier", render: (s) => <span className="font-medium">{s.name}</span> },
              { key: "o", header: "Orders", align: "right", render: (s) => s.orders },
              { key: "s", header: "Spend", align: "right", render: (s) => `${m(s.spend)} (${s.share}%)` },
              { key: "d", header: "Open orders past due", align: "right", render: (s) => (s.overdue ? <span className="font-semibold text-accent">{s.overdue}</span> : "—") },
              { key: "p", header: "Biggest price rise", render: (s) => (s.worstDrift ? `${s.worstDrift.item}: +${s.worstDrift.pct}%` : "—") },
            ]}
          />
        )}
      </Section>

      <Section title="Customers" meta="best by spend, and regulars who went quiet">
        <div className="grid gap-8 2xl:grid-cols-2">
          <DataTable
            getKey={(c) => c.key}
            rows={best}
            empty="Name or phone on bills builds this list."
            columns={[
              { key: "n", header: "Best customers", render: (c) => <span className="font-medium">{c.name}</span> },
              { key: "b", header: "Bills", align: "right", render: (c) => c.bills },
              { key: "s", header: "Spent", align: "right", render: (c) => m(c.spend) },
            ]}
          />
          <DataTable
            getKey={(c) => c.key}
            rows={lapsed}
            empty="No regular has been away for 45+ days."
            columns={[
              { key: "n", header: "Gone quiet", render: (c) => <span className="font-medium">{c.name}</span> },
              { key: "d", header: "Away", align: "right", render: (c) => `${c.quietDays} d` },
              { key: "w", header: "", render: (c) => c.phone
                ? <a className={wa} target="_blank" rel="noreferrer" href={waLink(c.phone, `Namaste ${c.name}, we miss you at ${b.name}! Drop by this week, we have something for you.`)}>Win back</a>
                : <span className="text-ink-faint">no phone</span> },
            ]}
          />
        </div>
      </Section>

      <Section title="Counter exceptions" meta="a prompt to look, not a verdict">
        {flags.length ? (
          <ul className="divide-y divide-rule border-y border-rule text-[0.85rem]">
            {flags.map((f, i) => <li key={i} className="px-3 py-2.5"><span className="font-medium">{f.who}</span> <span className="text-ink-soft">{f.why}</span></li>)}
          </ul>
        ) : <p className="text-[0.82rem] text-ink-faint">Nothing stands out. Flags need at least 3 returns or 3 short day-closes by one person.</p>}
      </Section>
    </>
  );
}
