# RetailX

A multi-tenant service for MSMEs. A business signs up, describes itself in a guided onboarding, and gets a
workspace built around it: modules, KPIs, forecasts, analytics, automations, GST reports and an AI leadership team.
Every part of it can be reshaped afterwards. Next.js (App Router) + Tailwind v4 + Auth.js + libSQL + the Anthropic SDK.

## Run

```bash
npm install
cp .env.example .env.local   # set AUTH_SECRET at least; everything else is optional
npm run dev                  # http://localhost:3000 → /signup
```

| Command | What it does |
|---|---|
| `npm run check` | Self-checks for the engines: metrics, forecasting, GST, planning, importers, sample data, branch planner |
| `npm test` | Playwright end-to-end journey on a fresh temporary database (builds and serves on :3100) |

## Database

**SQLite through libSQL, hosted free on [Turso](https://turso.tech) when deployed.** No change of code between the two:

| Where | Setting | Cost |
|---|---|---|
| Your laptop / college lab / demo | nothing: a file at `.data/retailx.db` is created on first run | free |
| Deployed (Vercel, Render, Railway…) | `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | Turso free tier (no card needed) |

To create the hosted database (once): install the Turso CLI, then

```bash
turso auth signup
turso db create retailx
turso db show retailx --url        # → TURSO_DATABASE_URL
turso db tokens create retailx     # → TURSO_AUTH_TOKEN
```

The tables create themselves on first connection. Why this one: it's real SQL with transactions, it needs no server
for local work or a viva demo, and the free hosted tier works from serverless hosts where a local file can't.
Alternatives if your college asks for "a real RDBMS": Neon or Supabase (free Postgres) — that means rewriting the
queries in `src/lib/db.ts` (one file; the rest of the app only calls its functions).

Each business's configuration is one JSON document; records, users, the audit trail, push subscriptions, tokens and
rate-limit hits are rows. Business updates run in a write transaction, and writes are queued in-process so two never
collide on the SQLite file.

## Optional services (each has a working fallback)

| Service | Env | Without it |
|---|---|---|
| Claude (AI roles) | `ANTHROPIC_API_KEY` | Rule-based briefings from your KPIs |
| Any OpenAI-compatible AI, free: Gemini, Groq, Ollama | `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` (see `.env.example`) | Same as above; market research needs Claude or Groq (web search) |
| Resend (email) | `RESEND_API_KEY`, `EMAIL_FROM` | Emails go to the outbox (Reports → Messages) and the server log |
| WhatsApp Cloud API | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | One-tap `wa.me` links with the message written |
| A clock | `CRON_SECRET` + a scheduler calling `/api/cron` | Automations and briefings run when someone opens the app |
| Browser push | nothing (VAPID keys are generated and stored on first use; or set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`) | — |

In production set **`APP_URL`** (e.g. `https://retailx.example.com`): emailed reset and verification links are built
from it, never from request headers.

`vercel.json` schedules `/api/cron` daily at 06:00 IST; for more frequent runs use cron-job.org (free) with the header
`Authorization: Bearer $CRON_SECRET`.

## What's in it

- **Accounts:** sign up, sign in with email / phone / username (each tied to one business and one role), password reset
  by email or WhatsApp, email and phone verification, rate-limited sign-in and sign-up, per-business roles with an
  access matrix enforced on every page, action and dashboard tile.
- **Onboarding:** 10 steps with a live preview: basics (GSTIN, UPI ID, opening cash, language), industry and category,
  how you work, then editable modules, KPIs, forecasts, AI team, team and access, theme; optional 6 months of sample data.
- **Records:** 18 module templates plus custom modules; quick entry (phone-friendly), edit, search, filters, column
  picker, sort, saved views, CSV export, import with column auto-mapping for Tally / Vyapar / Busy / bank statements
  (debits → categorised expenses, DD/MM/YYYY dates), recycle bin with undo (30 days), per-record history.
- **Audit trail:** every record, setting, member, automation and approval change (Settings → Audit log).
- **Analytics:** KPI register with like-for-like comparison while a period is in progress, drill-down, driver analysis,
  group comparison (location vs location), same period last year, breakdowns, anomaly log that skips event days.
- **Market comparison:** each margin, cost share and rate placed against businesses like yours (bottom quarter /
  typical / top quarter), with what reaching the typical figure is worth a month in rupees. Built-in ranges per industry
  and category (labelled as rules of thumb); **Research current figures** has Claude search the web and save sourced,
  dated figures; owners can enter their own. The AI team quotes these ranges.
- **Forecasting:** 10 models with a rolling-origin back-test; festival/promotion uplift learned from history;
  **stock planning** (per-product demand, safety stock, order quantities); **13-week cash flow** with runway.
- **Billing counter (POS):** scan a barcode or search (`3*milk` bills three), several bills held at once in tabs that
  survive a refresh, line and bill discounts (`50` or `10%`), Cash / UPI / Card / Credit with change due and a pay-by-UPI
  QR for the exact amount, returns (credit notes) and stock in, customer lookup by phone with what they owe, keyboard
  first (F2 search, F3 customer, F4 cash, F6 discount, F7 mode, F9 save & print, Alt+N new bill). Each bill is Sales
  lines sharing an invoice number (`26-27/0001`, `CN/26-27/0001`), so GST, KPIs, forecasts and the AI team see it; stock
  moves atomically in SQL, so two counters selling the same item both count. 80 mm thermal receipt or A4 invoice.
- **Day close (Z report):** sales by payment mode, returns, credit given, cash expected (opening + cash sales − cash
  expenses) against cash counted by note denomination; saved to the Day close module, tomorrow opens on today's count.
- **Barcode labels:** Code 128 shelf / product labels from Stock, printed on A4 sheets or a label printer.
- **GST & UPI:** tax invoices (CGST/SGST vs IGST from GSTIN state codes) with UPI QR, print to PDF, WhatsApp share;
  GSTR-1 style outward summary, HSN summary, input tax credit and GSTR-3B net payable; WhatsApp payment reminders with
  UPI links.
- **AI team:** CFO, COO, CTO, Head of People, GM, CMO or custom roles; streamed replies; memory of standing rules;
  hand-offs between roles; approval queue for "draft" roles; morning briefings.
- **Automations & tasks:** record / schedule / KPI triggers → tasks, notes, field updates, WhatsApp or email messages.
- **Notifications:** bell in the top bar; browser push on any device you switch it on for (Profile & security);
  optional email. You're told when a task is assigned to you (by a person or an automation) and the owner when an AI
  proposal waits for approval.
- **Workspace:** dashboard tiles you drag and resize, personal layouts, English / हिन्दी / मराठी / தமிழ் for navigation,
  page titles and the everyday screens (records, dashboard, tasks), theme, installable on phones (PWA) with quick-add.
- **Insights:** who owes you and for how long (30 / 60 / 60+ days, WhatsApp reminder per customer), stock that has not
  sold in 60 days, products expiring before they will sell out, a what-if simulator (supplier late by N days, demand
  up or down) with a plain-language reason for each reorder, supplier scorecard (spend share, orders past due, price
  rises), best customers and regulars who went quiet, and counter exceptions (high return rate, drawer short at close).
  The same watch-list opens the CFO / COO / GM morning briefing, with or without an AI key.
- **Stock planning → orders:** one tap turns a suggested quantity into an Ordered purchase; urgent lines go to WhatsApp.
- **Restock autopilot (owner only):** once a day with the scheduler, or on "Run now", places the "order now" lines as
  Ordered purchases from suppliers the owner ticked, inside a weekly spend cap, never twice for an item already on
  order, and never pays anyone. The owner gets a notification; every order is in the audit log as "Autopilot".
- **Counter extras:** camera barcode scan and spoken items (`3 milk`) where the browser supports them; per-customer
  credit limit (checked on the server too); loyalty points (1 per ₹100 spent, ₹1 each at the counter); bill a
  quotation in one click (it becomes Accepted); bills made offline wait on the device and are sent once, even if the
  send half-failed (each carries an id), and the counter page reloads offline through the service worker.
- **Payroll run:** gross, PF (12% to ₹15,000) and ESI (0.75% up to ₹21,000 gross) from the Team list, once per month.
- **Accountant login:** a role can be View only: it reads what it is given and every save is refused.
- **GSTR-1 JSON** for the GST offline tool (Reports); check it there before filing.
- **Branch planner:** ROI, payback, break-even across three scenarios, seeded from an average existing location.

Ported from the FitSecret POS, and joined up with the rest of the workspace:

- **Offers & coupons:** coupons (% or flat, minimum bill, dates), combos (a set of items for one price, biggest saving
  first, each unit counted once) and near-expiry offers on one batch. The counter applies them by itself and the
  server prices them again. **Insights → Near-expiry offers** suggests the % that clears a batch before it expires,
  never below cost + 5%, and puts it live in one tap; batches that can't be cleared at a profit are flagged for return.
- **Counter, Vyapar-grade:** wholesale price from a minimum quantity; a known customer's last rate reused; first expiry,
  first out (a scan picks the batch that expires soonest), and expired stock refused; returns against an invoice
  (**Load bill**, never more than was sold); **Supplier return** as a debit note (`DN/26-27/0001`); cashier limits per
  role (most discount by hand, may or may not sell below list price; offers don't count); **Check profit** on the bill;
  serial / IMEI per unit; own invoice prefix; stop sales below zero stock; 58 mm or 80 mm receipts.
- **Quotations & orders:** quotation, proforma invoice, sale order or delivery challan; none move stock or money
  until billed at the counter.
- **Books:** profit & loss, balance sheet, trial balance and a ledger per account, all posted from the records you
  already keep (sales with cost of goods, purchases, expenses, payroll with PF/ESI, payments, day-close over/short).
  **Payments** (in and out, TDS, cheques: not deposited / deposited / cleared / bounced) settle dues, which Insights and
  reminders then net off. **Journal entries** for capital, drawings, loans and opening balances. **Fixed assets** with
  straight-line monthly depreciation. **Bank reconcile:** a statement CSV matched to the books by amount and date
  (±3 days) in the browser. **Export to Tally** (vouchers + ledgers as Tally import XML).
- **GST files:** e-way bill JSON per invoice (portal bulk upload), GSTR-9 annual summary month by month with the
  year's HSN summary, TDS on payments.
- **Scan supplier bill:** a photo of the bill → stock-in lines (GSTIN, bill no, date, qty, rate, GST, batch, MM/YY
  expiry), matched to your stock list, free OCR in the browser (Tesseract), reviewed before anything is added.
- **Customers & credit:** payment terms per customer (a credit bill is due that many days later; Insights shows
  what is overdue, invoices print *Due by*), customer groups, GSTIN and *Referred by* on Customers; add any other field
  in Settings → Modules.
- **Counter & invoices settings:** TCS % offered as a tick box on bills (posted to *TCS payable*, Form 27EQ by quarter
  and buyer on Reports); an owner override PIN a cashier's bill needs when it goes past their discount or price limit
  (hashed, rate-limited, noted in the audit log); three A4 invoice layouts (classic, modern, compact) with your bank
  details and terms; staff incentive and referral commission %, reported per person on Reports → Staff & referrals.
- **Verify my data** (Books): negative stock, future-dated or duplicate invoices, missing prices, costs, HSN or GST
  rates, malformed GSTINs, purchases without a supplier GSTIN, stale orders, very old dues, customers sharing a phone,
  and whether the trial balance balances, each with a link to fix it.
- **Import from Tally:** a Tally masters XML (List of Accounts / Stock Items) into Customers and Stock in one step.
- **Optional product features** (onboarding review step, or Settings → Counter & invoices): *Product certificates*
  (lab report / FSSAI / ISI link, issuer, valid-until; Insights lists what runs out within 30 days) and *Nutrition
  labels* (ingredients, nutrition per serving, veg mark, allergens, how to use, FSSAI no.). Both print on **pack
  labels** (Labels → Pack labels), with a QR to the certificate. Off by default; switching off hides the fields and keeps
  what was entered.
- **Branches & warehouses:** stock per location and **Transfer stock** between them (Stock page).
- **తెలుగు** (Telugu) joins the interface languages.

## Code map

- `src/lib/db.ts` storage · `session.ts` who's asking · `model.ts` types · `catalog.ts` industries, templates, KPI library, roles.
- `metrics.ts` formulas, periods, KPI status, drivers · `forecast.ts` models, back-test, anomalies · `planning.ts`
  cash flow, stock plan, event uplift · `gst.ts` (+ GSTR-9, e-way bill) · `pos.ts` (counter pricing, limits, FEFO, day close, barcodes) ·
  `offers.ts` · `books.ts` (postings, P&L, balance sheet, bank reconcile, Tally) · `billparse.ts` · `extras.ts` (terms, Tally import, Verify my data, staff & referrals, TCS / 27EQ, nutrition) · `importers.ts` · `sample.ts` · `branch.ts` · `benchmarks.ts`.
- `ai.ts` Claude agent loop + fallback + briefings · `automation.ts` · `notify.ts` (email, WhatsApp, push) / `links.ts`.
- `src/app/actions.ts` server actions (they return errors as values; see `src/lib/result.ts`) · `src/app/api/{ai,cron}`
  routes · `public/sw.js` push service worker · `src/components/config/*` editors shared by onboarding and Settings.

## Limits worth knowing

- Each request loads a business's live records into memory: comfortable to tens of thousands of rows per business;
  push aggregation into SQL beyond that.
- WhatsApp Cloud API free-form messages only reach customers who wrote to you in the last 24 hours; business-started
  messages need approved templates.
- Lunar festival dates in the built-in calendar are approximate; check them in Settings → Calendar.
- GST summaries assume amounts are GST-inclusive; have an accountant check before filing.
- Offline billing: invoice numbers and stock are assigned when the queued bill reaches the server, so a bill made offline
  has no number or printed receipt until then. The offline page copy is the last one fetched online.
- Payroll has no attendance, professional tax or TDS; GSTR-1 JSON nets credit notes into their slab instead of the
  credit-note tables. Not built: e-invoice (IRN, needs a GSP account and applies above ₹5 Cr turnover), marketplace
  sync, courier APIs (Shiprocket / Delhivery tracking).
- The books treat every amount as GST-inclusive and value stock at cost from purchases and sale-line costs; stock or
  cash from before your first record shows as a negative balance until you add an opening-balance journal entry.
- The e-way bill and GSTR-9 files follow the portals' published shapes; check the first file on the portal.

## Design

See `DESIGN.md`.
