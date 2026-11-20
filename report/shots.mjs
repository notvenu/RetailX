// Screenshots of RetailX for the report: a fresh demo grocery workspace with sample data, against a running server.
import { chromium } from "file:///d:/Coding/Projects/RetailX/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3200";
const OUT = new URL("./fig/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const shot = async (name, path, fn) => {
  if (path) await page.goto(BASE + path, { waitUntil: "networkidle" });
  if (fn) await fn();
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + name + ".png" });
  console.log("shot", name);
};

await page.goto(BASE + "/signup");
await page.getByLabel("Your name").fill("Demo Owner");
await page.getByLabel("Business name").fill("Demo Kirana Store");
await page.getByLabel("Email").fill(`demo-${Date.now()}@example.test`);
await page.getByLabel(/^Password/).fill("demo-pass-123");
await page.getByLabel("Confirm password").fill("demo-pass-123");
await page.getByRole("button", { name: "Create account and continue" }).click();
await page.waitForURL(/onboarding/);
await page.getByPlaceholder("e.g. Pune").fill("Amaravati");
await page.getByRole("button", { name: "Continue" }).click();
await page.getByRole("button", { name: /Retail store/ }).click();
await page.getByRole("button", { name: "Grocery & supermarket" }).click();
await shot("onboarding", null);
await page.getByRole("button", { name: "Continue" }).click();
await page.getByRole("switch", { name: "Do customers ever pay later?" }).click();
await page.getByRole("button", { name: "Build my workspace" }).click();
await page.getByText(/Built for a retail store/).waitFor();
for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Continue" }).click();
await page.getByRole("switch", { name: "Start with sample data" }).click();
await page.getByRole("button", { name: "Launch workspace" }).click();
await page.waitForURL(/dashboard/, { timeout: 90_000 });

await shot("dashboard", "/dashboard");
await shot("pos", "/pos", async () => {
  const s = page.getByLabel("Scan a barcode or search an item");
  await s.fill("SKU-1000"); await s.press("Enter");
  await s.fill("SKU-1001"); await s.press("Enter");
  await page.getByLabel("Customer phone").fill("9876500003");
});
await shot("forecasting", "/forecasting");
await shot("stock", "/forecasting?tab=stock");
await shot("cash", "/forecasting?tab=cash", async () => {
  await page.getByPlaceholder("250000").fill("300000");
  await page.getByRole("button", { name: "Start forecast" }).click();
  await page.getByRole("heading", { name: "13-week cash flow" }).waitFor();
});
await shot("insights", "/insights");
await shot("whatif", null, async () => {
  await page.getByRole("heading", { name: "What if…" }).scrollIntoViewIfNeeded();
  await page.getByRole("slider").nth(1).fill("5");
  await page.getByRole("slider").nth(2).fill("30");
});
await shot("reports", "/reports");
await shot("analytics", "/analytics");
await shot("ai", "/ai");
await shot("automations", "/automations");
await shot("payroll", "/m/payroll");
await browser.close();
