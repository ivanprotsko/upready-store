// Visitor pass over the live tenant storefront (rule 18f: the real product, the exact URL Ivan opens).
// Frames at 1280x900 and 390x844; DOM checks recorded as JSON next to them.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = "https://cherkashino.shipshift.dev";
const OUT = process.argv[2];
const checks = {};
const browser = await chromium.launch();

async function shot(name, url, width, height, fn) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "ru-RU" });
  const page = await ctx.newPage();
  const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1500);
  const file = `${OUT}/${name}-${width}x${height}.png`;
  await page.screenshot({ path: file, fullPage: false });
  const rec = { url, status: resp?.status() ?? null, title: await page.title(), file };
  if (fn) Object.assign(rec, await fn(page));
  checks[`${name}-${width}x${height}`] = rec;
  console.log(`${name} ${width}x${height} → ${rec.status} ${JSON.stringify(rec).slice(0, 200)}`);
  await ctx.close();
}

const homeChecks = async (p) => ({
  images: await p.locator("img").count(),
  brokenImages: await p.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src).slice(0, 5)),
  h1: (await p.locator("h1").first().textContent().catch(() => null))?.trim() ?? null,
});

for (const [w, h] of [[1280, 900], [390, 844]]) {
  await shot("home", `${BASE}/ru`, w, h, homeChecks);
  await shot("catalog", `${BASE}/ru/store`, w, h, async (p) => ({
    ...(await homeChecks(p)),
    productCards: await p.locator('a[href*="/products/"]').count(),
  }));
  await shot("category-dobavki", `${BASE}/ru/categories/dobavki-cherkashino`, w, h, homeChecks);
}

// product page + add to cart, desktop only
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" });
const page = await ctx.newPage();
await page.goto(`${BASE}/ru/store`, { waitUntil: "networkidle", timeout: 90000 });
const href = await page.locator('a[href*="/products/"]').first().getAttribute("href");
const productUrl = new URL(href, BASE).toString();
await page.goto(productUrl, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/product-1280x900.png` });
checks["product"] = {
  url: productUrl,
  title: await page.title(),
  h1: (await page.locator("h1").first().textContent().catch(() => null))?.trim() ?? null,
  images: await page.locator("img").count(),
  brokenImages: await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src).slice(0, 5)),
  file: `${OUT}/product-1280x900.png`,
};
console.log("product:", JSON.stringify(checks["product"]).slice(0, 300));

// add to cart
const btn = page.getByRole("button", { name: /в корзину|добавить|add to cart/i }).first();
let cart = { clicked: false };
if (await btn.count()) {
  await btn.click();
  await page.waitForTimeout(6000);
  cart.clicked = true;
  await page.screenshot({ path: `${OUT}/product-after-add-1280x900.png` });
  await page.goto(`${BASE}/ru/cart`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/cart-1280x900.png` });
  cart.cartUrl = `${BASE}/ru/cart`;
  cart.cartLineItems = await page.locator('a[href*="/products/"]').count();
  cart.bodyHasEmptyWord = /корзина пуста|cart is empty/i.test(await page.locator("body").innerText());
  cart.file = `${OUT}/cart-1280x900.png`;
}
checks["cart"] = cart;
console.log("cart:", JSON.stringify(cart));

// the four content pages, recorded as evidence for step 7
for (const k of ["offer", "contacts", "privacy", "about"]) {
  const r = await page.goto(`${BASE}/ru/pages/${k}`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => null);
  const text = await page.locator("body").innerText().catch(() => "");
  checks[`page-${k}`] = {
    url: `${BASE}/ru/pages/${k}`,
    status: r?.status() ?? null,
    hasCyrillic: /[А-Яа-яЁё]{12,}/.test(text),
    excerpt: text.replace(/\s+/g, " ").slice(0, 160),
  };
  if (r?.status() === 200) await page.screenshot({ path: `${OUT}/page-${k}-1280x900.png` });
  console.log(`page ${k}:`, JSON.stringify(checks[`page-${k}`]).slice(0, 220));
}

await ctx.close();
await browser.close();
writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 1) + "\n");
console.log("checks written");
