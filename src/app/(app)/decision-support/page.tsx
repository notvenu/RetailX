import Link from "next/link";
import { Building2, ArrowRight } from "lucide-react";
import { PageHeader, Section, Figure, FigureRow, StatusPill } from "@/components/ui";
import { RECOMMENDATIONS, SUMMARY, ORG } from "@/lib/mock";
import { kpi } from "@/lib/kpi";
import { moneyCompact, pct } from "@/lib/format";

const open = RECOMMENDATIONS.length;

export default function DecisionSupportPage() {
  return (
    <>
      <PageHeader
        title="Decision support"
        meta={`${ORG.name} · prescriptive analytics`}
      />

      <div className="mt-6">
        <FigureRow>
          <Figure label="Break-even achievement" value={pct(SUMMARY.breakEvenAchievement)} deltas={[{ value: SUMMARY.breakEvenAchievement - 100, label: "above break-even", suffix: "pts" }]} />
          <Figure label={kpi("roce").label} value={kpi("roce").display} deltas={[{ value: kpi("roce").value - kpi("roce").target, label: "vs target", suffix: "pts" }]} />
          <Figure label="Cash on hand" value={moneyCompact(SUMMARY.cashOnHand)} />
          <Figure label="Open recommendations" value={String(open)} />
        </FigureRow>
      </div>

      <Section title="Recommendations" meta="driver → action → expected impact">
        <ul className="divide-y divide-rule">
          {RECOMMENDATIONS.map((r) => (
            <li key={r.title} className="py-5 first:pt-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-[0.95rem] font-semibold text-ink">{r.title}</h3>
                <div className="flex items-center gap-3 text-[0.74rem] text-ink-soft">
                  <span>Risk <StatusPill>{r.risk}</StatusPill></span>
                  <span className="inline-flex items-center gap-1.5">
                    Confidence
                    <span className="h-1.5 w-16 rounded-full bg-panel-deep">
                      <span className="block h-full rounded-full bg-accent/75" style={{ width: `${r.confidence * 100}%` }} />
                    </span>
                    <span className="num font-medium text-ink">{Math.round(r.confidence * 100)}%</span>
                  </span>
                </div>
              </div>
              <dl className="mt-2 grid gap-x-8 gap-y-1.5 text-[0.82rem] sm:grid-cols-[5rem_1fr]">
                <dt className="text-ink-faint">Driver</dt><dd className="text-ink-soft">{r.driver}</dd>
                <dt className="text-ink-faint">Action</dt><dd className="text-ink">{r.action}</dd>
                <dt className="text-ink-faint">Impact</dt><dd className="font-medium text-good">{r.impact}</dd>
              </dl>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Scenario evaluation">
        <div className="flex flex-wrap items-center justify-between gap-4 border border-rule bg-panel/60 px-5 py-4">
          <div className="max-w-xl">
            <p className="flex items-center gap-2 text-[0.9rem] font-semibold text-ink">
              <Building2 className="size-4 text-accent" strokeWidth={1.75} />
              New branch opening evaluation
            </p>
            <p className="mt-1 text-[0.8rem] text-ink-soft">
              Enter assumptions for a proposed location and get investment, ROI, ROCE, break-even,
              payback and cash-flow impact across conservative, base and optimistic cases, with the
              assumptions that move the decision most.
            </p>
          </div>
          <Link
            href="/branch-evaluation"
            className="inline-flex items-center gap-1.5 rounded-[4px] bg-accent px-3.5 py-2 text-[0.82rem] font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Open evaluation <ArrowRight className="size-4" />
          </Link>
        </div>
      </Section>
    </>
  );
}
