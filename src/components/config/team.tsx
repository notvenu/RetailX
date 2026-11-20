"use client";

import { Plus, Trash2 } from "lucide-react";
import { AREAS_ALL, slug, type ModuleDef, type TeamRole } from "@/lib/model";
import { btnGhost, btnQuiet, control } from "@/components/ui";

const AREA_NAMES: Record<string, string> = {
  dashboard: "Dashboard", analytics: "Analytics", forecasting: "Forecasting", ai: "AI team", automations: "Automations", tasks: "Tasks", settings: "Settings",
};

/** Roles × areas: what each team role can open. The owner always has everything. */
export function RolesMatrix({ roles, modules, onChange }: { roles: TeamRole[]; modules: ModuleDef[]; onChange: (r: TeamRole[]) => void }) {
  const cols = [...modules.filter((m) => m.enabled).map((m) => ({ key: m.id, name: m.name })), ...AREAS_ALL.map((a) => ({ key: a, name: AREA_NAMES[a] }))];
  const toggle = (i: number, key: string) =>
    onChange(roles.map((r, j) => (j !== i ? r : { ...r, access: r.access.includes(key) ? r.access.filter((x) => x !== key) : [...r.access, key] })));
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="text-[0.78rem]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-paper pb-2 pr-4 text-left text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">Role</th>
              {cols.map((c) => (
                <th key={c.key} className="h-28 min-w-9 px-1 pb-2 align-bottom font-normal text-ink-soft">
                  <span className="inline-block -rotate-60 origin-bottom-left translate-x-3 whitespace-nowrap text-[0.72rem]">{c.name}</span>
                </th>
              ))}
              <th className="pb-2 px-2 text-left text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">View only</th>
              <th className="pb-2 px-2 text-left text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-ink-faint" title="Most a cashier can take off a bill by hand. Offers and coupons don't count.">Max disc. %</th>
              <th className="pb-2 px-2 text-left text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-ink-faint" title="Can sell below the item's list price">Lower price</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {roles.map((r, i) => {
              const all = r.access.includes("*");
              return (
                <tr key={r.id}>
                  <td className="sticky left-0 bg-paper py-1.5 pr-4">
                    {r.id === "owner" ? <span className="font-medium text-ink">Owner</span> : (
                      <input aria-label="Role name" className={`${control} w-32`} value={r.name} onChange={(e) => onChange(roles.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    )}
                  </td>
                  {cols.map((c) => (
                    <td key={c.key} className="px-1 text-center">
                      <input type="checkbox" aria-label={`${r.name} can open ${c.name}`} className="size-4 accent-[var(--color-accent)]"
                        checked={all || r.access.includes(c.key)} disabled={all} onChange={() => toggle(i, c.key)} />
                    </td>
                  ))}
                  <td className="px-2 text-center">
                    {r.id !== "owner" ? <input type="checkbox" aria-label={`${r.name} is view only`} className="size-4 accent-[var(--color-accent)]" checked={!!r.readonly} onChange={() => onChange(roles.map((x, j) => (j === i ? { ...x, readonly: !x.readonly } : x)))} /> : null}
                  </td>
                  <td className="px-2">
                    {r.id !== "owner" ? <input inputMode="decimal" aria-label={`${r.name} maximum discount percent`} placeholder="Any" className={`${control} w-16 text-right`}
                      value={r.maxDiscount ?? ""} onChange={(e) => { const v = e.target.value.trim(); onChange(roles.map((x, j) => (j === i ? { ...x, maxDiscount: v === "" ? undefined : Math.min(100, Math.max(0, parseFloat(v) || 0)) } : x))); }} /> : null}
                  </td>
                  <td className="px-2 text-center">
                    {r.id !== "owner" ? <input type="checkbox" aria-label={`${r.name} can lower prices`} className="size-4 accent-[var(--color-accent)]" checked={r.priceEdit !== false} onChange={() => onChange(roles.map((x, j) => (j === i ? { ...x, priceEdit: x.priceEdit === false } : x)))} /> : null}
                  </td>
                  <td className="pl-2">
                    {r.id !== "owner" ? <button type="button" className={btnQuiet} aria-label={`Delete ${r.name}`} onClick={() => onChange(roles.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className={`${btnGhost} mt-3`}
        onClick={() => { const name = `Role ${roles.length}`; onChange([...roles, { id: slug(name) + "_" + Date.now().toString(36), name, access: ["dashboard", "tasks"] }]); }}>
        <Plus className="size-3.5" /> Add a role
      </button>
    </div>
  );
}
