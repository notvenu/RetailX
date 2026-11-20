import { expect, test, type Page } from "@playwright/test";

// One business, start to finish: sign up → onboard with sample data → record → import → analyse → plan → AI →
// team member with a username login → role-limited access. Runs against a fresh database (playwright.config.ts).
test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const owner = { email: `owner-${stamp}@example.test`, password: "e2e-pass-123" };
const staff = { username: `staff_${stamp}`, password: "staff-pass-123" };
const manager = { username: `mgr_${stamp}`, password: "mgr-pass-1234" };
const ca = { username: `ca_${stamp}`, password: "ca-pass-123456" };
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  // surface browser-side exceptions in the test output: they otherwise show only as Next's error page
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.message}`));
});

test("sign up creates the business and opens onboarding", async () => {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Asha Test");
  await page.getByLabel("Business name").fill("Asha Kirana");
  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel(/^Password/).fill(owner.password);
  await page.getByLabel("Confirm password").fill(owner.password);
  await page.getByRole("button", { name: "Create account and continue" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: /Welcome, Asha/ })).toBeVisible();
});

test("onboarding builds a grocery workspace with sample data", async () => {
  await page.getByPlaceholder("e.g. Pune").fill("Nashik");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Retail store/ }).click();
  await page.getByRole("button", { name: "Grocery & supermarket" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("switch", { name: "Do customers ever pay later?" }).click();
  await page.getByRole("button", { name: "Build my workspace" }).click();
  await expect(page.getByText(/Built for a retail store/)).toBeVisible();
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review & launch" })).toBeVisible();
  await page.getByRole("switch", { name: "Start with sample data" }).click();
  await page.getByRole("button", { name: "Launch workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  await expect(page.getByText("You're looking at sample data.")).toBeVisible();
});

test("a sale can be added, deleted and undone", async () => {
  await page.goto("/m/sales");
  const form = page.locator("form").first();
  await form.getByLabel(/Amount/).fill("4321");
  await form.getByLabel("Customer", { exact: true }).fill("E2E Customer");
  await form.getByRole("button", { name: "Add" }).click();
  const row = page.getByRole("row", { name: /E2E Customer/ });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(/moved to the recycle bin/)).toBeVisible();
  await expect(page.getByRole("row", { name: /E2E Customer/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("row", { name: /E2E Customer/ })).toBeVisible();
});

test("the counter bills scanned items, takes stock off, takes a return and closes the day", async () => {
  await page.goto("/pos");
  await expect(page.getByRole("heading", { name: "Counter" })).toBeVisible();
  const search = page.getByLabel("Scan a barcode or search an item");
  // what a barcode scanner does: types the code, then Enter. "2*" bills two.
  await search.fill("2*SKU-1000");
  await search.press("Enter");
  const line = page.getByRole("row").filter({ has: page.getByLabel(/quantity$/) }).first();
  await expect(line.getByLabel(/quantity$/)).toHaveValue("2");
  const before = Number((await line.getByText(/-?\d+ in stock/).textContent())!.match(/-?\d+/)![0]);
  await search.fill("Gift wrap");
  await search.press("Enter");
  await page.getByLabel("Gift wrap price").fill("30");
  await page.getByLabel("Bill discount, amount or percent").fill("10");
  await page.getByRole("button", { name: "Exact" }).click();
  await page.getByRole("button", { name: /Save only/ }).click();
  await expect(page.getByText(/Bill \d\d-\d\d\/0001 saved/)).toBeVisible();

  // stock came off at once, and the invoice shows both lines
  await search.fill("SKU-1000");
  await expect(page.getByRole("option").first()).toContainText(`${before - 2} left`);
  await search.fill("");
  const invoice = await page.getByRole("link", { name: "invoice" }).getAttribute("href");
  await page.goto(invoice!);
  await expect(page.getByText("Gift wrap")).toBeVisible();
  await expect(page.getByText("2 items · amounts include GST.")).toBeVisible();

  // a return puts it back on the shelf
  await page.goto("/pos");
  await page.getByRole("radio", { name: "Return", exact: true }).click();
  await search.fill("SKU-1000");
  await search.press("Enter");
  await page.getByRole("button", { name: /Save only/ }).click();
  await expect(page.getByText(/Return CN\/\d\d-\d\d\/0001 saved/)).toBeVisible();
  await search.fill("SKU-1000");
  await expect(page.getByRole("option").first()).toContainText(`${before - 1} left`);

  await page.goto("/dayclose");
  await expect(page.getByRole("heading", { name: "Day close" })).toBeVisible();
  await page.getByLabel("Or type the total counted").fill("1");
  page.once("dialog", (d) => d.accept()); // over / short: confirm closing anyway
  await page.getByRole("button", { name: "Close the day" }).click();
  await expect(page.getByText(/Day closed · cash/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent closes" })).toBeVisible();

  await page.goto("/labels");
  await page.getByRole("button", { name: "One each" }).click();
  await expect(page.getByRole("button", { name: /Print \d+ labels/ })).toBeEnabled();
  await expect(page.getByRole("img", { name: "Barcode SKU-1000" })).toBeVisible();
});

test("offline: the counter reloads with no connection, queues the bill, and sends it once back online", async () => {
  await page.goto("/pos");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now served through the service worker, so /pos and its scripts are cached
  const search = page.getByLabel("Scan a barcode or search an item");
  await page.getByRole("radio", { name: "Sale" }).click(); // the counter remembers the last bill type: the test before left it on Return
  await search.fill("SKU-1000");
  // only the "N left" part: the price sits right next to it in the option's text
  const left = async () => Number((await page.getByRole("option").first().getByText(/-?\d+ left$/).textContent())!.match(/(-?\d+) left/)![1]);
  const before = await left();
  await search.fill("");

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Counter" })).toBeVisible();
  await search.fill("SKU-1000");
  await search.press("Enter");
  await page.getByRole("button", { name: /Save only/ }).click();
  // the failed send can make Next reload the page, which drops the toast; the queue banner is what lasts
  await expect(page.getByText(/1 bill waiting to be sent/)).toBeVisible();

  await page.context().setOffline(false);
  await expect(page.getByText(/waiting to be sent/)).toHaveCount(0, { timeout: 30_000 });
  // the first reload after reconnecting can still come from the offline copy: reload until the fresh page arrives
  await expect.poll(async () => { await page.reload(); await search.fill("SKU-1000"); return left(); }, { timeout: 30_000 }).toBe(before - 1); // saved exactly once
});

test("credit limit: a credit bill that would take a customer over their limit is refused", async () => {
  await page.goto("/m/customers");
  const form = page.locator("form").first();
  await form.getByLabel(/^Name/).fill("Limit Lena");
  await form.getByLabel("Phone", { exact: true }).fill("9876500001");
  await form.getByLabel("Credit limit").fill("50");
  await form.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("row", { name: /Limit Lena/ })).toBeVisible();

  await page.goto("/pos");
  await page.getByRole("radio", { name: "Sale" }).click();
  const search = page.getByLabel("Scan a barcode or search an item");
  await search.fill("SKU-1000");
  await search.press("Enter");
  await page.getByLabel("Customer phone").fill("9876500001");
  await page.getByRole("radio", { name: "Credit" }).click();
  await expect(page.getByText(/Over credit limit by/)).toBeVisible();
  await page.getByRole("button", { name: /Save only/ }).click();
  await expect(page.getByText(/credit limit of/)).toBeVisible();
  await page.getByRole("radio", { name: "Cash" }).click(); // paying now is always fine
  await expect(page.getByText(/Over credit limit by/)).toHaveCount(0);
});

test("loyalty: spend earns points that come off the next bill, once", async () => {
  await page.goto("/pos");
  await page.getByRole("radio", { name: "Sale" }).click();
  await page.getByRole("radio", { name: "Cash" }).click();
  const search = page.getByLabel("Scan a barcode or search an item");
  const bill = async (phone: string) => {
    await search.fill("Gift wrap");
    await search.press("Enter");
    await page.getByLabel("Gift wrap price").fill("1000");
    await page.getByLabel("Customer phone").fill(phone);
  };
  // (the credit-limit test left an unsaved line in this tab, so amounts are read, not assumed)
  await bill("9876500003");
  await page.getByRole("button", { name: /Save only/ }).click();
  await expect(page.getByText(/Bill \d\d-\d\d\/\d+ saved/)).toBeVisible();

  await bill("9876500003");
  const shown = async () => Number((await page.getByText(/\d+ = ₹[\d,.]+/).first().textContent())!.match(/(\d+) = ₹/)![1]);
  await expect.poll(shown).toBeGreaterThanOrEqual(10); // ₹1000+ spent = 10+ points
  const have = await shown();
  await page.getByLabel("Loyalty points to use").fill("5");
  await expect(page.getByText("−₹5.00")).toBeVisible();
  await page.getByRole("button", { name: /Save only/ }).click();
  // only Gift wrap is on this bill: 1000 less 5 points
  await expect(page.getByText(/Bill \d\d-\d\d\/\d+ saved · ₹995/)).toBeVisible();
  const paid = 995;

  // 5 were spent and the amount paid earned new points: about have − 5 + paid/100. Points are floor(total spend / 100),
  // not a sum of per-bill floors, so allow one point of rounding either way; a missed or doubled deduction is ~5 off.
  const want = have - 5 + Math.floor(paid / 100);
  await page.reload();
  await bill("9876500003");
  await expect.poll(shown).toBeGreaterThanOrEqual(want);
  await expect.poll(shown).toBeLessThanOrEqual(want + 1);
});

test("a quotation is billed at the counter and becomes Accepted", async () => {
  await page.goto("/settings?tab=modules");
  await page.getByLabel("Use Quotations").click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Saved\./)).toBeVisible();

  await page.goto("/m/quotes");
  const form = page.locator("form").first();
  await form.getByLabel(/^Customer( \*)?$/).fill("Quote Qasim");
  await form.getByLabel(/^Quote amount/).fill("500");
  await form.getByLabel("Item / service").fill("Installation visit");
  await form.getByRole("button", { name: "Add" }).click();
  const row = page.getByRole("row", { name: /Quote Qasim/ });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Bill this quotation at the counter" }).click();

  await expect(page).toHaveURL(/\/pos$/);
  await expect(page.getByLabel("Installation visit price")).toHaveValue("500");
  await page.getByRole("button", { name: /Save only/ }).click();
  await expect(page.getByText(/Bill \d\d-\d\d\/\d+ saved/)).toBeVisible();

  await page.goto("/m/quotes");
  // the status column isn't among the default columns, but an Accepted quote no longer offers "bill this"
  await expect(page.getByRole("row", { name: /Quote Qasim/ }).getByRole("link", { name: "Bill this quotation at the counter" })).toHaveCount(0);
});

test("a bank statement imports as categorised expenses", async () => {
  await page.goto("/m/expenses");
  await page.getByRole("button", { name: "Import" }).click();
  await page.locator("textarea").fill([
    "Txn Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance",
    "01/09/2026,NEFT-LANDLORD-SEPT RENT,45000.00,,120000",
    "03/09/2026,UPI/MSEDCL/electricity,6210.00,,113790",
    "04/09/2026,UPI/RAHUL/received,,2500.00,116290",
  ].join("\n"));
  await expect(page.getByText(/Looks like a bank statement: 2 debits/)).toBeVisible();
  await page.getByRole("button", { name: /Import 2 rows/ }).click();
  await expect(page.getByText("Imported 2 records.")).toBeVisible();
});

test("analytics, forecasts, stock and cash plans render from the data", async () => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "KPI register" })).toBeVisible();
  await expect(page.getByText("Revenue").first()).toBeVisible();
  await page.goto("/forecasting");
  await expect(page.getByRole("heading", { name: "Model comparison" })).toBeVisible();
  await page.goto("/forecasting?tab=stock");
  await expect(page.getByRole("heading", { name: "What to order" })).toBeVisible();
  await page.goto("/forecasting?tab=cash");
  await page.getByPlaceholder("250000").fill("300000");
  await page.getByRole("button", { name: "Start forecast" }).click();
  await expect(page.getByRole("heading", { name: "13-week cash flow" })).toBeVisible();
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "GSTR-3B summary" })).toBeVisible();
});

test("autopilot: orders urgent lines from ticked suppliers, and never orders the same item twice", async () => {
  await page.goto("/forecasting?tab=stock");
  // a longer supplier lead time makes some lines urgent whatever weekday the suite runs on; the autopilot plans with it
  await page.getByRole("slider").first().fill("12");
  await page.getByLabel("Autopilot on").click();
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByLabel("Autopilot weekly cap").fill("1000000");
  await page.getByRole("button", { name: "Save autopilot" }).click();
  await expect(page.getByText(/Autopilot is on/)).toBeVisible();
  await page.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByText(/Placed \d+ orders?\./)).toBeVisible();
  // a second run finds every line already on order
  await page.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByText("Nothing to order right now.")).toBeVisible();
});

test("insights: dues, idle stock, what-if and supplier sections render; the stock plan can place an order", async () => {
  await page.goto("/insights");
  await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();
  for (const h of ["Who owes you", "Stock that is not moving", "What if…", "Suppliers", "Customers", "Counter exceptions"])
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  // moving the supplier delay changes the verdict line
  const meta = page.getByText(/would run out before stock arrives/);
  const before = await meta.textContent();
  await page.getByRole("slider").nth(1).fill("14");
  await expect(meta).not.toHaveText(before ?? "");
  // a product of its own that sells and has no order open (the sample data already has every demo item on order)
  await page.goto("/m/inventory");
  const form = page.locator("form").first();
  await form.getByLabel(/^Product/).fill("Mango pickle");
  await form.getByLabel(/^SKU/).fill("PICKLE-1");
  await form.getByLabel(/^On hand/).fill("0");
  await form.getByLabel(/^Price/).fill("90");
  await form.getByLabel(/^Unit cost/).fill("60");
  await form.getByLabel(/^Supplier/).fill("Shree Traders");
  await form.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("row", { name: /Mango pickle/ })).toBeVisible();
  // the plan reads finished days, so the sale is yesterday's
  const yesterday = new Date(Date.now() + 5.5 * 3600e3 - 864e5).toISOString().slice(0, 10);
  await page.goto("/m/sales");
  const sale = page.locator("form").first();
  await sale.getByLabel(/^Date/).fill(yesterday);
  await sale.getByLabel(/^Item/).fill("Mango pickle");
  await sale.getByLabel(/^Qty/).fill("3");
  await sale.getByLabel(/^Amount/).fill("270");
  await sale.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("row", { name: /Mango pickle/ }).first()).toBeVisible();

  await page.goto("/forecasting?tab=stock");
  // the autopilot test before this one already ordered the urgent lines: they say so instead of offering a second order
  await expect(page.getByText("On order").first()).toBeVisible();
  await page.getByRole("row", { name: /Mango pickle/ }).getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText("Ordered", { exact: true }).first()).toBeVisible();
});

test("payroll: a pay run is previewed with PF/ESI and created once", async () => {
  await page.goto("/m/payroll");
  await expect(page.getByRole("heading", { name: "Run payroll" })).toBeVisible();
  const create = page.getByRole("button", { name: /Create \d+ pay entries/ });
  await create.click();
  await expect(page.getByText(/pay entries created as Pending/)).toBeVisible();
  await expect(page.getByText("everyone is already paid for this month")).toBeVisible();
});

test("market comparison places KPIs against ranges and takes the owner's own figure", async () => {
  await page.goto("/market");
  await expect(page.getByRole("heading", { name: "Your KPIs against the market" })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: "Gross margin" });
  await expect(row.getByText(/Top quarter|Above typical|Below typical|Bottom quarter/)).toBeVisible();
  await row.getByRole("button", { name: "Set your own" }).click();
  await row.getByLabel("Low (25%)").fill("30");
  await row.getByLabel("Typical", { exact: true }).fill("20"); // out of order: refused
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByRole("alert")).toContainText("low to high");
  await row.getByLabel("Typical", { exact: true }).fill("35");
  await row.getByLabel("High (75%)").fill("40");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByText("Your figure")).toBeVisible();
  await row.getByRole("button", { name: "Use built-in" }).click();
  await expect(row.getByText(/Built-in reference range/)).toBeVisible();
  await page.getByRole("button", { name: "Research current figures" }).click();
  await expect(page.getByRole("status")).toContainText("ANTHROPIC_API_KEY");
});

test("offers: a coupon comes off a counter bill, and an unknown code is refused", async () => {
  await page.goto("/m/offers");
  const form = page.locator("form").first();
  await form.getByLabel(/^Offer/).fill("Ten percent off");
  await form.getByLabel(/^Coupon code/).fill("TEN");
  await form.getByLabel(/^% off/).fill("10");
  await form.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("row", { name: /Ten percent off/ })).toBeVisible();

  await page.goto("/pos");
  await page.getByRole("radio", { name: "Sale" }).click();
  const search = page.getByRole("textbox", { name: "Scan a barcode or search an item" });
  await page.getByRole("button", { name: "Clear bill" }).click({ timeout: 2000 }).catch(() => {});
  await search.fill("Coupon test");
  await search.press("Enter");
  await page.getByRole("textbox", { name: "Coupon test price" }).fill("500");
  await page.getByRole("textbox", { name: "Coupon code" }).fill("NOPE");
  await expect(page.getByText("No coupon NOPE.")).toBeVisible();
  await page.getByRole("textbox", { name: "Coupon code" }).fill("TEN");
  await expect(page.getByText("Coupon TEN")).toBeVisible();
  await page.getByRole("button", { name: /Save only/ }).click();
  await expect(page.getByText(/Bill \d\d-\d\d\/\d+ saved · ₹/)).toBeVisible();
});

test("a supplier return is a debit note; the books balance and export to Tally", async () => {
  await page.goto("/pos");
  await page.getByRole("radio", { name: "Supplier return" }).click();
  const search = page.getByRole("textbox", { name: "Scan a barcode or search an item" });
  await search.fill("SKU-1001");
  await search.press("Enter");
  await page.getByRole("button", { name: /Save only/ }).click();
  await expect(page.getByText(/Debit note DN\/\d\d-\d\d\/0001 saved/)).toBeVisible();
  await page.getByRole("radio", { name: "Sale" }).click();

  await page.goto("/books?tab=tb");
  await expect(page.getByRole("heading", { name: "Trial balance" })).toBeVisible();
  const [dr, cr] = (await page.getByText(/^₹[\d,.]+ = ₹[\d,.]+$/).textContent())!.split(" = ");
  expect(dr).toBe(cr);
  await page.getByRole("link", { name: "Balance sheet" }).click();
  await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export to Tally" }).click();
  expect((await download).suggestedFilename()).toMatch(/^tally-.*\.xml$/);
});

test("accounting extras: payment terms, TCS, 27EQ, staff report, Verify my data, Tally import, pack labels", async () => {
  await page.goto("/settings?tab=counter");
  await page.getByLabel("TCS % on bills").fill("1");
  await page.getByLabel("Staff incentive % of net sales").fill("2");
  await page.getByRole("switch", { name: "Nutrition labels" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();

  await page.goto("/m/customers");
  const form = page.locator("form").first();
  await form.getByLabel(/^Name/).fill("Terms Tara");
  await form.getByLabel("Phone", { exact: true }).fill("9876500077");
  await form.getByLabel(/^Payment terms/).fill("15");
  await form.getByLabel(/^Referred by/).fill("Kiran");
  await form.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("row", { name: /Terms Tara/ })).toBeVisible();

  await page.goto("/pos");
  await page.getByRole("radio", { name: "Sale" }).click();
  const search = page.getByRole("textbox", { name: "Scan a barcode or search an item" });
  await search.fill("TCS test");
  await search.press("Enter");
  await page.getByRole("textbox", { name: "TCS test price" }).fill("1000");
  await page.getByRole("textbox", { name: "Customer phone" }).fill("9876500077");
  await page.getByRole("radio", { name: "Credit" }).click();
  await expect(page.getByText(/due in 15 days/)).toBeVisible();
  await page.getByRole("checkbox", { name: /Collect TCS/ }).check();
  await expect(page.getByText("To collect")).toBeVisible();
  await page.getByRole("button", { name: /Save only/ }).click();
  await expect(page.getByText(/Bill \d\d-\d\d\/\d+ saved · ₹1,010/)).toBeVisible();
  await page.getByRole("radio", { name: "Cash" }).click();

  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: /Form 27EQ/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Staff & referrals" })).toBeVisible();
  await page.goto("/books?tab=verify");
  await expect(page.getByRole("heading", { name: "Verify my data" })).toBeVisible();
  await expect(page.getByText(/Trial balance balances/)).toBeVisible();

  await page.goto("/m/customers");
  await page.getByRole("button", { name: "Import" }).click();
  await page.locator("textarea").last().fill(`<ENVELOPE><BODY><TALLYMESSAGE><LEDGER NAME="Tally Traders"><PARENT>Sundry Debtors</PARENT><LEDGERMOBILE>9876500088</LEDGERMOBILE></LEDGER></TALLYMESSAGE></BODY></ENVELOPE>`);
  await page.getByRole("button", { name: "Import from Tally" }).click();
  await expect(page.getByText(/Imported 1 customers/)).toBeVisible();

  await page.goto("/m/inventory");
  await expect(page.locator("form").first().getByLabel(/^Ingredients/)).toBeVisible();
  await page.goto("/labels?kind=pack");
  await expect(page.getByRole("link", { name: "Pack labels" })).toBeVisible();
});

test("an AI role answers (built-in rules without an API key)", async () => {
  await page.goto("/ai/cfo");
  await page.getByLabel("Message Arjun").fill("How are margins?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("How are margins?")).toBeVisible();
  await expect(page.getByText(/running on built-in rules/).last()).toBeVisible();
});

test("invoice, approvals, branch planner, profile and verification pages open", async () => {
  await page.goto("/m/sales");
  const invoice = await page.getByRole("link", { name: "Invoice" }).first().getAttribute("href");
  await page.goto(invoice!);
  await expect(page.getByRole("button", { name: /Print/ })).toBeVisible();
  await expect(page.getByText(/GSTIN|Invoice|Credit note/).first()).toBeVisible(); // newest sale is the counter's return
  await page.goto("/approvals");
  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
  await page.goto("/planner");
  await expect(page.getByRole("heading", { name: "Branch planner" })).toBeVisible();
  await page.goto("/profile");
  await expect(page.getByText("Notifications on this device")).toBeVisible();
  await page.goto("/settings?tab=calendar");
  await page.getByRole("button", { name: /Add Indian festivals/ }).click();
  await expect(page.getByRole("textbox", { name: "Name" }).first()).toHaveValue(/Diwali|Holi|Christmas|Eid|Navratri|Ganesh|Dussehra|Raksha|Makar/);
  await page.goto("/verify");
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
});

test("a team member signs in with a username and sees only their role", async () => {
  await page.goto("/settings?tab=team");
  await page.getByRole("button", { name: "Add a person" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Ravi Staff");
  await page.getByLabel("Email, phone or username").fill(staff.username);
  await page.getByLabel("Role", { exact: true }).selectOption("staff");
  await page.getByLabel("Temporary password").fill(staff.password);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`@${staff.username}`)).toBeVisible();
  await page.getByRole("button", { name: "Add a person" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Mona Manager");
  await page.getByLabel("Email, phone or username").fill(manager.username);
  await page.getByLabel("Role", { exact: true }).selectOption("manager");
  await page.getByLabel("Temporary password").fill(manager.password);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`@${manager.username}`)).toBeVisible();
  await page.getByRole("button", { name: "Add a person" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Chandra CA");
  await page.getByLabel("Email, phone or username").fill(ca.username);
  await page.getByLabel("Role", { exact: true }).selectOption("ca");
  await page.getByLabel("Temporary password").fill(ca.password);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`@${ca.username}`)).toBeVisible();
  // the dangerous case: a manager the owner trusted with Settings
  await page.getByLabel("Manager can open Settings").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Saved\./)).toBeVisible();

  await page.goto("/signout");
  await page.getByLabel("Email, phone or username").fill(staff.username.toUpperCase());
  await page.getByLabel("Password").fill(staff.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await page.goto("/settings");
  await expect(page).toHaveURL(/denied=settings/);
});

test("a view-only CA can read the books but every save is refused", async () => {
  await page.goto("/signout");
  await page.goto("/signin");
  await page.getByLabel("Email, phone or username").fill(ca.username);
  await page.getByLabel("Password").fill(ca.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "GSTR-3B summary" })).toBeVisible();
  await page.goto("/m/sales");
  const form = page.locator("form").first();
  await form.getByLabel(/Amount/).fill("99");
  await form.getByLabel("Customer", { exact: true }).fill("CA should not save this");
  await form.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(/view-only/)).toBeVisible();
  await expect(page.getByRole("row", { name: /CA should not save this/ })).toHaveCount(0);
});

test("a manager can't take over the owner, and sign-in won't redirect off-site", async () => {
  await page.goto("/signout");
  await page.goto("/signin?from=%2F%2Fevil.example");
  await page.getByLabel("Email, phone or username").fill(manager.username);
  await page.getByLabel("Password").fill(manager.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/localhost:3100\/dashboard/);
  await page.goto("/settings?tab=team");
  page.once("dialog", (d) => d.accept("taken-over-123"));
  await page.getByRole("listitem").filter({ hasText: "Asha Test" }).getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByText("Only the owner can change the owner's account.")).toBeVisible();
});

test("password reset never reveals whether a login exists", async () => {
  await page.goto("/signout");
  await page.goto("/forgot");
  await page.getByLabel("Email, phone or username").fill("nobody@nowhere.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If that login exists/)).toBeVisible();
});

test("the cron endpoint needs its secret", async ({ request }) => {
  expect((await request.get("/api/cron")).status()).toBe(401);
  const ok = await request.get("/api/cron", { headers: { authorization: "Bearer e2e-secret" } });
  expect(ok.status()).toBe(200);
});
