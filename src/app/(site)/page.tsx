import type { Metadata } from "next";
import Link from "next/link";
import { Actions, Chain, Chapter, MODULES, RuledList, TextLink, Wrap } from "@/components/site";

export const metadata: Metadata = {
  title: "RetailX — one set of books for every branch",
  description:
    "An ERP for multi-branch retailers: finance, sales, stock, purchasing and payroll in one set of books, with forecasts, anomaly checks and a branch-opening evaluation built on them.",
};

export default function Home() {
  return (
    <>
      <Wrap className="grid gap-14 pt-16 lg:grid-cols-12 lg:gap-16 lg:pt-28">
        <div className="lg:col-span-7">
          <h1 className="text-[clamp(2.6rem,5.6vw,4.1rem)] font-semibold leading-[1.02] tracking-[-0.042em] text-balance text-ink">
            One set of books for every branch, and a straight answer on the next one.
          </h1>
          <p className="mt-7 max-w-[34rem] text-[1.1rem] leading-relaxed text-ink-soft">
            RetailX keeps a retailer&apos;s sales, stock, purchases, payroll and expenses in one place, then reads
            them forward: what next month looks like, what went wrong this week, what to reorder, and whether a new
            branch will pay back.
          </p>
          <div className="mt-10">
            <Actions link={{ href: "/how-it-works", label: "How it works" }} />
          </div>
        </div>

        <div className="lg:col-span-5 lg:pt-3">
          <RuledList
            animate
            title="The questions it answers"
            rows={[
              { label: "How are we doing?", value: "The month's P&L and KPIs against target" },
              { label: "What changed?", value: "Daily checks that flag the unusual day" },
              { label: "What comes next?", value: "Forecasts for revenue and demand" },
              { label: "Should we open another branch?", value: "Scenarios, payback and a recommendation" },
            ]}
          />
        </div>
      </Wrap>

      <Chapter
        title="Seven modules, one set of records"
        lede="Each module keeps its own books, and every report reads from the same records, so a figure on one page can be traced to the transactions behind it."
      >
        <div className="grid gap-x-12 border-t border-rule md:grid-cols-2">
          {MODULES.map((m, i) => (
            <Link
              key={m.title}
              href={`/features#note-${i + 1}`}
              className="group grid grid-cols-[2.5rem_1fr] gap-x-3 border-b border-rule py-5"
            >
              <span className="text-[1.15rem] font-light text-ink-faint transition-colors duration-150 group-hover:text-accent">
                {i + 1}
              </span>
              <span>
                <span className="block text-[1rem] font-semibold text-ink transition-colors duration-150 group-hover:text-accent">
                  {m.title}
                </span>
                <span className="mt-1 block text-[0.88rem] leading-relaxed text-ink-soft">{m.short}</span>
              </span>
            </Link>
          ))}
        </div>
      </Chapter>

      <Chapter
        title="From a sale to a decision"
        lede="Reports are built in one order, from the records up, so every forecast and recommendation rests on what was actually recorded."
      >
        <Chain />
        <div className="mt-8">
          <TextLink href="/how-it-works">How the forecasts are made and tested</TextLink>
        </div>
      </Chapter>

      <Chapter
        title="See it working"
        lede="Sign in as the owner, a branch manager, the accountant or a floor employee. Each role sees only the books its job needs."
      >
        <Actions link={{ href: "/about", label: "About the project" }} />
      </Chapter>
    </>
  );
}
