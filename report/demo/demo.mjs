// Start-to-end demo of RetailX against the running app (http://localhost:3000), on an empty database.
// Run: node report/demo/demo.mjs   → screenshots + video + demo-results.md in report/demo/
import { chromium, expect } from "@playwright/test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.DEMO_URL ?? "http://localhost:3000";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, "shots"), VIDEO = path.join(HERE, "video");
rmSync(SHOTS, { recursive: true, force: true }); rmSync(VIDEO, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true }); mkdirSync(VIDEO, { recursive: true });
expect.configure({ timeout: 20_000 });

const stamp = Date.now().toString(36);
const owner = { email: `demo-owner-${stamp}@example.test`, password: "demo-pass-123" };
const staff = { username: `cashier_${stamp}`, password: "cashier-pass-12" };
const ca = { username: `ca_${stamp}`, password: "ca-pass-123456" };
const PIN = "4321";
const day = (n) => new Date(Date.now() + 5.5 * 3600e3 + n * 864e5).toISOString().slice(0, 10);

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 }, recordVideo: { dir: VIDEO, size: { width: 1280, height: 800 } } });
const page = await context.newPage();
page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}`));
page.setDefaultTimeout(20_000);

const results = [];
let n = 0;
async function step(group, name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ group, name, ok: true, ms: Date.now() - t });
    console.log(`PASS  ${group} · ${name}`);
  } catch (e) {
    results.push({ group, name, ok: false, ms: Date.now() - t, why: String(e.message).split("\n").slice(0, 3).join(" ") });
    console.log(`FAIL  ${group} · ${name}\n      ${String(e.message).split("\n")[0]}`);
  }
  const file = `${String(++n).padStart(2, "0")}-${(group + "-" + name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}.png`;
  await page.screenshot({ path: path.join(SHOTS, file) }).catch(() => {});
}

const search = () => page.getByRole("textbox", { name: "Scan a barcode or search an item" });
const saveOnly = () => page.getByRole("button", { name: /Save only/ }).click();
const saved = () => page.getByText(/(Bill|Return|Stock in|Debit note) [A-Z/]*\d\d-\d\d\/\d+ saved/).first();
async function addRecord(url, values, extra) {
  await page.goto(url);
  const form = page.locator("form").first();
  for (const [label, v] of Object.entries(values)) {
    const re = new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const el = form.getByLabel(re).first();
    const tag = await el.evaluate((x) => x.tagName);
    if (tag === "SELECT") await el.selectOption(v); else await el.fill(String(v));
  }
  if (extra) await extra(form);
  await form.getByRole("button", { name: "Add" }).click();
}
const scan = async (code, qty) => { await search().fill(qty && qty !== 1 ? `${qty}*${code}` : code); await search().press("Enter"); };

/* ============ 1. start: account and onboarding ============ */
await step("Start", "Sign up", async () => {
  await page.goto(BASE + "/signup");
  await page.getByLabel("Your name").fill("Demo Owner");
  await page.getByLabel("Business name").fill("Fit Secrets Demo Store");
  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel(/^Password/).fill(owner.password);
  await page.getByLabel("Confirm password").fill(owner.password);
  await page.getByRole("button", { name: "Create account and continue" }).click();
  await expect(page).toHaveURL(/onboarding/);
});
await step("Start", "Onboarding: grocery shop, credit on, certificates + nutrition switched on, sample data", async () => {
  await page.getByPlaceholder("e.g. Pune").fill("Vijayawada");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Retail store/ }).click();
  await page.getByRole("button", { name: "Grocery & supermarket" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("switch", { name: "Do customers ever pay later?" }).click();
  await page.getByRole("button", { name: "Build my workspace" }).click();
  await expect(page.getByText(/Built for a retail store/)).toBeVisible();
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review & launch" })).toBeVisible();
  await page.getByRole("switch", { name: "Product certificates" }).click();
  await page.getByRole("switch", { name: "Nutrition labels" }).click();
  await page.getByRole("switch", { name: "Start with sample data" }).click();
  await page.getByRole("button", { name: "Launch workspace" }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 90_000 });
  await expect(page.getByText("You're looking at sample data.")).toBeVisible();
});

/* ============ 2. master data ============ */
await step("Stock", "Add products: wholesale price, expiry, batch, certificate, nutrition", async () => {
  await addRecord("/m/inventory", {
    Product: "Whey Protein 1kg", SKU: "WHEY1", "On hand": 30, Price: 2000, "Unit cost": 1500, MRP: 2400, "Wholesale price": 1800, "Wholesale from qty": 3,
    Barcode: "8900000000011", Expiry: day(200), Batch: "WP-2611",
    "Certificate link": "https://example.com/whey-lab-report.pdf", "Certified by": "NABL lab", "Certificate valid until": day(20),
    Ingredients: "Whey protein concentrate, cocoa, sweetener", "Nutrition per serving": "Energy 120 kcal; Protein 24 g; Fat 1.5 g; Carbohydrate 3 g",
    "Serving size": "30 g scoop", "Veg / non-veg": "Veg", Allergens: "Milk", "FSSAI licence": "10020042000123", Supplier: "Metro Wholesale",
  });
  await expect(page.getByRole("row", { name: /Whey Protein 1kg/ })).toBeVisible();
  await addRecord("/m/inventory", { Product: "Fresh curd 500g", SKU: "CURD1", "On hand": 24, Price: 45, "Unit cost": 30, Expiry: day(12), Batch: "C-07", Supplier: "Metro Wholesale" });
  await expect(page.getByRole("row", { name: /Fresh curd/ })).toBeVisible();
  await addRecord("/m/inventory", { Product: "Shaker bottle", SKU: "SHAKER1", "On hand": 15, Price: 300, "Unit cost": 120, Supplier: "Metro Wholesale" });
  await expect(page.getByRole("row", { name: /Shaker bottle/ })).toBeVisible();
  await addRecord("/m/inventory", { Product: "Old jam 200g", SKU: "JAM1", "On hand": 5, Price: 100, "Unit cost": 50, Expiry: day(-10), Supplier: "Metro Wholesale" });
  await expect(page.getByRole("row", { name: /Old jam/ })).toBeVisible();
});
await step("Customers", "Customer with credit limit, payment terms, group and referrer", async () => {
  await addRecord("/m/customers", { Name: "Demo Dev", Phone: "9876500011", "Credit limit": 5000, "Payment terms": 15, "Customer group": "Gym", "Referred by": "Kiran" });
  await expect(page.getByRole("row", { name: /Demo Dev/ })).toBeVisible();
});
await step("Offers", "Coupon and combo", async () => {
  await addRecord("/m/offers", { Offer: "Ten percent off", Type: "Coupon", "Coupon code": "DEMO10", "% off": 10, "Minimum bill": 500 });
  await expect(page.getByRole("row", { name: /Ten percent off/ })).toBeVisible();
  await addRecord("/m/offers", { Offer: "Gym starter", Type: "Combo", Items: "WHEY1, SHAKER1", "Combo price": 1950 });
  await expect(page.getByRole("row", { name: /Gym starter/ })).toBeVisible();
});
await step("Settings", "Counter & invoices: TCS, incentive, referral, modern layout, bank, terms", async () => {
  await page.goto("/settings?tab=counter");
  await page.getByLabel("TCS % on bills").fill("1");
  await page.getByLabel("Staff incentive % of net sales").fill("2");
  await page.getByLabel("Referral commission %").fill("2");
  await page.getByRole("radio", { name: "Modern" }).click();
  await page.getByLabel("Bank details on invoices").fill("HDFC Bank · A/c 50200012345678 · IFSC HDFC0001234");
  await page.getByLabel("Terms on invoices").fill("Goods once sold are exchanged within 7 days with the bill.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
  await page.getByLabel("New owner PIN").fill(PIN);
  await page.getByRole("button", { name: "Save PIN" }).click();
  await expect(page.getByText("PIN saved.")).toBeVisible();
});

/* ============ 3. the counter ============ */
let invoiceNo = "";
await step("Counter", "Sale: wholesale rate from qty 3, combo, coupon, TCS, cash", async () => {
  await page.goto("/pos");
  await page.getByRole("radio", { name: "Sale" }).click();
  await scan("WHEY1", 3);
  await expect(page.getByRole("textbox", { name: "Whey Protein 1kg price" })).toHaveValue("1800");
  await scan("SHAKER1");
  await expect(page.getByText(/Gym starter/)).toBeVisible();
  await page.getByRole("textbox", { name: "Coupon code" }).fill("DEMO10");
  await expect(page.getByText("Coupon DEMO10")).toBeVisible();
  await page.getByRole("checkbox", { name: /Collect TCS/ }).check();
  await expect(page.getByText("To collect")).toBeVisible();
  await page.getByRole("button", { name: "Check profit" }).click();
  await expect(page.getByText(/Profit/).first()).toBeVisible();
  await saveOnly();
  await expect(saved()).toBeVisible();
  invoiceNo = (await saved().textContent()).match(/(\d\d-\d\d\/\d+)/)[1];
});
await step("Counter", "Expired batch is refused", async () => {
  await scan("JAM1");
  await expect(page.getByText(/expired on/)).toBeVisible();
});
await step("Counter", "Credit sale: due date from payment terms", async () => {
  await scan("CURD1", 4);
  await page.getByRole("textbox", { name: "Customer phone" }).fill("9876500011");
  await page.getByRole("radio", { name: "Credit" }).click();
  await expect(page.getByText(/due in 15 days/)).toBeVisible();
  await saveOnly();
  await expect(saved()).toBeVisible();
  await page.getByRole("radio", { name: "Cash" }).click();
});
await step("Counter", "Credit limit stops a bill over ₹5,000", async () => {
  await scan("WHEY1", 3);
  await page.getByRole("textbox", { name: "Customer phone" }).fill("9876500011");
  await page.getByRole("radio", { name: "Credit" }).click();
  await expect(page.getByText(/Over credit limit by/)).toBeVisible();
  await page.getByRole("radio", { name: "Cash" }).click();
  await page.getByRole("button", { name: "Clear bill" }).click({ timeout: 3000 }).catch(() => {});
});
await step("Counter", "Return against the invoice (capped at what was sold)", async () => {
  await page.getByRole("radio", { name: "Return", exact: true }).click();
  await page.getByRole("textbox", { name: "Against invoice" }).fill(invoiceNo);
  await page.getByRole("button", { name: "Load bill" }).click();
  await expect(page.getByText(/Loaded what can still come back/)).toBeVisible();
  await page.getByRole("textbox", { name: "Whey Protein 1kg quantity" }).fill("1");
  await page.getByRole("button", { name: "Remove Shaker bottle" }).click();
  await saveOnly();
  await expect(page.getByText(/Return CN\/\d\d-\d\d\/\d+ saved/)).toBeVisible();
});
await step("Counter", "Return above what was sold is refused", async () => {
  await page.getByRole("textbox", { name: "Against invoice" }).fill(invoiceNo);
  await page.getByRole("button", { name: "Load bill" }).click();
  await expect(page.getByText(/Loaded what can still come back/)).toBeVisible();
  await page.getByRole("textbox", { name: "Whey Protein 1kg quantity" }).fill("9");
  await saveOnly();
  await expect(page.getByText(/can still be returned/)).toBeVisible();
  await page.getByRole("button", { name: "Clear bill" }).click();
});
await step("Counter", "Stock in, supplier return (debit note), scan-bill button", async () => {
  await page.getByRole("radio", { name: "Stock in" }).click();
  await expect(page.getByText("Scan supplier bill")).toBeVisible();
  await page.getByRole("textbox", { name: "Supplier name" }).fill("Metro Wholesale");
  await scan("CURD1", 10);
  await saveOnly();
  await expect(page.getByText(/Stock in GRN\/\d\d-\d\d\/\d+ saved/)).toBeVisible();
  await page.getByRole("radio", { name: "Supplier return" }).click();
  await scan("CURD1", 2);
  await saveOnly();
  await expect(page.getByText(/Debit note DN\/\d\d-\d\d\/\d+ saved/)).toBeVisible();
  await page.getByRole("radio", { name: "Sale" }).click();
});
await step("Counter", "Offline: bill waits on the device and is sent once when back online", async () => {
  await page.goto("/pos");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Counter" })).toBeVisible();
  await scan("SHAKER1");
  await saveOnly();
  await expect(page.getByText(/1 bill waiting to be sent/)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/waiting to be sent/)).toHaveCount(0, { timeout: 40_000 });
});
await step("Counter", "Quotation billed in one click", async () => {
  await page.goto("/settings?tab=modules");
  await page.getByLabel("Use Quotations").click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Saved\./)).toBeVisible();
  await addRecord("/m/quotes", { Customer: "Quote Qasim", "Quote amount": 500, "Item / service": "Installation visit" });
  const row = page.getByRole("row", { name: /Quote Qasim/ });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "Bill this quotation at the counter" }).click();
  await expect(page.getByLabel("Installation visit price")).toHaveValue("500");
  await saveOnly();
  await expect(saved()).toBeVisible();
});
await step("Counter", "Invoice: modern layout, bank, terms, TCS line, e-way bill JSON", async () => {
  await page.goto("/m/sales");
  // the sale itself, not the credit note made against it (its number contains this one)
  const link = page.getByRole("row").filter({ has: page.getByRole("cell", { name: invoiceNo, exact: true }) }).first().getByRole("link", { name: "Invoice" });
  await page.goto(await link.getAttribute("href"));
  await expect(page.getByText("Bank details")).toBeVisible();
  await expect(page.getByText("Goods once sold are exchanged")).toBeVisible();
  await expect(page.getByText("TCS collected")).toBeVisible();
  await page.getByRole("button", { name: "E-way bill" }).click();
  await page.getByLabel("Distance in km").fill("120");
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  expect((await dl).suggestedFilename()).toMatch(/^EWB_/);
});
await step("Counter", "Day close with cash count", async () => {
  await page.goto("/dayclose");
  await page.getByLabel("Or type the total counted").fill("1");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Close the day" }).click();
  await expect(page.getByText(/Day closed · cash/)).toBeVisible();
});

/* ============ 4. accounting ============ */
await step("Books", "Switch on Payments, Journal and Fixed assets", async () => {
  await page.goto("/books");
  await page.getByRole("button", { name: "Switch on Payments, Journal & Fixed assets" }).click();
  await expect(page.getByRole("link", { name: "Payments" })).toBeVisible();
});
await step("Books", "Payment in with TDS settles dues; journal entry; fixed asset", async () => {
  await addRecord("/m/payments", { "Customer / supplier": "Demo Dev", Amount: 150, TDS: 10, Mode: "Bank" });
  await expect(page.getByRole("row", { name: /Demo Dev/ })).toBeVisible();
  await addRecord("/m/journal", { "Debit account": "Bank", "Credit account": "Opening balances", Amount: 500000, Narration: "Opening bank balance" });
  await expect(page.getByRole("row", { name: /Opening balances/ })).toBeVisible();
  await addRecord("/m/assets", { Asset: "Cold-storage fridge", Cost: 60000, "Useful life": 5 });
  await expect(page.getByRole("row", { name: /fridge/ })).toBeVisible();
});
await step("Books", "Profit & loss, balance sheet, trial balance, ledger", async () => {
  await page.goto("/books");
  await expect(page.getByRole("heading", { name: "Income" })).toBeVisible();
  await page.getByRole("link", { name: "Balance sheet" }).click();
  await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible();
  await page.getByRole("link", { name: "Trial balance" }).click();
  const [dr, cr] = (await page.getByText(/^₹[\d,.]+ = ₹[\d,.]+$/).textContent()).split(" = ");
  expect(dr).toBe(cr);
  await page.getByRole("link", { name: "Cash", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: /Ledger: Cash/ })).toBeVisible();
});
await step("Books", "Bank reconciliation from a statement", async () => {
  await page.goto("/books?tab=bank");
  await page.getByLabel("Bank statement CSV").fill("Date,Narration,Withdrawal,Deposit,Balance\n" + `${day(0).split("-").reverse().join("/")},UPI-RANDOM,,236.00,1000\n${day(0).split("-").reverse().join("/")},BANK CHARGES,15.00,,985`);
  await expect(page.getByText(/statement lines match the books/)).toBeVisible();
  await expect(page.getByText("In the bank, not in the books")).toBeVisible();
});
await step("Books", "Verify my data", async () => {
  await page.goto("/books?tab=verify");
  await expect(page.getByRole("heading", { name: "Verify my data" })).toBeVisible();
  await expect(page.getByText(/Trial balance balances/)).toBeVisible();
});
await step("Books", "Export to Tally (XML) and import Tally masters", async () => {
  await page.goto("/books");
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export to Tally" }).click();
  expect((await dl).suggestedFilename()).toMatch(/^tally-.*\.xml$/);
  await page.goto("/m/customers");
  await page.getByRole("button", { name: "Import" }).click();
  await page.locator("textarea").last().fill(`<ENVELOPE><BODY><TALLYMESSAGE><LEDGER NAME="Tally Traders"><PARENT>Sundry Debtors</PARENT><LEDGERMOBILE>9876500088</LEDGERMOBILE></LEDGER></TALLYMESSAGE></BODY></ENVELOPE>`);
  await page.getByRole("button", { name: "Import from Tally" }).click();
  await expect(page.getByText(/Imported 1 customers/)).toBeVisible();
});

/* ============ 5. insights, planning, autopilot ============ */
await step("Insights", "Dues with overdue, idle and expiring stock, what-if, suppliers", async () => {
  await page.goto("/insights");
  for (const h of ["Who owes you", "Stock that is not moving", "Expiring soon", "What if…", "Suppliers", "Customers", "Counter exceptions"])
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Overdue" })).toBeVisible();
  const meta = page.getByText(/would run out before stock arrives/);
  const before = await meta.textContent();
  await page.getByRole("slider").nth(1).fill("14");
  await expect(meta).not.toHaveText(before ?? "");
});
await step("Insights", "Certificates running out are listed", async () => {
  await expect(page.getByRole("heading", { name: "Certificates" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Whey Protein 1kg/ }).first()).toBeVisible();
});
await step("Insights", "Near-expiry offer put live in one tap, then applied at the counter", async () => {
  await page.getByRole("button", { name: /Put \d+% off live/ }).first().click();
  await expect(page.getByText(/Live: \d+% off at the counter/)).toBeVisible();
  await page.goto("/pos");
  await page.getByRole("radio", { name: "Sale" }).click();
  await scan("CURD1");
  await expect(page.getByText(/Near-expiry offer \d+% off/)).toBeVisible();
  await page.getByRole("button", { name: "Clear bill" }).click({ timeout: 3000 }).catch(() => {});
  page.once("dialog", (d) => d.accept());
});
await step("Forecasting", "Model comparison, stock plan and 13-week cash flow", async () => {
  await page.goto("/forecasting");
  await expect(page.getByRole("heading", { name: "Model comparison" })).toBeVisible();
  await page.goto("/forecasting?tab=stock");
  await expect(page.getByRole("heading", { name: "What to order" })).toBeVisible();
  await page.goto("/forecasting?tab=cash");
  await page.getByPlaceholder("250000").fill("300000");
  await page.getByRole("button", { name: "Start forecast" }).click();
  await expect(page.getByRole("heading", { name: "13-week cash flow" })).toBeVisible();
});
await step("Forecasting", "Place a suggested order; restock autopilot on and run", async () => {
  // the sample data's demo items are already on order; a new product that sells has none open
  await addRecord("/m/inventory", { Product: "Mango pickle", SKU: "PICKLE1", "On hand": 0, Price: 90, "Unit cost": 60, Supplier: "Shree Traders" });
  await expect(page.getByRole("row", { name: /Mango pickle/ })).toBeVisible();
  await addRecord("/m/sales", { Date: day(-1), Item: "Mango pickle", Qty: 3, Amount: 270 });
  await expect(page.getByRole("row", { name: /Mango pickle/ }).first()).toBeVisible();
  await page.goto("/forecasting?tab=stock");
  await page.getByRole("row", { name: /Mango pickle/ }).getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText("Ordered", { exact: true }).first()).toBeVisible();
  await page.getByRole("slider").first().fill("12");
  await page.getByLabel("Autopilot on").click();
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByLabel("Autopilot weekly cap").fill("1000000");
  await page.getByRole("button", { name: "Save autopilot" }).click();
  await expect(page.getByText(/Autopilot is on/)).toBeVisible();
  await page.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByText(/Placed \d+ orders?\.|Nothing to order right now\./)).toBeVisible();
});

/* ============ 6. AI and market ============ */
await step("AI team", "CFO answers with a live model (free Groq key), using the books", async () => {
  await page.goto("/ai/cfo");
  await expect(page.getByText(/running on built-in rules/)).toHaveCount(0);
  await page.getByLabel("Message Arjun").fill("Which customers owe us money, and how much overall? Be brief.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Which customers owe us money")).toBeVisible();
  await page.waitForFunction(() => !/Checking|Reading|Thinking|Running/.test(document.body.innerText), null, { timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(15_000);
  const body = await page.locator("body").innerText();
  if (/built-in rules|rate limit|rejected|returned an error|couldn't be reached/.test(body)) throw new Error("AI did not answer: " + (body.match(/(built-in rules|rate limit|rejected|returned an error|couldn't be reached)[^\n]*/) ?? [])[0]);
});
await step("AI team", "AI roles page and approvals", async () => {
  await page.goto("/ai");
  await expect(page.getByText(/Arjun/).first()).toBeVisible();
  await page.goto("/approvals");
  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
});
// the free tier counts tokens per minute: let the chat above settle before the web search
await page.waitForTimeout(65_000);
await step("Market", "Market comparison, own figure, and live web research (Groq browser search)", async () => {
  await page.goto("/market");
  await expect(page.getByRole("heading", { name: "Your KPIs against the market" })).toBeVisible();
  await page.getByRole("button", { name: "Research current figures" }).click();
  await expect(page.getByRole("status")).toBeVisible({ timeout: 150_000 });
  const t = await page.getByRole("status").innerText();
  if (/needs web search|failed|busy|didn't finish/i.test(t)) throw new Error("research: " + t);
});
await step("Automations", "Automations and tasks open", async () => {
  await page.goto("/automations");
  await expect(page.locator("main, body").first()).toContainText(/Automations/);
  await page.goto("/tasks");
  await expect(page.locator("body")).toContainText(/Tasks|To do/);
});

/* ============ 7. reports and labels ============ */
await step("Reports", "GST summary, GSTR-9, Form 27EQ, staff & referrals, downloads", async () => {
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "GSTR-3B summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /GSTR-9: year/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Form 27EQ/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Staff & referrals" })).toBeVisible();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "GSTR-9 summary" }).click();
  expect((await dl).suggestedFilename()).toMatch(/^GSTR9/);
});
await step("Labels", "Barcode labels and pack labels with nutrition + certificate QR", async () => {
  await page.goto("/labels");
  await page.getByRole("button", { name: "One each" }).click();
  await expect(page.getByRole("button", { name: /Print \d+ labels/ })).toBeEnabled();
  await page.getByRole("link", { name: "Pack labels" }).click();
  await expect(page.getByText(/Pack labels with nutrition/)).toBeVisible(); // the other tab also has "One each": wait for the switch
  await page.getByRole("button", { name: "One each" }).click();
  await expect(page.getByText(/Nutrition per 30 g scoop/)).toBeVisible();
  await expect(page.getByText(/Protein/).first()).toBeVisible();
  await expect(page.getByRole("img", { name: "QR code to the certificate" }).first()).toBeVisible();
});
await step("Stock", "Transfer stock between locations", async () => {
  await page.goto("/settings");
  await page.getByLabel("Locations").fill("2");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Saved\./)).toBeVisible();
  await page.goto("/m/inventory");
  await page.getByRole("button", { name: /Transfer stock between locations/ }).click();
  const sel = page.getByLabel("Item to move");
  const value = await sel.evaluate((el) => [...el.options].find((o) => /Shaker bottle/.test(o.text))?.value);
  await sel.selectOption(value);
  await page.getByLabel("Move to location").fill("Location 2");
  await page.getByLabel("Quantity to move").fill("3");
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByText("Moved 3 to Location 2.")).toBeVisible();
});

/* ============ 8. team, cashier limits + owner PIN, accountant ============ */
await step("Team", "Add a cashier and an accountant; cashier limited to 5% discount", async () => {
  await page.goto("/settings?tab=team");
  for (const [name, who, role] of [["Ravi Cashier", staff, "staff"], ["Chandra CA", ca, "ca"]]) {
    await page.getByRole("button", { name: "Add a person" }).click();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Email, phone or username").fill(who.username);
    await page.getByLabel("Role", { exact: true }).selectOption(role);
    await page.getByLabel("Temporary password").fill(who.password);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(`@${who.username}`)).toBeVisible();
  }
  await page.getByLabel("Staff maximum discount percent").fill("5");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Saved\./)).toBeVisible();
});
await step("Team", "Cashier: discount over the limit is refused, owner PIN allows it", async () => {
  await page.goto("/signout");
  await page.getByLabel("Email, phone or username").fill(staff.username);
  await page.getByLabel("Password").fill(staff.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/pos");
  await page.getByRole("radio", { name: "Sale" }).click();
  await scan("SHAKER1");
  await page.getByRole("textbox", { name: "Bill discount, amount or percent" }).fill("30%");
  await expect(page.getByText(/over your limit of 5%/).first()).toBeVisible();
  await saveOnly();
  await expect(page.getByText(/Or have the owner type their PIN/)).toBeVisible();
  await page.getByLabel("Owner PIN").fill("0000");
  await saveOnly();
  await expect(page.getByText("That PIN isn't the owner's.")).toBeVisible();
  await page.getByLabel("Owner PIN").fill(PIN);
  await saveOnly();
  await expect(saved()).toBeVisible();
});
await step("Team", "Cashier cannot open Settings or Books", async () => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/denied=settings/);
});
await step("Team", "Accountant (view-only) reads reports, every save is refused", async () => {
  await page.goto("/signout");
  await page.getByLabel("Email, phone or username").fill(ca.username);
  await page.getByLabel("Password").fill(ca.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "GSTR-3B summary" })).toBeVisible();
  await page.goto("/m/sales");
  const form = page.locator("form").first();
  await form.getByLabel(/Amount/).fill("99");
  await form.getByLabel("Customer", { exact: true }).fill("CA should not save this");
  await form.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(/view-only/)).toBeVisible();
});
await step("Team", "Owner sees the cashier's sales in Staff & referrals, and the PIN override in the audit log", async () => {
  await page.goto("/signout");
  await page.getByLabel("Email, phone or username").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/reports");
  await expect(page.getByRole("row", { name: /Ravi Cashier/ })).toBeVisible();
  await page.goto("/settings?tab=audit");
  await expect(page.getByText(/owner PIN/).first()).toBeVisible();
});

/* ============ report ============ */
await page.goto("/dashboard");
await page.screenshot({ path: path.join(SHOTS, "99-final-dashboard.png") }).catch(() => {});
const video = page.video();
await context.close();
await browser.close();
const vpath = video ? await video.path().catch(() => "") : "";

const pass = results.filter((r) => r.ok).length;
const md = [`# RetailX start-to-end demo`, ``, `Run on an empty database, ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. **${pass} of ${results.length} steps passed.**`, ``,
  `| # | Area | Step | Result | Time |`, `|---|---|---|---|---|`,
  ...results.map((r, i) => `| ${i + 1} | ${r.group} | ${r.name} | ${r.ok ? "PASS" : "**FAIL** — " + r.why.replace(/\|/g, "/")} | ${(r.ms / 1000).toFixed(1)} s |`), ``,
  `Screenshots: report/demo/shots · Video: ${vpath ? path.relative(path.join(HERE, "..", ".."), vpath).replace(/\\/g, "/") : "report/demo/video"}`].join("\n");
writeFileSync(path.join(HERE, "demo-results.md"), md);
console.log(`\n${pass}/${results.length} steps passed`);
process.exit(pass === results.length ? 0 : 1);
