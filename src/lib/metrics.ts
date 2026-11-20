/**
 * Turns records into numbers: a tiny arithmetic evaluator for KPI formulas and field expressions,
 * condition matching, period bucketing and KPI series. Pure; runs on client and server.
 * Self-check: `node src/lib/metrics.ts`
 */
import type { Business, Condition, Grain, KpiDef, MetricRef, ModuleDef, RecordRow, Unit, Value } from "./model";

/* ---------------- arithmetic: numbers, names, + - * / ( ) ---------------- */

type Node = number | string | [string, Node, Node?];
const parsed = new Map<string, Node | null>();

function parse(src: string): Node | null {
  const toks = src.match(/\d+(?:\.\d+)?|[A-Za-z_]\w*|[-+*/()]/g) ?? [];
  if (toks.join("") !== src.replace(/\s+/g, "")) return null; // stray characters
  let i = 0;
  const atom = (): Node => {
    const t = toks[i++];
    if (t === "(") { const e = sum(); if (toks[i++] !== ")") throw 0; return e; }
    if (t === "-") return ["neg", atom()];
    if (t === undefined || "+*/)".includes(t)) throw 0;
    return /^\d/.test(t) ? Number(t) : t;
  };
  const product = (): Node => { let l = atom(); while (toks[i] === "*" || toks[i] === "/") l = [toks[i++], l, atom()]; return l; };
  const sum = (): Node => { let l = product(); while (toks[i] === "+" || toks[i] === "-") l = [toks[i++], l, product()]; return l; };
  try { const e = sum(); return i === toks.length ? e : null; } catch { return null; }
}

/** NaN when the expression is invalid or divides by zero. */
export function evalExpr(expr: string, vars: (name: string) => number): number {
  if (!parsed.has(expr)) parsed.set(expr, parse(expr));
  const node = parsed.get(expr);
  if (node == null) return NaN;
  const ev = (n: Node): number => {
    if (typeof n === "number") return n;
    if (typeof n === "string") return vars(n);
    const [op, a, b] = n;
    const x = ev(a);
    if (op === "neg") return -x;
    const y = ev(b!);
    return op === "+" ? x + y : op === "-" ? x - y : op === "*" ? x * y : y === 0 ? NaN : x / y;
  };
  return ev(node);
}

export const exprNames = (expr: string) => [...new Set(expr.match(/[A-Za-z_]\w*/g) ?? [])];
export const validExpr = (expr: string) => parse(expr) != null;

/* ---------------- values & conditions ---------------- */

export function toNum(v: Value | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function matches(row: Record<string, Value>, conds: Condition[] = []) {
  return conds.every((c) => {
    const raw = row[c.field];
    const s = String(raw ?? "").trim();
    const target = c.value?.startsWith("@") ? String(row[c.value.slice(1)] ?? "") : c.value ?? "";
    const any = target.split("|").map((x) => x.trim().toLowerCase());
    switch (c.op) {
      case "eq": return any.includes(s.toLowerCase());
      case "ne": return !any.includes(s.toLowerCase());
      case "contains": return s.toLowerCase().includes(target.toLowerCase());
      case "empty": return s === "";
      case "notempty": return s !== "";
      default: {
        if (s === "") return false;
        const a = toNum(raw), b = toNum(target);
        return c.op === "gt" ? a > b : c.op === "gte" ? a >= b : c.op === "lt" ? a < b : a <= b;
      }
    }
  });
}

export function aggregate(rows: RecordRow[], ref: MetricRef, dateField?: string): number {
  const hit = rows.filter((r) => matches(r.data, ref.where));
  if (ref.agg === "count") return hit.length;
  const val = (r: RecordRow) => (ref.field ? evalExpr(ref.field, (k) => toNum(r.data[k])) : 1);
  // a blank value is its own entry: sales typed without an invoice number are still one bill each
  if (ref.agg === "distinct") return new Set(hit.map((r) => String(r.data[ref.field ?? ""] ?? "") || "#" + r.id)).size;
  const vals = hit.map(val).filter(Number.isFinite);
  if (!vals.length) return ref.agg === "sum" ? 0 : NaN;
  switch (ref.agg) {
    case "sum": return vals.reduce((a, b) => a + b, 0);
    case "avg": return vals.reduce((a, b) => a + b, 0) / vals.length;
    case "min": return Math.min(...vals);
    case "max": return Math.max(...vals);
    case "last": {
      const by = (r: RecordRow) => String((dateField && r.data[dateField]) || r.at);
      return val([...hit].sort((a, b) => by(a).localeCompare(by(b))).at(-1)!);
    }
  }
}

/* ---------------- periods ---------------- */

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Period key that sorts as text: day `2026-10-05`, week = its Monday, month `2026-10`, quarter `2026-Q4`, year `2026`. */
export function bucket(dateIso: string, grain: Grain): string {
  const d = new Date(dateIso.slice(0, 10) + "T00:00:00Z");
  if (isNaN(+d)) return "";
  if (grain === "day") return iso(d);
  if (grain === "week") { d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); }
  if (grain === "month") return iso(d).slice(0, 7);
  if (grain === "quarter") return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  return String(d.getUTCFullYear());
}

export function nextBucket(key: string, grain: Grain, by = 1): string {
  if (grain === "year") return String(+key + by);
  if (grain === "quarter") {
    const q = +key.slice(0, 4) * 4 + (+key.slice(-1) - 1) + by;
    return `${Math.floor(q / 4)}-Q${(q % 4) + 1}`;
  }
  if (grain === "month") {
    const mm = +key.slice(0, 4) * 12 + (+key.slice(5, 7) - 1) + by;
    return `${Math.floor(mm / 12)}-${pad((mm % 12) + 1)}`;
  }
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + by * (grain === "week" ? 7 : 1));
  return iso(d);
}

export function bucketLabel(key: string, grain: Grain): string {
  if (grain === "year" || grain === "quarter") return key.replace("-", " ");
  if (grain === "month") return `${MON[+key.slice(5, 7) - 1]} ${key.slice(2, 4)}`;
  return `${+key.slice(8, 10)} ${MON[+key.slice(5, 7) - 1]}`;
}

/* ---------------- KPI series ---------------- */

/** `partial`: the first period, when the records start part-way through it */
export type Point = { key: string; label: string; value: number | null; partial?: boolean };
type Data = Pick<Business, "modules" | "records">;

const recordDate = (mod: ModuleDef, r: RecordRow) => String((mod.dateField && r.data[mod.dateField]) || r.at.slice(0, 10));

/**
 * Contiguous series from the first period with data up to the latest one that has started (records dated in the
 * future, like planned expenses or advance bookings, wait until their period arrives). Empty periods count as zero activity.
 */
export function kpiSeries(data: Data, kpi: KpiDef, grain: Grain): Point[] {
  const per: Record<string, Map<string, RecordRow[]>> = {};
  const snapshot: Record<string, number> = {};
  const keys = new Set<string>();
  const now = bucket(todayIso(), grain);
  let first = "9999";
  for (const [name, ref] of Object.entries(kpi.metrics)) {
    const mod = data.modules.find((x) => x.id === ref.module);
    const rows = data.records[ref.module] ?? [];
    if (!mod?.dateField) { snapshot[name] = aggregate(rows, ref); continue; }
    const groups = new Map<string, RecordRow[]>();
    for (const r of rows) {
      const d = recordDate(mod, r);
      const kk = bucket(d, grain);
      if (!kk || kk > now) continue;
      if (d < first) first = d;
      keys.add(kk);
      const g = groups.get(kk);
      if (g) g.push(r); else groups.set(kk, [r]);
    }
    per[name] = groups;
  }
  const value = (kk: string) => {
    const v = evalExpr(kpi.formula, (name) => {
      if (name in snapshot) return snapshot[name];
      const ref = kpi.metrics[name];
      if (!ref) return NaN;
      const mod = data.modules.find((x) => x.id === ref.module);
      return aggregate(per[name]?.get(kk) ?? [], ref, mod?.dateField);
    });
    return Number.isFinite(v) ? v : null;
  };
  if (!keys.size) {
    if (!Object.keys(per).length && Object.keys(snapshot).length) return [{ key: now, label: "Now", value: value(now) }];
    return [];
  }
  const sorted = [...keys].sort();
  const out: Point[] = [];
  for (let kk = sorted[0], guard = 0; kk <= sorted.at(-1)! && guard < 5000; kk = nextBucket(kk, grain), guard++)
    out.push({ key: kk, label: bucketLabel(kk, grain), value: value(kk) });
  if (grain !== "day" && out.length && first.slice(0, 10) > periodStart(out[0].key, grain)) out[0].partial = true;
  return out;
}

export const isSnapshot = (data: Data, kpi: KpiDef) =>
  Object.values(kpi.metrics).every((ref) => !data.modules.find((x) => x.id === ref.module)?.dateField);

/** First day (ISO) of a period key. */
function periodStart(key: string, grain: Grain): string {
  if (grain === "day" || grain === "week") return key;
  if (grain === "month") return key + "-01";
  if (grain === "quarter") return `${key.slice(0, 4)}-${pad((+key.slice(-1) - 1) * 3 + 1)}-01`;
  return key + "-01-01";
}
const addDays = (isoDate: string, n: number) => { const d = new Date(isoDate + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const daysBetween = (a: string, b: string) => Math.round((+new Date(b + "T00:00:00Z") - +new Date(a + "T00:00:00Z")) / 864e5);
// ponytail: "today" is the server's local date; store a timezone per business if it ever serves several zones
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** The period that contains today, still being written. */
export const inProgress = (key: string | undefined, grain: Grain) => !!key && key === bucket(todayIso(), grain);
/** Only whole periods: drops a partial first period and the one in progress. Forecasts and trend lines learn from these. */
export const complete = (s: Point[], grain: Grain) => s.slice(s[0]?.partial ? 1 : 0, inProgress(s.at(-1)?.key, grain) ? -1 : undefined);

/** A KPI over `prevKey`, counting only its first `days` days (like-for-like with a period in progress). */
function periodToDate(data: Data, kpi: KpiDef, grain: Grain, prevKey: string, days: number): number | null {
  const start = periodStart(prevKey, grain), end = periodStart(nextBucket(prevKey, grain), grain), cut = addDays(start, days);
  const records: Data["records"] = {};
  for (const mod of data.modules) {
    const rows = data.records[mod.id];
    if (!rows) continue;
    records[mod.id] = mod.dateField ? rows.filter((r) => { const d = recordDate(mod, r); return d < start || d >= end || d < cut; }) : rows;
  }
  return kpiSeries({ modules: data.modules, records }, kpi, grain).find((p) => p.key === prevKey)?.value ?? null;
}

/** Totals add up over days (revenue, count); ratios and averages don't. */
export const isAdditive = (kpi: KpiDef) => !kpi.formula.includes("/") && kpi.unit !== "pct";

export type KpiStatus = {
  kpi: KpiDef;
  value: number | null;
  previous: number | null;
  period: string;
  /** what `previous` is: "Sep 26", or "1–5 Sep 26" when the current period is still in progress */
  versus: string;
  partial: boolean;
  vsPrevious: number | null; // % change (pts for pct units)
  vsTarget: number | null;
  spark: number[];
  status: "good" | "watch" | "bad" | "none";
};

/**
 * Latest period with data vs the one before (or the same period a year earlier). When the latest period
 * is still in progress, it is compared like-for-like with the same number of days of the earlier period,
 * and targets of additive KPIs are pro-rated to the days elapsed.
 */
export function kpiStatus(data: Data, kpi: KpiDef, grain: Grain, compareTo: "previous" | "last_year" = "previous"): KpiStatus {
  const s = kpiSeries(data, kpi, grain);
  const cur = s.at(-1);
  const back = compareTo === "last_year" && grain !== "year" ? (grain === "day" ? 364 : grain === "week" ? 52 : grain === "month" ? 12 : 4) : 1;
  const prevKey = cur ? nextBucket(cur.key, grain, -back) : undefined;
  const snapshot = isSnapshot(data, kpi);
  const partial = !snapshot && grain !== "day" && inProgress(cur?.key, grain);
  const elapsed = partial && cur ? daysBetween(periodStart(cur.key, grain), todayIso()) + 1 : 0;
  const span = cur ? daysBetween(periodStart(cur.key, grain), periodStart(nextBucket(cur.key, grain), grain)) : 1;

  const v = cur?.value ?? null;
  const p = !prevKey ? null : partial ? periodToDate(data, kpi, grain, prevKey, elapsed) : s.find((x) => x.key === prevKey)?.value ?? null;
  const target = kpi.target == null ? undefined : partial && isAdditive(kpi) ? (kpi.target * elapsed) / span : kpi.target;
  const change = (a: number | null, b: number | null | undefined) =>
    a == null || b == null || b === 0 ? null : kpi.unit === "pct" ? a - b : ((a - b) / Math.abs(b)) * 100;
  const vsTarget = change(v, target);
  const good = (d: number | null, slack = 0) => (d == null ? null : kpi.higherIsBetter ? d >= -slack : d <= slack);
  // ponytail: a 2% (or 1 pt) slack on period-over-period so ordinary wobble doesn't raise flags; tune if owners want twitchier alerts
  const t = good(vsTarget), pr = good(change(v, p), kpi.unit === "pct" ? 1 : 2);
  const prevLabel = prevKey ? bucketLabel(prevKey, grain) : "—";
  return {
    kpi, value: v, previous: p, partial,
    period: snapshot ? "Now" : cur ? `${cur.label}${partial ? " so far" : ""}` : "—",
    versus: partial ? `first ${elapsed} day${elapsed > 1 ? "s" : ""} of ${prevLabel}` : prevLabel,
    vsPrevious: change(v, p), vsTarget,
    spark: complete(s, grain).slice(-14).map((x) => x.value ?? 0),
    status: v == null ? "none" : t === false && Math.abs(vsTarget!) > 10 ? "bad" : t === false || pr === false ? "watch" : "good",
  };
}

/** Totals of a measure grouped by a field's value, largest first. */
export function breakdown(data: Data, moduleId: string, field: string, measure?: string, since?: string) {
  const mod = data.modules.find((x) => x.id === moduleId);
  const rows = (data.records[moduleId] ?? []).filter((r) => !since || !mod?.dateField || recordDate(mod, r) >= since);
  const groups = new Map<string, number>();
  for (const r of rows) {
    const g = String(r.data[field] ?? "").trim() || "—";
    groups.set(g, (groups.get(g) ?? 0) + (measure ? evalExpr(measure, (kk) => toNum(r.data[kk])) || 0 : 1));
  }
  return [...groups].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

/**
 * Diagnostic: which groups moved a KPI between the last two finished periods. When every ingredient lives in one
 * module, the KPI itself is recomputed inside each group (Staples margin 18% → 12%); otherwise its main ingredient
 * is split. Checks each choice/text field of that module with 2–25 distinct values.
 */
export function drivers(data: Data, kpi: KpiDef, grain: Grain) {
  const refs = Object.values(kpi.metrics);
  const primary = refs.find((r) => data.modules.find((m) => m.id === r.module)?.dateField);
  if (!primary) return [];
  const mod = data.modules.find((m) => m.id === primary.module)!;
  const whole = refs.every((r) => r.module === mod.id);
  const done = complete(kpiSeries(data, kpi, grain), grain);
  const cur = done.at(-1)?.key, prev = done.at(-2)?.key;
  if (!cur || !prev) return [];
  const rows = (data.records[mod.id] ?? []).map((r) => ({ r, k: bucket(recordDate(mod, r), grain) }));
  const inCur = rows.filter((x) => x.k === cur).map((x) => x.r);
  const inPrev = rows.filter((x) => x.k === prev).map((x) => x.r);
  const measure = (list: RecordRow[]) =>
    whole ? evalExpr(kpi.formula, (n) => aggregate(list, kpi.metrics[n], mod.dateField)) : aggregate(list, primary, mod.dateField);
  const additive = !whole || isAdditive(kpi);
  const minRows = (n: number) => (additive ? 0 : Math.max(3, n * 0.05)); // a ratio over 2 bills is noise
  const fieldUnit: Unit = !whole ? (primary.agg === "count" ? "number" : mod.fields.find((f) => f.key === primary.field)?.type === "money" || /\*/.test(primary.field ?? "") ? "money" : "number") : kpi.unit;
  return mod.fields
    .filter((f) => (f.type === "select" || f.type === "text") && f.key !== mod.dateField)
    .map((f) => {
      const g = (r: RecordRow) => String(r.data[f.key] ?? "").trim() || "—";
      const groups = [...new Set([...inCur, ...inPrev].map(g))];
      if (groups.length < 2 || groups.length > 25) return null;
      const items = groups
        .map((grp) => {
          const c = inCur.filter((r) => g(r) === grp), p = inPrev.filter((r) => g(r) === grp);
          if (c.length < minRows(inCur.length) || p.length < minRows(inPrev.length)) return null;
          const cv = measure(c), pv = measure(p);
          const fin = (x: number) => (Number.isFinite(x) ? x : additive ? 0 : NaN);
          return { group: grp, cur: fin(cv), prev: fin(pv), diff: fin(cv) - fin(pv) };
        })
        .filter((x): x is NonNullable<typeof x> => !!x && Number.isFinite(x.diff))
        .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
      return { field: f.label, items: items.slice(0, 6), weight: items.reduce((t, x) => t + Math.abs(x.diff), 0) };
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.weight > 0)
    .sort((x, y) => y.weight - x.weight)
    .slice(0, 3)
    .map((x) => ({ ...x, additive, unit: fieldUnit, of: whole ? kpi.name : mod.name, cur: bucketLabel(cur, grain), prev: bucketLabel(prev, grain) }));
}

/**
 * A KPI side by side for each value of a field (location vs location, channel vs channel) over the last finished
 * periods. Only for KPIs whose every ingredient lives in modules that have that field.
 */
export function kpiByGroup(data: Data, kpi: KpiDef, grain: Grain, field: string, periods = 6) {
  const mods = [...new Set(Object.values(kpi.metrics).map((m) => m.module))];
  if (!mods.every((id) => data.modules.find((m) => m.id === id)?.fields.some((f) => f.key === field))) return null;
  const all = complete(kpiSeries(data, kpi, grain), grain).slice(-periods);
  if (!all.length) return null;
  const groups = [...new Set(mods.flatMap((id) => (data.records[id] ?? []).map((r) => String(r.data[field] ?? "").trim() || "—")))].slice(0, 20);
  const rows = groups.map((g) => {
    const records = Object.fromEntries(Object.entries(data.records).map(([id, rows]) =>
      [id, mods.includes(id) ? rows.filter((r) => (String(r.data[field] ?? "").trim() || "—") === g) : rows]));
    const s = kpiSeries({ modules: data.modules, records }, kpi, grain);
    return { group: g, values: all.map((p) => s.find((x) => x.key === p.key)?.value ?? null) };
  });
  return { periods: all.map((p) => p.label), total: all.map((p) => p.value), rows };
}

/** The main money field of a module, used as the default breakdown measure. */
export const moneyField = (mod?: ModuleDef) => mod?.fields.find((x) => x.type === "money")?.key;

/* ---------------- self-check ---------------- */

if (typeof process !== "undefined" && process.argv[1]?.endsWith("metrics.ts")) {
  const assert = (c: boolean, msg: string) => { if (!c) throw new Error(msg); };
  assert(evalExpr("(rev - cogs) / rev * 100", (n) => ({ rev: 200, cogs: 150 })[n]!) === 25, "formula");
  assert(Number.isNaN(evalExpr("a / b", () => 0)), "div by zero");
  assert(evalExpr("-a + 2 * (3 - 1)", () => 1) === 3, "precedence");
  assert(!validExpr("rev +"), "invalid expr");
  assert(matches({ on_hand: 3, reorder: 5 }, [{ field: "on_hand", op: "lte", value: "@reorder" }]), "field ref");
  assert(matches({ stage: "Lost" }, [{ field: "stage", op: "eq", value: "Won|Lost" }]), "any-of");
  assert(bucket("2026-10-07", "week") === "2026-10-05", "monday");
  assert(nextBucket("2026-12", "month") === "2027-01" && nextBucket("2026-Q4", "quarter") === "2027-Q1", "next bucket");
  const row = (date: string, amount: number, cost: number): RecordRow => ({ id: date + amount, at: date, by: "t", data: { date, amount, cost } });
  const mods: Data["modules"] = [{ id: "sales", name: "Sales", icon: "", group: "", description: "", enabled: true, dateField: "date", fields: [] }];
  const data: Data = { modules: mods, records: { sales: [row("2025-08-03", 100, 60), row("2025-10-01", 300, 200), row("2025-10-20", 100, 40)] } };
  const kpi: KpiDef = { id: "gm", name: "GM", unit: "pct", area: "finance", higherIsBetter: true, formula: "(rev - cogs) / rev * 100",
    metrics: { rev: { module: "sales", agg: "sum", field: "amount" }, cogs: { module: "sales", agg: "sum", field: "cost" } } };
  const s = kpiSeries(data, kpi, "month");
  assert(s.length === 3 && s[1].value === null && s[2].value === 40, "series with gap " + JSON.stringify(s));
  const st = kpiStatus(data, { ...kpi, target: 50 }, "month");
  assert(st.value === 40 && st.vsTarget === -10 && st.status === "watch" && !st.partial, "status " + JSON.stringify(st));

  // a month in progress is compared with the same days of last month, and additive targets pro-rate
  const now = new Date(), y = now.getFullYear(), mo = now.getMonth();
  const day = (m: number, d: number) => iso(new Date(Date.UTC(y, m, d)));
  const rev: KpiDef = { id: "rev", name: "Revenue", unit: "money", area: "sales", higherIsBetter: true, formula: "r", target: 3100,
    metrics: { r: { module: "sales", agg: "sum", field: "amount" } } };
  const live: Data = { modules: mods, records: { sales: [row(day(mo - 1, 1), 100, 0), row(day(mo - 1, 28), 5000, 0), row(day(mo, 1), 150, 0)] } };
  const ls = kpiStatus(live, rev, "month");
  const elapsed = now.getDate();
  if (elapsed < 28) {
    assert(ls.partial && ls.previous === 100 && ls.vsPrevious === 50, "like-for-like " + JSON.stringify(ls));
    const span = Math.round((Date.UTC(y, mo + 1, 1) - Date.UTC(y, mo, 1)) / 864e5);
    assert(Math.abs(ls.vsTarget! - ((150 - (3100 * elapsed) / span) / ((3100 * elapsed) / span)) * 100) < 1e-9, "pro-rated target");
  }
  assert(complete(kpiSeries(live, rev, "month"), "month").length === 1, "complete drops the month in progress");
  const mid = kpiSeries({ modules: mods, records: { sales: [row("2025-05-25", 10, 0), row("2025-06-03", 10, 0), row("2025-07-09", 10, 0)] } }, rev, "month");
  assert(mid[0].partial === true && complete(mid, "month").map((p) => p.key).join() === "2025-06,2025-07", "partial first month dropped");
  console.log("metrics self-check ok");
}
