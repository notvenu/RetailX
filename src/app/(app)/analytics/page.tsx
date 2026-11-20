import { t } from "@/lib/i18n";
import Link from "next/link";
import { requireArea } from "@/lib/session";
import { breakdown, complete, drivers, isSnapshot, kpiByGroup, kpiSeries, kpiStatus, moneyField } from "@/lib/metrics";
import { eventDays } from "@/lib/planning";
import { anomalies } from "@/lib/forecast";
import { fmtUnit, type Fmt } from "@/lib/format";
import type { Grain, KpiDef } from "@/lib/model";
import { BarComposition, LineChart, Sparkline } from "@/components/charts";
import { DataTable, Delta, Empty, PageHeader, Section, StatusPill } from "@/components/ui";
import { AREA_LABEL } from "@/lib/catalog";

const GRAINS: Grain[] = ["day", "week", "month", "quarter", "year"];

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const { lang, business: b } = await requireArea("analytics");
  const sp = await searchParams;
  const fmt: Fmt = { currency: b.currency, locale: b.locale };
  const grain = GRAINS.includes(sp.grain as Grain) ? (sp.grain as Grain) : b.analytics.grain;
  const kpi = b.kpis.find((k) => k.id === sp.kpi) ?? b.kpis[0];
  const q = (p: Record<string, string>) => "?" + new URLSearchParams({ grain, ...(kpi ? { kpi: kpi.id } : {}), ...p }).toString();

  if (!kpi) {
    return (
      <>
        <PageHeader title={t(lang, "nav.analytics")} />
        <div className="mt-8"><Empty title="No KPIs yet">Add KPIs in Settings → KPIs to see them measured here.</Empty></div>
      </>
    );
  }

  const stats = b.kpis.map((k) => kpiStatus(b, k, grain, b.analytics.compareTo));
  const series = complete(kpiSeries(b, kpi, grain), grain);
  const vals = series.map((p) => p.value).filter((v): v is number => v != null);
  const why = drivers(b, kpi, grain);
  // compare groups: any choice field shared by the KPI's modules (location, channel, category…)
  const kpiMods = [...new Set(Object.values(kpi.metrics).map((m) => m.module))];
  const groupFields = (b.modules.find((m) => m.id === kpiMods[0])?.fields ?? [])
    .filter((f) => f.type === "select" && kpiMods.every((id) => b.modules.find((m) => m.id === id)?.fields.some((x) => x.key === f.key)));
  const by = groupFields.find((f) => f.key === sp.by) ?? groupFields.find((f) => f.key === "location") ?? groupFields[0];
  const cmp = by ? kpiByGroup(b, kpi, grain, by.key) : null;
  const yoy = grain === "month" || grain === "quarter" ? (() => {
    const s = complete(kpiSeries(b, kpi, grain), grain);
    const back = grain === "month" ? 12 : 4;
    return s.slice(-6).map((p, i, arr) => ({ p, prev: s[s.length - arr.length + i - back] })).filter((x) => x.prev);
  })() : [];
  const unitOf = (k: KpiDef) => (k.unit === "pct" ? "pts" : "%");

  // anomalies: each dated KPI by day over the last 120 days, against its same-weekday norm
  // festival and promotion days are expected to be unusual: they're blanked out, not flagged
  const evDays = eventDays(b.events);
  const flags = b.kpis
    .filter((k) => !isSnapshot(b, k))
    .flatMap((k) => {
      const s = kpiSeries(b, k, "day").slice(-120);
      return anomalies(s.map((p) => (evDays.has(p.key) ? null : p.value)), 7, b.analytics.anomalyZ).map((a) => ({ k, label: s[a.index].label, key: s[a.index].key, ...a }));
    })
    .sort((x, y) => y.key.localeCompare(x.key))
    .slice(0, 25);

  return (
    <>
      <PageHeader
        title={t(lang, "nav.analytics")}
        meta={`Measured ${grain === "day" ? "daily" : grain + "ly"} against ${b.analytics.compareTo === "previous" ? "the previous period" : "the same period last year"}`}
        actions={
          <nav aria-label="Period" className="flex gap-1 rounded-sm border border-rule-strong bg-panel/60 p-0.5 text-[0.78rem]">
            {GRAINS.map((g) => (
              <Link key={g} href={q({ grain: g })} aria-current={g === grain ? "page" : undefined}
                className={`rounded-sm px-2.5 py-1 capitalize ${g === grain ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "text-ink-soft hover:text-ink"}`}>{g}</Link>
            ))}
          </nav>
        }
      />

      <Section title="KPI register" meta="Select a KPI to drill in">
        <DataTable
          getKey={(s) => s.kpi.id}
          rows={stats}
          rowClassName={(s) => (s.kpi.id === kpi.id ? "bg-accent-wash" : "")}
          columns={[
            { key: "n", header: "KPI", render: (s) => <Link href={q({ kpi: s.kpi.id })} className="font-medium text-ink hover:text-accent">{s.kpi.name}<span className="ml-2 text-[0.7rem] font-normal text-ink-faint">{AREA_LABEL[s.kpi.area]}</span></Link> },
            { key: "p", header: "Period", render: (s) => <span className="text-ink-soft">{s.period}</span> },
            { key: "v", header: "Value", align: "right", render: (s) => <span className="font-medium">{fmtUnit(s.value, s.kpi.unit, fmt)}</span> },
            { key: "pp", header: "vs prior", align: "right", render: (s) => (s.vsPrevious == null ? "—" : <span title={`vs ${s.versus}`}><Delta value={s.vsPrevious} suffix={unitOf(s.kpi)} higherIsBetter={s.kpi.higherIsBetter} /></span>) },
            { key: "t", header: "Target", align: "right", render: (s) => fmtUnit(s.kpi.target, s.kpi.unit, fmt) },
            { key: "vt", header: "vs target", align: "right", render: (s) => (s.vsTarget == null ? "—" : <Delta value={s.vsTarget} suffix={unitOf(s.kpi)} higherIsBetter={s.kpi.higherIsBetter} />) },
            { key: "s", header: "Trend", render: (s) => <Sparkline data={s.spark} tone={s.status === "bad" ? "bad" : "accent"} width={96} height={22} /> },
            { key: "st", header: "Status", render: (s) => (s.status === "none" ? <span className="text-ink-faint">No data</span> : <StatusPill>{s.status}</StatusPill>) },
          ]}
        />
      </Section>

      <Section title={`${kpi.name}: drill-down`} meta={<>Finished periods · <code className="text-[0.72rem]">{kpi.formula}</code></>}>
        {vals.length ? (
          <>
            <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[0.8rem] sm:grid-cols-5">
              {[
                ["Periods", String(series.length)],
                ["Latest", fmtUnit(vals.at(-1), kpi.unit, fmt)],
                ["Average", fmtUnit(vals.reduce((a, c) => a + c, 0) / vals.length, kpi.unit, fmt)],
                ["Best", fmtUnit(kpi.higherIsBetter ? Math.max(...vals) : Math.min(...vals), kpi.unit, fmt)],
                ["Worst", fmtUnit(kpi.higherIsBetter ? Math.min(...vals) : Math.max(...vals), kpi.unit, fmt)],
              ].map(([k, v]) => <div key={k}><dt className="text-ink-faint">{k}</dt><dd className="font-semibold tabular-nums text-ink">{v}</dd></div>)}
            </dl>
            <LineChart points={series.slice(-60).map((p) => ({ x: p.label, actual: p.value }))} valueFormat={(n) => fmtUnit(n, kpi.unit, fmt, true)} />
          </>
        ) : <Empty title="No data for this KPI yet">Record entries in {Object.values(kpi.metrics).map((m) => b.modules.find((x) => x.id === m.module)?.name).filter(Boolean).join(", ")}.</Empty>}
      </Section>

      {why.length ? (
        <Section title="What moved it" meta={`${why[0].prev} → ${why[0].cur} · ${why[0].additive ? `change in ${why[0].of.toLowerCase()}` : `${kpi.name.toLowerCase()} within each group`}`}>
          <div className="grid gap-8 md:grid-cols-3">
            {why.map((w) => (
              <div key={w.field}>
                <h3 className="mb-2 text-[0.8rem] font-semibold text-ink">By {w.field.toLowerCase()}</h3>
                <ul className="divide-y divide-rule text-[0.8rem]">
                  {w.items.map((it) => {
                    const better = (it.diff > 0) === kpi.higherIsBetter;
                    const tone = it.diff === 0 ? "text-ink-faint" : better ? "text-good" : "text-bad";
                    return (
                      <li key={it.group} className="flex items-baseline justify-between gap-3 py-1.5">
                        <span className="truncate text-ink-soft">{it.group}</span>
                        {w.additive ? (
                          <span className={`num font-medium ${tone}`}>{it.diff > 0 ? "+" : ""}{fmtUnit(it.diff, w.unit, fmt, true)}</span>
                        ) : (
                          <span className="num">
                            <span className="text-ink-faint">{fmtUnit(it.prev, w.unit, fmt, true)} → </span>
                            <span className={`font-medium ${tone}`}>{fmtUnit(it.cur, w.unit, fmt, true)}</span>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {cmp && by ? (
        <Section title={`Compare by ${by.label.toLowerCase()}`} meta={
          <span className="flex flex-wrap gap-1.5">
            {groupFields.map((f) => <Link key={f.key} href={q({ by: f.key })} className={f.key === by.key ? "font-medium text-accent" : "hover:text-ink"}>{f.label}</Link>)}
          </span>
        }>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[0.82rem]">
              <thead>
                <tr className="border-b border-rule-strong text-[0.66rem] uppercase tracking-[0.1em] text-ink-faint">
                  <th className="px-3 pb-2 text-left">{by.label}</th>
                  {cmp.periods.map((p) => <th key={p} className="px-3 pb-2 text-right">{p}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {cmp.rows.map((r) => {
                  const last = r.values.at(-1), prev = r.values.at(-2);
                  const d = last != null && prev ? (kpi.unit === "pct" ? last - prev : ((last - prev) / Math.abs(prev)) * 100) : null;
                  return (
                    <tr key={r.group}>
                      <td className="px-3 py-2 font-medium text-ink">{r.group}{d != null ? <span className="ml-2"><Delta value={d} suffix={unitOf(kpi)} higherIsBetter={kpi.higherIsBetter} /></span> : null}</td>
                      {r.values.map((v, i) => <td key={i} className="num px-3 py-2">{fmtUnit(v, kpi.unit, fmt, true)}</td>)}
                    </tr>
                  );
                })}
                <tr className="border-t border-rule-strong font-semibold">
                  <td className="px-3 py-2">All</td>
                  {cmp.total.map((v, i) => <td key={i} className="num px-3 py-2">{fmtUnit(v, kpi.unit, fmt, true)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {yoy.length ? (
        <Section title="Same period last year">
          <DataTable
            getKey={(x) => x.p.key}
            rows={yoy}
            columns={[
              { key: "p", header: "Period", render: (x) => x.p.label },
              { key: "v", header: "This year", align: "right", render: (x) => fmtUnit(x.p.value, kpi.unit, fmt) },
              { key: "l", header: "Last year", align: "right", render: (x) => fmtUnit(x.prev!.value, kpi.unit, fmt) },
              { key: "d", header: "Change", align: "right", render: (x) => (x.p.value != null && x.prev!.value ? <Delta value={kpi.unit === "pct" ? x.p.value - x.prev!.value : ((x.p.value - x.prev!.value) / Math.abs(x.prev!.value)) * 100} suffix={unitOf(kpi)} higherIsBetter={kpi.higherIsBetter} /> : "—") },
            ]}
          />
        </Section>
      ) : null}

      {b.analytics.breakdowns.length ? (
        <Section title="Breakdowns" meta="All time">
          <div className="grid gap-10 md:grid-cols-2">
            {b.analytics.breakdowns.map((bd, i) => {
              const mod = b.modules.find((m) => m.id === bd.module);
              const field = mod?.fields.find((f) => f.key === bd.field);
              if (!mod || !field) return null;
              const measure = bd.measure === "1" ? undefined : bd.measure ?? moneyField(mod);
              const isMoney = !!measure && mod.fields.find((f) => f.key === measure)?.type === "money";
              const items = breakdown(b, mod.id, field.key, measure).slice(0, 10);
              return (
                <div key={i}>
                  <h3 className="mb-3 text-[0.8rem] font-semibold text-ink">{mod.name} by {field.label.toLowerCase()}</h3>
                  {items.length ? <BarComposition items={items} format={(n) => (isMoney ? fmtUnit(n, "money", fmt, true) : fmtUnit(n, "number", fmt))} /> : <p className="text-[0.8rem] text-ink-faint">No records yet.</p>}
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}

      <Section title="Anomaly log" meta={`Days ≥ ${b.analytics.anomalyZ}σ from their usual weekday level · last 120 days${evDays.size ? " · event days excluded" : ""}`}>
        <DataTable
          getKey={(a) => a.k.id + a.key}
          rows={flags}
          empty="No unusual days. Anomalies appear once a KPI has a few weeks of daily records."
          columns={[
            { key: "d", header: "Day", render: (a) => a.label },
            { key: "k", header: "KPI", render: (a) => a.k.name },
            { key: "v", header: "Actual", align: "right", render: (a) => fmtUnit(a.value, a.k.unit, fmt) },
            { key: "e", header: "Usual", align: "right", render: (a) => fmtUnit(a.expected, a.k.unit, fmt) },
            { key: "z", header: "Deviation", align: "right", render: (a) => `${a.z > 0 ? "+" : ""}${a.z.toFixed(1)}σ` },
            { key: "s", header: "Severity", render: (a) => <StatusPill>{Math.abs(a.z) >= b.analytics.anomalyZ * 1.5 ? "bad" : "watch"}</StatusPill> },
          ]}
        />
      </Section>
    </>
  );
}
