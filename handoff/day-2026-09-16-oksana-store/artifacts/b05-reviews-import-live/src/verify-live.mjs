// Acceptance on the LIVE shop and the LIVE panel (rule 18f): the imported
// reviews must be visible where the owner and her buyers look, not only in the
// database. Three product pages + the panel's review list.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "/Users/ivanprotsko/upready/projects/upready-store/node_modules/playwright/index.mjs";

const OUT =
  "/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/b05-reviews-import-live";
const SHOTS = path.join(OUT, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const SHOP = "https://cherkashino.shipshift.dev";
const PANEL = "https://panel-store.upready.dev";
const STATE = path.join(OUT, ".owner-state.json");

function creds() {
  const txt = fs.readFileSync(
    "/Users/ivanprotsko/upready/.private/upready-store-day-2026-09-16/cherkashino-owner.md",
    "utf8",
  );
  const email = (txt.match(/E-mail владельца[^:]*:\s*(\S+)/) || [])[1];
  const pass = (txt.match(/^-\s*Пароль:\s*(.+)$/m) || [])[1];
  if (!email || !pass) throw new Error("creds not parsed");
  return { email, pass: pass.trim() };
}

const PRODUCTS = [
  ["svechi-asd", "svechi-asd-s-chesnokom-10-sht-cherkashino", 47],
  ["multivarka", "multivarka-dlya-doma-i-avto-2-l-12-vt-24-vt-220-vt-cherkashino", 31],
  ["maz-asd-3", "maz-s-asd-3-15-100-ml-cherkashino", 24],
];

const out = { measured_at: new Date().toISOString(), storefront: [], panel: {}, console_errors: [] };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" });
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") out.console_errors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => out.console_errors.push("pageerror: " + String(e).slice(0, 200)));

for (const [name, handle, expected] of PRODUCTS) {
  const rec = { name, handle, expected_reviews: expected, url: `${SHOP}/ru/products/${handle}` };
  try {
    await page.goto(rec.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    const block = page.locator('[data-testid="product-reviews"]');
    await block.waitFor({ timeout: 60000 });
    await block.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    // the summary carries "<average> из 5 · <count> отзывов" in its aria-label
    rec.summary = await page
      .locator('[data-testid="product-reviews-summary"]')
      .getAttribute("aria-label")
      .catch(() => null);
    const text = await block.innerText();
    rec.count_in_summary = Number((rec.summary || "").match(/·\s*(\d+)/)?.[1] ?? NaN);
    rec.cards_on_page = await block.locator('[data-testid="product-review"]').count().catch(() => -1);
    rec.sample = text.replace(/\s+/g, " ").slice(0, 260);
    rec.shot = path.join(SHOTS, `pdp-${name}-1280x900.png`);
    await page.screenshot({ path: rec.shot, fullPage: false });
  } catch (e) {
    rec.error = String(e).slice(0, 300);
  }
  out.storefront.push(rec);
  console.log(`${name.padEnd(12)} ${rec.error ? "ERR " + rec.error : rec.summary}`);
}

// ---- panel, logged in as the owner
try {
  const { email, pass } = creds();
  await page.goto(PANEL + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("input[name=email]", { timeout: 60000 });
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", pass);
  await Promise.all([
    page.waitForURL((u) => !String(u).includes("/login"), { timeout: 90000 }).catch(() => {}),
    page.click("button[type=submit]"),
  ]);
  await page.waitForSelector('a[href="/products"]', { timeout: 90000 });
  await ctx.storageState({ path: STATE });

  await page.goto(PANEL + "/reviews", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(6000);
  const body = await page.evaluate(() => document.body.innerText.trim());
  out.panel.url = page.url();
  out.panel.rows = await page.locator("table tbody tr").count().catch(() => -1);
  out.panel.text = body.replace(/\s+/g, " ").slice(0, 900);
  out.panel.shot = path.join(SHOTS, "panel-reviews-1280x900.png");
  await page.screenshot({ path: out.panel.shot, fullPage: false });
  console.log("panel rows:", out.panel.rows);
} catch (e) {
  out.panel.error = String(e).slice(0, 300);
  console.log("panel ERR", out.panel.error);
}

fs.writeFileSync(path.join(OUT, "03-verify-live.json"), JSON.stringify(out, null, 2));
await browser.close();
console.log("DONE");
