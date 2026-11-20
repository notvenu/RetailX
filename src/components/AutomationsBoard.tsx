"use client";

import { useState, useTransition } from "react";
import { Pencil, Play, Plus, Trash2 } from "lucide-react";
import { deleteAutomation, runAutomation, saveAutomation } from "@/app/actions";
import { ago } from "@/lib/format";
import type { Activity, AiRole, Automation, KpiDef, ModuleDef, PublicUser } from "@/lib/model";
import { AutomationForm, describeAction, describeTrigger } from "@/components/config/automations";
import { Empty, Section, StatusPill, Toggle, btnPrimary, btnQuiet } from "@/components/ui";
import { orAlert } from "@/lib/result";

export function AutomationsBoard({ automations, activity, modules, kpis, roles, members }: {
  automations: Automation[]; activity: Activity[]; modules: ModuleDef[]; kpis: KpiDef[]; roles: AiRole[]; members: PublicUser[];
}) {
  const [editing, setEditing] = useState<Automation | null>(null);
  const [pending, start] = useTransition();
  const blank = (): Automation => ({
    id: "", name: "", enabled: true, trigger: { type: "record", module: modules.find((m) => m.enabled)?.id ?? "" }, conditions: [],
    actions: [{ type: "task", title: "" }], createdBy: "", runs: 0,
  });
  const drafts = automations.filter((a) => !a.enabled && a.createdBy.startsWith("ai:"));

  return (
    <>
      <div className="mt-6 flex justify-end">
        {!editing ? <button className={btnPrimary} onClick={() => setEditing(blank())}><Plus className="size-3.5" /> New automation</button> : null}
      </div>
      {editing ? (
        <div className="mt-4">
          <AutomationForm value={editing} modules={modules} kpis={kpis} roles={roles} members={members}
            onCancel={() => setEditing(null)}
            onSave={(a) => start(async () => { await orAlert(saveAutomation(a)); setEditing(null); })} />
        </div>
      ) : null}

      {drafts.length ? (
        <p className="mt-5 rounded-sm border border-accent/30 bg-accent-wash px-3 py-2 text-[0.8rem] text-accent">
          {drafts.length} automation{drafts.length > 1 ? "s" : ""} drafted by your AI team {drafts.length > 1 ? "are" : "is"} waiting for you to switch on.
        </p>
      ) : null}

      <Section title="Your automations" meta={`${automations.filter((a) => a.enabled).length} on`}>
        {automations.length ? (
          <ul className="divide-y divide-rule border-b border-rule">
            {automations.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                <Toggle on={a.enabled} label={`Switch ${a.name}`} onChange={(v) => start(async () => { await orAlert(saveAutomation({ ...a, enabled: v })); })} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[0.88rem] font-medium text-ink">
                    {a.name}
                    {a.createdBy.startsWith("ai:") ? <StatusPill>{`by ${roles.find((r) => `ai:${r.id}` === a.createdBy)?.title ?? "AI"}`}</StatusPill> : null}
                  </p>
                  <p className="text-[0.76rem] text-ink-soft">
                    {describeTrigger(a.trigger, modules, kpis)}
                    {a.conditions.length ? ` where ${a.conditions.map((c) => `${c.field} ${c.op} ${c.value ?? ""}`).join(" and ")}` : ""}
                    {" → "}
                    {a.actions.map((x) => describeAction(x, roles, members)).join("; ")}
                  </p>
                  <p suppressHydrationWarning className="text-[0.7rem] text-ink-faint">{a.runs} runs{a.lastRun ? ` · last ${ago(a.lastRun)}` : ""}</p>
                </div>
                <div className="flex">
                  <button className={btnQuiet} disabled={pending} onClick={() => start(async () => { await orAlert(runAutomation(a.id)); })}><Play className="size-3.5" /> Run now</button>
                  <button className={btnQuiet} aria-label="Edit" onClick={() => setEditing(a)}><Pencil className="size-3.5" /></button>
                  <button className={btnQuiet} aria-label="Delete" disabled={pending} onClick={() => confirm(`Delete “${a.name}”?`) && start(async () => { await orAlert(deleteAutomation(a.id)); })}><Trash2 className="size-3.5" /></button>
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty title="No automations yet">Create one: e.g. when a sale is saved unpaid, give your CFO a task to collect it.</Empty>}
      </Section>

      <Section title="Recent runs and AI actions">
        {activity.length ? (
          <ul className="space-y-1.5 text-[0.8rem]">
            {activity.map((x) => (
              <li key={x.id} className="flex justify-between gap-4">
                <span className="text-ink-soft">{x.text}</span>
                <span suppressHydrationWarning className="shrink-0 text-ink-faint">{ago(x.at)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-[0.8rem] text-ink-faint">Nothing has run yet.</p>}
      </Section>
    </>
  );
}
