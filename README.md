# RetailX

Frontend prototype for an integrated SME ERP with business analytics, forecasting and
decision support. Next.js (App Router) + Tailwind v4 + Auth.js. **All data is synthetic
sample data** (`src/lib/mock.ts`) — no backend.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
```

`.env.local` ships a dev `AUTH_SECRET` — replace it for any real deployment.

## Sign in

Password for every demo account is `retailx`.

| Role | Email | Sees |
|---|---|---|
| Owner | `owner@retailx.test` | everything |
| Manager | `manager@retailx.test` | everything |
| Accountant | `accountant@retailx.test` | Finance, Sales, Inventory, Procurement, Analytics, Forecasting |
| Employee | `employee@retailx.test` | Overview, Sales, Inventory |

Route access is enforced in `src/proxy.ts` and mirrored in the sidebar (`src/lib/access.ts`).

## Data entry

Sales, Inventory, Procurement, Finance and People each have an **add-record form** (top-right
of the main table). Whoever can open the module can add to it. Submitted records are validated,
prepended to the table, and saved to `localStorage` for that browser — they survive reload.
Each panel has a **Reset** link that clears the added records and restores the seed data.
`src/components/CollectionPanel.tsx` holds the generic panel and the per-module presets.

## Modules

Overview (KPI register + P&L + forecast) · Finance · Sales & CRM · Inventory · Procurement ·
People & Payroll · Analytics (KPI drill-down, branch health, anomaly log) · Forecasting
(Holt–Winters with prediction intervals + back-test) · Decision support (recommendations) ·
**Branch evaluation** — the flagship: enter assumptions for a proposed location and get
ROI / ROCE / break-even / payback / cash-flow across conservative, base and optimistic cases
plus the assumptions that move the decision most (`src/lib/branch.ts`).

```bash
node src/lib/branch.ts   # self-check on the financial engine
```

## Design

See `DESIGN.md` and `.impeccable/surfaces/app.md`.
