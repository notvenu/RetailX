/** Automation engine + the business's activity log. Mutates a Business inside `updateBusiness`. */
import { money, type Fmt } from "@/lib/format";
import { kpiStatus, matches } from "@/lib/metrics";
import { notifyUsers, sendEmail, sendWhatsApp, waLink, whatsappConfigured } from "@/lib/notify";
import { uid, type Activity, type Automation, type Business, type RecordRow, type Task, type Value } from "@/lib/model";

export function log(b: Business, text: string, kind: Activity["kind"] = "info", link?: string) {
  b.activity.unshift({ id: uid("a_"), at: new Date().toISOString(), text, kind, ...(link ? { link } : {}) });
  b.activity.length = Math.min(b.activity.length, 300);
}

export function addTask(b: Business, t: Omit<Task, "id" | "createdAt" | "status"> & { status?: Task["status"] }): Task {
  const task: Task = { id: uid("t_"), createdAt: new Date().toISOString(), status: "todo", ...t };
  b.tasks.unshift(task);
  return task;
}

/** `{{field}}` → the record's value, money fields formatted in the business currency. */
export function fill(tpl: string, b: Business, moduleId: string | null, data: Record<string, Value> | null) {
  const mod = moduleId ? b.modules.find((x) => x.id === moduleId) : null;
  const fmt: Fmt = { currency: b.currency, locale: b.locale };
  return tpl.replace(/{{\s*(\w+)\s*}}/g, (_, k: string) => {
    const v = data?.[k];
    if (v == null || v === "") return "—";
    return mod?.fields.find((x) => x.key === k)?.type === "money" ? money(Number(v), fmt) : String(v);
  });
}

/** Messages to send once the transaction that decided them has committed. */
/** `user` = a person in the business (`user:<id>`), told by push / opted-in email. */
export type Outgoing = { channel: "whatsapp" | "email" | "user"; to: string; text: string; subject?: string };

function run(b: Business, a: Automation, moduleId: string | null, row: RecordRow | null, out: Outgoing[]) {
  for (const act of a.actions) {
    if (act.type === "task") {
      const title = fill(act.title, b, moduleId, row?.data ?? null);
      addTask(b, { title, assignee: act.assignee, source: `automation:${a.id}` });
      if (act.assignee?.startsWith("user:")) out.push({ channel: "user", to: act.assignee, text: title, subject: `New task: ${title}` });
    } else if (act.type === "notify") {
      log(b, fill(act.message, b, moduleId, row?.data ?? null), "automation");
    } else if (act.type === "set_field" && row) {
      row.data[act.field] = act.value;
    } else if (act.type === "message") {
      const to = fill(act.to, b, moduleId, row?.data ?? null).trim();
      const text = fill(act.text, b, moduleId, row?.data ?? null);
      if (!to || to === "—") { log(b, `“${a.name}”: no ${act.channel} recipient on this record`, "warn"); continue; }
      if (act.channel === "whatsapp" && !whatsappConfigured()) {
        // no WhatsApp API: hand it to a person as a one-tap link with the message already written
        addTask(b, { title: `Send WhatsApp to ${to}: “${text.slice(0, 60)}${text.length > 60 ? "…" : ""}”`, link: waLink(to, text), source: `automation:${a.id}` });
      } else out.push({ channel: act.channel, to, text, subject: a.name });
    }
  }
  a.runs += 1;
  a.lastRun = new Date().toISOString();
  log(b, `Automation “${a.name}” ran`, "automation");
}

/** Called whenever a record is saved. */
export function onRecord(b: Business, moduleId: string, row: RecordRow, out: Outgoing[] = []) {
  for (const a of b.automations)
    if (a.enabled && a.trigger.type === "record" && a.trigger.module === moduleId && matches(row.data, a.conditions)) run(b, a, moduleId, row, out);
  return out;
}

const PERIOD_MS = { day: 864e5, week: 7 * 864e5, month: 30 * 864e5 };

/** Due schedules and KPI watches. Called by /api/cron on a clock, and whenever someone opens the app. Needs records loaded. */
export function runDue(b: Business, out: Outgoing[] = [], now = Date.now()): number {
  let ran = 0;
  for (const a of b.automations) {
    if (!a.enabled) continue;
    const last = a.lastRun ? +new Date(a.lastRun) : 0;
    if (a.trigger.type === "schedule" && now - last >= PERIOD_MS[a.trigger.every]) { run(b, a, null, null, out); ran++; }
    if (a.trigger.type === "kpi" && now - last >= PERIOD_MS.day) {
      const t = a.trigger;
      const kpi = b.kpis.find((x) => x.id === t.kpi);
      const v = kpi ? kpiStatus(b, kpi, b.analytics.grain).value : null;
      if (v != null && (t.op === "lt" ? v < t.value : v > t.value)) { run(b, a, null, null, out); ran++; }
    }
  }
  return ran;
}

/** Manual run: record automations replay against the latest matching record. */
export function runNow(b: Business, id: string, out: Outgoing[] = []) {
  const a = b.automations.find((x) => x.id === id);
  if (!a) throw new Error("No such automation.");
  if (a.trigger.type === "record") {
    const mod = a.trigger.module;
    const row = (b.records[mod] ?? []).find((r) => matches(r.data, a.conditions));
    if (!row) { log(b, `“${a.name}”: no ${mod} record matches its conditions yet`, "warn"); return out; }
    run(b, a, mod, row, out);
  } else run(b, a, null, null, out);
  return out;
}

export async function deliver(businessId: string, out: Outgoing[]) {
  for (const m of out) {
    if (m.channel === "user") await notifyUsers(businessId, (u) => `user:${u.id}` === m.to, m.subject ?? "RetailX", `An automation gave you a task:\n\n${m.text}`);
    else if (m.channel === "email") await sendEmail({ to: m.to, subject: m.subject ?? "Message", text: m.text, businessId });
    else await sendWhatsApp({ to: m.to, text: m.text, businessId });
  }
}
