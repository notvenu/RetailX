"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { uid, type AiRole, type Area, type Autonomy, type KpiDef } from "@/lib/model";
import { AREA_LABEL, AUTONOMY } from "@/lib/catalog";
import { Icon } from "@/components/icon";
import { Chip, Label, Segmented, Toggle, btnGhost, btnQuiet, control } from "@/components/ui";


const ROLE_ICONS = ["compass", "landmark", "settings", "cpu", "users", "megaphone", "sparkles", "briefcase", "target", "heart", "truck", "boxes"];

const TEMPLATES: Omit<AiRole, "id" | "enabled">[] = [
  { name: "Sam", title: "Head of Sales", icon: "target", mandate: "Hits the sales target: pipeline, conversion, pricing and the follow-ups that close deals.", responsibilities: ["Daily pipeline review", "Follow-up reminders", "Discount discipline"], areas: ["sales", "customers"], kpis: [], autonomy: "draft", tone: "Upbeat and direct", custom: true },
  { name: "Ira", title: "Procurement Manager", icon: "truck", mandate: "Buys right: supplier prices, lead times and order quantities that keep stock lean.", responsibilities: ["Supplier price checks", "Order quantity advice", "Late delivery follow-ups"], areas: ["operations", "finance"], kpis: [], autonomy: "draft", tone: "Careful and thrifty", custom: true },
  { name: "Leo", title: "Customer Success", icon: "heart", mandate: "Keeps customers coming back: complaints, reviews, loyalty and win-backs.", responsibilities: ["Win-back lists", "Review requests", "Complaint follow-ups"], areas: ["customers"], kpis: [], autonomy: "advise", tone: "Warm", custom: true },
  { name: "Tara", title: "Compliance Officer", icon: "landmark", mandate: "Keeps you on the right side of tax and labour rules with reminders and checklists.", responsibilities: ["GST filing reminders", "PF/ESI/PT dates", "Licence renewals"], areas: ["finance", "people"], kpis: [], autonomy: "draft", tone: "Precise", custom: true },
];

/** Switch AI roles on, shape their mandate and autonomy, or hire your own. */
export function AiRolesEditor({ roles, kpis, onChange }: { roles: AiRole[]; kpis: KpiDef[]; onChange: (r: AiRole[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const set = (i: number, patch: Partial<AiRole>) => onChange(roles.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const hire = (t: Omit<AiRole, "id" | "enabled">) => {
    const r: AiRole = { ...structuredClone(t), id: uid("ai_"), enabled: true, custom: true };
    onChange([...roles, r]);
    setOpen(r.id);
  };

  return (
    <div className="space-y-6">
      <ul className="grid gap-3 md:grid-cols-2">
        {roles.map((r, i) => (
          <li key={r.id} className={`rounded-sm border p-4 transition-colors ${r.enabled ? "border-accent/40 bg-surface" : "border-rule bg-panel/40"}`}>
            <div className="flex items-start gap-3">
              <span className={`grid size-9 shrink-0 place-items-center rounded-full ${r.enabled ? "bg-accent-wash text-accent" : "bg-panel text-ink-faint"}`}><Icon name={r.icon} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.9rem] font-semibold text-ink">{r.title}</p>
                <p className="text-[0.74rem] text-ink-faint">{r.name} · {AUTONOMY.find((a) => a.value === r.autonomy)?.label}</p>
              </div>
              <Toggle on={r.enabled} onChange={(v) => set(i, { enabled: v })} label={`Use ${r.title}`} />
            </div>
            <p className="mt-2 text-[0.8rem] leading-relaxed text-ink-soft">{r.mandate}</p>
            <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="mt-2 inline-flex items-center gap-1 text-[0.76rem] font-medium text-accent">
              {open === r.id ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} Shape this role
            </button>
            {open === r.id ? <RoleDetail r={r} kpis={kpis} onChange={(p) => set(i, p)} onRemove={r.custom ? () => onChange(roles.filter((_, j) => j !== i)) : undefined} /> : null}
          </li>
        ))}
      </ul>

      <div>
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">Hire another AI role</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {TEMPLATES.filter((t) => !roles.some((r) => r.title === t.title)).map((t) => (
            <button key={t.title} type="button" className={btnGhost} onClick={() => hire(t)}><Icon name={t.icon} className="size-3.5" /> {t.title}</button>
          ))}
          <button type="button" className={btnGhost}
            onClick={() => hire({ name: "Alex", title: "New role", icon: "sparkles", mandate: "Describe what this role is responsible for.", responsibilities: [], areas: ["operations"], kpis: [], autonomy: "advise", tone: "Clear and friendly", custom: true })}>
            <Plus className="size-3.5" /> Start from scratch
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleDetail({ r, kpis, onChange, onRemove }: { r: AiRole; kpis: KpiDef[]; onChange: (p: Partial<AiRole>) => void; onRemove?: () => void }) {
  const toggleArea = (a: Area) => onChange({ areas: r.areas.includes(a) ? r.areas.filter((x) => x !== a) : [...r.areas, a] });
  const own = r.kpis.length ? r.kpis : kpis.filter((k) => r.areas.includes(k.area)).map((k) => k.id);
  return (
    <div className="mt-3 space-y-3 border-t border-rule pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Label text="Title"><input className={control} value={r.title} onChange={(e) => onChange({ title: e.target.value })} /></Label>
        <Label text="Name"><input className={control} value={r.name} onChange={(e) => onChange({ name: e.target.value })} /></Label>
      </div>
      <Label text="Mandate"><textarea rows={3} className={control} value={r.mandate} onChange={(e) => onChange({ mandate: e.target.value })} /></Label>
      <Label text="Responsibilities" hint="One per line. These shape what it checks and the tasks it takes on.">
        <textarea rows={4} className={control} defaultValue={r.responsibilities.join("\n")} onBlur={(e) => onChange({ responsibilities: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
      </Label>
      <Label text="Tone"><input className={control} value={r.tone} onChange={(e) => onChange({ tone: e.target.value })} /></Label>
      <div>
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Watches</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(Object.keys(AREA_LABEL) as Area[]).map((a) => <Chip key={a} on={r.areas.includes(a)} onClick={() => toggleArea(a)}>{AREA_LABEL[a]}</Chip>)}
        </div>
      </div>
      <div>
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">KPIs it owns</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {kpis.map((k) => (
            <Chip key={k.id} on={own.includes(k.id)} onClick={() => onChange({ kpis: own.includes(k.id) ? own.filter((x) => x !== k.id) : [...own, k.id] })}>{k.name}</Chip>
          ))}
        </div>
      </div>
      <div>
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Autonomy</span>
        <div className="mt-1"><Segmented label="Autonomy" value={r.autonomy} options={AUTONOMY} onChange={(v) => onChange({ autonomy: v })} /></div>
        <p className="mt-1 text-[0.74rem] text-ink-faint">{AUTONOMY.find((a) => a.value === r.autonomy)?.about}</p>
      </div>
      <div>
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Icon</span>
        <div className="mt-1 flex flex-wrap gap-1">
          {ROLE_ICONS.map((n) => (
            <button key={n} type="button" aria-label={n} aria-pressed={r.icon === n} onClick={() => onChange({ icon: n })}
              className={`grid size-7 place-items-center rounded-sm border ${r.icon === n ? "border-accent bg-accent-wash text-accent" : "border-transparent text-ink-soft hover:bg-panel"}`}>
              <Icon name={n} className="size-3.5" />
            </button>
          ))}
        </div>
      </div>
      {onRemove ? <button type="button" className={`${btnQuiet} text-bad`} onClick={onRemove}><Trash2 className="size-3.5" /> Remove role</button> : null}
    </div>
  );
}
