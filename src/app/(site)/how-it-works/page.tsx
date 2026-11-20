import type { Metadata } from "next";
import { Actions, Chain, Chapter, PageIntro } from "@/components/site";

export const metadata: Metadata = {
  title: "How it works — RetailX",
  description:
    "How RetailX builds a workspace from your onboarding answers, how its forecasts are chosen and tested, and how AI roles coach and act.",
};

const PARTS = [
  {
    title: "Onboarding",
    summary: "Ten short steps that turn a description of your business into a working system.",
    rows: [
      { k: "Asks", v: "Business basics, industry and category, whether you keep stock, sell on credit, pay salaries, how many locations, how you sell, and this year's goals" },
      { k: "Builds", v: "Modules with the right fields, KPIs ordered by your goals, forecasts on your headline number, AI roles, starter automations, team roles and a dashboard" },
      { k: "You change", v: "Everything, before launch and any time after in Settings: switch modules, edit fields, build KPIs, hire AI roles, set access, pick a theme" },
    ],
  },
  {
    title: "Forecasting",
    summary: "Ten models compete on your own history; the one with the smallest error on data it never saw wins.",
    rows: [
      { k: "Models", v: "Naive, seasonal naive, drift, long-run mean, moving average, exponential smoothing, damped trend, Holt-Winters (additive and multiplicative), trend + season regression" },
      { k: "Tested by", v: "Rolling-origin back-test: forecast from several past points using only earlier data, compare with what happened, score by sMAPE, MASE, RMSE or MAE" },
      { k: "You set", v: "What to forecast, daily to quarterly, how far ahead, seasonality, confidence range, log transform, and what-if scenarios" },
      { k: "Limits", v: "Short histories give wide ranges, and the page says so. When a model can't beat simply repeating last period, you're told to treat it as a rough range." },
    ],
  },
  {
    title: "Analytics",
    summary: "KPIs explained, not just reported.",
    rows: [
      { k: "Measures", v: "Each KPI is a formula over totals, counts or averages of your records, filtered as you choose, for any period from a day to a year" },
      { k: "Explains", v: "Driver analysis splits the change between the last two periods by category, channel, location or any other field" },
      { k: "Watches", v: "Days far from their usual weekday level, scored by a robust z-score at the sensitivity you set" },
    ],
  },
  {
    title: "AI roles",
    summary: "A leadership team that reads your books and works within limits you set.",
    rows: [
      { k: "Each has", v: "A mandate, responsibilities, the KPIs it owns, a tone, and an autonomy level: advise, draft or act" },
      { k: "Can", v: "Read KPIs, trends, records and forecasts; create and complete tasks; draft or switch on automations; set targets (act level only)" },
      { k: "Won't", v: "Quote a figure the books can't produce. Without an AI key, roles still give rule-based briefings from your KPIs." },
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageIntro title="From sign-up to decisions">
        <p>How RetailX builds a workspace from your answers, how it measures and forecasts, and how your AI team coaches and acts.</p>
      </PageIntro>

      <Chapter title="The path" lede="Every business goes through the same five steps, in this order.">
        <Chain />
      </Chapter>

      <Chapter title="The parts" lede="What each part does, how it is checked, and what you control.">
        <div>
          {PARTS.map((m) => (
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

      <Chapter title="One login, one role" lede="Each person signs in with their own email, phone or username. That login belongs to one business and one role, so nobody chooses a role at the door, and each sees only what their role can open.">
        <Actions link={{ href: "/features", label: "See everything it does" }} />
      </Chapter>
    </>
  );
}
