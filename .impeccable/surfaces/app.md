# Surface: RetailX application (all authenticated modules + login)

Scope: the whole authenticated app shell and every module screen, plus the login screen. Visitor mode: **Operate**.

Audience: SME owner/manager, accountant, employee (role-gated). Job: check position and operational health, work the module books, and get a scenario-tested branch-opening recommendation. Constraints: desktop-first back-office use, daytime light, synthetic data only, no real backend.

## Direction contract

THESIS: RetailX is a management ledger that thinks — every screen reads like a page from a well-kept book of accounts, and analytics/forecasting/decision support are marginalia in that same book. It refuses the SaaS-dashboard arrangement: floating rounded cards on a gray field, a colourful chart as the hero, pill-shaped sidebar nav.

OWN-WORLD: Paper-white content surface (#FCFCFB); cool slate panel (#F3F4F6, ink #1D2433) for sidebar and toolbars. Hairline rules (#E5E7EB) do all the dividing — no card boxes, no drop shadows except on overlays (one shadow token). One accent ink, deep indigo #3538CD, for primary action, current nav/row selection and focus ring; nothing else is blue. Variance colours emerald #067647 / amber #B54708 / rose #B42318 as text and chart ticks only, never fills. Public Sans across the entire UI with tabular figures on; no second family, no mono. Tables are the primary component: full-width, hairline row separators, 11px uppercase tracked column heads, money columns right-aligned to a fixed decimal. Charts are thin line-and-rule SVG drawings — one accent stroke, confidence band as 8% indigo fill, hairline gridlines, no library chrome. Lucide icons at 1.5px stroke, never filled.

STORY: The user opens RetailX to answer "how are we doing, and what should we do." The dashboard states the financial position in plain figures with variance vs target and prior period. Module screens are the books behind those figures. Analytics explains movement, Forecasting projects it with a stated confidence interval, Decision Support and Branch Evaluation turn it into a recommendation with ROI / ROCE / break-even / payback and conservative/base/optimistic cases.

FIRST VIEWPORT: 240px slate sidebar (org name, active role, nav grouped Overview / Operations / Intelligence). Main: header line — "Overview", period selector, "as of" date, and the indigo primary action "New branch evaluation" top-right. Then a register of four figure blocks (Revenue, Gross Profit Margin, Operating Profit, Net Profit): large tabular value, variance vs target and vs prior in semantic colour, a 56px hairline sparkline. Below: two-thirds "Revenue vs forecast" line chart with confidence band; one-third "Needs attention" list of anomalies / off-target KPIs. Then a compact P&L summary register and a recent-activity table. No card boxes — sections divided by rules and spacing.

FORM: printed management report / double-entry ledger. Chosen inline; the concept-seed direction tournament was skipped deliberately for this scoped internal Operate build (ponytail + fixed requirements). No seed key.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
