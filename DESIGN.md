# Design system — RetailX

<!-- Recorded from the shipped build. Operate mode. Direction: "management ledger". -->

## Principle

Every screen reads like a page from a well-kept book of accounts. Figures first, charts
support. Sections are divided by hairline rules and spacing, never card boxes or drop
shadows. One accent ink; semantic colour only for variance.

## Tokens (`src/app/globals.css`, Tailwind v4 `@theme`)

| Role | Token | Value |
|---|---|---|
| Content surface | `--color-paper` | `#fcfcfb` |
| Panel (sidebar, toolbars, callouts) | `--color-panel` / `--color-panel-deep` | `#f3f4f6` / `#eceef1` |
| Text | `--color-ink` / `--color-ink-soft` / `--color-ink-faint` | `#1d2433` / `#4b5565` / `#8a94a6` |
| Rules | `--color-rule` / `--color-rule-strong` | `#e5e7eb` / `#d3d7de` |
| Accent (primary action, current selection, focus) | `--color-accent` / `-hover` / `-wash` | `#3538cd` / `#2c2fb3` / `#eef0fc` |
| Positive variance | `--color-good` (+`-wash`) | `#067647` |
| Watch | `--color-warn` (+`-wash`) | `#b54708` |
| Adverse | `--color-bad` (+`-wash`) | `#b42318` |
| Overlay shadow (dropdowns, mobile drawer only) | `--shadow-overlay` | `0 1px 2px …/06, 0 4px 12px …/10` |

Light only (`color-scheme: light`) — back-office daytime use. No dark theme.

## Type

- One family: **Public Sans** (`next/font`, `--font-public-sans`), tabular figures on globally
  (`font-feature-settings: "tnum" 1`). No display face, no mono except literal credential/code values.
- Page title `1.35rem`/600/`-0.02em`. Section heading `0.7rem`/600/uppercase/`0.14em` tracking.
  Figure value `1.55rem`/600 tabular. Table body `0.82rem`. Column heads `0.66rem`/uppercase/`0.1em`.
- Numeric cells: `.num` utility → `tabular-nums`, right-aligned, `nowrap`.

## Components (`src/components/`)

- **`ui.tsx`** — `PageHeader` (title + meta + actions, bottom hairline), `Section` (uppercase heading
  with hairline + optional meta/actions), `Figure` + `FigureRow` (KPI register: label, big tabular
  value, `Delta` rows, sparkline; hairline-divided grid, no boxes), `Delta` (arrow + magnitude in
  semantic colour, `%` or `pts`/`d` suffix), `StatusPill` (tinted text on wash, 1px hued border;
  status→tone map), `DataTable` (full-width, `min-w-[640px]` scrolls on mobile, hairline row
  separators, `align:"right"` → `.num`, empty state), `KeyValue`, `Note`.
- **`charts.tsx`** — hand-rolled SVG, no library. `Sparkline`, `LineChart` (accent actual line,
  dashed prediction, `accent/8%` confidence band, hairline gridlines, forecast boundary marker),
  `BarComposition` (label · track · value rows).
- **`CollectionPanel.tsx`** — client. Generic `CollectionPanel<T>` = section heading + inline
  add-record form (field grid, required validation, grouped money inputs) + `DataTable`, backed by
  `useCollection` (`localStorage` key `retailx:v1:<name>`, seed fallback, `Reset`). Per-module
  presets (`SalesInvoices`, `InventoryProducts`, `PurchaseOrdersPanel`, `ExpensesPanel`,
  `EmployeesPanel`) keep all `render`/`build` functions client-side; server pages pass only `role`.
- **`shell/AppShell.tsx`** — 240px slate sidebar (wordmark, org, role, nav grouped
  Overview/Operations/Intelligence, active item = white bg + 2px accent marker), 56px topbar
  ("as of" context + user menu with sign-out), mobile drawer. `rx-rise` entrance on `<main>`.

## Motion

`rx-rise` (4px + fade, ~1 moment) on route content. Hover transitions 150 ms. No page-load
choreography, no decorative motion.

## Data & access

- Sample data only: `src/lib/mock.ts`. Formatters `src/lib/format.ts` (INR, `en-IN` grouping,
  `₹x.xx L`/`Cr` compact). KPI helpers `src/lib/kpi.ts`.
- Branch-evaluation engine `src/lib/branch.ts` — pure functions, three scenarios + recommendation +
  sensitivity, self-check under `node src/lib/branch.ts`.
- Roles Owner / Manager / Accountant / Employee. Route access map `src/lib/access.ts` drives both
  `src/proxy.ts` (redirect) and the sidebar (`src/lib/nav.ts`). Auth: Auth.js v5 credentials,
  `src/auth.ts`.

## Direction contract

See `.impeccable/surfaces/app.md`. The concept-seed direction tournament was skipped deliberately
for this scoped internal Operate build; the world was committed inline.
