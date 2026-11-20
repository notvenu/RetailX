# RetailX start-to-end demo

Run on an empty database, 2026-11-19 21:12 UTC. **39 of 40 steps passed.**

| # | Area | Step | Result | Time |
|---|---|---|---|---|
| 1 | Start | Sign up | PASS | 0.6 s |
| 2 | Start | Onboarding: grocery shop, credit on, certificates + nutrition switched on, sample data | PASS | 3.6 s |
| 3 | Stock | Add products: wholesale price, expiry, batch, certificate, nutrition | PASS | 1.7 s |
| 4 | Customers | Customer with credit limit, payment terms, group and referrer | PASS | 0.5 s |
| 5 | Offers | Coupon and combo | PASS | 0.5 s |
| 6 | Settings | Counter & invoices: TCS, incentive, referral, modern layout, bank, terms | PASS | 0.4 s |
| 7 | Counter | Sale: wholesale rate from qty 3, combo, coupon, TCS, cash | PASS | 0.4 s |
| 8 | Counter | Expired batch is refused | PASS | 0.0 s |
| 9 | Counter | Credit sale: due date from payment terms | PASS | 0.2 s |
| 10 | Counter | Credit limit stops a bill over ₹5,000 | PASS | 0.1 s |
| 11 | Counter | Return against the invoice (capped at what was sold) | PASS | 0.2 s |
| 12 | Counter | Return above what was sold is refused | PASS | 0.2 s |
| 13 | Counter | Stock in, supplier return (debit note), scan-bill button | PASS | 0.4 s |
| 14 | Counter | Offline: bill waits on the device and is sent once when back online | PASS | 2.5 s |
| 15 | Counter | Quotation billed in one click | PASS | 0.9 s |
| 16 | Counter | Invoice: modern layout, bank, terms, TCS line, e-way bill JSON | PASS | 0.4 s |
| 17 | Counter | Day close with cash count | PASS | 0.2 s |
| 18 | Books | Switch on Payments, Journal and Fixed assets | PASS | 0.5 s |
| 19 | Books | Payment in with TDS settles dues; journal entry; fixed asset | PASS | 0.8 s |
| 20 | Books | Profit & loss, balance sheet, trial balance, ledger | PASS | 0.7 s |
| 21 | Books | Bank reconciliation from a statement | PASS | 0.2 s |
| 22 | Books | Verify my data | PASS | 0.2 s |
| 23 | Books | Export to Tally (XML) and import Tally masters | PASS | 0.6 s |
| 24 | Insights | Dues with overdue, idle and expiring stock, what-if, suppliers | PASS | 0.3 s |
| 25 | Insights | Certificates running out are listed | PASS | 0.0 s |
| 26 | Insights | Near-expiry offer put live in one tap, then applied at the counter | PASS | 1.3 s |
| 27 | Forecasting | Model comparison, stock plan and 13-week cash flow | PASS | 0.6 s |
| 28 | Forecasting | Place a suggested order; restock autopilot on and run | PASS | 1.6 s |
| 29 | AI team | CFO answers with a live model (free Groq key), using the books | PASS | 15.2 s |
| 30 | AI team | AI roles page and approvals | PASS | 0.2 s |
| 31 | Market | Market comparison, own figure, and live web research (Groq browser search) | **FAIL** — research: The free AI tier is busy: Rate limit reached for model `openai/gpt-oss-20b` in organization `org_01jh0k7ffvfahscnandtnvvz6t` service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 199492, Requested 2825. Please try again in 16m40.94 | 76.3 s |
| 32 | Automations | Automations and tasks open | PASS | 0.2 s |
| 33 | Reports | GST summary, GSTR-9, Form 27EQ, staff & referrals, downloads | PASS | 0.3 s |
| 34 | Labels | Barcode labels and pack labels with nutrition + certificate QR | PASS | 0.3 s |
| 35 | Stock | Transfer stock between locations | PASS | 0.5 s |
| 36 | Team | Add a cashier and an accountant; cashier limited to 5% discount | PASS | 0.7 s |
| 37 | Team | Cashier: discount over the limit is refused, owner PIN allows it | PASS | 0.9 s |
| 38 | Team | Cashier cannot open Settings or Books | PASS | 0.2 s |
| 39 | Team | Accountant (view-only) reads reports, every save is refused | PASS | 0.9 s |
| 40 | Team | Owner sees the cashier's sales in Staff & referrals, and the PIN override in the audit log | PASS | 0.7 s |

Screenshots: report/demo/shots · Video: report/demo/video/page@5084e65191d23975eeb7219642052d78.webm