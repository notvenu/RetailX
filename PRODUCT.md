# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Next.js (App Router, TypeScript) + Tailwind CSS v4 + Auth.js (NextAuth v5, credentials) + Lucide icons. No chart or component library — tables and SVG charts are hand-built. Chosen to match the team's proposed React/Node direction while keeping the prototype a single deployable frontend with in-repo mock data. This build is the frontend only; data is mock fixtures in `src/lib/mock`.

## Users

- **SME owner / manager** — checks financial position and operational health between other work, mostly on a laptop in a back office under daytime light. Wants a reliable single view and a defensible answer to "should we open a branch".
- **Accountant / finance staff** — works in Finance, Sales, Procurement and Analytics; needs dense, accurate figures with variance against target and prior period.
- **Employee** — limited role; sees Sales, Inventory and their HR record, not Finance or Decision Support.

## Product Purpose

An integrated SME ERP prototype that records core business transactions (Finance, Sales/CRM, Inventory, Procurement, HR/Payroll) and adds an analytics, forecasting and decision-support layer on top of that data. Success is demonstrating the full flow transaction → consolidated data → KPIs → forecast → decision support, with a flagship "new branch opening" financial evaluation (investment, ROI, ROCE, break-even, payback, conservative/base/optimistic scenarios).

## Positioning

Not a dashboard bolted onto spreadsheets, and not a clone of a large enterprise ERP. The ERP layer supplies structured, traceable business data; the analytics layer explains and forecasts it; the decision layer turns it into a scenario-tested recommendation. The branch-opening evaluation engine is the differentiator.

## Operating Context

Back-office use on desktop/laptop. Role-based access gates Finance, HR and Decision Support. Periods are monthly; figures are reported against target and previous period. Currency is per-organization. The prototype ships with one seeded single-store organization, with a second store under evaluation.

## Capabilities and Constraints

- Modules (prototype scope, shallow): Finance & Accounting, Sales & CRM, Inventory & Procurement, HR & Payroll, Analytics & Forecasting, Decision Support, Branch Opening Evaluation.
- Core KPI set from the brief: Total Revenue, Revenue Growth %, Gross Profit / Margin %, Operating Expenses, Operating Profit / Margin %, Net Profit / Margin %, Sales Target Achievement %, Average Bill Value, Revenue per Customer/Employee, Inventory Turnover, DIO, Stock-out Rate %, ROCE, Break-even Achievement %, Payback Period, Cash Conversion Cycle, Store/Branch Health Score.
- Analytics answers four levels: descriptive, diagnostic, predictive, prescriptive.
- Branch evaluation inputs: initial investment, rent + deposit, store size, expected monthly sales, expected gross margin, employee count + payroll, utilities + operating expenses, marketing/launch cost, expected growth, financing cost. Outputs: revenue, gross/operating profit + margin, break-even point + achievement %, ROI, ROCE, payback, cash-flow impact, three scenarios, key risk factors + recommendation.
- Auth: NextAuth credentials against mock users; roles Owner, Manager, Accountant, Employee. No real backend in this build.
- Data entry: role-appropriate "add record" forms on Sales (invoices), Inventory (products), Procurement (POs), Finance (logged expenses) and HR (employees). Submitted records persist to `localStorage` per browser (there is no server); a per-panel Reset restores the seed data.

## Evidence on Hand

- Source brief: `RetailX_First_Project_Review (1).pdf` (project overview, modules, KPI framework, flagship evaluation spec, DB schema, system design).
- The seeded organisation is Nandan Provisions, an illustrative single-store neighbourhood supermarket (Baner Road, Pune; Udyam micro enterprise) with realistic, hand-authored books for September 2026 in detail and monthly closes from October 2025 (`ml/data/`). It is not a real company: the app carries one quiet "Illustrative business" note in the shell rather than "sample data" on every page. Do not invent claims beyond these books.

## Product Principles

1. Figures before charts — state the number and its variance first; visuals support, they don't lead.
2. Every screen is traceable back to source transactions; analytics never invents data the ERP layer can't produce.
3. Decisions come with scenarios and risk, never a single point estimate.
4. Role determines what is visible; finance and people data are not shown to roles that shouldn't see them.
5. Consistency over novelty — the same table, form and control vocabulary on every module.

## Accessibility & Inclusion

Body/placeholder text ≥ 4.5:1 contrast; keyboard-navigable nav, tables and forms; visible focus ring; numeric data uses tabular figures and right-alignment for scan accuracy.
