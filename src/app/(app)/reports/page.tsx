import { t } from "@/lib/i18n";
import Link from "next/link";
import { requireArea } from "@/lib/session";
import { listOutbox } from "@/lib/db";
import { ago, money } from "@/lib/format";
import { gstSummary, gstr1, gstr9, type TaxLine } from "@/lib/gst";
import { form27EQ, referralReport, staffReport } from "@/lib/extras";
import { DataTable, Empty, PageHeader, Section, StatusPill } from "@/components/ui";
import { CsvButton } from "@/components/CsvButton";
import { JsonButton } from "@/components/JsonButton";

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const { lang, business: b } = await requireArea("reports");
  const sp = await searchParams;
  const fmt = { currency: b.currency, locale: b.locale };
  const m = (n: number) => money(n, fmt);
  const sales = b.records.sales ?? [], purchases = b.records.purchases ?? [];
  const months = [...new Set(sales.map((r) => String(r.data.date ?? r.at).slice(0, 7)))].sort().reverse();
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : months[0] ?? new Date().toISOString().slice(0, 7);
  const g = gstSummary(sales, purchases, month, b.state);
  const outbox = await listOutbox(b.id, 40);
  // the financial year the chosen month falls in
  const fs = b.fiscalStart || 4, my = +month.slice(0, 4), mm = +month.slice(5, 7);
  const fyStart = `${mm >= fs ? my : my - 1}-${String(fs).padStart(2, "0")}`;
  const year = gstr9(sales, purchases, fyStart, b.state);
  const fyLabel = `${fyStart.slice(0, 4)}-${String(+fyStart.slice(0, 4) + 1).slice(2)}`;
  const tcsQ = form27EQ(sales, fyStart).filter((q) => q.collected);
  const monthEnd = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10);
  const staff = staffReport(sales, `${month}-01`, monthEnd, b.counter?.incentivePct ?? 0);
  const refs = referralReport(sales, b.records.customers ?? [], `${month}-01`, monthEnd, b.counter?.referralPct ?? 0);
  const tds = (b.records.payments ?? []).filter((p) => Number(p.data.tds) > 0 && String(p.data.date ?? "").slice(0, 7) >= fyStart);

  const lineCols = (label: string) => [
    { key: "k", header: label, render: (r: { k: string; l: TaxLine }) => r.k },
    { key: "n", header: "Bills", align: "right" as const, render: (r: { k: string; l: TaxLine }) => r.l.count },
    { key: "t", header: "Taxable value", align: "right" as const, render: (r: { k: string; l: TaxLine }) => m(r.l.taxable) },
    { key: "c", header: "CGST", align: "right" as const, render: (r: { k: string; l: TaxLine }) => m(r.l.cgst) },
    { key: "s", header: "SGST", align: "right" as const, render: (r: { k: string; l: TaxLine }) => m(r.l.sgst) },
    { key: "i", header: "IGST", align: "right" as const, render: (r: { k: string; l: TaxLine }) => m(r.l.igst) },
    { key: "v", header: "Invoice value", align: "right" as const, render: (r: { k: string; l: TaxLine }) => m(r.l.total) },
  ];
  const slabs = Object.entries(g.outward).sort(([a], [c]) => +a - +c).map(([k, l]) => ({ k: `${k}%`, l }));
  const csv = [
    ["Section", "Key", "Bills", "Taxable", "CGST", "SGST", "IGST", "Value"],
    ...slabs.map((r) => ["Outward", r.k, r.l.count, r.l.taxable, r.l.cgst, r.l.sgst, r.l.igst, r.l.total]),
    ["B2B", "", g.b2b.count, g.b2b.taxable, g.b2b.cgst, g.b2b.sgst, g.b2b.igst, g.b2b.total],
    ["B2C", "", g.b2c.count, g.b2c.taxable, g.b2c.cgst, g.b2c.sgst, g.b2c.igst, g.b2c.total],
    ...g.hsn.map((h) => ["HSN", `${h.hsn} @ ${h.rate}%`, h.line.count, h.line.taxable, h.line.cgst, h.line.sgst, h.line.igst, h.line.total]),
    ...Object.entries(g.inward).map(([k, l]) => ["ITC", `${k}%`, l.count, l.taxable, l.cgst, l.sgst, l.igst, l.total]),
    ["Net payable", "", "", "", "", "", "", g.payable],
  ].map((r) => r.map(String));

  return (
    <>
      <PageHeader
        title={t(lang, "nav.reports")}
        meta={b.gstin ? `GST for GSTIN ${b.gstin}` : "Add your GSTIN in Settings → Business for tax invoices and correct IGST/CGST split."}
        actions={<>{b.gstin && b.state ? <JsonButton data={gstr1(sales, month, b.gstin, b.state)} name={`GSTR1_${month}.json`} label="GSTR-1 JSON" /> : null}<JsonButton data={{ gstin: b.gstin, fy: fyLabel, ...year }} name={`GSTR9-summary_${fyLabel}.json`} label="GSTR-9 summary" /><CsvButton rows={csv} name={`gst-${month}.csv`} /></>}
      />
      <nav aria-label="Month" className="mt-5 flex flex-wrap gap-1.5">
        {(months.length ? months : [month]).slice(0, 12).map((x) => (
          <Link key={x} href={`/reports?month=${x}`} aria-current={x === month ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-[0.78rem] ${x === month ? "border-accent bg-accent-wash text-accent" : "border-rule-strong text-ink-soft hover:text-ink"}`}>
            {new Date(x + "-01T00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
          </Link>
        ))}
      </nav>

      {!sales.length ? (
        <div className="mt-8"><Empty title="No sales recorded">GST summaries are built from Sales (and Purchases for input tax credit). Record or import sales with a GST % to see them.</Empty></div>
      ) : (
        <>
          <Section title="GSTR-3B summary" meta="Output tax minus eligible input tax credit">
            <dl className="grid max-w-xl grid-cols-3 gap-4 text-[0.85rem]">
              <div><dt className="text-ink-faint">Output tax</dt><dd className="text-[1.2rem] font-semibold tabular-nums text-ink">{m(g.outputTax)}</dd></div>
              <div><dt className="text-ink-faint">Input tax credit</dt><dd className="text-[1.2rem] font-semibold tabular-nums text-ink">{m(g.inputTax)}</dd></div>
              <div><dt className="text-ink-faint">Net payable</dt><dd className="text-[1.2rem] font-semibold tabular-nums text-accent">{m(g.payable)}</dd></div>
            </dl>
            <p className="mt-2 text-[0.75rem] text-ink-faint">Amounts are GST-inclusive as recorded. Input credit counts purchases from suppliers with a GSTIN. Check with your accountant before filing.</p>
          </Section>
          <Section title="Outward supplies by rate (GSTR-1)">
            <DataTable getKey={(r) => r.k} rows={slabs} columns={lineCols("Rate")} />
          </Section>
          <Section title="B2B and B2C">
            <DataTable getKey={(r) => r.k} rows={[{ k: "B2B (customer has GSTIN)", l: g.b2b }, { k: "B2C", l: g.b2c }]} columns={lineCols("Type")} />
          </Section>
          <Section title="HSN / SAC summary">
            <DataTable getKey={(r) => r.k} rows={g.hsn.map((h) => ({ k: `${h.hsn} @ ${h.rate}%`, l: h.line }))} columns={lineCols("HSN @ rate")} />
          </Section>
          {Object.keys(g.inward).length ? (
            <Section title="Input tax credit by rate">
              <DataTable getKey={(r) => r.k} rows={Object.entries(g.inward).map(([k, l]) => ({ k: `${k}%`, l }))} columns={lineCols("Rate")} />
            </Section>
          ) : null}
        </>
      )}

      {sales.length ? (
        <Section title={`GSTR-9: year ${fyLabel}`} meta={`taxable ${m(year.totals.taxable)} · output ${m(year.totals.outputTax)} · credit ${m(year.totals.inputTax)} · paid ${m(year.totals.payable)}`}>
          <DataTable getKey={(r) => r.month} rows={year.months.filter((r) => r.taxable || r.inputTax)} empty="Nothing recorded this year." columns={[
            { key: "m", header: "Month", render: (r) => new Date(r.month + "-01T00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" }) },
            { key: "t", header: "Taxable", align: "right", render: (r) => m(r.taxable) },
            { key: "b", header: "B2B", align: "right", render: (r) => m(r.b2b) },
            { key: "c", header: "B2C", align: "right", render: (r) => m(r.b2c) },
            { key: "o", header: "Output tax", align: "right", render: (r) => m(r.outputTax) },
            { key: "i", header: "Input credit", align: "right", render: (r) => m(r.inputTax) },
            { key: "p", header: "Tax payable", align: "right", render: (r) => m(r.payable) },
          ]} />
          <p className="mt-2 text-[0.75rem] text-ink-faint">The annual return re-states the year&apos;s monthly returns: compare these totals with what was filed in GSTR-1 and GSTR-3B before filing GSTR-9.</p>
        </Section>
      ) : null}

      {tds.length ? (
        <Section title="TDS on payments" meta={`${fyLabel} · deducted by customers or by you; claim or deposit it`}>
          <DataTable getKey={(r) => r.id} rows={tds} columns={[
            { key: "d", header: "Date", render: (r) => String(r.data.date ?? "") },
            { key: "p", header: "Party", render: (r) => String(r.data.party ?? "") },
            { key: "w", header: "Direction", render: (r) => (r.data.direction === "Out" ? "You deducted (pay to govt.)" : "Deducted from you (claim)") },
            { key: "a", header: "Payment", align: "right", render: (r) => m(Number(r.data.amount) || 0) },
            { key: "t", header: "TDS", align: "right", render: (r) => m(Number(r.data.tds) || 0) },
          ]} />
        </Section>
      ) : null}

      {tcsQ.length ? (
        <Section title={`Form 27EQ: TCS collected ${fyLabel}`} meta="by quarter and buyer, for the quarterly TCS return">
          {tcsQ.map((q) => (
            <div key={q.quarter} className="mb-4">
              <p className="mb-1 text-[0.84rem] font-semibold text-ink">{q.quarter} · collected {m(q.collected)} on {m(q.received)} received</p>
              <DataTable getKey={(r) => r.name + r.gstin} rows={q.parties} columns={[
                { key: "n", header: "Buyer", render: (r) => r.name },
                { key: "g", header: "GSTIN / PAN", render: (r) => r.gstin || "—" },
                { key: "r", header: "Amount received", align: "right", render: (r) => m(r.received) },
                { key: "t", header: "TCS", align: "right", render: (r) => m(r.tcs) },
              ]} />
            </div>
          ))}
          <p className="text-[0.75rem] text-ink-faint">File with your CA: 27EQ needs each buyer&apos;s PAN, which Tally or the return utility asks for.</p>
        </Section>
      ) : null}

      {staff.length ? (
        <Section title="Staff & referrals" meta={`${new Date(month + "-01T00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}${b.counter?.incentivePct ? ` · incentive ${b.counter.incentivePct}% of net sales` : " · set the incentive % in Settings → Counter & invoices"}`}>
          <DataTable getKey={(r) => r.who} rows={staff} columns={[
            { key: "w", header: "Billed by", render: (r) => <span className="font-medium">{r.who}</span> },
            { key: "b", header: "Bills", align: "right", render: (r) => r.bills },
            { key: "s", header: "Sales", align: "right", render: (r) => m(r.sales) },
            { key: "r", header: "Returns", align: "right", render: (r) => (r.returns ? m(r.returns) : "—") },
            { key: "n", header: "Net", align: "right", render: (r) => m(r.net) },
            { key: "i", header: "Incentive", align: "right", render: (r) => (r.incentive ? <span className="font-semibold">{m(r.incentive)}</span> : "—") },
          ]} />
          {refs.length ? (
            <div className="mt-5">
              <p className="mb-1 text-[0.84rem] font-semibold text-ink">Referrals{b.counter?.referralPct ? ` · commission ${b.counter.referralPct}%` : ""}</p>
              <DataTable getKey={(r) => r.referrer} rows={refs} columns={[
                { key: "r", header: "Referred by", render: (r) => r.referrer },
                { key: "c", header: "Customers", align: "right", render: (r) => r.customers },
                { key: "s", header: "Their purchases", align: "right", render: (r) => m(r.sales) },
                { key: "k", header: "Commission", align: "right", render: (r) => (r.commission ? m(r.commission) : "—") },
              ]} />
            </div>
          ) : <p className="mt-3 text-[0.75rem] text-ink-faint">Fill Customers → Referred by to see who brings you customers.</p>}
        </Section>
      ) : null}

      <Section title="Messages" meta="Every email and WhatsApp the system sent, or queued for a person to send">
        <DataTable
          getKey={(r) => r.id}
          rows={outbox}
          empty="No messages yet."
          columns={[
            { key: "a", header: "When", render: (r) => <span suppressHydrationWarning>{ago(r.at)}</span> },
            { key: "c", header: "Channel", render: (r) => (r.channel === "email" ? "Email" : "WhatsApp") },
            { key: "t", header: "To", render: (r) => r.recipient },
            { key: "b", header: "Message", render: (r) => <span className="line-clamp-2">{r.subject ? `${r.subject}: ` : ""}{r.body}</span> },
            { key: "s", header: "Status", render: (r) => <StatusPill>{r.sent ? "Delivered" : "Pending"}</StatusPill> },
          ]}
        />
        <p className="mt-2 text-[0.75rem] text-ink-faint">“Pending” means no provider is configured, so the message was logged here (and as a one-tap task for WhatsApp) instead of sent.</p>
      </Section>
    </>
  );
}
