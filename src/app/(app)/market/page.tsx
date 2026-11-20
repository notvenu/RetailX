import { t } from "@/lib/i18n";
import { requireArea } from "@/lib/session";
import { complete, isSnapshot, kpiSeries } from "@/lib/metrics";
import { benchmarkFor, BUILTIN_NOTE, placement, worthAtMedian, type Band, type Benchmark } from "@/lib/benchmarks";
import { measurableKpis } from "@/lib/catalog";
import { fmtUnit, type Fmt } from "@/lib/format";
import type { KpiDef } from "@/lib/model";
import { Empty, Figure, FigureRow, PageHeader, Section } from "@/components/ui";
import { RangeEdit, ResearchButton } from "@/components/MarketControls";

const BAND: Record<Band, { label: string; cls: string; dot: string }> = {
  top: { label: "Top quarter", cls: "text-good bg-good-wash border-good/25", dot: "bg-good" },
  above: { label: "Above typical", cls: "text-good bg-good-wash border-good/25", dot: "bg-good" },
  below: { label: "Below typical", cls: "text-warn bg-warn-wash border-warn/25", dot: "bg-warn" },
  bottom: { label: "Bottom quarter", cls: "text-bad bg-bad-wash border-bad/25", dot: "bg-bad" },
};

const ORIGIN: Record<Exclude<Benchmark["origin"], "builtin">, string> = { web: "Researched", owner: "Your figure" };

export default async function MarketPage() {
  const { lang, business: b, can } = await requireArea("analytics");
  const fmt: Fmt = { currency: b.currency, locale: b.locale };
  // flows (margins, rates) are compared on the last finished month; stock-type KPIs on where they stand now
  const lastFull = (k: KpiDef) => (isSnapshot(b, k) ? kpiSeries(b, k, "month").at(-1) : complete(kpiSeries(b, k, "month"), "month").at(-1));
  const all = measurableKpis(b);
  const revKpi = all.find((k) => k.unit === "money" && /(^|_)revenue$/.test(k.id));
  const revenue = revKpi ? lastFull(revKpi)?.value ?? null : null;
  const gapText = (k: KpiDef, gap: number) => (k.unit === "pct" ? `${Math.abs(gap).toFixed(1)} pts` : fmtUnit(Math.abs(gap), k.unit, fmt));

  const rows = all.flatMap((k) => {
    const bm = benchmarkFor(b, k);
    if (!bm) return [];
    const p = lastFull(k);
    const value = p?.value ?? null;
    const place = value != null ? placement(value, bm, k.higherIsBetter) : null;
    const worth = value != null ? worthAtMedian(k.id, value, bm, revenue) : null;
    return [{ k, bm, value, period: p?.label, place, worth, tracked: b.kpis.some((x) => x.id === k.id) }];
  });
  const measured = rows.filter((r) => r.place);
  const atOrAbove = measured.filter((r) => r.place!.band === "top" || r.place!.band === "above").length;
  const atStake = rows.reduce((s, r) => s + (r.worth ?? 0), 0);
  const researched = rows.map((r) => r.bm.asOf).filter(Boolean).sort().at(-1);
  const period = measured.find((r) => !isSnapshot(b, r.k))?.period;

  return (
    <>
      <PageHeader
        title={t(lang, "nav.market")}
        meta={`How ${b.name} compares with other ${b.category.toLowerCase()} businesses, on ratios that don't depend on size.`}
        actions={can("settings") ? <ResearchButton /> : null}
      />

      {!rows.length ? (
        <div className="mt-8"><Empty title="Nothing to compare yet">None of your KPIs has a market range. Margins, cost shares and rates (gross margin, payroll to revenue, return rate…) can be compared; add them in Settings → KPIs.</Empty></div>
      ) : (
        <>
          <div className="mt-6">
            <FigureRow>
              <Figure label="At or above typical" value={measured.length ? `${atOrAbove} of ${measured.length}` : "—"} />
              <Figure label="Below typical" value={measured.length ? String(measured.length - atOrAbove) : "—"} />
              <Figure label="Monthly gain at typical" value={atStake > 0 ? fmtUnit(atStake, "money", fmt) : "—"} />
              <Figure label="Compared on" value={period ?? "No full month yet"} />
            </FigureRow>
            <p className="mt-2 text-[0.75rem] text-ink-faint">
              Your figures are for the last finished month. &ldquo;Monthly gain at typical&rdquo; is what reaching the typical margin or cost share would be worth on that month&rsquo;s revenue.
              {researched ? ` Latest market figures: ${researched}.` : ""}
            </p>
          </div>

          <Section title="Your KPIs against the market" meta="bar: middle half of businesses · tick: typical · dot: you">
            <ul className="divide-y divide-rule border-y border-rule">
              {rows.map(({ k, bm, value, place, worth, tracked }) => {
                const lo = Math.min(bm.p25, value ?? bm.p25), hi = Math.max(bm.p75, value ?? bm.p75);
                const pad = (hi - lo) * 0.25 || Math.abs(bm.p50) * 0.25 || 1;
                const [min, max] = [lo - pad, hi + pad];
                const at = (v: number) => `${((v - min) / (max - min)) * 100}%`;
                const band = place ? BAND[place.band] : null;
                return (
                  <li key={k.id} className="grid gap-x-6 gap-y-2 py-4 md:grid-cols-[minmax(12rem,1fr)_minmax(14rem,1.4fr)_minmax(12rem,1fr)]">
                    <div>
                      <div className="font-medium text-ink">{k.name}</div>
                      <div className="text-[0.75rem] text-ink-faint">{k.higherIsBetter ? "Higher is better" : "Lower is better"}{isSnapshot(b, k) ? " · as of now" : ""}{tracked ? "" : " · not on your KPI list"}</div>
                      <div className="mt-1 text-[1.15rem] font-semibold tabular-nums text-ink">{fmtUnit(value, k.unit, fmt)}</div>
                    </div>

                    <div className="self-center">
                      <div
                        className="relative h-6"
                        role="img"
                        aria-label={`${k.name}: you ${fmtUnit(value, k.unit, fmt)}; market middle half ${fmtUnit(bm.p25, k.unit, fmt)} to ${fmtUnit(bm.p75, k.unit, fmt)}, typical ${fmtUnit(bm.p50, k.unit, fmt)}`}
                      >
                        <div className="absolute inset-x-0 top-1/2 h-px bg-rule-strong" />
                        <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-sm bg-accent/20" style={{ left: at(bm.p25), width: `calc(${at(bm.p75)} - ${at(bm.p25)})` }} />
                        <div className="absolute top-1 h-4 w-0.5 -translate-x-1/2 bg-ink-soft" style={{ left: at(bm.p50) }} />
                        {value != null && band ? <div className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-paper ${band.dot}`} style={{ left: at(value) }} /> : null}
                      </div>
                      <div className="text-center text-[0.7rem] tabular-nums text-ink-faint">
                        middle half {fmtUnit(bm.p25, k.unit, fmt)}–{fmtUnit(bm.p75, k.unit, fmt)} · typical {fmtUnit(bm.p50, k.unit, fmt)}
                      </div>
                    </div>

                    <div className="text-[0.8rem]">
                      {place && band ? (
                        <>
                          <span className={`inline-flex rounded-sm border px-1.5 py-0.5 text-[0.7rem] font-medium leading-none ${band.cls}`}>{band.label}</span>
                          <span className="ml-2 text-ink-soft">
                            {Math.abs(place.gap) < 1e-9 ? "at typical" : `${gapText(k, place.gap)} ${place.gap > 0 ? "better" : "worse"} than typical`}
                          </span>
                          {worth ? <div className="mt-1 text-ink">Worth about <b>{fmtUnit(worth, "money", fmt)}</b> a month at typical</div> : null}
                        </>
                      ) : (
                        <span className="text-ink-faint">No finished month recorded yet.</span>
                      )}
                      <div className="mt-1.5 text-[0.72rem] text-ink-faint">
                        {bm.origin === "builtin" ? BUILTIN_NOTE : ORIGIN[bm.origin]}
                        {bm.asOf ? ` · ${bm.asOf}` : ""}
                        {bm.source ? <> · {bm.url ? <a className="underline hover:text-accent" href={bm.url} target="_blank" rel="noopener noreferrer">{bm.source}</a> : bm.source}</> : null}
                        {bm.note ? ` · ${bm.note}` : ""}
                      </div>
                      {can("settings") ? <RangeEdit kpiId={k.id} current={bm} /> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title="About these figures">
            <div className="max-w-prose space-y-2 text-[0.82rem] text-ink-soft">
              <p>Each range shows where the middle half of comparable small businesses sit: a quarter do worse than the low end, a quarter better than the high end. &ldquo;Typical&rdquo; is the median.</p>
              <p>Built-in ranges are general rules of thumb for Indian MSMEs, not live data. <b>Research current figures</b> has the AI team search the web for recent industry figures and save each one with its source and date; KPIs it can&rsquo;t source keep their built-in range. You can also enter a figure you trust, from a trade association or your accountant, with <b>Set your own</b>.</p>
              <p>Your AI team sees these ranges too, so they can tell you when a number is unusual for your trade, not just unusual for you.</p>
            </div>
          </Section>
        </>
      )}
    </>
  );
}
