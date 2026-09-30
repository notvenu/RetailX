import { PageHeader, Section, Figure, FigureRow, DataTable, KeyValue, Note } from "@/components/ui";
import { LineChart } from "@/components/charts";
import { REVENUE_FORECAST, FORECAST_MODEL, ORG } from "@/lib/mock";
import { money, moneyCompact, pct } from "@/lib/format";

const history = REVENUE_FORECAST.filter((p) => p.actual != null);
const lastActual = history[history.length - 1].actual!;
const nextMonth = REVENUE_FORECAST.find((p) => p.actual == null)!;

export default function ForecastingPage() {
  return (
    <>
      <PageHeader
        title="Forecasting"
        meta={`${ORG.name} · ${FORECAST_MODEL.name}`}
      />

      <div className="mt-6">
        <FigureRow>
          <Figure
            label={`${nextMonth.x} forecast`}
            value={moneyCompact(nextMonth.predicted!)}
            deltas={[{ value: ((nextMonth.predicted! - lastActual) / lastActual) * 100, label: `vs ${history[history.length - 1].x}` }]}
          />
          <Figure
            label="90% interval"
            value={`± ${pct(((nextMonth.upper! - nextMonth.predicted!) / nextMonth.predicted!) * 100, 1)}`}
          />
          <Figure label="Back-test MAPE" value={pct(FORECAST_MODEL.mape)} />
          <Figure label="Back-test MAE" value={moneyCompact(FORECAST_MODEL.mae)} />
        </FigureRow>
      </div>

      <Section title="Revenue forecast" meta="6 months history · 4 months projected">
        <LineChart points={REVENUE_FORECAST} showBand showPredicted height={300} />
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.72rem] text-ink-soft">
          <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-accent" />Actual revenue</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-ink-soft" />Model prediction</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[1px] bg-accent/15" />90% prediction interval</span>
        </div>
      </Section>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <Section title="Model evaluation" className="mt-0 first:mt-0">
          <KeyValue
            items={[
              { k: "Method", v: FORECAST_MODEL.name },
              { k: "Target", v: FORECAST_MODEL.target },
              { k: "Training window", v: FORECAST_MODEL.trainedOn },
              { k: "Validation", v: FORECAST_MODEL.validation },
              { k: "MAPE", v: pct(FORECAST_MODEL.mape) },
              { k: "RMSE", v: money(FORECAST_MODEL.rmse) },
              { k: "MAE", v: money(FORECAST_MODEL.mae) },
              { k: "Bias (mean error)", v: pct(FORECAST_MODEL.bias) },
            ]}
          />
          <Note>
            Rolling-origin validation retrains at each fold and scores the next month only, so the error
            estimate reflects true forward performance. A near-zero bias means the model is not
            systematically over- or under-forecasting. {FORECAST_MODEL.limits}
          </Note>
        </Section>

        <Section title="Forecast vs actual — last 6 months" className="mt-0 first:mt-0">
          <DataTable
            getKey={(r) => r.x}
            rows={history}
            columns={[
              { key: "month", header: "Month", render: (r) => r.x },
              { key: "actual", header: "Actual", align: "right", render: (r) => money(r.actual!) },
              { key: "pred", header: "Predicted", align: "right", render: (r) => <span className="text-ink-soft">{money(r.predicted!)}</span> },
              {
                key: "err", header: "Error", align: "right",
                render: (r) => {
                  const e = ((r.actual! - r.predicted!) / r.actual!) * 100;
                  return <span className={Math.abs(e) > 3 ? "text-warn" : "text-ink-soft"}>{e > 0 ? "+" : ""}{e.toFixed(1)}%</span>;
                },
              },
            ]}
          />
        </Section>
      </div>
    </>
  );
}
