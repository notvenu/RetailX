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

## Models

The demo business is **Nandan Provisions**, an illustrative single-store supermarket on Baner Road,
Pune, with books closed on 30 Sep 2026. `ml/data/` holds them: `monthly_closes.csv` (Oct 2025 – Sep
2026), `store_daily.csv` (September day book, with incidents noted), `sku_daily.csv` (tracked
products, authored by `ml/data/make_sku_daily.py` from the day book) and `category_month.csv`.
Staff, customers, suppliers, orders and invoices are entered in `src/lib/mock.ts`.

`ml/retailx.py` reads the books and writes `src/data/ml.json`, which `src/lib/mock.ts` reads: the P&L,
expense mix, KPI series, revenue forecast, anomaly log and 16-day product demand with order quantities.
It refuses to run if the September close and the day book disagree. Rerun it whenever the data changes.

```bash
pip install pandas numpy statsmodels
python ml/data/make_sku_daily.py   # after editing store_daily.csv
python ml/retailx.py      # books -> src/data/ml.json, scores -> ml/models/metrics.json
pip install scikit-learn lightgbm joblib kaggle   # only for the public benchmarks below
python ml/download.py     # optional: public benchmark datasets (Kaggle token + accepted competition rules)
python ml/train.py        # optional: same methods on Favorita, M5, Rossmann, TFI
```

## Design

See `DESIGN.md` and `.impeccable/surfaces/app.md`.
