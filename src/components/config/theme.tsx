"use client";

import { ACCENTS } from "@/lib/catalog";
import { themeCss } from "@/lib/theme";
import type { Theme } from "@/lib/model";
import { Label, Segmented } from "@/components/ui";

/** Accent, light/dark, density, type, corners and sidebar side. Previews live on the page. */
export function ThemeEditor({ theme, onChange, preview = true }: { theme: Theme; onChange: (t: Theme) => void; preview?: boolean }) {
  const set = (p: Partial<Theme>) => onChange({ ...theme, ...p });
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      {preview ? <style>{themeCss(theme)}</style> : null}
      <div className="space-y-5">
        <div>
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">Accent colour</span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {ACCENTS.map((a) => (
              <button key={a.value} type="button" aria-label={a.name} aria-pressed={theme.accent === a.value} onClick={() => set({ accent: a.value })}
                className={`size-8 rounded-full ring-offset-2 ring-offset-paper transition ${theme.accent === a.value ? "ring-2 ring-ink" : "hover:scale-110"}`}
                style={{ background: a.value }} />
            ))}
            <label className="ml-2 flex items-center gap-2 text-[0.78rem] text-ink-soft">
              Custom <input type="color" value={theme.accent} onChange={(e) => set({ accent: e.target.value })} className="h-8 w-10 cursor-pointer rounded-sm border border-rule-strong bg-surface" />
            </label>
          </div>
        </div>
        <Label text="Appearance">
          <Segmented label="Appearance" value={theme.mode} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "Match device" }]} onChange={(v) => set({ mode: v })} />
        </Label>
        <Label text="Density">
          <Segmented label="Density" value={theme.density} options={[{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }, { value: "spacious", label: "Spacious" }]} onChange={(v) => set({ density: v })} />
        </Label>
        <Label text="Typeface">
          <Segmented label="Typeface" value={theme.font} options={[{ value: "public-sans", label: "Public Sans" }, { value: "plex", label: "IBM Plex" }, { value: "serif", label: "Serif" }, { value: "system", label: "System" }]} onChange={(v) => set({ font: v })} />
        </Label>
        <Label text="Corners">
          <Segmented label="Corners" value={theme.radius} options={[{ value: "sharp", label: "Sharp" }, { value: "soft", label: "Soft" }, { value: "round", label: "Round" }]} onChange={(v) => set({ radius: v })} />
        </Label>
        <Label text="Sidebar">
          <Segmented label="Sidebar" value={theme.sidebar} options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} onChange={(v) => set({ sidebar: v })} />
        </Label>
      </div>

      <div aria-hidden className={`flex h-56 overflow-hidden rounded-md border border-rule bg-paper ${theme.sidebar === "right" ? "flex-row-reverse" : ""}`}>
        <div className="w-20 space-y-1.5 border-rule bg-panel p-2">
          <div className="text-[0.7rem] font-bold text-ink">R<span className="text-accent">X</span></div>
          {[1, 0, 0, 0].map((a, i) => <div key={i} className={`h-3 rounded-sm ${a ? "bg-surface" : "bg-panel-deep"}`} />)}
        </div>
        <div className="flex-1 space-y-2 p-3">
          <div className="text-[0.8rem] font-semibold text-ink">Dashboard</div>
          <div className="grid grid-cols-2 gap-1.5">
            {["Revenue", "Margin"].map((x) => (
              <div key={x} className="rounded-sm border border-rule bg-surface p-1.5">
                <div className="text-[0.55rem] uppercase text-ink-faint">{x}</div>
                <div className="text-[0.85rem] font-semibold text-ink">{x === "Revenue" ? "4.2 L" : "23.4%"}</div>
                <div className="text-[0.55rem] text-good">▲ 6.1%</div>
              </div>
            ))}
          </div>
          <div className="rounded-sm border border-rule bg-surface p-1.5">
            <svg viewBox="0 0 100 24" className="h-8 w-full"><path d="M0,20 L15,16 L30,18 L45,10 L60,12 L75,6 L100,4" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" /></svg>
          </div>
          <span className="inline-block rounded-sm bg-accent px-2 py-1 text-[0.65rem] font-medium text-white">Primary action</span>
        </div>
      </div>
    </div>
  );
}
