// Narrated product film of RetailX: a title card before every feature, subtitles, calm pacing.
// Run: DEMO_URL=http://localhost:3300 node report/demo/film.mjs   (server on an EMPTY database)
// Output: report/demo/film/raw.webm  (convert with ffmpeg; see report/demo/film/README.md)
import { chromium } from "@playwright/test";
import { mkdirSync, rmSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.DEMO_URL ?? "http://localhost:3300";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "film");
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });

const stamp = Date.now().toString(36);
const owner = { email: `owner-${stamp}@example.test`, password: "demo-pass-123" };
const staff = { username: `cashier_${stamp}`, password: "cashier-pass-12" };
const ca = { username: `ca_${stamp}`, password: "ca-pass-123456" };
const PIN = "4321";
const day = (n) => new Date(Date.now() + 5.5 * 3600e3 + n * 864e5).toISOString().slice(0, 10);

const W = 1440, H = 810;
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: BASE, viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } } });

/* ---------- on-screen layer: title card, subtitle bar, cursor dot (survives navigation) ---------- */
await context.addInitScript(() => {
  const css = `
  #f-card{position:fixed;inset:0;z-index:2147483647;background:#1d2433;color:#fcfcfb;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;font-family:"Public Sans",system-ui,sans-serif;opacity:1;transition:opacity .45s ease;padding:0 12%;pointer-events:none}
  #f-card.off{opacity:0;pointer-events:none}
  #f-card small{font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:#8a94a6}
  #f-card h1{font-size:46px;line-height:1.15;font-weight:700;letter-spacing:-.02em;margin:0}
  #f-card p{font-size:21px;line-height:1.45;color:#c9cfdb;margin:0;max-width:880px}
  #f-cap{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:2147483646;max-width:76%;background:rgba(29,36,51,.9);color:#fff;font:500 19px/1.4 "Public Sans",system-ui,sans-serif;padding:10px 20px;border-radius:6px;text-align:center;pointer-events:none;opacity:1;transition:opacity .3s ease}
  #f-cap.off{opacity:0}
  #f-cur{position:fixed;z-index:2147483645;width:16px;height:16px;margin:-8px 0 0 -8px;border:2px solid #3538cd;background:rgba(53,56,205,.18);border-radius:50%;pointer-events:none;transition:left .18s ease,top .18s ease;left:-50px;top:-50px}`;
  const get = () => { try { return JSON.parse(sessionStorage.getItem("film") || "{}"); } catch { return {}; } };
  const put = (s) => { try { sessionStorage.setItem("film", JSON.stringify(s)); } catch {} };
  const mk = (id, tag = "div") => { let e = document.getElementById(id); if (!e) { e = document.createElement(tag); e.id = id; document.documentElement.appendChild(e); } return e; };
  const render = () => {
    if (!document.documentElement) return;
    if (!document.getElementById("f-style")) { const st = document.createElement("style"); st.id = "f-style"; st.textContent = css; document.documentElement.appendChild(st); }
    const s = get();
    const card = mk("f-card"), cap = mk("f-cap"); mk("f-cur");
    if (s.card) { card.innerHTML = `<small></small><h1></h1><p></p>`; card.children[0].textContent = s.card.k || ""; card.children[1].textContent = s.card.t; card.children[2].textContent = s.card.s || ""; card.classList.remove("off"); }
    else card.classList.add("off");
    if (s.cap) { cap.textContent = s.cap; cap.classList.remove("off"); } else cap.classList.add("off");
  };
  window.__film = { set: (patch) => { put({ ...get(), ...patch }); render(); } };
  render();
  document.addEventListener("DOMContentLoaded", render);
  document.addEventListener("mousemove", (e) => { const c = document.getElementById("f-cur"); if (c) { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; } }, true);
});

const page = await context.newPage();
page.setDefaultTimeout(15_000);
page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}`));

/* ---------- helpers ---------- */
const wait = (ms) => page.waitForTimeout(ms);
const film = (patch) => page.evaluate((p) => window.__film?.set(p), patch).catch(() => {});
const say = async (text, minMs = 0) => { await film({ cap: text }); await wait(Math.max(minMs, 1500 + text.length * 38)); };
const mute = () => film({ cap: "" });
const failures = [];
let featureNo = 0;
// A feature: title card (over whatever is on screen), set up the page underneath, hold, fade out.
async function feature(title, sub, setup) {
  featureNo++;
  await film({ cap: "", card: { k: `Feature ${featureNo}`, t: title, s: sub } });
  await wait(300);
  try { await setup?.(); } catch (e) { failures.push(`${title} (setup): ${String(e.message).split("\n")[0]}`); console.log(`FAIL setup ${title}: ${String(e.message).split("\n")[0]}`); }
  await wait(2600);
  await film({ card: null });
  await wait(600);
}
// Run one beat; a failure is recorded and the film carries on.
async function beat(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); }
  catch (e) {
    failures.push(`${name}: ${String(e.message).split("\n")[0]}`);
    console.log(`FAIL ${name}: ${String(e.message).split("\n")[0]}`);
    await page.screenshot({ path: path.join(OUT, `fail-${failures.length}.png`) }).catch(() => {});
  }
}
async function scroll(total, steps = 14, gap = 140) {
  await page.mouse.move(W * 0.62, H * 0.5);
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, total / steps); await wait(gap); }
  await wait(500);
}
const top = async () => { await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll("main, [class*=overflow]").forEach((e) => (e.scrollTop = 0)); }); await wait(400); };
async function type(loc, text, delay = 35) { await loc.click(); await loc.fill(""); await loc.pressSequentially(String(text), { delay }); await wait(250); }
async function fillForm(form, values) {
  for (const [label, v] of Object.entries(values)) {
    const re = new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const el = form.getByLabel(re).first();
    const tag = await el.evaluate((x) => x.tagName);
    if (tag === "SELECT") await el.selectOption(v); else await el.fill(String(v));
    await wait(120);
  }
}
async function addRecord(url, values) {
  await page.goto(url);
  const form = page.locator("form").first();
  await fillForm(form, values);
  await wait(500);
  await form.getByRole("button", { name: "Add" }).click();
}
const search = () => page.getByRole("textbox", { name: "Scan a barcode or search an item" });
const saveOnly = () => page.getByRole("button", { name: /Save only/ }).click();
const saved = () => page.getByText(/(Bill|Return|Stock in|Debit note) [A-Z/]*\d\d-\d\d\/\d+ saved/).first();
const scan = async (code, qty) => { await search().fill(""); await search().pressSequentially(qty && qty !== 1 ? `${qty}*${code}` : code, { delay: 60 }); await search().press("Enter"); await wait(500); };
const signIn = async (id, pw) => {
  await page.goto("/signout");
  await type(page.getByLabel("Email, phone or username"), id, 25);
  await type(page.getByLabel("Password"), pw, 25);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard/);
};

/* =====================================================================================
   FILM
   ===================================================================================== */
await page.goto("/");
await film({ card: { k: "Product demo", t: "RetailX", s: "One workspace for a small business: billing, stock, books, GST, forecasts and an AI leadership team. Shown start to finish." } });
await wait(4200);
await film({ card: null }); await wait(600);

/* 1 ---------------------------------------------------------------- public site */
await feature("The public site", "What RetailX is, who it is for and how it works", async () => { await page.goto("/"); });
await beat("site", async () => {
  await say("The home page explains the product in plain words.");
  await scroll(1400);
  await page.goto("/features"); await say("Features: everything a shop needs, grouped by job."); await scroll(1500);
  await page.goto("/how-it-works"); await say("How it works: sign up, describe the business, get a workspace built around it."); await scroll(1100);
  await page.goto("/about"); await say("About, with a contact form for questions."); await scroll(800);
  await mute();
});

/* 2 ---------------------------------------------------------------- accounts */
await feature("Accounts and sign-in", "Email, phone or username. Each login belongs to one business and one role.", async () => { await page.goto("/signin"); });
await beat("signin pages", async () => {
  await say("Sign in with an email, a phone number or a username.");
  await page.goto("/forgot"); await say("Forgotten passwords are reset by email or WhatsApp.");
  await page.goto("/signup"); await say("Sign-up is rate-limited. One form creates the business and its owner login.");
  await type(page.getByLabel("Your name"), "Demo Owner");
  await type(page.getByLabel("Business name"), "Nandan Provisions");
  await type(page.getByLabel("Email"), owner.email, 20);
  await type(page.getByLabel(/^Password/), owner.password, 20);
  await type(page.getByLabel("Confirm password"), owner.password, 20);
  await wait(500);
  await page.getByRole("button", { name: "Create account and continue" }).click();
  await page.waitForURL(/onboarding/);
  await mute();
});

/* 3 ---------------------------------------------------------------- onboarding */
await feature("Guided onboarding", "Ten steps with a live preview. The workspace is built around the business.", null);
await beat("onboarding", async () => {
  await say("Step 1: basics such as the city, GSTIN, UPI ID, opening cash and language.");
  await type(page.getByPlaceholder("e.g. Pune"), "Vijayawada");
  await page.getByRole("button", { name: "Continue" }).click(); await wait(500);
  await say("Step 2: the industry and category. Here, a grocery store.");
  await page.getByRole("button", { name: /Retail store/ }).click(); await wait(700);
  await page.getByRole("button", { name: "Grocery & supermarket" }).click(); await wait(900);
  await page.getByRole("button", { name: "Continue" }).click(); await wait(500);
  await say("Step 3: how the business works. Customers who pay later switch on credit and dues.");
  await page.getByRole("switch", { name: "Do customers ever pay later?" }).click(); await wait(900);
  await page.getByRole("button", { name: "Build my workspace" }).click();
  await page.getByText(/Built for a retail store/).waitFor();
  await say("RetailX proposes a workspace. Every part can be edited.");
  const steps = ["Modules: the record types the business keeps.", "KPIs: the numbers it will be measured on.", "Forecasts: which series to project.", "AI team: the roles that advise the owner.", "Team and access: who can see and do what.", "Theme: colours and look."];
  for (const s of steps) { await say(s, 1800); await page.getByRole("button", { name: "Continue" }).click(); await wait(500); }
  await page.getByRole("heading", { name: "Review & launch" }).waitFor();
  await say("Last step: optional product certificates and nutrition labels, and six months of sample data.");
  await page.getByRole("switch", { name: "Product certificates" }).click(); await wait(500);
  await page.getByRole("switch", { name: "Nutrition labels" }).click(); await wait(500);
  await page.getByRole("switch", { name: "Start with sample data" }).click(); await wait(900);
  await page.getByRole("button", { name: "Launch workspace" }).click();
  await page.waitForURL(/dashboard/, { timeout: 90_000 });
  await mute();
});

/* 4 ---------------------------------------------------------------- dashboard */
await feature("Dashboard", "Tiles you can move and resize. Personal layouts. Four languages for everyday screens.", async () => { await page.goto("/dashboard"); });
await beat("dashboard", async () => {
  await say("The dashboard shows the KPIs that matter to this business, filled here with sample data.");
  await scroll(900, 10);
  await top();
  await beat("customise", async () => {
    await page.getByRole("button", { name: /Customi[sz]e|Edit layout|Arrange/i }).first().click({ timeout: 4000 });
    await say("Tiles can be resized, reconfigured or removed.");
    await page.getByRole("button", { name: "Wider" }).first().click({ timeout: 3000 }); await wait(700);
    await page.getByRole("button", { name: /Cancel|Done|Save/i }).first().click({ timeout: 3000 }); await wait(600);
  });
  await say("The language switch changes navigation, titles and the everyday screens.");
  await page.getByRole("button", { name: /Demo Owner/ }).click(); await wait(600);
  await page.locator("select").filter({ has: page.locator("option", { hasText: "हिन्दी" }) }).first().selectOption({ label: "हिन्दी" }); await wait(2200);
  await say("Here in Hindi.", 2200);
  // the open menu has a full-screen backdrop: it is still open, so switch back from inside it
  await page.locator("select").filter({ has: page.locator("option", { hasText: "हिन्दी" }) }).first().selectOption("en"); await wait(1800);
  await page.mouse.click(300, 500); await wait(500);
  await page.reload(); await wait(800);
  await mute();
});

/* 5 ---------------------------------------------------------------- records */
await feature("Records", "18 module templates. Quick entry, search, sort, columns, import, history and a recycle bin.", async () => { await page.goto("/m/inventory"); });
await beat("records", async () => {
  await say("Stock is a module. Quick entry sits at the top and works well on a phone.");
  await page.goto("/m/inventory");
  const form = page.locator("form").first();
  await say("Add a product with price, wholesale price, expiry, batch, a certificate and nutrition details.");
  await fillForm(form, {
    Product: "Whey Protein 1kg", SKU: "WHEY1", "On hand": 30, Price: 2000, "Unit cost": 1500, MRP: 2400, "Wholesale price": 1800, "Wholesale from qty": 3,
    Barcode: "8900000000011", Expiry: day(200), Batch: "WP-2611",
    "Certificate link": "https://example.com/whey-lab-report.pdf", "Certified by": "NABL lab", "Certificate valid until": day(20),
    Ingredients: "Whey protein concentrate, cocoa, sweetener", "Nutrition per serving": "Energy 120 kcal; Protein 24 g; Fat 1.5 g; Carbohydrate 3 g",
    "Serving size": "30 g scoop", "Veg / non-veg": "Veg", Allergens: "Milk", "FSSAI licence": "10020042000123", Supplier: "Metro Wholesale",
  });
  await form.getByRole("button", { name: "Add" }).click();
  await page.getByRole("row", { name: /Whey Protein 1kg/ }).waitFor(); await wait(800);
  for (const v of [
    { Product: "Fresh curd 500g", SKU: "CURD1", "On hand": 24, Price: 45, "Unit cost": 30, Expiry: day(12), Batch: "C-07", Supplier: "Metro Wholesale" },
    { Product: "Shaker bottle", SKU: "SHAKER1", "On hand": 15, Price: 300, "Unit cost": 120, Supplier: "Metro Wholesale" },
    { Product: "Old jam 200g", SKU: "JAM1", "On hand": 5, Price: 100, "Unit cost": 50, Expiry: day(-10), Supplier: "Metro Wholesale" },
  ]) {
    await fillForm(form, v); await form.getByRole("button", { name: "Add" }).click();
    await page.getByRole("row", { name: new RegExp(v.Product) }).first().waitFor(); await wait(500);
  }
  await say("Search, sort and choose columns. Views can be saved.");
  const box = page.getByRole("searchbox").or(page.getByPlaceholder(/Search/i)).first();
  await type(box, "whey", 80); await wait(900); await box.fill(""); await wait(400);
  await beat("columns", async () => { await page.getByRole("button", { name: "Columns" }).click({ timeout: 3000 }); await wait(1200); await page.keyboard.press("Escape"); await page.mouse.click(W / 2, 40); });
  await beat("sort", async () => { await page.getByLabel("Sort by").selectOption({ index: 1 }); await wait(900); });
  await say("Every record keeps its history. Deleted records wait 30 days in a recycle bin and can be restored.");
  await beat("history", async () => { await page.getByRole("button", { name: /History/i }).first().click({ timeout: 3000 }); await wait(1800); await page.getByRole("button", { name: "Close history" }).click(); });
  await beat("recycle", async () => { await page.getByRole("button", { name: /Recycle|Bin|Deleted/i }).first().click({ timeout: 3000 }); await wait(1800); await page.getByRole("button", { name: "Close recycle bin" }).click(); });
  await say("Import takes CSV exports from Tally, Vyapar, Busy or a bank statement and maps the columns by itself.");
  await beat("import", async () => { await page.getByRole("button", { name: "Import" }).click(); await wait(2800); await page.getByRole("button", { name: "Close import" }).click(); });
  await mute();
});

/* 6 ---------------------------------------------------------------- customers and offers */
await feature("Customers and offers", "Credit limits and payment terms per customer. Coupons and combos applied at the counter.", async () => { await page.goto("/m/customers"); });
await beat("customers", async () => {
  await say("A customer with a phone number, a credit limit, payment terms, a group and who referred them.");
  await addRecord("/m/customers", { Name: "Demo Dev", Phone: "9876500011", "Credit limit": 5000, "Payment terms": 15, "Customer group": "Gym", "Referred by": "Kiran" });
  await page.getByRole("row", { name: /Demo Dev/ }).waitFor(); await wait(1200);
});
await beat("offers", async () => {
  await say("Offers: a percentage coupon with a minimum bill, and a combo of two items at one price.");
  await addRecord("/m/offers", { Offer: "Ten percent off", Type: "Coupon", "Coupon code": "DEMO10", "% off": 10, "Minimum bill": 500 });
  await page.getByRole("row", { name: /Ten percent off/ }).waitFor(); await wait(700);
  const form = page.locator("form").first();
  await fillForm(form, { Offer: "Gym starter", Type: "Combo", Items: "WHEY1, SHAKER1", "Combo price": 1950 });
  await form.getByRole("button", { name: "Add" }).click();
  await page.getByRole("row", { name: /Gym starter/ }).waitFor(); await wait(1000);
  await mute();
});

/* 7 ---------------------------------------------------------------- counter settings */
await feature("Counter and invoice settings", "TCS, staff incentive, referral commission, invoice layout, bank details, terms and an owner PIN.", async () => { await page.goto("/settings?tab=counter"); });
await beat("counter settings", async () => {
  await say("Tax collected at source, incentive and referral percentages.");
  await type(page.getByLabel("TCS % on bills"), "1");
  await type(page.getByLabel("Staff incentive % of net sales"), "2");
  await type(page.getByLabel("Referral commission %"), "2");
  await say("Three A4 invoice layouts, with bank details and terms printed on them.");
  await page.getByRole("radio", { name: "Modern" }).click(); await wait(500);
  await type(page.getByLabel("Bank details on invoices"), "HDFC Bank · A/c 50200012345678 · IFSC HDFC0001234", 15);
  await type(page.getByLabel("Terms on invoices"), "Goods once sold are exchanged within 7 days with the bill.", 15);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText(/^Saved\./).waitFor(); await wait(900);
  await say("An owner PIN lets a cashier go past their limits with the owner's say-so. It is stored hashed.");
  await type(page.getByLabel("New owner PIN"), PIN, 120);
  await page.getByRole("button", { name: "Save PIN" }).click();
  await page.getByText("PIN saved.").waitFor(); await wait(1000);
  await mute();
});

/* 8 ---------------------------------------------------------------- counter */
let invoiceNo = "";
await feature("The billing counter", "Scan or search, hold several bills, discounts, payment modes, UPI QR, returns, offers and stock-in.", async () => { await page.goto("/pos"); await page.getByRole("radio", { name: "Sale" }).click(); });
await beat("counter sale", async () => {
  await say("Type or scan a code. Prefix a quantity to bill several: 3 times the whey.");
  await scan("WHEY1", 3);
  await page.getByRole("textbox", { name: "Whey Protein 1kg price" }).waitFor();
  await say("Three or more switches to the wholesale rate by itself.");
  await scan("SHAKER1");
  await say("The shaker completes the combo, so the combo price is applied.");
  await page.getByText(/Gym starter/).waitFor();
  await type(page.getByRole("textbox", { name: "Coupon code" }), "DEMO10", 90);
  await page.getByText("Coupon DEMO10").waitFor();
  await page.getByRole("checkbox", { name: /Collect TCS/ }).check(); await wait(600);
  await say("Check profit shows the margin on this bill before it is saved. The cashier sees only what the owner allows.");
  await page.getByRole("button", { name: "Check profit" }).click(); await wait(1800);
  await say("Cash, UPI, Card or Credit. UPI shows a QR for the exact amount.");
  await beat("upi", async () => { await page.getByRole("radio", { name: "UPI" }).click({ timeout: 3000 }); await wait(2200); await page.getByRole("radio", { name: "Cash" }).click(); });
  await saveOnly();
  await saved().waitFor();
  invoiceNo = (await saved().textContent()).match(/(\d\d-\d\d\/\d+)/)[1];
  await say(`Saved as invoice ${invoiceNo}. Stock, GST, KPIs and the books all update from this one bill.`);
});
await beat("expired", async () => {
  await say("Expired stock cannot be sold.");
  await scan("JAM1"); await page.getByText(/expired on/).waitFor(); await wait(1600);
});
await beat("credit", async () => {
  await say("A credit sale to a known customer. Payment terms set the due date.");
  await scan("CURD1", 4);
  await type(page.getByRole("textbox", { name: "Customer phone" }), "9876500011", 50);
  await page.getByRole("radio", { name: "Credit" }).click();
  await page.getByText(/due in 15 days/).waitFor(); await wait(1500);
  await saveOnly(); await saved().waitFor(); await wait(1200);
  await page.getByRole("radio", { name: "Cash" }).click();
});
await beat("credit limit", async () => {
  await say("The customer's credit limit is enforced, on the server as well.");
  await scan("WHEY1", 3);
  await page.getByRole("textbox", { name: "Customer phone" }).fill("9876500011");
  await page.getByRole("radio", { name: "Credit" }).click();
  await page.getByText(/Over credit limit by/).waitFor(); await wait(2000);
  await page.getByRole("radio", { name: "Cash" }).click();
  await page.getByRole("button", { name: "Clear bill" }).click({ timeout: 3000 }).catch(() => {});
});
await beat("returns", async () => {
  await say("Returns are made against the original invoice and capped at what was sold.");
  await page.getByRole("radio", { name: "Return", exact: true }).click();
  await type(page.getByRole("textbox", { name: "Against invoice" }), invoiceNo, 60);
  await page.getByRole("button", { name: "Load bill" }).click();
  await page.getByText(/Loaded what can still come back/).waitFor(); await wait(1000);
  await page.getByRole("textbox", { name: "Whey Protein 1kg quantity" }).fill("1");
  await page.getByRole("button", { name: "Remove Shaker bottle" }).click(); await wait(600);
  await saveOnly();
  await page.getByText(/Return CN\/\d\d-\d\d\/\d+ saved/).waitFor(); await wait(1400);
  await say("Trying to return more than was sold is refused.");
  await type(page.getByRole("textbox", { name: "Against invoice" }), invoiceNo, 30);
  await page.getByRole("button", { name: "Load bill" }).click();
  await page.getByText(/Loaded what can still come back/).waitFor();
  await page.getByRole("textbox", { name: "Whey Protein 1kg quantity" }).fill("9");
  await saveOnly(); await page.getByText(/can still be returned/).waitFor(); await wait(2000);
  await page.getByRole("button", { name: "Clear bill" }).click();
});
await beat("stock in", async () => {
  await say("Stock in records a delivery. It can also scan a supplier's bill with free OCR in the browser.");
  await page.getByRole("radio", { name: "Stock in" }).click();
  await page.getByText("Scan supplier bill").waitFor(); await wait(1200);
  await type(page.getByRole("textbox", { name: "Supplier name" }), "Metro Wholesale", 40);
  await scan("CURD1", 10); await saveOnly();
  await page.getByText(/Stock in GRN\/\d\d-\d\d\/\d+ saved/).waitFor(); await wait(1200);
  await say("A supplier return becomes a debit note.");
  await page.getByRole("radio", { name: "Supplier return" }).click();
  await scan("CURD1", 2); await saveOnly();
  await page.getByText(/Debit note DN\/\d\d-\d\d\/\d+ saved/).waitFor(); await wait(1400);
  await page.getByRole("radio", { name: "Sale" }).click();
});
await beat("offline", async () => {
  await say("The counter works offline. Bills wait on the device and are sent once, exactly once, when the network returns.");
  await page.goto("/pos");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "Counter" }).waitFor();
  await scan("SHAKER1"); await saveOnly();
  await page.getByText(/1 bill waiting to be sent/).waitFor(); await wait(2200);
  await context.setOffline(false);
  await page.getByText(/waiting to be sent/).waitFor({ state: "detached", timeout: 40_000 }); await wait(1200);
});
await beat("quotation", async () => {
  await say("A quotation, proforma or sale order moves no stock or money until it is billed here in one click.");
  await page.goto("/settings?tab=modules");
  await page.getByLabel("Use Quotations").click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText(/Saved\./).waitFor();
  await addRecord("/m/quotes", { Customer: "Quote Qasim", "Quote amount": 500, "Item / service": "Installation visit" });
  const row = page.getByRole("row", { name: /Quote Qasim/ });
  await row.waitFor(); await wait(900);
  await row.getByRole("link", { name: "Bill this quotation at the counter" }).click();
  await page.getByLabel("Installation visit price").waitFor(); await wait(1200);
  await saveOnly(); await saved().waitFor(); await wait(1200);
});

/* 9 ---------------------------------------------------------------- invoice */
await feature("GST invoice and e-way bill", "CGST/SGST or IGST from the GSTIN state codes, UPI QR, print to PDF, WhatsApp, e-way bill JSON.", async () => {
  await page.goto("/m/sales");
  const link = page.getByRole("row").filter({ has: page.getByRole("cell", { name: invoiceNo, exact: true }) }).first().getByRole("link", { name: "Invoice" });
  await page.goto(await link.getAttribute("href"));
});
await beat("invoice", async () => {
  await say("The invoice uses the chosen layout, with bank details, terms and the TCS line.");
  await scroll(700, 8);
  await top();
  await say("An e-way bill file for the GST portal is one click, with the distance entered.");
  await page.getByRole("button", { name: "E-way bill" }).click();
  await type(page.getByLabel("Distance in km"), "120", 80);
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click(); await dl; await wait(1500);
  await mute();
});

/* 10 --------------------------------------------------------------- day close */
await feature("Day close", "The Z report: sales by payment mode, returns, credit given, and cash expected against cash counted.", async () => { await page.goto("/dayclose"); });
await beat("day close", async () => {
  await say("Expected cash is the opening count plus cash sales minus cash expenses.");
  await wait(1500);
  await say("Cash is counted by note. Any difference is saved as over or short.");
  await type(page.getByLabel("Or type the total counted"), "1", 100);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Close the day" }).click();
  await page.getByText(/Day closed · cash/).waitFor(); await wait(2200);
  await mute();
});

/* 11 --------------------------------------------------------------- books */
await feature("Books", "Profit and loss, balance sheet, trial balance and ledgers, posted from the records already kept.", async () => { await page.goto("/books"); });
await beat("books", async () => {
  await say("Payments, journal entries and fixed assets are optional modules. One button switches them on.");
  await page.getByRole("button", { name: "Switch on Payments, Journal & Fixed assets" }).click();
  await page.getByRole("link", { name: "Payments" }).waitFor(); await wait(1000);
  await say("A payment in, with TDS, settles the customer's dues.");
  await addRecord("/m/payments", { "Customer / supplier": "Demo Dev", Amount: 150, TDS: 10, Mode: "Bank" });
  await page.getByRole("row", { name: /Demo Dev/ }).waitFor(); await wait(900);
  await say("A journal entry for the opening bank balance.");
  await addRecord("/m/journal", { "Debit account": "Bank", "Credit account": "Opening balances", Amount: 500000, Narration: "Opening bank balance" });
  await page.getByRole("row", { name: /Opening balances/ }).waitFor(); await wait(900);
  await say("A fixed asset, depreciated monthly on a straight line.");
  await addRecord("/m/assets", { Asset: "Cold-storage fridge", Cost: 60000, "Useful life": 5 });
  await page.getByRole("row", { name: /fridge/ }).waitFor(); await wait(900);
});
await beat("statements", async () => {
  await page.goto("/books"); await say("Profit and loss."); await scroll(600, 6);
  await top(); await page.getByRole("link", { name: "Balance sheet" }).click(); await say("Balance sheet."); await wait(800);
  await page.getByRole("link", { name: "Trial balance" }).click(); await say("Trial balance. Debits equal credits."); await wait(800);
  await page.getByRole("link", { name: "Cash", exact: true }).first().click(); await say("A ledger for each account, back to the entries behind it."); await wait(800);
});
await beat("bank", async () => {
  await page.goto("/books?tab=bank");
  await say("Bank reconciliation: paste a statement and it is matched to the books by amount and date.");
  const d = day(0).split("-").reverse().join("/");
  await page.getByLabel("Bank statement CSV").fill(`Date,Narration,Withdrawal,Deposit,Balance\n${d},UPI-RANDOM,,236.00,1000\n${d},BANK CHARGES,15.00,,985`);
  await page.getByText(/statement lines match the books/).waitFor(); await wait(2000);
});
await beat("verify", async () => {
  await page.goto("/books?tab=verify");
  await say("Verify my data checks for negative stock, duplicate invoices, missing GST rates, bad GSTINs and more. Each finding links to its fix.");
  await page.getByRole("heading", { name: "Verify my data" }).waitFor(); await scroll(600, 6); await top();
});
await beat("tally", async () => {
  await page.goto("/books");
  await say("Books export to Tally as import XML, and Tally masters import into Customers and Stock.");
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export to Tally" }).click(); await dl; await wait(1200);
  await page.goto("/m/customers");
  await page.getByRole("button", { name: "Import" }).click();
  await page.locator("textarea").last().fill(`<ENVELOPE><BODY><TALLYMESSAGE><LEDGER NAME="Tally Traders"><PARENT>Sundry Debtors</PARENT><LEDGERMOBILE>9876500088</LEDGERMOBILE></LEDGER></TALLYMESSAGE></BODY></ENVELOPE>`);
  await wait(900);
  await page.getByRole("button", { name: "Import from Tally" }).click();
  await page.getByText(/Imported 1 customers/).waitFor(); await wait(1800);
  await mute();
});

/* 12 --------------------------------------------------------------- insights */
await feature("Insights", "Who owes you, what is not selling, what expires, and what happens if a supplier is late.", async () => { await page.goto("/insights"); });
await beat("insights", async () => {
  await say("Dues are aged 30, 60 and over 60 days, with a WhatsApp reminder for each customer.");
  await scroll(500, 6);
  await say("Stock that has not sold in 60 days, and products that will expire before they sell out.");
  await scroll(600, 6);
  await say("A what-if simulator: move the supplier delay or the demand and the reorder reasons change in plain language.");
  await page.getByRole("heading", { name: "What if…" }).scrollIntoViewIfNeeded(); await wait(900);
  await page.getByRole("slider").nth(1).fill("14"); await wait(2200);
  await say("Supplier scorecard, best customers, regulars who went quiet, and counter exceptions.");
  await scroll(900, 8);
  await say("Product certificates that run out within 30 days are listed too.");
  await page.getByRole("heading", { name: "Certificates" }).scrollIntoViewIfNeeded(); await wait(2000);
});
await beat("near-expiry offer", async () => {
  await say("Near-expiry offers suggest the discount that clears a batch at a profit, and put it live in one tap.");
  await page.getByRole("heading", { name: "Near-expiry offers" }).scrollIntoViewIfNeeded(); await wait(1800);
  await page.getByRole("row").filter({ hasText: /Fresh curd/ }).getByRole("button", { name: /Put \d+% off live/ }).first().click();
  await page.getByText(/Live: \d+% off at the counter/).waitFor(); await wait(1500);
  await page.goto("/pos"); await page.getByRole("radio", { name: "Sale" }).click();
  await scan("CURD1");
  await say("At the counter the offer applies by itself, and the server prices it again.");
  await page.getByText(/Near-expiry offer \d+% off/).waitFor(); await wait(1800);
  await page.getByRole("button", { name: "Clear bill" }).click({ timeout: 3000 }).catch(() => {});
  await mute();
});

/* 13 --------------------------------------------------------------- analytics */
await feature("Analytics", "KPI register, like-for-like comparison, drill-down, drivers, same period last year and anomalies.", async () => { await page.goto("/analytics"); });
await beat("analytics", async () => {
  await say("Each KPI is compared like for like while a period is still in progress.");
  await scroll(500, 6);
  await beat("kpi click", async () => { await page.getByRole("row").nth(3).click({ timeout: 3000 }); await wait(1200); });
  await say("Drill into a KPI: finished periods, what moved it, and a comparison by location or category.");
  await scroll(1200, 10);
  await say("The anomaly log skips event days such as festivals.");
  await scroll(1200, 10);
});

/* 14 --------------------------------------------------------------- forecasting */
await feature("Forecasting and planning", "Ten models back-tested on history, stock planning, a 13-week cash flow and restock autopilot.", async () => { await page.goto("/forecasting"); });
await beat("forecast", async () => {
  await say("Ten models are compared by a rolling back-test, so the most accurate one is used, not the most fashionable.");
  await scroll(600, 6);
  await top();
  await page.goto("/forecasting?tab=stock");
  await say("Stock planning: per-product demand, safety stock and what to order.");
  await page.getByRole("heading", { name: "What to order" }).waitFor(); await scroll(500, 6);
  await page.goto("/forecasting?tab=cash");
  await say("A 13-week cash flow with runway, from an opening balance.");
  await type(page.getByPlaceholder("250000"), "300000", 70);
  await page.getByRole("button", { name: "Start forecast" }).click();
  await page.getByRole("heading", { name: "13-week cash flow" }).waitFor(); await scroll(700, 8);
});
await beat("autopilot", async () => {
  await say("One tap turns a suggested quantity into an Ordered purchase.");
  await addRecord("/m/inventory", { Product: "Mango pickle", SKU: "PICKLE1", "On hand": 0, Price: 90, "Unit cost": 60, Supplier: "Shree Traders" });
  await page.getByRole("row", { name: /Mango pickle/ }).waitFor();
  await addRecord("/m/sales", { Date: day(-1), Item: "Mango pickle", Qty: 3, Amount: 270 });
  await page.getByRole("row", { name: /Mango pickle/ }).first().waitFor();
  await page.goto("/forecasting?tab=stock");
  await page.getByRole("row", { name: /Mango pickle/ }).getByRole("button", { name: "Place order" }).click();
  await page.getByText("Ordered", { exact: true }).first().waitFor(); await wait(1500);
  await say("Restock autopilot, owner only: orders from ticked suppliers inside a weekly cap, never twice for an item on order, never pays anyone.");
  await page.getByRole("slider").first().fill("12");
  await page.getByLabel("Autopilot on").click(); await wait(500);
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByLabel("Autopilot weekly cap").fill("1000000");
  await page.getByRole("button", { name: "Save autopilot" }).click();
  await page.getByText(/Autopilot is on/).waitFor(); await wait(1200);
  await page.getByRole("button", { name: "Run now" }).click();
  await page.getByText(/Placed \d+ orders?\.|Nothing to order right now\./).waitFor(); await wait(2200);
  await mute();
});

/* 15 --------------------------------------------------------------- planner */
await feature("Branch planner", "ROI, payback and break-even for a new location across three scenarios.", async () => { await page.goto("/planner"); });
await beat("planner", async () => {
  await say("Seeded from an average existing location, so a new branch is judged against real numbers.");
  await scroll(900, 10);
  await top();
});

/* 16 --------------------------------------------------------------- market */
await feature("Market comparison", "Each margin and cost share placed against businesses like yours, in rupees per month.", async () => { await page.goto("/market"); });
await beat("market", async () => {
  await say("Bottom quarter, typical or top quarter, and what reaching the typical figure is worth a month.");
  await scroll(900, 10);
  await say("Built-in ranges are labelled as rules of thumb. With an AI key, Research current figures finds sourced, dated figures. Owners can also enter their own.");
  await top(); await wait(800);
});

/* 17 --------------------------------------------------------------- AI team */
await feature("AI leadership team", "CFO, COO, CTO, People, GM and CMO roles. Streamed answers, standing rules, hand-offs and approvals.", async () => { await page.goto("/ai"); });
await beat("ai", async () => {
  await say("Each role reads the business's own numbers. Without an AI key it gives rule-based briefings; with Claude, Gemini, Groq or Ollama it answers in full.");
  await scroll(500, 6);
  await top();
  await page.goto("/ai/cfo");
  await say("Ask the CFO a question.");
  await type(page.getByLabel(/^Message /), "Which customers owe us money, and how much overall?", 30);
  await page.getByRole("button", { name: "Send" }).click(); await wait(6000);
  await say("Roles that only draft send their proposals to an approval queue, and the owner is notified.");
  await page.goto("/approvals"); await page.getByRole("heading", { name: "Approvals" }).waitFor(); await wait(1500);
  await mute();
});

/* 18 --------------------------------------------------------------- automations and tasks */
await feature("Automations and tasks", "When something happens, do something. People and the AI team share one task board.", async () => { await page.goto("/automations"); });
await beat("automations", async () => {
  await say("Triggers on a record, a schedule or a KPI create tasks and notes, update fields, or send WhatsApp and email messages.");
  await scroll(600, 6); await top();
  await page.goto("/tasks");
  await say("Tasks for people and for the AI roles. You are notified when one is assigned to you.");
  await beat("new task", async () => {
    const t = page.getByLabel("New task");
    await type(t, "Call Metro Wholesale about the curd delivery", 30);
    await t.press("Enter"); await wait(1800);
  });
  await mute();
});

/* 19 --------------------------------------------------------------- payroll */
await feature("Payroll run", "Gross pay, PF at 12% up to ₹15,000 and ESI at 0.75% up to ₹21,000, once per month from the team list.", async () => { await page.goto("/m/payroll"); });
await beat("payroll", async () => {
  await say("Payroll is posted to the books with PF and ESI worked out for each employee.");
  await scroll(700, 8);
  await top();
});

/* 20 --------------------------------------------------------------- reports and labels */
await feature("GST reports", "GSTR-3B summary, GSTR-1 JSON, GSTR-9 annual, HSN summary, TCS Form 27EQ and staff commissions.", async () => { await page.goto("/reports"); });
await beat("reports", async () => {
  await say("Outward supplies, HSN summary, input tax credit and net payable.");
  await scroll(800, 8);
  await say("GSTR-9 month by month, Form 27EQ by quarter, and incentives and referrals per person.");
  await scroll(1100, 10);
  await top();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "GSTR-9 summary" }).click(); await dl;
  await say("Each file follows the portal's published shape. Check the first one on the portal before filing.");
  await mute();
});
await feature("Barcode and pack labels", "Code 128 shelf labels on A4 or a label printer. Pack labels carry nutrition and a certificate QR.", async () => { await page.goto("/labels"); });
await beat("labels", async () => {
  await say("Pick the products and print barcode labels.");
  await page.getByRole("button", { name: "One each" }).click(); await wait(1800);
  await page.getByRole("link", { name: "Pack labels" }).click();
  await page.getByText(/Pack labels with nutrition/).waitFor();
  await page.getByRole("button", { name: "One each" }).click();
  await say("Pack labels print ingredients, nutrition per serving, allergens, the FSSAI number and a QR to the lab certificate.");
  await page.getByText(/Nutrition per 30 g scoop/).waitFor(); await wait(1500); await scroll(500, 6);
  await mute();
});

/* 21 --------------------------------------------------------------- branches */
await feature("Branches and warehouses", "Stock per location, with transfers between them.", async () => {
  await page.goto("/settings");
  await page.getByLabel("Locations").fill("2");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText(/Saved\./).waitFor();
  await page.goto("/m/inventory");
});
await beat("transfer", async () => {
  await say("With two locations, stock can be moved between them.");
  await page.getByRole("button", { name: /Transfer stock between locations/ }).click(); await wait(800);
  const sel = page.getByLabel("Item to move");
  const value = await sel.evaluate((el) => [...el.options].find((o) => /Shaker bottle/.test(o.text))?.value);
  await sel.selectOption(value); await wait(500);
  await page.getByLabel("Move to location").fill("Location 2");
  await type(page.getByLabel("Quantity to move"), "3", 120);
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await page.getByText("Moved 3 to Location 2.").waitFor(); await wait(1800);
  await mute();
});

/* 22 --------------------------------------------------------------- team and roles */
await feature("Team, roles and limits", "A cashier with a discount limit, an owner PIN override and a view-only accountant login.", async () => { await page.goto("/settings?tab=team"); });
await beat("team", async () => {
  await say("Add people and give each one a role. The role decides which pages, actions and dashboard tiles they get.");
  for (const [name, who, role] of [["Ravi Cashier", staff, "staff"], ["Chandra CA", ca, "ca"]]) {
    await page.getByRole("button", { name: "Add a person" }).click(); await wait(500);
    await type(page.getByLabel("Name", { exact: true }), name, 30);
    await type(page.getByLabel("Email, phone or username"), who.username, 20);
    await page.getByLabel("Role", { exact: true }).selectOption(role);
    await type(page.getByLabel("Temporary password"), who.password, 15);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByText(`@${who.username}`).waitFor(); await wait(900);
  }
  await say("The cashier's maximum discount is 5 percent.");
  await type(page.getByLabel("Staff maximum discount percent"), "5", 120);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText(/Saved\./).waitFor(); await wait(1000);
  await mute();
});
await beat("cashier", async () => {
  await say("Signing in as the cashier.");
  await signIn(staff.username, staff.password);
  await page.goto("/pos"); await page.getByRole("radio", { name: "Sale" }).click();
  await scan("SHAKER1");
  await say("A 30 percent discount is over the cashier's 5 percent limit.");
  await type(page.getByRole("textbox", { name: "Bill discount, amount or percent" }), "30%", 120);
  await page.getByText(/over your limit of 5%/).first().waitFor(); await wait(1500);
  await saveOnly();
  await page.getByText(/Or have the owner type their PIN/).waitFor();
  await say("The bill is refused unless the owner types their PIN. A wrong PIN is rejected and the attempts are rate-limited.");
  await type(page.getByLabel("Owner PIN"), "0000", 150); await saveOnly();
  await page.getByText("That PIN isn't the owner's.").waitFor(); await wait(1500);
  await type(page.getByLabel("Owner PIN"), PIN, 150); await saveOnly();
  await saved().waitFor(); await say("The right PIN lets it through, and the override is written to the audit log.");
  await page.goto("/settings");
  await page.waitForURL(/denied=settings/);
  await say("The cashier cannot open Settings or Books. Every page is guarded on the server.");
  await wait(1500);
});
await beat("accountant", async () => {
  await say("Now the accountant, a view-only role.");
  await signIn(ca.username, ca.password);
  await page.goto("/reports"); await page.getByRole("heading", { name: "GSTR-3B summary" }).waitFor();
  await say("It can read reports and books.");
  await scroll(500, 6);
  await page.goto("/m/sales");
  const form = page.locator("form").first();
  await form.getByLabel(/Amount/).fill("99");
  await form.getByLabel("Customer", { exact: true }).fill("CA should not save this");
  await form.getByRole("button", { name: "Add" }).click();
  await page.getByText(/view-only/).waitFor();
  await say("Every save is refused.");
  await wait(1500);
});

/* 23 --------------------------------------------------------------- audit trail */
await feature("Audit trail and staff reports", "Every record, setting, member, automation and approval change is logged.", async () => { await signIn(owner.email, owner.password); await page.goto("/settings?tab=audit"); });
await beat("audit", async () => {
  await say("The owner sees who changed what and when, including the PIN override.");
  await page.getByText(/owner PIN/).first().waitFor(); await wait(2000);
  await scroll(500, 6);
  await page.goto("/reports");
  await say("And each person's sales, incentive and referral commission.");
  await page.getByRole("row", { name: /Ravi Cashier/ }).scrollIntoViewIfNeeded(); await wait(2200);
  await mute();
});

/* 24 --------------------------------------------------------------- profile and notifications */
await feature("Profile, notifications and installing", "Verification, password, browser push on any device, and an installable phone app.", async () => { await page.goto("/profile"); });
await beat("profile", async () => {
  await say("Verify the email or phone, change the password, and switch on browser push for this device.");
  await scroll(500, 6); await top();
  await page.goto("/dashboard");
  await say("The bell in the top bar lists what needs attention. The app installs on a phone and offers quick-add.");
  await beat("bell", async () => { await page.getByRole("button", { name: /Notifications|Bell/i }).first().click({ timeout: 3000 }); await wait(2200); await page.keyboard.press("Escape"); });
  await mute();
});

/* ---------- end ---------- */
await film({ cap: "", card: { k: "That is RetailX", t: "From the first sale to the closing books", s: "Billing, stock, GST, accounts, forecasts and an AI team in one workspace that fits the business." } });
await wait(5000);

const video = page.video();
await context.close();
await browser.close();
const vp = await video.path();
renameSync(vp, path.join(OUT, "raw.webm"));
console.log(`\nfilm: ${path.join(OUT, "raw.webm")}\n${failures.length ? "beats that failed:\n - " + failures.join("\n - ") : "all beats ran"}`);
