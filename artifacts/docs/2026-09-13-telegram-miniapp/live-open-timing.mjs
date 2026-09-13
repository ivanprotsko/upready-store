import { createRequire } from "node:module";
const require = createRequire(process.argv[2]);
const { chromium, devices } = require("@playwright/test");
const url = process.argv[3]; const runs = Number(process.argv[4] ?? 3);
const browser = await chromium.launch();
const out = [];
for (let i = 0; i < runs; i++) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  const t0 = performance.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const dcl = Math.round(performance.now() - t0);
  await page.waitForLoadState("load");
  const load = Math.round(performance.now() - t0);
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return n ? { ttfb: Math.round(n.responseStart), fcp: null } : null; });
  const fcp = await page.evaluate(() => { const e = performance.getEntriesByName("first-contentful-paint")[0]; return e ? Math.round(e.startTime) : null; });
  const cards = await page.locator('a[href*="/products/"]').count();
  out.push({ run: i + 1, ttfbMs: nav?.ttfb, fcpMs: fcp, domContentLoadedMs: dcl, loadMs: load, productLinks: cards });
  await ctx.close();
}
await browser.close();
for (const r of out) console.log(JSON.stringify(r));
