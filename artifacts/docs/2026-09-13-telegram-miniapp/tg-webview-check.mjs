#!/usr/bin/env node
/**
 * Exercises the storefront the way a Telegram client does, without Telegram:
 * a 390×844 mobile Chromium opens `<storefront>/mini?tgWebAppStartParam=…` with
 * the launch fragment telegram-web-app.js expects, and a stub
 * `window.TelegramWebviewProxy` records every event the page posts to the
 * client (`web_app_ready`, `web_app_expand`, `web_app_setup_back_button`, …).
 * The official script is loaded from telegram.org, so what is measured is our
 * bridge against the real bridge — only the client on the other side is fake.
 *
 *   node tg-webview-check.mjs <storefront url> <product handle> [shots dir]
 *
 * This is a functional check of the code path, NOT the acceptance in a real
 * Telegram client (rule 18f): the screenshots it writes are from a simulated
 * webview and are labelled so.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(new URL("../../../apps/storefront/package.json", import.meta.url));
const { chromium, devices } = require("@playwright/test");

const [storefront, productHandle, shotsDir = "shots"] = process.argv.slice(2);
if (!storefront || !productHandle) {
  console.error("usage: tg-webview-check.mjs <storefront url> <product handle> [shots dir]");
  process.exit(2);
}
mkdirSync(shotsDir, { recursive: true });

const theme = { bg_color: "#ffffff", text_color: "#000000", button_color: "#2481cc", button_text_color: "#ffffff" };
const fragment =
  "#tgWebAppData=" + encodeURIComponent("query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A279058397%7D&auth_date=1757770000&hash=deadbeef") +
  "&tgWebAppVersion=8.0&tgWebAppPlatform=ios&tgWebAppThemeParams=" + encodeURIComponent(JSON.stringify(theme));

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["iPhone 13"], colorScheme: "light" });
await context.addInitScript(() => {
  window.__tgEvents = window.__tgEvents ?? [];
  window.TelegramWebviewProxy = {
    postEvent(name, data) {
      // telegram-web-app.js hands the client a JSON string; keep it readable.
      let parsed = data ?? null;
      if (typeof data === "string") {
        try { parsed = JSON.parse(data); } catch { parsed = data; }
      }
      window.__tgEvents.push([name, parsed]);
    },
  };
});
const page = await context.newPage();
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures.push(name);
};
const events = async () => page.evaluate(() => (window.__tgEvents ?? []).map((e) => e[0]));
const shot = async (name) => {
  const file = join(shotsDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`   shot ${file}`);
};
const settle = async () => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
};

// 1. Entry with a product deep link → redirected to the product page, hash intact.
const t0 = performance.now();
await page.goto(`${storefront}/mini?tgWebAppStartParam=product_${productHandle}${fragment}`, { waitUntil: "domcontentloaded" });
await settle();
const entryMs = Math.round(performance.now() - t0);
const url = new URL(page.url());
check("entry redirects to the product", url.pathname.endsWith(`/products/${productHandle}`), `${url.pathname} in ${entryMs} ms`);
check("launch fragment survived the redirects", url.hash.includes("tgWebAppData"), url.hash.slice(0, 40) + "…");
check("bridge marked <html data-tg>", (await page.evaluate(() => document.documentElement.dataset.tg)) === "1");
check("window.Telegram.WebApp is live", await page.evaluate(() => !!window.Telegram?.WebApp?.initData));
let ev = await events();
check("posted web_app_ready + web_app_expand", ev.includes("web_app_ready") && ev.includes("web_app_expand"), ev.join(","));
check("back button shown on a product page", await page.evaluate(() => (window.__tgEvents ?? []).some((e) => e[0] === "web_app_setup_back_button" && e[1]?.is_visible === true)));
await shot("1-product-deep-link-simulated");

// 2. Add to cart, go to the cart.
// The add button is disabled until every option has a value: pick the first
// value of each option group (one button per group, grouped by parent element).
const firstOfEachGroup = await page.locator('[data-testid="option-button"]').evaluateAll((buttons) => {
  const seen = new Map();
  buttons.forEach((b, i) => { if (!seen.has(b.parentElement)) seen.set(b.parentElement, i); });
  return [...seen.values()];
});
for (const index of firstOfEachGroup) {
  await page.locator('[data-testid="option-button"]').nth(index).click();
  await page.waitForTimeout(300);
}
const addBtn = page.locator('[data-testid="add-product-button"]').first();
check("add-to-cart button is enabled after picking options", (await addBtn.count()) > 0 && (await addBtn.isEnabled()), `${firstOfEachGroup.length} option group(s)`);
if (await addBtn.count()) {
  // The add is a server action: a POST back to the page URL. Wait for its answer
  // (bounded) instead of a fixed pause — in dev mode the first action compiles.
  const action = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/products/"), { timeout: 30000 }).catch(() => null);
  await addBtn.click().catch(() => {});
  const res = await action;
  check("add-to-cart server action answered", !!res && res.status() === 200, res ? `HTTP ${res.status()}` : "no response within 30 s");
  await page.waitForTimeout(1000);
}
const cartCookie = (await context.cookies()).find((c) => c.name === "_medusa_cart_id");
check("cart cookie set inside the webview session", !!cartCookie, cartCookie ? `cart ${cartCookie.value.slice(0, 12)}…` : "none");
await page.goto(`${storefront}/${url.pathname.split("/")[1]}/cart`, { waitUntil: "domcontentloaded" });
await settle();
check("cart page opened inside the same session", page.url().includes("/cart"));
check("still marked as Telegram after a full navigation (sessionStorage)", (await page.evaluate(() => document.documentElement.dataset.tg)) === "1");
const cartHasLine = await page.locator('[data-testid="product-row"]').count();
check("cart holds the product", cartHasLine > 0, `${cartHasLine} line(s)`);
await shot("2-cart-simulated");

// 3. Catalog entry without a parameter → /store, back button hidden.
await page.goto(`${storefront}/mini${fragment}`, { waitUntil: "domcontentloaded" });
await settle();
check("bare entry opens the catalog", new URL(page.url()).pathname.endsWith("/store"), new URL(page.url()).pathname);
ev = await page.evaluate(() => (window.__tgEvents ?? []).filter((e) => e[0] === "web_app_setup_back_button").map((e) => e[1]?.is_visible));
check("back button hidden on the catalog", ev.length > 0 && ev[ev.length - 1] === false, JSON.stringify(ev));
const cards = await page.locator('a[href*="/products/"]').count();
check("catalog shows product cards", cards > 0, `${cards} links`);
await shot("3-catalog-simulated");

// 4. A plain browser visit loads nothing Telegram.
const plain = await context.browser().newContext({ ...devices["iPhone 13"] });
const p2 = await plain.newPage();
const requests = [];
p2.on("request", (r) => requests.push(r.url()));
await p2.goto(`${storefront}/`, { waitUntil: "networkidle" }).catch(() => {});
check("plain visit never loads telegram-web-app.js", !requests.some((u) => u.includes("telegram-web-app.js")));
check("plain visit is not marked as Telegram", (await p2.evaluate(() => document.documentElement.dataset.tg)) === undefined);
await plain.close();

await browser.close();
console.log(failures.length ? `FAILED: ${failures.join("; ")}` : "ALL PASS");
process.exit(failures.length ? 1 : 0);
