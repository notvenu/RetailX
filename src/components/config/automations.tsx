"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { Action, AiRole, Automation, KpiDef, ModuleDef, PublicUser, Trigger } from "@/lib/model";
import { Conditions } from "@/components/config/kpis";
import { Label, Segmented, Toggle, btnPrimary, btnQuiet, control } from "@/components/ui";

function blankAction(kind: string, mod?: ModuleDef): Action {
  if (kind === "task") return { type: "task", title: "" };
  if (kind === "notify") return { type: "notify", message: "" };
  if (kind === "whatsapp" || kind === "email") {
    const field = mod?.fields.find((f) => f.type === (kind === "email" ? "email" : "phone"))?.key;
    return { type: "message", channel: kind, to: field ? `{{${field}}}` : "", text: "" };
  }
  return { type: "set_field", field: mod?.fields[0]?.key ?? "", value: "" };
}

/** One line per action, for lists. */
export function describeAction(x: Action, roles: AiRole[], members: PublicUser[] = []) {
  if (x.type === "task") return `task “${x.title}” for ${assigneeLabel(x.assignee, roles, members)}`;
  if (x.type === "notify") return `notify “${x.message}”`;
  if (x.type === "message") return `${x.channel === "email" ? "email" : "WhatsApp"} ${x.to}: “${x.text}”`;
  return `set ${x.field} = ${x.value}`;
}

export function describeTrigger(t: Trigger, modules: ModuleDef[], kpis: KpiDef[]) {
  if (t.type === "record") return `When a ${modules.find((m) => m.id === t.module)?.name ?? t.module} record is saved`;
  if (t.type === "schedule") return `Every ${t.every}`;
  return `When ${kpis.find((k) => k.id === t.kpi)?.name ?? t.kpi} is ${t.op === "lt" ? "below" : "above"} ${t.value}`;
}

export function assigneeLabel(a: string | undefined, roles: AiRole[], members: PublicUser[] = []) {
  if (!a) return "Unassigned";
  if (a.startsWith("ai:")) { const r = roles.find((x) => x.id === a.slice(3)); return r ? `${r.title} (AI)` : "AI role"; }
  return members.find((m) => `user:${m.id}` === a)?.name ?? "Team member";
}

export function AssigneeSelect({ value, roles, members = [], onChange }: { value?: string; roles: AiRole[]; members?: PublicUser[]; onChange: (v: string | undefined) => void }) {
  return (
    <select aria-label="Assign to" className={`${control} w-auto`} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">Unassigned</option>
      {roles.filter((r) => r.enabled).length ? (
        <optgroup label="AI roles">
          {roles.filter((r) => r.enabled).map((r) => <option key={r.id} value={`ai:${r.id}`}>{r.title} ({r.name})</option>)}
        </optgroup>
      ) : null}
      {members.length ? (
        <optgroup label="People">
          {members.map((m) => <option key={m.id} value={`user:${m.id}`}>{m.name}</option>)}
        </optgroup>
      ) : null}
    </select>
  );
}

export function AutomationForm({ value, modules, kpis, roles, members, onSave, onCancel }: {
  value: Automation; modules: ModuleDef[]; kpis: KpiDef[]; roles: AiRole[]; members?: PublicUser[];
  onSave: (a: Automation) => void; onCancel: () => void;
}) {
  const [a, setA] = useState<Automation>(value);
  const on = modules.filter((m) => m.enabled);
  const t = a.trigger;
  const mod = t.type === "record" ? on.find((m) => m.id === t.module) : undefined;
  const setAct = (i: number, p: Partial<Action>) => setA({ ...a, actions: a.actions.map((x, j) => (j === i ? ({ ...x, ...p } as Action) : x)) });

  return (
    <div className="space-y-5 border border-rule bg-panel/40 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1"><Label text="Name"><input className={control} value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder="e.g. Chase unpaid bills" /></Label></div>
        <span className="flex items-center gap-2 pb-1.5 text-[0.8rem] text-ink-soft"><Toggle on={a.enabled} onChange={(v) => setA({ ...a, enabled: v })} label="Enabled" /> {a.enabled ? "On" : "Off"}</span>
      </div>

      <div>
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">When</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.82rem]">
          <Segmented label="Trigger" value={t.type} options={[{ value: "record", label: "A record is saved" }, { value: "schedule", label: "On a schedule" }, { value: "kpi", label: "A KPI crosses a line" }]}
            onChange={(v) => setA({
              ...a, conditions: [],
              trigger: v === "record" ? { type: "record", module: on[0]?.id ?? "" } : v === "schedule" ? { type: "schedule", every: "week" } : { type: "kpi", kpi: kpis[0]?.id ?? "", op: "lt", value: 0 },
            })} />
          {t.type === "record" ? (
            <select aria-label="Module" className={`${control} w-auto`} value={t.module} onChange={(e) => setA({ ...a, trigger: { type: "record", module: e.target.value }, conditions: [] })}>
              {on.map((m) => <option key={m.id} value={m.id}>in {m.name}</option>)}
            </select>
          ) : t.type === "schedule" ? (
            <select aria-label="Every" className={`${control} w-auto`} value={t.every} onChange={(e) => setA({ ...a, trigger: { type: "schedule", every: e.target.value as "day" } })}>
              <option value="day">every day</option><option value="week">every week</option><option value="month">every month</option>
            </select>
          ) : (
            <>
              <select aria-label="KPI" className={`${control} w-auto`} value={t.kpi} onChange={(e) => setA({ ...a, trigger: { ...t, kpi: e.target.value } })}>
                {kpis.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
              <select aria-label="Direction" className={`${control} w-auto`} value={t.op} onChange={(e) => setA({ ...a, trigger: { ...t, op: e.target.value as "lt" } })}>
                <option value="lt">falls below</option><option value="gt">rises above</option>
              </select>
              <input aria-label="Threshold" inputMode="decimal" className={`${control} w-28`} value={t.value} onChange={(e) => setA({ ...a, trigger: { ...t, value: Number(e.target.value) || 0 } })} />
            </>
          )}
        </div>
        {t.type === "record" ? <div className="mt-2"><Conditions module={mod} conditions={a.conditions} onChange={(c) => setA({ ...a, conditions: c })} /></div> : null}
      </div>

      <div>
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Then</p>
        <div className="mt-1.5 space-y-2">
          {a.actions.map((act, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-[0.82rem]">
              <select aria-label="Action" className={`${control} w-auto`} value={act.type === "message" ? act.channel : act.type}
                onChange={(e) => setA({ ...a, actions: a.actions.map((x, j) => (j === i ? blankAction(e.target.value, mod) : x)) })}>
                <option value="task">Create a task</option>
                <option value="notify">Post to the activity feed</option>
                <option value="whatsapp">Send a WhatsApp message</option>
                <option value="email">Send an email</option>
                {t.type === "record" ? <option value="set_field">Set a field on the record</option> : null}
              </select>
              {act.type === "task" ? (
                <>
                  <input aria-label="Task title" className={`${control} min-w-[16rem] flex-1`} value={act.title} onChange={(e) => setAct(i, { title: e.target.value })} placeholder="Call {{customer}} about {{amount}}" />
                  <AssigneeSelect value={act.assignee} roles={roles} members={members} onChange={(v) => setAct(i, { assignee: v })} />
                </>
              ) : act.type === "notify" ? (
                <input aria-label="Message" className={`${control} min-w-[16rem] flex-1`} value={act.message} onChange={(e) => setAct(i, { message: e.target.value })} placeholder="Big order from {{customer}}" />
              ) : act.type === "message" ? (
                <>
                  <input aria-label="To" className={`${control} w-44`} value={act.to} onChange={(e) => setAct(i, { to: e.target.value })}
                    placeholder={act.channel === "email" ? "{{email}} or address" : "{{phone}} or number"} />
                  <input aria-label="Message text" className={`${control} min-w-[16rem] flex-1`} value={act.text} onChange={(e) => setAct(i, { text: e.target.value })}
                    placeholder="Hi {{customer}}, your bill of {{amount}} is due." />
                </>
              ) : (
                <>
                  <select aria-label="Field" className={`${control} w-auto`} value={act.field} onChange={(e) => setAct(i, { field: e.target.value })}>
                    {mod?.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  <span className="text-ink-faint">to</span>
                  <input aria-label="Value" className={`${control} w-36`} value={act.value} onChange={(e) => setAct(i, { value: e.target.value })} />
                </>
              )}
              <button type="button" className={btnQuiet} aria-label="Remove action" onClick={() => setA({ ...a, actions: a.actions.filter((_, j) => j !== i) })}><X className="size-3.5" /></button>
            </div>
          ))}
          <button type="button" className={btnQuiet} onClick={() => setA({ ...a, actions: [...a.actions, { type: "task", title: "" }] })}><Plus className="size-3.5" /> Add action</button>
          {mod ? <p className="text-[0.72rem] text-ink-faint">Use {"{{field}}"} to insert the record&apos;s values: {mod.fields.map((f) => `{{${f.key}}}`).join(" ")}</p> : null}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className={btnQuiet} onClick={onCancel}>Cancel</button>
        <button type="button" className={btnPrimary} disabled={!a.name.trim() || !a.actions.length} onClick={() => onSave(a)}>Save automation</button>
      </div>
    </div>
  );
}
