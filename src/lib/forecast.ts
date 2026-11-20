/**
 * Forecasting engine. Ten models from naive to Holt-Winters and seasonal regression, parameters
 * fitted by grid search on one-step-ahead error, compared by rolling-origin back-test, with
 * prediction intervals, log transform, what-if scenarios and robust anomaly detection.
 * Pure TypeScript, no dependencies; runs in the browser. Self-check: `node src/lib/forecast.ts`
 */
import type { ModelKey } from "./model";

export const MODELS: { key: ModelKey; name: string; seasonal: boolean; about: string }[] = [
  { key: "naive", name: "Naive", seasonal: false, about: "Next period equals the last one. The baseline every model must beat." },
  { key: "snaive", name: "Seasonal naive", seasonal: true, about: "Same as the same point last season (last Monday, last March)." },
  { key: "drift", name: "Drift", seasonal: false, about: "Extends the average change from first to last period." },
  { key: "mean", name: "Long-run mean", seasonal: false, about: "The average of all history. Good for flat, noisy series." },
  { key: "ma", name: "Moving average", seasonal: false, about: "Average of the most recent window (one season, or 3 periods)." },
  { key: "ses", name: "Exponential smoothing", seasonal: false, about: "Weighted average favouring recent periods; level only." },
  { key: "holt", name: "Damped trend (Holt)", seasonal: false, about: "Level plus a trend that flattens out the further ahead it looks." },
  { key: "hw_add", name: "Holt-Winters additive", seasonal: true, about: "Level, damped trend and a seasonal pattern of fixed size." },
  { key: "hw_mul", name: "Holt-Winters multiplicative", seasonal: true, about: "Seasonal swings that grow with the level. Needs positive data." },
  { key: "regression", name: "Trend + season regression", seasonal: true, about: "Least-squares line with a term for each season position." },
];

type Fit = { fitted: (number | null)[]; forecast: (h: number) => number[]; params: Record<string, number>; growth: (i: number) => number };

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const sse = (y: number[], f: (number | null)[]) => y.reduce((s, v, i) => (f[i] == null ? s : s + (v - f[i]!) ** 2), 0);
const grid = (...vals: number[]) => vals;

/* ---------------- models ---------------- */

function smoothing(y: number[], alpha: number, beta: number, phi: number, m: number, gamma: number, mult: boolean) {
  const n = y.length;
  const seasonal = m > 1;
  const start = seasonal ? m : 1;
  let level = seasonal ? mean(y.slice(0, m)) : y[0];
  let trend = seasonal && n >= 2 * m ? (mean(y.slice(m, 2 * m)) - mean(y.slice(0, m))) / m : beta > 0 && n > 1 ? y[1] - y[0] : 0;
  const s = seasonal ? y.slice(0, m).map((v) => (mult ? v / (level || 1) : v - level)) : [];
  const fitted: (number | null)[] = Array(start).fill(null);
  for (let t = start; t < n; t++) {
    const si = seasonal ? s[t % m] : mult ? 1 : 0;
    const base = level + phi * trend;
    fitted.push(mult ? base * si : base + si);
    const prevLevel = level;
    const deseason = mult ? y[t] / (si || 1) : y[t] - si;
    level = alpha * deseason + (1 - alpha) * base;
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
    if (seasonal) s[t % m] = gamma * (mult ? y[t] / (level || 1) : y[t] - level) + (1 - gamma) * si;
  }
  const forecast = (h: number) =>
    Array.from({ length: h }, (_, i) => {
      let damp = 0;
      for (let j = 1; j <= i + 1; j++) damp += phi ** j;
      const base = level + damp * trend;
      if (!seasonal) return base;
      const si = s[(n + i) % m];
      return mult ? base * si : base + si;
    });
  return { fitted, forecast };
}

function bestSmoothing(y: number[], opts: { alphas: number[]; betas: number[]; phis: number[]; gammas: number[]; m: number; mult: boolean }): Fit {
  let best: { e: number; a: number; b: number; p: number; g: number } | null = null;
  for (const a of opts.alphas) for (const b of opts.betas) for (const p of opts.phis) for (const g of opts.gammas) {
    const e = sse(y, smoothing(y, a, b, p, opts.m, g, opts.mult).fitted);
    if (Number.isFinite(e) && (!best || e < best.e)) best = { e, a, b, p, g };
  }
  const { a, b, p, g } = best ?? { a: 0.3, b: 0, p: 1, g: 0 };
  const r = smoothing(y, a, b, p, opts.m, g, opts.mult);
  // ponytail: interval growth from the textbook ETS variance with the trend/season terms folded into alpha;
  // close enough for planning bands, swap for simulated paths if anyone audits the coverage.
  return { ...r, params: { alpha: a, beta: b, phi: p, gamma: g }, growth: (i) => Math.sqrt(1 + i * (a * (1 + b)) ** 2) };
}

/** Ordinary least squares via normal equations (Gauss-Jordan). Small designs only. */
function ols(X: number[][], y: number[]): number[] | null {
  const k = X[0].length;
  const A = Array.from({ length: k }, (_, i) => [
    ...Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0)),
    X.reduce((s, r, t) => s + r[i] * y[t], 0),
  ]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-9) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let j = c; j <= k; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((row, i) => row[k] / row[i]);
}

export function fitModel(key: ModelKey, y: number[], m: number): Fit | null {
  const n = y.length;
  const last = y[n - 1];
  const seasonal = m > 1 && n >= 2 * m;
  const flat = (v: number) => (h: number) => Array(h).fill(v);
  switch (key) {
    case "naive":
      return { fitted: [null, ...y.slice(0, -1)], forecast: flat(last), params: {}, growth: (i) => Math.sqrt(i + 1) };
    case "snaive":
      if (!seasonal) return null;
      return {
        fitted: y.map((_, t) => (t >= m ? y[t - m] : null)),
        forecast: (h) => Array.from({ length: h }, (_, i) => y[n - m + (i % m)]),
        params: { m }, growth: (i) => Math.sqrt(Math.floor(i / m) + 1),
      };
    case "drift": {
      if (n < 3) return null;
      const slope = (last - y[0]) / (n - 1);
      return {
        fitted: y.map((_, t) => (t ? y[t - 1] + slope : null)),
        forecast: (h) => Array.from({ length: h }, (_, i) => last + slope * (i + 1)),
        params: { slope }, growth: (i) => Math.sqrt((i + 1) * (1 + (i + 1) / n)),
      };
    }
    case "mean":
      return { fitted: y.map((_, t) => (t ? mean(y.slice(0, t)) : null)), forecast: flat(mean(y)), params: { mean: mean(y) }, growth: () => Math.sqrt(1 + 1 / n) };
    case "ma": {
      const w = Math.min(n, m > 1 ? m : 3);
      return {
        fitted: y.map((_, t) => (t >= w ? mean(y.slice(t - w, t)) : null)),
        forecast: flat(mean(y.slice(-w))), params: { window: w }, growth: (i) => Math.sqrt(1 + i / w),
      };
    }
    case "ses":
      return bestSmoothing(y, { alphas: grid(0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9), betas: [0], phis: [1], gammas: [0], m: 1, mult: false });
    case "holt":
      if (n < 4) return null;
      return bestSmoothing(y, { alphas: grid(0.1, 0.2, 0.4, 0.6, 0.8), betas: grid(0.05, 0.1, 0.2, 0.3), phis: grid(0.8, 0.9, 0.98), gammas: [0], m: 1, mult: false });
    case "hw_add":
    case "hw_mul":
      if (!seasonal || (key === "hw_mul" && y.some((v) => v <= 0))) return null;
      return bestSmoothing(y, {
        alphas: grid(0.1, 0.3, 0.5, 0.7), betas: grid(0, 0.05, 0.15), phis: grid(0.9, 0.98), gammas: grid(0.05, 0.15, 0.3),
        m, mult: key === "hw_mul",
      });
    case "regression": {
      const k = seasonal ? m : 1;
      const row = (t: number) => [1, t, ...Array.from({ length: k - 1 }, (_, j) => (t % k === j + 1 ? 1 : 0))];
      if (n < k + 3) return null;
      const beta = ols(y.map((_, t) => row(t)), y);
      if (!beta) return null;
      const at = (t: number) => row(t).reduce((s, x, j) => s + x * beta[j], 0);
      return { fitted: y.map((_, t) => at(t)), forecast: (h) => Array.from({ length: h }, (_, i) => at(n + i)), params: { slope: beta[1] }, growth: () => 1.05 };
    }
  }
}

/* ---------------- seasonality ---------------- */

export function acf(y: number[], lag: number) {
  const mu = mean(y);
  const den = y.reduce((s, v) => s + (v - mu) ** 2, 0);
  if (!den || lag >= y.length) return 0;
  let num = 0;
  for (let t = lag; t < y.length; t++) num += (y[t] - mu) * (y[t - lag] - mu);
  return num / den;
}

export const SEASON_BY_GRAIN = { day: 7, week: 52, month: 12, quarter: 4, year: 1 } as const;

export function detectSeason(y: number[], candidate: number): number {
  return candidate > 1 && y.length >= 2 * candidate && acf(y, candidate) > 0.2 ? candidate : 1;
}

/* ---------------- back-test ---------------- */

export type Score = { key: ModelKey; name: string; mae: number; rmse: number; smape: number; mase: number; bias: number; folds: number };

export function backtest(y: number[], key: ModelKey, m: number, h: number, folds = 4): Score | null {
  const minTrain = m > 1 ? 2 * m : 3;
  const step = Math.max(1, Math.round(h / 2));
  const errs: { e: number; a: number; f: number }[] = [];
  let used = 0;
  for (let j = 0; j < folds; j++) {
    const origin = y.length - h - j * step;
    if (origin < minTrain) break;
    const fit = fitModel(key, y.slice(0, origin), m);
    if (!fit) return null;
    const fc = fit.forecast(Math.min(h, y.length - origin));
    fc.forEach((f, i) => errs.push({ e: y[origin + i] - f, a: y[origin + i], f }));
    used++;
  }
  if (!errs.length) return null;
  const scale = mean(y.slice(1).map((v, i) => Math.abs(v - y[i]))) || 1;
  const mae = mean(errs.map((x) => Math.abs(x.e)));
  return {
    key, name: MODELS.find((x) => x.key === key)!.name, folds: used, mae,
    rmse: Math.sqrt(mean(errs.map((x) => x.e ** 2))),
    smape: mean(errs.map((x) => (Math.abs(x.a) + Math.abs(x.f) === 0 ? 0 : (200 * Math.abs(x.e)) / (Math.abs(x.a) + Math.abs(x.f))))),
    mase: mae / scale,
    bias: mean(errs.map((x) => -x.e)), // positive = the model over-forecasts
  };
}

/* ---------------- run ---------------- */

export type ForecastOptions = {
  model: ModelKey | "auto";
  season: "auto" | "none" | number;
  seasonCandidate: number;
  horizon: number;
  confidence: number;
  transform: "none" | "log";
  selectBy: "smape" | "rmse" | "mae" | "mase";
};

export type ForecastResult = {
  chosen: ModelKey;
  m: number;
  scores: Score[];
  fitted: (number | null)[];
  forecast: number[];
  lower: number[];
  upper: number[];
  params: Record<string, number>;
  notes: string[];
};

const Z: Record<number, number> = { 80: 1.2816, 90: 1.6449, 95: 1.96, 99: 2.5758 };

export function runForecast(raw: number[], o: ForecastOptions): ForecastResult | null {
  const notes: string[] = [];
  if (raw.length < 4) return null;
  let log = o.transform === "log";
  if (log && raw.some((v) => v <= 0)) { log = false; notes.push("Log transform skipped: the series has zero or negative values."); }
  const y = log ? raw.map(Math.log) : raw;

  const m = o.season === "none" ? 1 : o.season === "auto" ? detectSeason(y, o.seasonCandidate) : y.length >= 2 * o.season ? o.season : 1;
  if (o.season === "auto") notes.push(m > 1 ? `Found a repeating pattern every ${m} periods.` : "No reliable seasonal pattern yet; seasonal models sit out.");
  else if (typeof o.season === "number" && m === 1) notes.push(`Need at least ${2 * o.season} periods to use a season of ${o.season}.`);

  const h = Math.max(1, Math.min(o.horizon, 365));
  const testH = Math.max(1, Math.min(h, Math.floor(y.length / 4)));
  const scores = MODELS.map((x) => backtest(y, x.key, m, testH)).filter((x): x is Score => !!x && Number.isFinite(x[o.selectBy]));
  scores.sort((a, b) => a[o.selectBy] - b[o.selectBy]);

  let chosen: ModelKey = o.model === "auto" ? scores[0]?.key ?? "naive" : o.model;
  let fit = fitModel(chosen, y, m);
  if (!fit) {
    notes.push(`${MODELS.find((x) => x.key === chosen)?.name} needs more history; used the best available model instead.`);
    chosen = scores[0]?.key ?? "naive";
    fit = fitModel(chosen, y, m)!;
  }
  const resid = y.map((v, t) => (fit!.fitted[t] == null ? null : v - fit!.fitted[t]!)).filter((v): v is number => v != null);
  const sd = Math.sqrt(mean(resid.map((r) => r * r))) || 0;
  const z = Z[o.confidence] ?? 1.6449;
  const fc = fit.forecast(h);
  const band = fc.map((_, i) => z * sd * fit!.growth(i));
  const back = (v: number) => (log ? Math.exp(v) : v);
  const best = scores.find((x) => x.key === chosen);
  if (best && best.mase > 1) notes.push("Back-test error is worse than simply repeating last period. Treat this forecast as a rough range.");
  if (y.length < 2 * (m > 1 ? m : 6)) notes.push("Short history: every extra period of data will tighten this forecast.");

  return {
    chosen, m, scores, params: fit.params, notes,
    fitted: fit.fitted.map((v) => (v == null ? null : back(v))),
    forecast: fc.map(back),
    lower: fc.map((v, i) => back(v - band[i])),
    upper: fc.map((v, i) => back(v + band[i])),
  };
}

/* ---------------- anomalies ---------------- */

export type Anomaly = { index: number; value: number; expected: number; z: number };

/**
 * Flags points far from their same-season median, scored by a robust (median / MAD) z.
 * `null` marks a period with nothing recorded: it is neither flagged nor used as a peer.
 */
export function anomalies(y: (number | null)[], m: number, threshold = 3): Anomaly[] {
  const known = y.filter((v): v is number => v != null);
  if (known.length < 8) return [];
  const season = m > 1 && y.length >= 2 * m ? m : 1;
  const ok = (v: number | null): v is number => v != null;
  const expected = y.map((v, t) => {
    if (v == null) return NaN;
    const peers = (season > 1
      ? y.filter((_, j) => j !== t && j % season === t % season)
      : [...y.slice(Math.max(0, t - 7), t), ...y.slice(t + 1, t + 8)]).filter(ok);
    return median(peers.length ? peers : known);
  });
  const idx = y.map((v, t) => (v == null ? -1 : t)).filter((t) => t >= 0);
  const r = idx.map((t) => (y[t] as number) - expected[t]);
  const med = median(r);
  const mad = median(r.map((x) => Math.abs(x - med))) || mean(r.map((x) => Math.abs(x - med))) || 1;
  return idx
    .map((t, i) => ({ index: t, value: y[t] as number, expected: expected[t], z: (0.6745 * (r[i] - med)) / mad }))
    .filter((a) => Math.abs(a.z) >= threshold);
}

/* ---------------- self-check ---------------- */

if (typeof process !== "undefined" && process.argv[1]?.endsWith("forecast.ts")) {
  const assert = (c: boolean, msg: string) => { if (!c) throw new Error(msg); };
  // 8 weeks of daily sales: weekly cycle + gentle growth + fixed noise
  const noise = [3, -2, 1, -4, 2, 0, -1, 4, -3, 2, 1, -2, 0, 3];
  const y = Array.from({ length: 56 }, (_, t) => 100 + t * 0.5 + [0, -10, -8, -5, 5, 25, 30][t % 7] + noise[t % 14]);
  assert(detectSeason(y, 7) === 7, "weekly season detected");
  const r = runForecast(y, { model: "auto", season: "auto", seasonCandidate: 7, horizon: 14, confidence: 90, transform: "none", selectBy: "smape" })!;
  assert(r.forecast.length === 14 && r.m === 7, "horizon & season");
  assert(MODELS.find((x) => x.key === r.chosen)!.seasonal, `seasonal model should win, got ${r.chosen}`);
  const best = r.scores[0];
  assert(best.smape < 8 && best.mase < 1, `accurate back-test, got sMAPE ${best.smape.toFixed(2)} MASE ${best.mase.toFixed(2)}`);
  assert(r.upper[13] - r.lower[13] >= r.upper[0] - r.lower[0], "band does not shrink");
  assert(r.forecast[5] > r.forecast[1], "Saturday above Tuesday");
  const naive = r.scores.find((x) => x.key === "naive")!;
  assert(best.smape < naive.smape, "beats naive");
  const spiked = [...y]; spiked[30] += 120;
  const an = anomalies(spiked, 7, 3);
  assert(an.length >= 1 && an.some((a) => a.index === 30), "spike found " + JSON.stringify(an.map((a) => a.index)));
  const gappy: (number | null)[] = [...spiked]; gappy[40] = null; gappy[41] = null;
  const ag = anomalies(gappy, 7, 3);
  assert(ag.some((a) => a.index === 30) && !ag.some((a) => a.index === 40 || a.index === 41), "empty days are skipped, not flagged");
  assert(runForecast([5, 5, 5], { model: "auto", season: "auto", seasonCandidate: 7, horizon: 3, confidence: 90, transform: "none", selectBy: "smape" }) === null, "too short");
  const logged = runForecast(y, { model: "hw_mul", season: 7, seasonCandidate: 7, horizon: 7, confidence: 95, transform: "log", selectBy: "rmse" })!;
  assert(logged.forecast.every((v) => v > 0), "log forecast positive");
  console.log(`forecast self-check ok · chose ${r.chosen}, sMAPE ${best.smape.toFixed(2)}%, MASE ${best.mase.toFixed(2)}`);
}
