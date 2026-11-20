/**
 * AI roles. Each role is Claude with the role's mandate, the business profile, live KPIs and a set of
 * tools that read the books and (depending on its autonomy) create tasks, automations and targets.
 * Without an API key, roles fall back to a rule-based briefing built from the same KPIs.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getBusiness, updateBusiness } from "@/lib/db";
import { industryById, measurableKpis } from "@/lib/catalog";
import { addTask, log } from "@/lib/automation";
import { notifyUsers } from "@/lib/notify";
import { fmtUnit, type Fmt } from "@/lib/format";
import { complete, kpiSeries, kpiStatus, matches, todayIso, type KpiStatus } from "@/lib/metrics";
import { runForecast, SEASON_BY_GRAIN } from "@/lib/forecast";
import { benchmarkFor, validRange, type Benchmark } from "@/lib/benchmarks";
import { watchList } from "@/lib/insights";
import { uid, type AiRole, type Automation, type Business, type ChatMsg, type Condition, type Grain } from "@/lib/model";

const MODEL = "claude-opus-5-5";
const INDUSTRY_NAME = (id: string) => industryById(id).name;
const hasClaude = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
/** Claude, or any OpenAI-compatible chat API (Gemini free tier by default; Groq, Ollama via AI_BASE_URL). */
export const aiConfigured = () => hasClaude() || !!process.env.AI_API_KEY;

/**
 * fetch for OpenAI-compatible APIs. Free tiers cap tokens per minute (Groq: 8,000), and an agent turn resends its tools
 * and context, so a 429 is normal: wait as long as the API asks (at most 25 s) and try again, up to 3 times.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response | null> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init).catch(() => null);
    if (!res || res.status !== 429 || attempt >= 3) return res;
    const wait = Math.min(25, Math.max(3, Number(res.headers.get("retry-after")) || 15));
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}

const fmtOf = (b: Business): Fmt => ({ currency: b.currency, locale: b.locale });

export function roleKpis(b: Business, role: AiRole) {
  return role.kpis.length ? b.kpis.filter((k) => role.kpis.includes(k.id)) : b.kpis.filter((k) => role.areas.includes(k.area));
}

function kpiLine(b: Business, s: KpiStatus) {
  const f = fmtOf(b);
  const parts = [`${s.kpi.name} (${s.kpi.id}): ${fmtUnit(s.value, s.kpi.unit, f)} for ${s.period}`];
  if (s.vsPrevious != null) parts.push(`${s.vsPrevious >= 0 ? "+" : ""}${s.vsPrevious.toFixed(1)}${s.kpi.unit === "pct" ? " pts" : "%"} vs ${s.versus}`);
  if (s.kpi.target != null) parts.push(`target ${fmtUnit(s.kpi.target, s.kpi.unit, f)}`);
  const bm = benchmarkFor(b, s.kpi);
  if (bm) parts.push(`market typical ${fmtUnit(bm.p50, s.kpi.unit, f)} (middle half ${fmtUnit(bm.p25, s.kpi.unit, f)}–${fmtUnit(bm.p75, s.kpi.unit, f)}, ${bm.origin === "builtin" ? "rule of thumb" : bm.origin === "web" ? `researched ${bm.asOf ?? ""}` : "owner's figure"})`);
  parts.push(s.kpi.higherIsBetter ? "higher is better" : "lower is better", `status ${s.status}`);
  return "- " + parts.join(" · ");
}

/* ---------------- rule-based coach (no key) ---------------- */

const ADVICE: Record<string, string> = {
  gross_margin: "Check discounts and the cost of your top 10 items; reprice anything below target margin.",
  net_margin: "List the three largest expense lines this period and agree a cap for each.",
  receivables: "Call the five largest unpaid bills this week; offer UPI links to make paying easy.",
  below_reorder: "Raise purchase orders for every item at or below its reorder level today.",
  stockout_rate: "Raise reorder levels on items that keep running out; they are lost sales.",
  expenses_total: "Compare each expense category with last period and question anything up more than 15%.",
  food_cost_pct: "Re-cost your top dishes against current supplier prices and trim portions that drifted.",
  waste_pct: "Log waste by item for a week; prep smaller batches of the worst three.",
  no_show_rate: "Send a reminder message the evening before every booking.",
  return_rate: "Read the last 20 return reasons; fix size charts or photos for the top product.",
  utilization: "Move non-billable work to fixed hours and review unbilled time every Friday.",
  rejection_rate: "Run a root-cause check on the line with the most rejects this period.",
  cancellation_rate: "Ask for a part-advance on OTA bookings and tighten the free-cancellation window.",
  on_time: "Review late trips by route; pad schedules on the worst lane.",
};

export function briefing(b: Business, role: AiRole): string {
  const f = fmtOf(b);
  const stats = roleKpis(b, role).map((k) => kpiStatus(b, k, b.analytics.grain, b.analytics.compareTo));
  const lines: string[] = [`**${role.title} briefing** for ${b.name}`];
  const flagged = stats.filter((s) => s.status === "bad" || s.status === "watch");
  if (!stats.some((s) => s.value != null)) {
    lines.push("", "There is nothing recorded yet for the numbers I watch. Start by entering this week's records in:");
    const mods = new Set(roleKpis(b, role).flatMap((k) => Object.values(k.metrics).map((x) => x.module)));
    for (const id of mods) { const mod = b.modules.find((x) => x.id === id); if (mod?.enabled) lines.push(`- ${mod.name}`); }
  } else {
    lines.push("", "**Where we stand**");
    for (const s of stats.filter((x) => x.value != null)) {
      const d = s.vsPrevious == null ? "" : ` (${s.vsPrevious >= 0 ? "+" : ""}${s.vsPrevious.toFixed(1)}${s.kpi.unit === "pct" ? " pts" : "%"} vs ${s.versus})`;
      lines.push(`- ${s.kpi.name}: ${fmtUnit(s.value, s.kpi.unit, f)}${d}${s.kpi.target != null ? `, target ${fmtUnit(s.kpi.target, s.kpi.unit, f)}` : ""}`);
    }
    lines.push("", flagged.length ? "**What I'd do this week**" : "Nothing is off track. Keep recording daily so I can spot drift early.");
    for (const s of flagged) lines.push(`- ${s.kpi.name} needs attention. ${ADVICE[s.kpi.id] ?? "Look at the records behind the drop and agree one fix with the team."}`);
  }
  const watch = watchList(b, todayIso(), (n) => fmtUnit(n, "money", f));
  const mine = role.id === "cfo" ? watch.money : role.id === "coo" ? watch.shelf : role.id === "gm" ? [...watch.money, ...watch.shelf] : [];
  if (mine.length) lines.push("", "**On my watch-list**", ...mine.map((x) => `- ${x}`));
  const gaps = b.modules.filter((m) => m.enabled && m.dateField && (b.records[m.id]?.length ?? 0) === 0);
  if (gaps.length && role.id === "cto") lines.push("", `**Data gaps**: no records yet in ${gaps.map((g) => g.name).join(", ")}.`);
  const open = b.tasks.filter((t) => t.assignee === `ai:${role.id}` && t.status !== "done");
  if (open.length) lines.push("", `I have ${open.length} open task${open.length > 1 ? "s" : ""}: ${open.slice(0, 3).map((t) => t.title).join("; ")}.`);
  return lines.join("\n");
}

/* ---------------- tools ---------------- */

// eager_input_streaming: tool inputs stream as generated; the API no longer validates them, so every tool below
// coerces and checks its own input (str(), Number(), allow-lists) before acting.
const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): Anthropic.Beta.BetaTool =>
  ({ name, description, input_schema: { type: "object", properties, required }, eager_input_streaming: true });
const GRAINS = { type: "string", enum: ["day", "week", "month", "quarter", "year"] };

const TOOLS_READ = [
  tool("get_kpis", "Current value, prior-period change, target and status of the business's KPIs. Use before quoting any figure.", { grain: GRAINS }),
  tool("get_kpi_series", "A KPI's value per period, oldest first, for trend questions.", { kpi: { type: "string" }, grain: GRAINS, last: { type: "integer" } }, ["kpi"]),
  tool("query_records", "Read records from a module, newest first, optionally filtered. Conditions: field, op (eq, ne, gt, gte, lt, lte, contains, empty, notempty), value.", {
    module: { type: "string" },
    where: { type: "array", items: { type: "object", properties: { field: { type: "string" }, op: { type: "string" }, value: { type: "string" } }, required: ["field", "op"] } },
    limit: { type: "integer" },
  }, ["module"]),
  tool("forecast_kpi", "Forecast a KPI with the automatic model choice; returns the chosen model, back-test error and the forecast with a 90% range.", { kpi: { type: "string" }, grain: { type: "string", enum: ["day", "week", "month"] }, horizon: { type: "integer" } }, ["kpi"]),
  tool("list_tasks", "Open tasks for the business, with assignee and status.", {}),
  tool("remember", "Save a standing fact or decision the owner told you, so you apply it in future conversations (e.g. 'we never discount dairy').", { fact: { type: "string" } }, ["fact"]),
  tool("forget", "Drop a remembered fact by its number in your memory list.", { number: { type: "integer" } }, ["number"]),
];

const TOOLS_WRITE = [
  tool("create_task", "Create a task. assignee: 'owner', 'ai:<role id>' (yourself, or a colleague to hand work to) or omitted.", {
    title: { type: "string" }, detail: { type: "string" }, assignee: { type: "string" }, due: { type: "string", description: "YYYY-MM-DD" },
  }, ["title"]),
  tool("update_task", "Update one of your tasks: status (todo, doing, done) and a result note describing what you did or found.", {
    id: { type: "string" }, status: { type: "string", enum: ["todo", "doing", "done"] }, result: { type: "string" },
  }, ["id"]),
  tool("create_automation",
    "Create an automation. trigger: {type:'record', module} | {type:'schedule', every:'day'|'week'|'month'} | {type:'kpi', kpi, op:'lt'|'gt', value}. " +
    "conditions apply to the saved record (record trigger only). actions: [{type:'task', title, assignee?} | {type:'notify', message} | {type:'message', channel:'whatsapp'|'email', to, text}]. Text may use {{field}}.",
    { name: { type: "string" }, trigger: { type: "object" }, conditions: { type: "array", items: { type: "object" } }, actions: { type: "array", items: { type: "object" } } },
    ["name", "trigger", "actions"]),
  tool("set_kpi_target", "Set the target for a KPI, in its own unit (money, %, count).", { kpi: { type: "string" }, target: { type: "number" } }, ["kpi", "target"]),
];

type Input = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const grainOf = (v: unknown, d: Grain): Grain => (["day", "week", "month", "quarter", "year"].includes(str(v)) ? (str(v) as Grain) : d);

async function runTool(businessId: string, role: AiRole, name: string, input: Input, done: string[]): Promise<string> {
  const b = await getBusiness(businessId);
  if (!b) return "Business not found.";
  const f = fmtOf(b);
  switch (name) {
    case "get_kpis": {
      const g = grainOf(input.grain, b.analytics.grain);
      return b.kpis.map((k) => kpiLine(b, kpiStatus(b, k, g, b.analytics.compareTo))).join("\n") || "No KPIs configured.";
    }
    case "get_kpi_series": {
      const kpi = b.kpis.find((k) => k.id === input.kpi);
      if (!kpi) return `Unknown KPI. Available: ${b.kpis.map((k) => k.id).join(", ")}`;
      const s = kpiSeries(b, kpi, grainOf(input.grain, b.analytics.grain)).slice(-(Number(input.last) || 24));
      return s.map((p) => `${p.label}: ${fmtUnit(p.value, kpi.unit, f)}`).join("\n") || "No data yet.";
    }
    case "query_records": {
      const mod = b.modules.find((x) => x.id === input.module && x.enabled);
      if (!mod) return `Unknown module. Available: ${b.modules.filter((x) => x.enabled).map((x) => x.id).join(", ")}`;
      const where = Array.isArray(input.where) ? (input.where as Condition[]).filter((c) => c && typeof c.field === "string") : [];
      const rows = (b.records[mod.id] ?? []).filter((r) => matches(r.data, where));
      const lim = Math.min(Number(input.limit) || 30, 100);
      return `${rows.length} matching ${mod.name} records. Fields: ${mod.fields.map((x) => x.key).join(", ")}\n` +
        rows.slice(0, lim).map((r) => JSON.stringify(r.data)).join("\n");
    }
    case "forecast_kpi": {
      const kpi = b.kpis.find((k) => k.id === input.kpi);
      if (!kpi) return "Unknown KPI.";
      const g = grainOf(input.grain, "month");
      const s = complete(kpiSeries(b, kpi, g), g);
      const r = runForecast(s.map((p) => p.value ?? 0), {
        model: "auto", season: "auto", seasonCandidate: SEASON_BY_GRAIN[g], horizon: Math.min(Number(input.horizon) || 6, 90), confidence: 90, transform: "none", selectBy: "smape",
      });
      if (!r) return `Not enough history (${s.length} finished periods); need at least 4.`;
      const best = r.scores.find((x) => x.key === r.chosen);
      return [`Model: ${r.chosen}; back-test sMAPE ${best?.smape.toFixed(1)}%, MASE ${best?.mase.toFixed(2)}`, ...r.notes,
        ...r.forecast.map((v, i) => `+${i + 1}: ${fmtUnit(v, kpi.unit, f)} (${fmtUnit(r.lower[i], kpi.unit, f)} – ${fmtUnit(r.upper[i], kpi.unit, f)})`)].join("\n");
    }
    case "list_tasks":
      return b.tasks.filter((t) => t.status !== "done").map((t) => `${t.id} · ${t.status}${t.needsApproval ? " (awaiting approval)" : ""} · ${t.assignee ?? "unassigned"} · ${t.title}`).join("\n") || "No open tasks.";
    case "remember":
    case "forget":
      return updateBusiness(businessId, (bb) => {
        const r = bb.aiRoles.find((x) => x.id === role.id);
        if (!r) return "Role not found.";
        r.memory ??= [];
        if (name === "remember") {
          const fact = str(input.fact).trim().slice(0, 300);
          if (!fact) return "Nothing to remember.";
          r.memory.push(fact);
          r.memory = r.memory.slice(-30);
          done.push(`Remembered: ${fact}`);
          return "Saved to memory.";
        }
        const i = Number(input.number) - 1;
        if (!(i >= 0 && i < r.memory.length)) return "No such memory.";
        done.push(`Forgot: ${r.memory.splice(i, 1)[0]}`);
        return "Removed.";
      });
  }
  if (role.autonomy === "advise") return "Your autonomy is 'advise': suggest this to the owner instead of doing it.";
  return updateBusiness(businessId, (bb) => {
    switch (name) {
      case "create_task": {
        const raw = str(input.assignee);
        const assignee = raw === "owner" || !raw ? undefined : raw.startsWith("ai:") && bb.aiRoles.some((r) => `ai:${r.id}` === raw && r.enabled) ? raw : undefined;
        // a "draft" role's tasks wait for the owner, except work it hands to itself
        const needsApproval = role.autonomy === "draft" && assignee !== `ai:${role.id}`;
        const due = /^\d{4}-\d{2}-\d{2}$/.test(str(input.due)) ? str(input.due) : undefined;
        const t = addTask(bb, { title: str(input.title).slice(0, 200) || "Untitled", detail: str(input.detail).slice(0, 2000) || undefined, assignee, due, source: `ai:${role.id}`, ...(needsApproval ? { needsApproval } : {}) });
        log(bb, `${role.title} ${needsApproval ? "proposed" : "created"} task “${t.title}”${assignee?.startsWith("ai:") && assignee !== `ai:${role.id}` ? ` for ${assignee.slice(3).toUpperCase()}` : ""}`, "ai");
        done.push(`${needsApproval ? "Proposed" : "Created"} task: ${t.title}`);
        if (needsApproval) void notifyUsers(businessId, (u) => u.roleId === "owner", `Approval needed: ${t.title}`, `${role.title} proposed a task and needs your approval:

${t.title}

Open Approvals in RetailX to approve or reject it.`, "/approvals").catch(() => {});
        return needsApproval ? `Proposed ${t.id}; it waits in the owner's approval queue.` : `Created ${t.id}.`;
      }
      case "update_task": {
        const t = bb.tasks.find((x) => x.id === input.id);
        if (!t) return "No such task.";
        if (["todo", "doing", "done"].includes(str(input.status))) t.status = input.status as typeof t.status;
        if (input.result) t.result = str(input.result).slice(0, 4000);
        log(bb, `${role.title} updated “${t.title}” → ${t.status}`, "ai");
        done.push(`Updated task: ${t.title} (${t.status})`);
        return "Updated.";
      }
      case "create_automation": {
        const tr = input.trigger as Automation["trigger"];
        if (!tr || !["record", "schedule", "kpi"].includes(tr.type)) return "Invalid trigger.";
        const acts = (Array.isArray(input.actions) ? (input.actions as Automation["actions"]) : [])
          .filter((x) => x && (x.type === "task" || x.type === "notify" || (x.type === "message" && (x.channel === "whatsapp" || x.channel === "email"))));
        if (!acts.length) return "Need at least one task, notify or message action.";
        const a: Automation = {
          id: uid("au_"), name: str(input.name).slice(0, 80) || "AI automation", trigger: tr,
          conditions: Array.isArray(input.conditions) ? (input.conditions as Condition[]) : [], actions: acts,
          enabled: role.autonomy === "act", createdBy: `ai:${role.id}`, runs: 0,
        };
        bb.automations.push(a);
        log(bb, `${role.title} ${a.enabled ? "set up" : "drafted (awaiting your approval)"} automation “${a.name}”`, "ai");
        done.push(`${a.enabled ? "Created" : "Drafted"} automation: ${a.name}`);
        return a.enabled ? "Automation created and switched on." : "Automation drafted; it waits in the owner's approval queue.";
      }
      case "set_kpi_target": {
        const kpi = bb.kpis.find((k) => k.id === input.kpi);
        if (!kpi || !Number.isFinite(Number(input.target))) return "Unknown KPI or bad target.";
        if (role.autonomy !== "act") return "Your autonomy is 'draft': propose the target instead of setting it.";
        kpi.target = Number(input.target);
        log(bb, `${role.title} set the ${kpi.name} target to ${fmtUnit(kpi.target, kpi.unit, fmtOf(bb))}`, "ai");
        done.push(`Set target: ${kpi.name}`);
        return "Target set.";
      }
    }
    return "Unknown tool.";
  });
}

/* ---------------- agent ---------------- */

function systemPrompt(b: Business, role: AiRole, others: AiRole[]) {
  const ownKpis = roleKpis(b, role).map((k) => k.id).join(", ") || "all";
  const rules = {
    advise: "You only advise. You can read the books and keep your memory, but cannot create or change anything; recommend what the owner should do.",
    draft: "You can create tasks (tasks for others wait for the owner's approval) and draft automations (they stay off until approved). You cannot change KPI targets.",
    act: "You can create tasks, switch on automations you create, and set KPI targets when the owner asks or the numbers clearly justify it. Say what you changed.",
  }[role.autonomy];
  return `You are ${role.name}, the ${role.title} of ${b.name}, an AI member of its leadership team working for the owner.

Mandate: ${role.mandate}
Responsibilities: ${role.responsibilities.join("; ")}.
Tone: ${role.tone}. Write for a busy small-business owner: short paragraphs or tight bullets, concrete next steps, under 220 words unless asked for more.
Autonomy: ${rules}

The business: ${b.industry} (${b.category}) in ${b.city || "—"}, ${b.country}. Team size ${b.profile.size}, ${b.profile.locations} location(s). Sells ${b.profile.sells}. Currency ${b.currency}.
Owner's goals: ${b.profile.goals.join(", ") || "not stated"}.
Modules in use (module ids for tools): ${b.modules.filter((m) => m.enabled).map((m) => `${m.id} (${m.name})`).join(", ")}.
KPIs you own: ${ownKpis}.
Colleagues you can hand work to with create_task: ${others.map((o) => `ai:${o.id} (${o.title})`).join(", ") || "none"}. Hand over work that belongs to their mandate instead of doing it yourself.

Ground every figure in the tools; never invent numbers. If the records needed to answer don't exist yet, say exactly what to start recording and where. Coach: explain the why in one line, then the action. When the owner states a standing preference or decision, save it with remember.`;
}

export type AgentReply = { text: string; actions: string[] };
export type Hooks = { onText?: (delta: string) => void; onStatus?: (s: string) => void };

const STATUS: Record<string, string> = {
  get_kpis: "Checking KPIs", get_kpi_series: "Reading the trend", query_records: "Reading records", forecast_kpi: "Running a forecast",
  list_tasks: "Looking at tasks", create_task: "Creating a task", update_task: "Updating a task", create_automation: "Setting up an automation",
  set_kpi_target: "Setting a target", remember: "Saving to memory", forget: "Updating memory",
};

export async function askRole(businessId: string, roleId: string, prompt: string, history: Pick<ChatMsg, "role" | "text">[], hooks: Hooks = {}): Promise<AgentReply> {
  const b = (await getBusiness(businessId))!;
  const role = b.aiRoles.find((r) => r.id === roleId);
  if (!role) return { text: "That role no longer exists.", actions: [] };
  const fallback = (note: string) => {
    const text = briefing(b, role) + `\n\n${note}`;
    hooks.onText?.(text);
    return { text, actions: [] };
  };
  if (!aiConfigured()) return fallback(`${role.name} is running on built-in rules. Set \`ANTHROPIC_API_KEY\` (or a free \`AI_API_KEY\`) on the server to talk with ${role.name} in your own words and let them act on tasks.`);

  const client = new Anthropic();
  const others = b.aiRoles.filter((r) => r.enabled && r.id !== role.id);
  const snapshot = roleKpis(b, role).map((k) => kpiLine(b, kpiStatus(b, k, b.analytics.grain, b.analytics.compareTo))).join("\n");
  const myTasks = b.tasks.filter((t) => t.assignee === `ai:${role.id}` && t.status !== "done").map((t) => `- ${t.id}: ${t.title}${t.detail ? ` (${t.detail})` : ""}`).join("\n");
  const memory = (role.memory ?? []).map((m, i) => `${i + 1}. ${m}`).join("\n");
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-12).map((h) => ({ role: h.role, content: h.text })),
    { role: "user", content: prompt },
  ];
  const tools = role.autonomy === "advise" ? TOOLS_READ : [...TOOLS_READ, ...TOOLS_WRITE];
  const actions: string[] = [];
  let text = "";
  let jsonRetries = 0;
  const context = `Today: ${todayIso()}\nYour memory:\n${memory || "(empty)"}\nYour KPIs right now:\n${snapshot || "(none recorded)"}\nYour open tasks:\n${myTasks || "(none)"}`;

  if (!hasClaude()) {
    text = await askCompatible(`${systemPrompt(b, role, others)}\n\n${context}`, history, prompt, tools,
      (name, input) => runTool(businessId, role, name, input, actions), hooks);
    return { text: text.trim() || "Done.", actions };
  }

  try {
    for (let turn = 0; turn < 10; turn++) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: [
          { type: "text", text: systemPrompt(b, role, others), cache_control: { type: "ephemeral" } },
          { type: "text", text: context },
        ],
        tools,
        messages,
      });
      stream.on("text", (d) => { text += d; hooks.onText?.(d); });
      let res: Anthropic.Beta.BetaMessage;
      try {
        res = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
        continue; // a streamed tool input wasn't parseable JSON: re-issue the turn
      }
      if (res.stop_reason === "refusal") return { text: text || "I can't help with that one. Try asking about the business's numbers or next steps.", actions };
      const uses = res.content.filter((c): c is Anthropic.Beta.BetaToolUseBlock => c.type === "tool_use");
      // a truncated turn may carry a half-written tool input: don't run it
      if (res.stop_reason === "max_tokens") return { text: text + (uses.length ? "\n\n(That ran long, so I stopped before acting. Ask again more narrowly.)" : ""), actions };
      messages.push({ role: "assistant", content: res.content });
      if (res.stop_reason !== "tool_use" || !uses.length) return { text: text.trim() || "Done.", actions };
      if (text && !text.endsWith("\n")) { text += "\n\n"; hooks.onText?.("\n\n"); }
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const u of uses) {
        hooks.onStatus?.(STATUS[u.name] ?? "Working");
        let out: string;
        try { out = await runTool(businessId, role, u.name, (u.input && typeof u.input === "object" ? u.input : {}) as Input, actions); }
        catch (e) { out = `Error: ${(e as Error).message}`; }
        results.push({ type: "tool_result", tool_use_id: u.id, content: out });
      }
      messages.push({ role: "user", content: results });
    }
    return { text: text + "\n\nI took several steps and stopped there. Ask me to continue if you need more.", actions };
  } catch (e) {
    const msg = e instanceof Anthropic.AuthenticationError ? "The AI key on the server was rejected. Check ANTHROPIC_API_KEY."
      : e instanceof Anthropic.RateLimitError ? "The AI service is busy. Try again in a minute."
      : e instanceof Anthropic.APIError ? `The AI service returned an error (${e.status}). Try again shortly.` : null;
    if (!msg) throw e;
    hooks.onText?.(msg);
    return { text: (text ? text + "\n\n" : "") + msg, actions };
  }
}

type OaMsg = { role: string; content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[]; tool_call_id?: string };

/**
 * Same agent loop over an OpenAI-compatible chat API. Defaults to Google Gemini's free tier.
 * ponytail: no streaming, each turn's text arrives whole; stream if the wait feels long.
 */
async function askCompatible(system: string, history: Pick<ChatMsg, "role" | "text">[], prompt: string, tools: Anthropic.Beta.BetaTool[],
  run: (name: string, input: Input) => Promise<string>, hooks: Hooks): Promise<string> {
  const base = process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
  const model = process.env.AI_MODEL || "gemini-2.5-flash";
  const fns = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  const msgs: OaMsg[] = [{ role: "system", content: system }, ...history.slice(-12).map((h) => ({ role: h.role, content: h.text })), { role: "user", content: prompt }];
  let text = "";
  const say = (s: string) => { text += s; hooks.onText?.(s); };
  for (let turn = 0; turn < 10; turn++) {
    const res = await fetchWithRetry(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify({ model, messages: msgs, tools: fns }),
    }).catch(() => null);
    if (!res?.ok) {
      const why = !res ? "The AI service couldn't be reached. Check the internet connection or AI_BASE_URL."
        : res.status === 429 ? "The free AI tier is busy (rate limit). Try again in a minute."
        : res.status === 401 || res.status === 403 ? "The AI key on the server was rejected. Check AI_API_KEY."
        : `The AI service returned an error (${res.status}: ${(await res.text()).slice(0, 200)}). Check AI_MODEL.`;
      say((text ? "\n\n" : "") + why);
      return text;
    }
    const m = (await res.json())?.choices?.[0]?.message as OaMsg | undefined;
    if (!m) { say("The AI service sent an empty reply. Try again."); return text; }
    if (m.content) say((text && !text.endsWith("\n") ? "\n\n" : "") + m.content);
    msgs.push(m); // echo back as received: Gemini needs its tool-call signatures returned
    if (!m.tool_calls?.length) return text;
    for (const c of m.tool_calls) {
      hooks.onStatus?.(STATUS[c.function.name] ?? "Working");
      let input: Input = {};
      try { input = JSON.parse(c.function.arguments || "{}"); } catch { /* bad JSON: run with no input, the tool says what's missing */ }
      let out: string;
      try { out = await run(c.function.name, input && typeof input === "object" ? input : {}); } catch (e) { out = `Error: ${(e as Error).message}`; }
      msgs.push({ role: "tool", tool_call_id: c.id, content: out });
    }
  }
  return text + "\n\nI took several steps and stopped there. Ask me to continue if you need more.";
}

/** Appends a reply to a role's thread. */
export async function postToThread(businessId: string, roleId: string, msgs: ChatMsg[]) {
  await updateBusiness(businessId, (b) => {
    const th = (b.threads[roleId] ??= []);
    th.push(...msgs);
    if (th.length > 60) th.splice(0, th.length - 60);
  });
}

/**
 * Morning briefings: once a day, each enabled role posts a briefing to its thread; "act" roles also work through
 * their open tasks. Runs from /api/cron, and after the first page view of the day as a fallback.
 */
export async function dailyBriefings(businessId: string) {
  const today = todayIso();
  const due = await updateBusiness(businessId, (b) => {
    const roles = b.aiRoles.filter((r) => r.enabled && b.briefed?.[r.id] !== today);
    b.briefed = { ...b.briefed, ...Object.fromEntries(roles.map((r) => [r.id, today])) }; // claim first, so two requests don't both brief
    return roles;
  });
  if (!due.length) return 0;
  for (const role of due) {
    const reply = await askRole(businessId, role.id,
      `It's the morning of ${today}. Write your morning briefing for the owner: what changed since yesterday in your area, what needs attention today, and one recommendation.` +
      (role.autonomy === "act" ? " Then work through any of your open tasks you can finish with your tools." : ""), []);
    await postToThread(businessId, role.id, [{ role: "assistant", text: `**Morning briefing, ${today}**\n\n${reply.text}`, at: new Date().toISOString() }]);
    await updateBusiness(businessId, (b) => log(b, `${role.title} posted the morning briefing`, "ai"));
  }
  return due.length;
}

/** An AI role works on a task assigned to it: checks the numbers, acts within its autonomy, records a result. */
export async function workTask(businessId: string, taskId: string, hooks: Hooks = {}): Promise<AgentReply> {
  const b = (await getBusiness(businessId, { records: false }))!;
  const t = b.tasks.find((x) => x.id === taskId);
  const roleId = t?.assignee?.startsWith("ai:") ? t.assignee.slice(3) : null;
  if (!t || !roleId) throw new Error("That task isn't assigned to an AI role.");
  if (t.needsApproval) throw new Error("Approve this task first.");
  await updateBusiness(businessId, (bb) => { const x = bb.tasks.find((y) => y.id === taskId); if (x) x.status = "doing"; });
  const reply = await askRole(businessId, roleId,
    `Work on your task ${t.id}: “${t.title}”${t.detail ? ` (${t.detail})` : ""}. Use the tools to check the numbers, do what your autonomy allows, ` +
    `then call update_task with status "done" and a short result the owner can act on. If you can't finish, leave it "doing" and say what's blocking.`, [], hooks);
  await updateBusiness(businessId, (bb) => {
    const x = bb.tasks.find((y) => y.id === taskId);
    if (!x) return;
    if (!x.result) x.result = reply.text;
    // nothing was done (e.g. no AI key): hand the task back rather than leave it looking in progress
    if (x.status === "doing" && reply.actions.length === 0) x.status = "todo";
  });
  await postToThread(businessId, roleId, [{ role: "assistant", text: `Worked on “${t.title}”.

${reply.text}`, at: new Date().toISOString() }]);
  return reply;
}

/* ---------------- market research ---------------- */

const SAVE_BENCHMARKS: Anthropic.Beta.BetaTool = {
  name: "save_benchmarks",
  description: "Save the market ranges you found. One entry per KPI you have a credible source for; leave out KPIs you couldn't source.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["benchmarks"],
    properties: {
      benchmarks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kpi", "p25", "p50", "p75", "source", "url", "note"],
          properties: {
            kpi: { type: "string", description: "KPI id from the list" },
            p25: { type: "number" }, p50: { type: "number" }, p75: { type: "number" },
            source: { type: "string", description: "Publisher and title of the source" },
            url: { type: "string" },
            note: { type: "string", description: "One line: what the figure covers (region, year, segment)" },
          },
        },
      },
    },
  },
};

/**
 * Has Claude search the web for current market ranges for this business's KPIs and saves the ones it can source,
 * with publisher, link and today's date. Returns how many were saved.
 */
export async function researchBenchmarks(businessId: string): Promise<{ saved: string[]; skipped: number }> {
  const groq = /groq\.com/.test(process.env.AI_BASE_URL ?? "") && !!process.env.AI_API_KEY;
  if (!hasClaude() && !groq) throw new Error("Researching current market figures needs web search: set ANTHROPIC_API_KEY, or use a Groq key (AI_BASE_URL=https://api.groq.com/openai/v1). The built-in ranges are shown meanwhile.");
  const b = (await getBusiness(businessId, { records: false }))!;
  const kpis = measurableKpis(b).filter((k) => benchmarkFor({ industry: b.industry, category: b.category }, k));
  if (!kpis.length) return { saved: [], skipped: 0 };
  const list = kpis.map((k) => `- ${k.id}: ${k.name} (${k.unit === "pct" ? "percent, e.g. 22.5" : k.unit}; formula ${k.formula}; ${k.higherIsBetter ? "higher is better" : "lower is better"})`).join("\n");
  const ask = `Find current market benchmarks for a ${b.category} business in the ${INDUSTRY_NAME(b.industry)} industry in ${b.city ? b.city + ", " : ""}${b.country}, ` +
    `a micro or small enterprise. For each KPI below, give the 25th percentile, median and 75th percentile a business like this ` +
    `typically achieves, in the KPI's own unit. Prefer recent (last 3 years), ${b.country}-specific sources: industry reports, ` +
    `trade associations, government or bank studies. If a source gives a single typical figure or a range, use it for the ` +
    `median / spread and say so in the note. Skip any KPI you can't source credibly; never guess.\n\nKPIs:\n${list}\n\n`;
  const save = async (found: (Benchmark & { kpi: string })[]) => {
    const today = todayIso();
    const ok = found.filter((x) => kpis.some((k) => k.id === x.kpi) && validRange(x) && /^https?:\/\//.test(x.url ?? ""));
    await updateBusiness(businessId, (bb) => {
      bb.benchmarks ??= {};
      for (const x of ok)
        bb.benchmarks[x.kpi] = { p25: x.p25, p50: x.p50, p75: x.p75, origin: "web", source: String(x.source).slice(0, 200), url: x.url, note: String(x.note ?? "").slice(0, 300), asOf: today };
      log(bb, `Market benchmarks refreshed from the web: ${ok.length} KPI${ok.length === 1 ? "" : "s"} sourced`, "ai");
    });
    return { saved: ok.map((x) => x.kpi), skipped: kpis.length - ok.length };
  };

  if (!hasClaude()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      // Groq's built-in browser search (gpt-oss models), then the findings as a JSON block at the end of the reply
      const res = await fetchWithRetry(`${process.env.AI_BASE_URL!.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.AI_API_KEY}` },
        body: JSON.stringify({
          model: /gpt-oss/.test(process.env.AI_MODEL ?? "") ? process.env.AI_MODEL : "openai/gpt-oss-120b",
          tools: [{ type: "browser_search" }],
          messages: [{ role: "user", content: ask + 'Search the web first. End your reply with one ```json block: {"benchmarks":[{"kpi","p25","p50","p75","source","url","note"}]} with numbers as plain numbers and the real page URL you read.' }],
        }),
      }).catch(() => null);
      if (!res?.ok) {
        // the API's own words (e.g. "Request too large for the free tier's 8,000 tokens a minute") tell the owner what to change
        const why = res ? ((await res.json().catch(() => null))?.error?.message as string | undefined)?.slice(0, 220) : undefined;
        throw new Error(res?.status === 429 ? `The free AI tier is busy${why ? `: ${why}` : ". Try again in a minute."}` : `The research request failed (${res?.status ?? "no connection"})${why ? `: ${why}` : ". Try again."}`);
      }
      const content: string = (await res.json())?.choices?.[0]?.message?.content ?? "";
      const block = content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
      let found: (Benchmark & { kpi: string })[] = [];
      try { found = JSON.parse(block).benchmarks ?? []; } catch {
        console.error("research: no usable JSON in the model's reply:", content.slice(-600));
        if (attempt === 0) continue; // a reply without its JSON block happens now and then: ask once more
        throw new Error("The research didn't finish with usable figures. Try again.");
      }
      return save(Array.isArray(found) ? found.map((x) => ({ ...x, p25: Number(x.p25), p50: Number(x.p50), p75: Number(x.p75) })) : []);
    }
    throw new Error("The research didn't finish with usable figures. Try again.");
  }

  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: ask + "When done, call save_benchmarks once with everything you found." }];
  for (let turn = 0; turn < 8; turn++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 10 }, SAVE_BENCHMARKS],
      messages,
    });
    if (res.stop_reason === "refusal") throw new Error("The research request was declined. Try again later.");
    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason === "pause_turn") continue; // long web search: the server resumes where it stopped
    const call = res.content.find((c): c is Anthropic.Beta.BetaToolUseBlock => c.type === "tool_use" && c.name === "save_benchmarks");
    if (!call) {
      if (res.stop_reason === "end_turn") break;
      continue;
    }
    return save(((call.input as { benchmarks?: unknown[] })?.benchmarks ?? []) as (Benchmark & { kpi: string })[]);
  }
  throw new Error("The research didn't finish with usable figures. Try again.");
}
