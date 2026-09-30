import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { SiteNav } from "@/components/site-nav";

export const SITE_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
];

export function Wordmark() {
  return (
    <Link href="/" className="text-[1.2rem] font-bold tracking-[-0.03em] text-ink">
      Retail<span className="text-accent">X</span>
    </Link>
  );
}

export function Wrap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1120px] px-5 sm:px-8 ${className}`}>{children}</div>;
}

export function DemoButton() {
  return (
    <Link
      href="/login"
      className="inline-flex items-center rounded-[4px] bg-accent px-4 py-2.5 text-[0.9rem] font-medium text-white transition-colors duration-150 hover:bg-accent-hover"
    >
      Open the demo
    </Link>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1.5 text-[0.9rem] font-medium text-accent underline-offset-4 hover:underline"
    >
      {children}
      <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={1.75} />
    </Link>
  );
}

export function Actions({ link }: { link?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
      <DemoButton />
      {link ? <TextLink href={link.href}>{link.label}</TextLink> : null}
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b border-rule">
      <Wrap className="flex h-16 items-center justify-between gap-6">
        <Wordmark />
        <SiteNav links={SITE_LINKS} />
      </Wrap>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-32 border-t border-rule">
      <Wrap className="flex flex-wrap items-end justify-between gap-6 py-10 text-[0.84rem]">
        <div>
          <Wordmark />
          <p className="mt-2 text-ink-soft">One set of books for every branch.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-ink-soft">
          {SITE_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-ink">
              {l.label}
            </Link>
          ))}
          <Link href="/login" className="hover:text-ink">
            Sign in
          </Link>
        </nav>
      </Wrap>
    </footer>
  );
}

/** Title block for the inner pages. */
export function PageIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Wrap className="pt-16 pb-4 lg:pt-24">
      <h1 className="max-w-[46rem] text-[clamp(2.3rem,4.6vw,3.4rem)] font-semibold leading-[1.04] tracking-[-0.038em] text-balance text-ink">
        {title}
      </h1>
      <div className="mt-6 max-w-[38rem] text-[1.06rem] leading-relaxed text-ink-soft">{children}</div>
    </Wrap>
  );
}

/** A report section: heading and standfirst on a hairline, content below. */
export function Chapter({ id, title, lede, children }: { id?: string; title: string; lede?: ReactNode; children?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <Wrap className="pt-24">
        <div className="grid gap-4 border-t border-rule-strong pt-6 lg:grid-cols-12">
          <h2 className="text-[1.65rem] font-semibold leading-tight tracking-[-0.025em] text-balance text-ink lg:col-span-5">
            {title}
          </h2>
          {lede ? <div className="max-w-[38rem] text-[0.98rem] leading-relaxed text-ink-soft lg:col-span-7">{lede}</div> : null}
        </div>
        {children ? <div className="mt-10">{children}</div> : null}
      </Wrap>
    </section>
  );
}

/** Ruled list with a heavy top rule; draws its rules in once on load when `animate`. */
export function RuledList({
  title,
  rows,
  animate = false,
}: {
  title: string;
  rows: { label: string; value: string }[];
  animate?: boolean;
}) {
  return (
    <div className={animate ? "rx-post" : undefined}>
      <h2 className="border-b-2 border-ink pb-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink">{title}</h2>
      <dl>
        {rows.map((r, i) => (
          <div key={r.label} className="relative py-4" style={{ "--i": i } as CSSProperties}>
            <span aria-hidden className="rx-post-rule absolute inset-x-0 bottom-0 h-px bg-rule" />
            <dt className="rx-post-value text-[1.05rem] font-medium tracking-[-0.01em] text-ink">{r.label}</dt>
            <dd className="rx-post-value mt-1 text-[0.86rem] text-ink-soft">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Numbered note: the number sits in the margin, the way annual-report notes do. */
export function NumberedNote({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <article
      id={`note-${n}`}
      className="rx-note grid scroll-mt-6 grid-cols-[2.75rem_minmax(0,1fr)] gap-x-4 border-b border-rule py-7 sm:grid-cols-[4.5rem_minmax(0,1fr)]"
    >
      <span className="rx-note-n pt-0.5 text-[1.9rem] font-light leading-none tracking-[-0.04em] text-ink-faint sm:text-[2.3rem]">
        {n}
      </span>
      <div>
        <h3 className="text-[1.1rem] font-semibold tracking-[-0.012em] text-ink">{title}</h3>
        <div className="mt-2 max-w-[36rem] text-[0.93rem] leading-relaxed text-ink-soft">{children}</div>
      </div>
    </article>
  );
}

/** The five-step chain from a transaction to a decision. */
const CHAIN = [
  { title: "Record", body: "Invoices, goods received, purchase orders, payroll and expenses, entered where the work happens." },
  { title: "Consolidate", body: "Every branch posts to one set of books, closed monthly." },
  { title: "Measure", body: "Margins, turnover, stock-outs and costs, each against target and the month before." },
  { title: "Forecast", body: "The months ahead with a stated range, and each product's demand for the next fortnight." },
  { title: "Decide", body: "A recommendation with scenarios, risk and the assumptions that move it." },
];

export function Chain() {
  return (
    <ol className="grid border-t-2 border-ink sm:grid-cols-2 lg:grid-cols-5">
      {CHAIN.map((s, i) => (
        <li key={s.title} className="border-b border-rule py-5 pr-6 lg:border-b-0 lg:border-r lg:pl-5 lg:first:pl-0 lg:last:border-r-0">
          <span className="text-[0.8rem] text-ink-soft">Step {i + 1}</span>
          <h3 className="mt-1 text-[1.05rem] font-semibold text-ink">{s.title}</h3>
          <p className="mt-2 text-[0.88rem] leading-relaxed text-ink-soft">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** The seven modules, shared by Home and Features. */
export const MODULES = [
  {
    title: "Finance and accounting",
    short: "A monthly P&L across branches, with every line against target and the month before.",
    long: "Revenue, cost of goods and operating expenses post to one monthly P&L for the whole business, built from the branch books. Every line is compared with its target and with the month before, so a slipping margin is visible the month it slips.",
    keeps: ["Trailing twelve-month P&L", "Expense register by category", "Receivables ageing", "KPI register with targets"],
  },
  {
    title: "Sales and customers",
    short: "Invoices, customer balances and revenue by branch in one register.",
    long: "Invoices by branch and customer, wholesale balances still owed, average bill and sales against target. A slow branch shows up before the quarter closes, not after.",
    keeps: ["Invoice register with payment status", "Wholesale and contract customers", "Revenue and margin by branch"],
  },
  {
    title: "Stock and purchasing",
    short: "Stock against reorder levels, and how much of each product to order next.",
    long: "Stock on hand against reorder levels, purchase orders by supplier, and a demand forecast for every product in every branch. The suggested order covers that forecast plus safety stock, so shelves stay full without tying cash up in the storeroom.",
    keeps: ["Stock status by product", "Purchase orders and supplier terms", "Demand forecast and suggested orders"],
  },
  {
    title: "People and payroll",
    short: "Employees, payroll runs and access that follows each person's job.",
    long: "Employees, monthly payroll runs and headcount by branch. Four roles decide what each person can open: owners and managers see everything, the accountant sees the finance books, and floor staff see sales and stock.",
    keeps: ["Employee register", "Payroll runs with approval", "Role-based access on every page"],
  },
  {
    title: "Forecasting",
    short: "The months ahead with a stated range, and the model's own track record beside it.",
    long: "Revenue for the months ahead with a range that widens the further out it looks, drawn beside recent actuals and what the model predicted for each of them. A forecast that carries its own track record is one you can plan against.",
    keeps: ["Revenue forecast with range", "Back-test against recent months", "Forecast versus actual, month by month"],
  },
  {
    title: "Analytics and anomaly checks",
    short: "A daily check on every branch, so an odd day is seen the week it happens.",
    long: "Each branch's revenue, margin, discount, footfall, shrinkage and stock-outs are checked every day against the same weekday. Days that fall well outside the usual range go to a log with the expected value and the day-book note beside them.",
    keeps: ["KPI drill-down by branch", "Branch health score", "Anomaly log with severity"],
  },
  {
    title: "Branch opening evaluation",
    short: "A tested answer on whether a new branch will pay back.",
    long: "Enter a site's investment, rent, staffing and expected sales, and get ROI, ROCE, break-even and payback across conservative, base and optimistic cases, with the assumptions that move the answer most, before the lease is signed.",
    keeps: ["Three scenarios with a recommendation", "Sensitivity of payback to each assumption", "Break-even and cash-flow impact"],
  },
];
