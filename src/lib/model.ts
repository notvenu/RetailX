/** Shared data model. Pure types + tiny helpers, safe to import from client and server. */

export type FieldType = "text" | "longtext" | "number" | "money" | "date" | "select" | "boolean" | "email" | "phone";
export type Field = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  default?: string;
};

export type ModuleDef = {
  id: string;
  name: string;
  icon: string;
  group: string;
  description: string;
  fields: Field[];
  /** records bucket into periods by this field; none = a register (stock list, staff list) read as-of now */
  dateField?: string;
  enabled: boolean;
  custom?: boolean;
};

export type Value = string | number | boolean;
/** `sample`: generated during onboarding so the owner can explore; removable in one click */
export type RecordRow = { id: string; at: string; by: string; data: Record<string, Value>; sample?: boolean };

export type Op = "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "notempty";
/** `value` may be `a|b` (any of) for eq/ne, or `@field` to compare with another field of the same record */
export type Condition = { field: string; op: Op; value?: string };

export type Agg = "sum" | "count" | "avg" | "min" | "max" | "distinct" | "last";
/** `field` may be an expression over the record's fields, e.g. `on_hand * unit_cost` */
export type MetricRef = { module: string; agg: Agg; field?: string; where?: Condition[] };

export type Unit = "money" | "number" | "pct" | "days" | "ratio";
export type Grain = "day" | "week" | "month" | "quarter" | "year";
export type Area = "finance" | "sales" | "operations" | "people" | "customers";

export type KpiDef = {
  id: string;
  name: string;
  description?: string;
  unit: Unit;
  area: Area;
  metrics: Record<string, MetricRef>;
  /** arithmetic over the metric names, e.g. `(rev - cogs) / rev * 100` */
  formula: string;
  target?: number;
  higherIsBetter: boolean;
};

export type ModelKey = "naive" | "snaive" | "drift" | "mean" | "ma" | "ses" | "holt" | "hw_add" | "hw_mul" | "regression";
export type ForecastDef = {
  id: string;
  name: string;
  kpi: string;
  grain: Grain;
  horizon: number;
  model: ModelKey | "auto";
  season: "auto" | "none" | number;
  confidence: 80 | 90 | 95 | 99;
  transform: "none" | "log";
  selectBy: "smape" | "rmse" | "mae" | "mase";
  /** what-if: multiply the forecast by (1 + pct/100) */
  scenarios: { name: string; pct: number }[];
  /** learn and apply the uplift of festivals / promotions in `Business.events` */
  useEvents?: boolean;
};

export type AnalyticsPrefs = {
  grain: Grain;
  compareTo: "previous" | "last_year";
  anomalyZ: number;
  breakdowns: { module: string; field: string; measure?: string }[];
};

export type Autonomy = "advise" | "draft" | "act";
export type AiRole = {
  id: string;
  name: string;
  title: string;
  icon: string;
  mandate: string;
  responsibilities: string[];
  areas: Area[];
  /** empty = every KPI in its areas */
  kpis: string[];
  autonomy: Autonomy;
  tone: string;
  enabled: boolean;
  custom?: boolean;
  /** standing facts and decisions the owner taught this role ("we never discount dairy") */
  memory?: string[];
};

export type Trigger =
  | { type: "record"; module: string }
  | { type: "schedule"; every: "day" | "week" | "month" }
  | { type: "kpi"; kpi: string; op: "lt" | "gt"; value: number };
export type Action =
  | { type: "task"; title: string; assignee?: string }
  | { type: "notify"; message: string }
  | { type: "set_field"; field: string; value: string }
  /** WhatsApp/email: `to` is a number/address or `{{field}}`; sent through the provider when configured, else a one-tap task */
  | { type: "message"; channel: "whatsapp" | "email"; to: string; text: string };
export type Automation = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
  createdBy: string;
  lastRun?: string;
  runs: number;
};

/** assignee: `user:<id>` or `ai:<roleId>` */
export type Task = {
  id: string;
  title: string;
  detail?: string;
  status: "todo" | "doing" | "done";
  assignee?: string;
  due?: string;
  source: string;
  createdAt: string;
  result?: string;
  /** drafted by an AI role on "draft" autonomy: waits in the approval queue */
  needsApproval?: boolean;
  /** one-tap action, e.g. a wa.me link with the message filled in */
  link?: string;
};
export type Activity = { id: string; at: string; text: string; kind: "info" | "warn" | "ai" | "automation"; link?: string };

/** Festivals, sales, promotions. Forecasts learn their uplift; anomaly checks don't flag them. */
export type BizEvent = { id: string; date: string; name: string; days?: number };


export type WidgetType = "kpi" | "trend" | "forecast" | "breakdown" | "records" | "tasks" | "ai" | "activity" | "note";
export type Widget = {
  id: string;
  type: WidgetType;
  w: number; // 1–4 columns
  h: number; // 1–3 rows
  kpi?: string;
  module?: string;
  field?: string;
  role?: string;
  text?: string;
};

export type Theme = {
  accent: string;
  mode: "light" | "dark" | "system";
  density: "compact" | "comfortable" | "spacious";
  font: "public-sans" | "plex" | "serif" | "system";
  radius: "sharp" | "soft" | "round";
  sidebar: "left" | "right";
};

export const AREAS_ALL = ["dashboard", "analytics", "forecasting", "ai", "automations", "tasks", "reports", "settings"] as const;
/** access: `*` for everything, else module ids and AREAS_ALL keys */
/** `readonly`: can open what `access` lists but every save, delete and run is refused (an accountant or auditor login). */
/** Counter limits (owner exempt): `maxDiscount` % of a bill given by hand, `priceEdit: false` = never below the list price. */
export type TeamRole = { id: string; name: string; access: string[]; readonly?: boolean; maxDiscount?: number; priceEdit?: boolean };
/**
 * Counter and invoice settings: own invoice prefix ("VJA" → VJA/26-27/0001), refuse sales below zero stock, receipt
 * width, TCS % offered on bills, the owner's override PIN (scrypt hash, never sent to the browser), A4 invoice layout,
 * terms and bank details printed on invoices, staff incentive and referral commission (% of net sales).
 */
export type CounterPrefs = {
  prefix?: string; blockNegative?: boolean; receipt?: "80mm" | "58mm"; tcsRate?: number; pinHash?: string;
  layout?: "classic" | "modern" | "compact"; terms?: string; bank?: string; incentivePct?: number; referralPct?: number;
};
/** Optional product features, switched on in onboarding or Settings: they add their fields to Stock. */
export type Features = { certificates?: boolean; nutrition?: boolean };

export type Profile = {
  size: string;
  locations: number;
  sells: "products" | "services" | "both";
  stock: boolean;
  credit: boolean;
  payroll: boolean;
  channels: string[];
  goals: string[];
};

export type ChatMsg = { role: "user" | "assistant"; text: string; at: string; by?: string };

export type Business = {
  id: string;
  name: string;
  industry: string;
  category: string;
  city: string;
  country: string;
  currency: string;
  locale: string;
  fiscalStart: number;
  createdAt: string;
  onboarded: boolean;
  profile: Profile;
  modules: ModuleDef[];
  kpis: KpiDef[];
  forecasts: ForecastDef[];
  analytics: AnalyticsPrefs;
  aiRoles: AiRole[];
  automations: Automation[];
  tasks: Task[];
  activity: Activity[];
  dashboard: Widget[];
  theme: Theme;
  roles: TeamRole[];
  /** loaded from the records table on read; never stored in the business document */
  records: Record<string, RecordRow[]>;
  threads: Record<string, ChatMsg[]>;
  gstin?: string;
  /** two-digit GST state code of the business, for CGST+SGST vs IGST */
  state?: string;
  upiId?: string;
  cash?: { balance: number; asOf: string };
  events?: BizEvent[];
  /** last morning briefing per AI role, `YYYY-MM-DD` */
  briefed?: Record<string, string>;
  language?: Lang;
  /** last bill number used, per prefix (`26-27/`, `CN/26-27/`…); bumped inside the business write transaction */
  billSeq?: Record<string, number>;
  /** market ranges the owner entered or the AI team researched; they override the built-in ones */
  benchmarks?: Record<string, import("./benchmarks").Benchmark>;
  /** restock autopilot: see src/lib/autoorder.ts */
  autoOrder?: import("./autoorder").AutoOrder;
  counter?: CounterPrefs;
  features?: Features;
};

export type Lang = "en" | "hi" | "mr" | "ta" | "te";
export type SavedView = { id: string; name: string; q?: string; where: Condition[]; columns?: string[]; sort?: { field: string; dir: "asc" | "desc" } };
export type UserPrefs = {
  lang?: Lang;
  /** a personal layout; falls back to the business dashboard */
  dashboard?: Widget[];
  views?: Record<string, SavedView[]>;
  seenAt?: string;
  emailNotify?: boolean;
};

export type User = {
  id: string;
  businessId: string;
  name: string;
  email?: string;
  phone?: string;
  username?: string;
  hash: string;
  roleId: string;
  createdAt: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  prefs?: UserPrefs;
};
export type PublicUser = Omit<User, "hash">;

/** The editable part of a business: what onboarding produces and settings changes. */
export type BusinessConfig = Pick<
  Business,
  | "name" | "industry" | "category" | "city" | "country" | "currency" | "locale" | "fiscalStart" | "profile"
  | "modules" | "kpis" | "forecasts" | "analytics" | "aiRoles" | "automations" | "dashboard" | "theme" | "roles"
  | "gstin" | "state" | "upiId" | "cash" | "events" | "language" | "counter" | "features"
>;

export const uid = (p = "") => p + Math.random().toString(36).slice(2, 10);
export const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || uid("f");

export function canAccess(role: TeamRole | undefined, key: string) {
  return !!role && (role.access.includes("*") || role.access.includes(key));
}
