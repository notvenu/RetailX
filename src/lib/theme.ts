import type { Theme } from "@/lib/model";

const DARK = `--color-paper:#0f131a;--color-panel:#161b24;--color-panel-deep:#1d2330;--color-surface:#131823;
--color-ink:#e6e9ef;--color-ink-soft:#b0b8c6;--color-ink-faint:#8791a2;--color-rule:#262d3a;--color-rule-strong:#364052;
--color-good:#4cc38a;--color-good-wash:#11271d;--color-warn:#f0a24a;--color-warn-wash:#2a1e0f;--color-bad:#f27a6f;--color-bad-wash:#2d1515;
--shadow-overlay:0 1px 2px rgba(0,0,0,.4),0 6px 18px rgba(0,0,0,.45);color-scheme:dark;`;

const RADIUS = { sharp: [0, 0, 2], soft: [3, 5, 8], round: [6, 10, 14] };
const BASE = { compact: 15, comfortable: 16, spacious: 17 };
const FONT = { "public-sans": "var(--font-public-sans)", plex: "var(--font-plex)", serif: "var(--font-serif)", system: "ui-sans-serif" };

/** CSS for a business theme. Injected as a <style> on :root, so the derived accent tokens recompute too. */
export function themeCss(t: Theme): string {
  const accent = /^#[0-9a-f]{6}$/i.test(t.accent) ? t.accent : "#3538cd";
  const [sm, md, lg] = RADIUS[t.radius] ?? RADIUS.soft;
  const base = `:root{--color-accent:${accent};--radius-sm:${sm}px;--radius-md:${md}px;--radius-lg:${lg}px;` +
    `--rx-base:${BASE[t.density] ?? 16}px;--font-sans:${FONT[t.font] ?? FONT["public-sans"]},ui-sans-serif,system-ui,sans-serif;}`;
  const darkRoot = `:root{${DARK}--color-accent:color-mix(in oklab,${accent} 78%,white);}`;
  if (t.mode === "dark") return base + darkRoot;
  if (t.mode === "system") return base + `@media (prefers-color-scheme: dark){${darkRoot}}`;
  return base;
}
