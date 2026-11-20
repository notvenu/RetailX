"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { blankModule } from "@/lib/catalog";
import { slug, type Field, type FieldType, type ModuleDef } from "@/lib/model";
import { Icon, ICON_NAMES } from "@/components/icon";
import { Toggle, btnGhost, btnQuiet, control } from "@/components/ui";

const TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" }, { value: "longtext", label: "Long text" }, { value: "number", label: "Number" },
  { value: "money", label: "Money" }, { value: "date", label: "Date" }, { value: "select", label: "Choice" },
  { value: "email", label: "Email" }, { value: "phone", label: "Phone" },
];

const move = <T,>(a: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= a.length) return a;
  const b = [...a];
  [b[i], b[j]] = [b[j], b[i]];
  return b;
};

/** Switch modules on/off, order them in the sidebar, rename them, and reshape their fields. */
export function ModulesEditor({ modules, onChange, recommended = [] }: { modules: ModuleDef[]; onChange: (m: ModuleDef[]) => void; recommended?: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const set = (i: number, patch: Partial<ModuleDef>) => onChange(modules.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <div>
      <ul className="divide-y divide-rule border-y border-rule">
        {modules.map((m, i) => (
          <li key={m.id} className={m.enabled ? "" : "opacity-70"}>
            <div className="flex items-center gap-3 py-2.5">
              <Toggle on={m.enabled} onChange={(v) => set(i, { enabled: v })} label={`Use ${m.name}`} />
              <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-panel text-ink-soft"><Icon name={m.icon} /></span>
              <button type="button" onClick={() => setOpen(open === m.id ? null : m.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-[0.88rem] font-medium text-ink">
                    {m.name}
                    {recommended.includes(m.id) ? <span className="rounded-full bg-accent-wash px-2 py-0.5 text-[0.65rem] font-semibold text-accent">Suggested</span> : null}
                    {m.custom ? <span className="rounded-full bg-panel px-2 py-0.5 text-[0.65rem] text-ink-soft">Custom</span> : null}
                  </span>
                  <span className="block truncate text-[0.76rem] text-ink-faint">{m.description || `${m.fields.length} fields`}</span>
                </span>
                {open === m.id ? <ChevronDown className="ml-auto size-4 shrink-0 text-ink-faint" /> : <ChevronRight className="ml-auto size-4 shrink-0 text-ink-faint" />}
              </button>
              <div className="flex shrink-0">
                <button type="button" className={btnQuiet} aria-label="Move up" onClick={() => onChange(move(modules, i, -1))}><ArrowUp className="size-3.5" /></button>
                <button type="button" className={btnQuiet} aria-label="Move down" onClick={() => onChange(move(modules, i, 1))}><ArrowDown className="size-3.5" /></button>
              </div>
            </div>
            {open === m.id ? (
              <ModuleDetail
                m={m}
                onChange={(patch) => set(i, patch)}
                onRemove={m.custom ? () => onChange(modules.filter((_, j) => j !== i)) : undefined}
              />
            ) : null}
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          const mod = blankModule(newName.trim());
          onChange([...modules, mod]);
          setOpen(mod.id);
          setNewName("");
        }}
      >
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Build your own module</span>
          <input className={control} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Equipment rentals, Warranty claims, Site visits" />
        </label>
        <button className={btnGhost}><Plus className="size-3.5" /> Create module</button>
      </form>
    </div>
  );
}

function ModuleDetail({ m, onChange, onRemove }: { m: ModuleDef; onChange: (p: Partial<ModuleDef>) => void; onRemove?: () => void }) {
  const setField = (i: number, patch: Partial<Field>) => onChange({ fields: m.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const dates = m.fields.filter((f) => f.type === "date");
  return (
    <div className="mb-4 ml-12 space-y-4 border-l-2 border-accent/30 pl-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="flex flex-col gap-1">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Name in your sidebar</span>
          <input className={control} value={m.name} onChange={(e) => onChange({ name: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Sidebar group</span>
          <input className={control} value={m.group} onChange={(e) => onChange({ group: e.target.value })} list="rx-groups" />
          <datalist id="rx-groups">{["Sales & customers", "Operations", "Finance", "People", "Custom"].map((g) => <option key={g} value={g} />)}</datalist>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Records dated by</span>
          <select className={control} value={m.dateField ?? ""} onChange={(e) => onChange({ dateField: e.target.value || undefined })}>
            <option value="">Not dated (a list, read as of now)</option>
            {dates.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>
      </div>
      <div>
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Icon</span>
        <div className="mt-1 flex flex-wrap gap-1">
          {ICON_NAMES.map((n) => (
            <button key={n} type="button" aria-label={n} aria-pressed={m.icon === n} onClick={() => onChange({ icon: n })}
              className={`grid size-7 place-items-center rounded-sm border ${m.icon === n ? "border-accent bg-accent-wash text-accent" : "border-transparent text-ink-soft hover:bg-panel"}`}>
              <Icon name={n} className="size-3.5" />
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Fields</p>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full min-w-[620px] text-[0.8rem]">
            <thead>
              <tr className="text-left text-[0.64rem] uppercase tracking-[0.08em] text-ink-faint">
                <th className="py-1 pr-2 font-semibold">Label</th><th className="pr-2 font-semibold">Type</th>
                <th className="pr-2 font-semibold">Choices (comma separated)</th><th className="pr-2 font-semibold">Default</th>
                <th className="pr-2 font-semibold">Required</th><th />
              </tr>
            </thead>
            <tbody>
              {m.fields.map((f, i) => (
                <tr key={f.key} className="align-top">
                  <td className="py-1 pr-2"><input aria-label="Field label" className={control} value={f.label} onChange={(e) => setField(i, { label: e.target.value })} /></td>
                  <td className="py-1 pr-2">
                    <select aria-label="Field type" className={control} value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldType, options: e.target.value === "select" ? f.options ?? ["Option A", "Option B"] : undefined })}>
                      {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    {f.type === "select" ? (
                      <input aria-label="Choices" className={control} defaultValue={f.options?.join(", ")}
                        onBlur={(e) => setField(i, { options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
                    ) : <span className="text-ink-faint">—</span>}
                  </td>
                  <td className="py-1 pr-2"><input aria-label="Default" className={control} value={f.default ?? ""} onChange={(e) => setField(i, { default: e.target.value || undefined })} /></td>
                  <td className="py-1 pr-2 pt-2.5"><Toggle on={!!f.required} onChange={(v) => setField(i, { required: v })} label="Required" /></td>
                  <td className="py-1">
                    <button type="button" className={btnQuiet} aria-label={`Remove ${f.label}`}
                      onClick={() => onChange({ fields: m.fields.filter((_, j) => j !== i), dateField: m.dateField === f.key ? undefined : m.dateField })}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={btnGhost}
            onClick={() => {
              const label = `New field ${m.fields.length + 1}`;
              let key = slug(label);
              while (m.fields.some((f) => f.key === key)) key += "_";
              onChange({ fields: [...m.fields, { key, label, type: "text" }] });
            }}>
            <Plus className="size-3.5" /> Add field
          </button>
          {onRemove ? <button type="button" className={`${btnQuiet} text-bad`} onClick={onRemove}><Trash2 className="size-3.5" /> Delete module</button> : null}
        </div>
        <p className="mt-2 text-[0.72rem] text-ink-faint">Renaming a field keeps its data. Removing one hides it; existing records keep their values.</p>
      </div>
    </div>
  );
}
