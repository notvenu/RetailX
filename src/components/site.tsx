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

export function StartButton() {
  return (
    <Link
      href="/signup"
      className="inline-flex items-center rounded-sm bg-accent px-4 py-2.5 text-[0.9rem] font-medium text-white transition-colors duration-150 hover:bg-accent-hover"
    >
      Set up your business
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
      <StartButton />
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
          <p className="mt-2 text-ink-soft">The operating system for small business.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-ink-soft">
          {SITE_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-ink">
              {l.label}
            </Link>
          ))}
          <Link href="/signin" className="hover:text-ink">
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
  { title: "Describe", body: "Sign up and tell us your industry, category and how you work. Ten short steps, about five minutes." },
  { title: "Shape", body: "Get modules, KPIs, forecasts and an AI team suggested for businesses like yours. Change any of it." },
  { title: "Record", body: "Enter sales, stock, costs and people in quick forms, or import your spreadsheets in one paste." },
  { title: "Understand", body: "KPIs against target, what moved them, unusual days, and forecasts that prove their accuracy." },
  { title: "Act", body: "Your AI CFO, COO and GM coach you, raise tasks and run the automations you approve." },
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

/** What the platform does, shared by Home and Features. */
export const MODULES = [
  {
    title: "Onboarding built around your trade",
    short: "Fourteen industries, their categories, and the questions that decide what you need.",
    long: "Pick your industry and category, say whether you keep stock, sell on credit, pay salaries or run several locations, and name this year's goals. The workspace is assembled from those answers: a pharmacy gets expiry dates, a restaurant a daily register with food cost, an agency timesheets and a pipeline.",
    keeps: ["14 industries, 70+ categories", "Category-specific fields", "Goal-driven KPI priorities", "Live preview while you answer"],
  },
  {
    title: "A billing counter that never stops",
    short: "Scan, speak or search; bill in cash, UPI, card or credit; keep selling when the internet drops.",
    long: "A keyboard-first counter with several bills open at once. Scan a barcode with a scanner or the phone camera, or say \u201c3 milk\u201d. Take cash, UPI with a QR for the exact amount, card or credit with a limit per customer, loyalty points, returns against the original bill and quotations billed in one click. If the connection drops, bills wait on the device and are sent exactly once when it returns. Receipts print on 58 or 80 mm paper, invoices on A4 in three layouts.",
    keeps: ["Offline billing", "Returns and credit notes", "Loyalty points and credit limits", "Day close with cash count"],
  },
  {
    title: "Offers, expiry and stock rules",
    short: "Coupons, combos and near-expiry discounts; first-expiry-first-out; wholesale prices; limits per cashier.",
    long: "Coupons, combos and near-expiry offers apply by themselves and are priced again on the server. Insights suggests the discount that clears a batch before it expires, never below cost plus 5%. A scan sells the batch that expires first, expired stock is refused, wholesale prices start from a minimum quantity, and each role can have a maximum discount that the owner can lift with a PIN. Move stock between branches and warehouses.",
    keeps: ["Coupons and combos", "Batch and expiry", "Wholesale and customer rates", "Cashier limits and owner PIN"],
  },
  {
    title: "Modules you can reshape",
    short: "Switch registers on, rename them, reorder the sidebar, and add your own fields or whole modules.",
    long: "Every module is a register you control: add a field, make one required, turn a text box into a choice list, change what dates a record, or build a module from scratch for the thing only your business tracks. Quick-entry forms, search, edit, CSV import and export come with every one.",
    keeps: ["24 ready-made registers", "Custom fields and modules", "Spreadsheet import and export", "Sidebar order and grouping"],
  },
  {
    title: "KPIs you define",
    short: "A library of 55 measures, or build your own formula from any module's fields.",
    long: "Pick from a library matched to your modules, set targets, and say whether higher or lower is better. Or compose your own: totals, counts and averages of any field, filtered by any condition, combined in a formula, for example repeat-customer share or margin on a single category.",
    keeps: ["Targets and variance", "Formula builder with filters", "Any period: day to year", "Comparison with last period or last year"],
  },
  {
    title: "Forecasting that shows its working",
    short: "Ten models compete on your own history; the most accurate wins, with a range and its track record.",
    long: "Naive baselines, moving averages, exponential smoothing, damped trend, Holt-Winters and seasonal regression are each back-tested on your data with a rolling origin. You see every model's error, the one chosen, a confidence range, and what-if scenarios. Pick the horizon, granularity, seasonality and model yourself if you prefer.",
    keeps: ["Rolling-origin back-test", "sMAPE, MASE, RMSE, bias", "Confidence ranges", "What-if scenarios"],
  },
  {
    title: "Insights and a restock autopilot",
    short: "Who owes you, what is not selling, what to reorder and why; and orders placed within limits you set.",
    long: "Dues by age with a WhatsApp reminder per customer, stock that has not sold, products that will expire before they sell, supplier scorecards, best customers and counter exceptions. Each reorder shows its demand, safety stock and reason, and a what-if simulator shows the effect of a late supplier. The autopilot can place routine orders from suppliers you tick, under a weekly cap, never twice for the same item, and never pays anyone.",
    keeps: ["Dues and overdue bills", "Plain-language reorder reasons", "What-if simulator", "Autopilot with guardrails"],
  },
  {
    title: "Analytics that explains",
    short: "Not just what happened: which category, channel or location moved it, and which days were unusual.",
    long: "A KPI register against target and prior period, drill-down at any granularity, breakdowns you configure, a driver analysis that finds the groups behind a change, and an anomaly log that flags days far from their usual weekday level at a sensitivity you set.",
    keeps: ["Driver analysis", "Configurable breakdowns", "Anomaly log", "Day to year views"],
  },
  {
    title: "Books and GST",
    short: "Profit and loss, balance sheet and trial balance from the records you already keep; GST files and Tally.",
    long: "Every bill, purchase, expense, pay run and payment is posted to the books for you, so the trial balance always balances. Add payments with TDS and cheques, journal entries, fixed assets with depreciation and a bank statement to reconcile. File-ready outputs: GSTR-1 and GSTR-9 summaries, e-way bill JSON, TCS and Form 27EQ, export to and import from Tally, and a Verify my data check that finds problems before your accountant does.",
    keeps: ["Profit & loss, balance sheet", "Bank reconciliation", "GSTR-1, GSTR-9, e-way bill", "Tally export and import"],
  },
  {
    title: "An AI leadership team",
    short: "A CFO, COO, CTO, Head of People and General Manager, or roles you invent, each coaching from your numbers.",
    long: "Each AI role has a mandate, responsibilities, the KPIs it owns and an autonomy level you choose: advise only, draft for your approval, or act. They read your books through the same KPIs you see, answer in plain language, create tasks, draft or switch on automations, and work through tasks you assign them.",
    keeps: ["Default and custom roles", "Advise, draft or act", "Briefings from live KPIs", "Works on assigned tasks"],
  },
  {
    title: "Automations and tasks",
    short: "When a record is saved, on a schedule, or when a KPI crosses a line: create a task, notify, or update the record.",
    long: "Chase every unpaid bill, reorder when stock hits its level, review large expenses, alert when margin drops. Build automations in plain terms, or let an AI role draft them. Tasks land on a board for people or AI roles, with due dates and results.",
    keeps: ["Record, schedule and KPI triggers", "Conditions with field references", "Tasks for people or AI", "Activity log"],
  },
  {
    title: "Your workspace, your way",
    short: "Drag and resize dashboard tiles, choose colours, dark mode, type, density and sidebar side.",
    long: "The dashboard is a grid of tiles you arrange: KPIs, trends, forecasts, breakdowns, latest records, tasks, an AI briefing or a note, each one sized and placed where you want it. The theme follows your brand, and every person signs in with their own email, phone or username tied to one role.",
    keeps: ["Drag-and-drop dashboard", "Accent, dark mode, fonts", "Role-based access", "One login per person"],
  },
  {
    title: "Optional features you switch on",
    short: "Product certificates and nutrition labels, chosen at set-up or later in Settings.",
    long: "Some businesses need more on each product. Switch on certificates to keep a lab report, FSSAI or ISI link with who issued it and until when, and be warned before it runs out. Switch on nutrition labels for ingredients, nutrition per serving, a veg mark, allergens and FSSAI number, printed as pack labels with a QR to the certificate. Switching a feature off hides its fields and keeps what you entered. Scan a supplier\u2019s bill with your phone to fill a stock-in.",
    keeps: ["Certificates with expiry warnings", "Nutrition and pack labels", "On or off any time", "Supplier-bill scanning"],
  },
];
