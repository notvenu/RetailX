import Link from "next/link";
import { requireArea } from "@/lib/session";
import { money } from "@/lib/format";
import { todayIso } from "@/lib/metrics";
import { balanceSheet, postings, profitLoss, tallyXml, trialBalance } from "@/lib/books";
import { verifyData } from "@/lib/extras";
import { DataTable, Empty, Figure, FigureRow, Note, PageHeader, Section } from "@/components/ui";
import { JsonButton } from "@/components/JsonButton";
import { BankReconcile, SwitchOn } from "@/components/BankReconcile";

export const metadata = { title: "Books · RetailX" };

const TABS = [["pl", "Profit & loss"], ["bs", "Balance sheet"], ["tb", "Trial balance"], ["bank", "Bank reconcile"], ["verify", "Verify my data"]] as const;

/**
 * The accounts, worked out from the records: nothing to post by hand except journal entries for what never passes
 * through a bill (owner's capital, loans, opening balances).
 */
export default async function BooksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { business: b, can } = await requireArea("reports");
  const sp = await searchParams;
  const today = todayIso();
  const fy = (() => { const y = +today.slice(0, 4), mo = +today.slice(5, 7), st = b.fiscalStart || 4; return `${mo >= st ? y : y - 1}-${String(st).padStart(2, "0")}-01`; })();
  const iso = (v: unknown, d: string) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : d);
  const from = iso(sp.from, fy), to = iso(sp.to, today);
  const tab = TABS.some(([k]) => k === sp.tab) ? String(sp.tab) : "pl";
  const account = typeof sp.account === "string" ? sp.account : "";
  const fmt = { currency: b.currency, locale: b.locale };
  const m = (n: number) => money(n, fmt);
  const on = (id: string) => b.modules.some((x) => x.id === id && x.enabled);
  const recs = Object.fromEntries(Object.entries(b.records).filter(([k]) => on(k)));
  const ps = postings(recs, to);
  const pl = profitLoss(ps, from, to);
  const bs = balanceSheet(ps);
  const tb = trialBalance(ps);
  const missing = ["payments", "journal", "assets"].filter((x) => !on(x));
  const q = (p: Record<string, string>) => `/books?${new URLSearchParams({ from, to, tab, ...p })}`;

  return (
    <>
      <PageHeader title="Books"
        meta={`Accounts from your records, ${from} to ${to}. Every bill, purchase, expense, pay run and payment is posted for you.`}
        actions={<>
          {ps.length ? <JsonButton text={tallyXml(ps, b.name)} mime="application/xml" name={`tally-${to}.xml`} label="Export to Tally" /> : null}
          {missing.length && can("settings") ? <SwitchOn ids={missing} label="Switch on Payments, Journal & Fixed assets" /> : null}
        </>} />

      <form className="mt-5 flex flex-wrap items-end gap-2 text-[0.8rem]" action="/books">
        <input type="hidden" name="tab" value={tab} />
        <label className="grid gap-1 text-ink-soft">From<input type="date" name="from" defaultValue={from} className="rounded-sm border border-rule-strong bg-surface px-2 py-1" /></label>
        <label className="grid gap-1 text-ink-soft">To<input type="date" name="to" defaultValue={to} className="rounded-sm border border-rule-strong bg-surface px-2 py-1" /></label>
        <button className="rounded-sm border border-rule-strong px-3 py-1 text-ink-soft hover:text-ink">Show</button>
      </form>

      <nav aria-label="Books" className="mt-4 flex flex-wrap gap-1.5">
        {TABS.map(([k, label]) => (
          <Link key={k} href={q({ tab: k, account: "" })} aria-current={k === tab ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-[0.78rem] ${k === tab ? "border-accent bg-accent-wash text-accent" : "border-rule-strong text-ink-soft hover:text-ink"}`}>{label}</Link>
        ))}
      </nav>

      {!ps.length ? <div className="mt-8"><Empty title="Nothing to post yet">The books fill themselves from Sales, Purchases, Expenses, Payroll and Payments.</Empty></div> : null}

      {ps.length && tab === "pl" ? (
        <>
          <div className="mt-6"><FigureRow>
            <Figure label="Sales (net of GST)" value={m(pl.income.find((x) => x.account === "Sales")?.amount ?? 0)} />
            <Figure label="Gross profit" value={m(pl.grossProfit)} />
            <Figure label="Expenses" value={m(pl.totalExpense - (pl.expense.find((x) => x.account === "Cost of goods sold")?.amount ?? 0))} />
            <Figure label="Net profit" value={m(pl.netProfit)} />
          </FigureRow></div>
          <div className="mt-6 grid gap-8 2xl:grid-cols-2">
            <Section title="Income" meta={m(pl.totalIncome)}>
              <DataTable getKey={(r) => r.account} rows={pl.income} columns={[
                { key: "a", header: "Account", render: (r) => <Link className="hover:underline" href={q({ tab: "tb", account: r.account })}>{r.account}</Link> },
                { key: "v", header: "Amount", align: "right", render: (r) => m(r.amount) },
              ]} />
            </Section>
            <Section title="Expenses" meta={m(pl.totalExpense)}>
              <DataTable getKey={(r) => r.account} rows={pl.expense} columns={[
                { key: "a", header: "Account", render: (r) => <Link className="hover:underline" href={q({ tab: "tb", account: r.account })}>{r.account}</Link> },
                { key: "v", header: "Amount", align: "right", render: (r) => m(r.amount) },
              ]} />
            </Section>
          </div>
          <Note>Cost of goods sold comes from the cost on each sale line (the counter fills it from Stock). Lines typed without a cost count as pure profit.</Note>
        </>
      ) : null}

      {ps.length && tab === "bs" ? (
        <>
          <div className="mt-6 grid gap-8 2xl:grid-cols-2">
            <Section title="Assets" meta={m(bs.totalAssets)}>
              <DataTable getKey={(r) => r.account} rows={bs.assets} columns={[
                { key: "a", header: "Account", render: (r) => <Link className="hover:underline" href={q({ tab: "tb", account: r.account })}>{r.account}</Link> },
                { key: "v", header: "Amount", align: "right", render: (r) => <span className={r.amount < 0 ? "text-bad" : ""}>{m(r.amount)}</span> },
              ]} />
            </Section>
            <Section title="Liabilities & equity" meta={m(bs.totalLiabilities + bs.totalEquity)}>
              <DataTable getKey={(r) => r.account} rows={[...bs.liabilities, ...bs.equity]} columns={[
                { key: "a", header: "Account", render: (r) => <Link className="hover:underline" href={q({ tab: "tb", account: r.account })}>{r.account}</Link> },
                { key: "v", header: "Amount", align: "right", render: (r) => <span className={r.amount < 0 ? "text-bad" : ""}>{m(r.amount)}</span> },
              ]} />
            </Section>
          </div>
          {bs.negatives.length ? (
            <p className="mt-4 rounded-sm border border-rule-strong bg-panel px-3 py-2 text-[0.8rem] text-ink-soft">
              {bs.negatives.join(", ")} {bs.negatives.length > 1 ? "are" : "is"} below zero, which usually means the opening balance was never entered:
              the cash, bank balance or stock you had before your first record here. Add a journal entry dated your first day:
              debit {bs.negatives[0]}, credit Opening balances, for what you had.{on("journal") ? <> <Link className="text-accent underline" href="/m/journal">Journal entries</Link></> : null}
            </p>
          ) : null}
          <Note>Stock is at cost: purchases in, the cost of each sale out. Profit to date is every income less every expense up to {to}.</Note>
        </>
      ) : null}

      {ps.length && tab === "tb" ? (
        account ? (
          <Section title={`Ledger: ${account}`} meta={<Link className="text-accent" href={q({ account: "" })}>All accounts</Link>}>
            {(() => {
              let run = 0;
              const rows = ps.filter((p) => p.account === account && p.date >= from).sort((a, c) => a.date.localeCompare(c.date)).map((p, i) => ({ ...p, i, run: (run += p.dr - p.cr) }));
              const opening = ps.filter((p) => p.account === account && p.date < from).reduce((t, p) => t + p.dr - p.cr, 0);
              return (
                <>
                  <p className="mb-2 text-[0.8rem] text-ink-soft">Opening balance on {from}: {m(opening)}</p>
                  <DataTable getKey={(r) => `${r.id}${r.i}`} rows={rows.map((r) => ({ ...r, run: r.run + opening }))} columns={[
                    { key: "d", header: "Date", render: (r) => r.date },
                    { key: "r", header: "Ref", render: (r) => r.ref || "—" },
                    { key: "m", header: "Details", render: (r) => r.memo },
                    { key: "dr", header: "Debit", align: "right", render: (r) => (r.dr ? m(r.dr) : "") },
                    { key: "cr", header: "Credit", align: "right", render: (r) => (r.cr ? m(r.cr) : "") },
                    { key: "b", header: "Balance", align: "right", render: (r) => m(r.run) },
                  ]} />
                </>
              );
            })()}
          </Section>
        ) : (
          <Section title="Trial balance" meta={`as of ${to}`}>
            <DataTable getKey={(r) => r.account} rows={tb} columns={[
              { key: "a", header: "Account", render: (r) => <Link className="hover:underline" href={q({ account: r.account })}>{r.account}</Link> },
              { key: "k", header: "Type", render: (r) => r.kind },
              { key: "dr", header: "Debit", align: "right", render: (r) => (r.balance > 0 ? m(r.balance) : "") },
              { key: "cr", header: "Credit", align: "right", render: (r) => (r.balance < 0 ? m(-r.balance) : "") },
            ]} />
            <p className="mt-2 text-right text-[0.8rem] font-semibold tabular-nums">
              {m(tb.reduce((t, r) => t + Math.max(r.balance, 0), 0))} = {m(tb.reduce((t, r) => t + Math.max(-r.balance, 0), 0))}
            </p>
          </Section>
        )
      ) : null}

      {tab === "verify" ? (() => {
        const issues = verifyData(recs, today, b);
        const balanced = Math.abs(tb.reduce((t, r) => t + r.balance, 0)) < 0.05;
        return (
          <Section title="Verify my data" meta={issues.length ? `${issues.filter((i) => i.level === "fix").length} to fix · ${issues.filter((i) => i.level === "check").length} to check` : "all clear"}>
            <ul className="divide-y divide-rule text-[0.86rem]">
              <li className="flex items-center justify-between gap-3 py-2"><span><span className={`mr-2 font-semibold ${balanced ? "text-good" : "text-bad"}`}>{balanced ? "OK" : "Fix"}</span>Trial balance {balanced ? "balances" : "doesn't balance"}</span></li>
              {issues.map((i) => (
                <li key={i.text} className="flex items-center justify-between gap-3 py-2">
                  <span><span className={`mr-2 font-semibold ${i.level === "fix" ? "text-bad" : "text-ink-soft"}`}>{i.level === "fix" ? "Fix" : "Check"}</span>
                    <span className="text-ink-faint">{i.area} · </span><span className="font-medium tabular-nums">{i.count}</span> {i.text}</span>
                  {i.link ? <Link className="shrink-0 text-accent underline-offset-2 hover:underline" href={i.link}>Open</Link> : null}
                </li>
              ))}
            </ul>
            {!issues.length ? <p className="mt-2 text-[0.84rem] text-good">Nothing found: stock, GST, invoices and customers look consistent.</p> : null}
          </Section>
        );
      })() : null}

      {ps.length && tab === "bank" ? (
        <Section title="Bank reconciliation" meta="statement against the books, matched by amount and date (±3 days)">
          <BankReconcile bank={ps.filter((p) => p.account === "Bank")} fmt={fmt} />
        </Section>
      ) : null}
    </>
  );
}
