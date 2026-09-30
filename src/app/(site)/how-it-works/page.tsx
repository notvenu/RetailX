import type { Metadata } from "next";
import { Actions, Chain, Chapter, PageIntro } from "@/components/site";

export const metadata: Metadata = {
  title: "How it works — RetailX",
  description:
    "How RetailX turns recorded transactions into forecasts, anomaly checks and branch recommendations, how each model is tested, and where it stops being reliable.",
};

const MODELS = [
  {
    title: "Revenue forecast",
    summary: "The months ahead for the whole business, with a range that widens the further out it looks.",
    rows: [
      { k: "Method", v: "Holt's exponential smoothing with a damped trend" },
      { k: "Reads", v: "Consolidated monthly revenue" },
      { k: "Tested by", v: "Predicting each recent month using only the months before it, then comparing with what happened" },
      { k: "Limits", v: "With under two years of history it cannot learn the yearly festival pattern, so festival months need a manual plan beside it." },
    ],
  },
  {
    title: "Anomaly checks",
    summary: "A daily look over every branch's shoulder, so an odd day is seen the week it happens.",
    rows: [
      { k: "Method", v: "Each metric compared with the same weekday on the month's other ordinary days, and the gap scored against the usual spread" },
      { k: "Reads", v: "Revenue, gross margin, discount, footfall, shrinkage and stock-outs, per day; festival days skipped" },
      { k: "Tested by", v: "Incidents logged in the day book: how many it catches, and how often it raises a false alarm" },
      { k: "Limits", v: "Margin and discount problems stand out clearly; small changes in footfall or shrinkage can hide in normal noise." },
    ],
  },
  {
    title: "Demand and reorder",
    summary: "How many of each product each branch will need over the next fortnight, and how much to order.",
    rows: [
      { k: "Method", v: "Average demand for each weekday on ordinary days, with safety stock sized from how much demand varies" },
      { k: "Reads", v: "Units sold plus sales lost to empty shelves, so it forecasts demand rather than what happened to be in stock" },
      { k: "Tested by", v: "Holding back the last week and comparing with a simple rule: the same weekday a week earlier" },
      { k: "Limits", v: "Festivals are left out of the average, so festival weeks need their own order plan." },
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageIntro title="From a sale to a decision">
        <p>
          How RetailX turns the transactions a shop records into forecasts, checks and recommendations, how each
          model is tested, and where it stops being reliable.
        </p>
      </PageIntro>

      <Chapter title="The chain" lede="Every report is built in this order, from the records up.">
        <Chain />
      </Chapter>

      <Chapter
        title="The models"
        lede="Three models read the books. Each is tested on data it never saw, and each has limits worth knowing before you act on it."
      >
        <div>
          {MODELS.map((m) => (
            <article key={m.title} className="grid gap-x-12 gap-y-4 border-b border-rule py-9 first:pt-0 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <h3 className="text-[1.15rem] font-semibold tracking-[-0.015em] text-ink">{m.title}</h3>
                <p className="mt-2 text-[0.92rem] leading-relaxed text-ink-soft">{m.summary}</p>
              </div>
              <dl className="border-t border-rule text-[0.9rem] lg:col-span-8">
                {m.rows.map((r) => (
                  <div key={r.k} className="grid gap-1 border-b border-rule py-3 sm:grid-cols-[7.5rem_1fr] sm:gap-6">
                    <dt className="font-medium text-ink">{r.k}</dt>
                    <dd className="leading-relaxed text-ink-soft">{r.v}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </Chapter>

      <Chapter
        title="Decisions come with scenarios"
        lede="The branch evaluation never gives a single number. Every answer arrives as conservative, base and optimistic cases, with the risk in each and the assumptions that would change it."
      >
        <Actions link={{ href: "/features", label: "See every module" }} />
      </Chapter>
    </>
  );
}
