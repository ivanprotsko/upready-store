import { createRequire } from "module";
const req = createRequire("/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-analytics/apps/storefront/package.json");
const { chromium } = req("@playwright/test");
const ART = process.argv[2];
const BASE = "http://localhost:5317";
const out = {};

const shop = async (email, key) => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "supersecret");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${ART}/panel-${key}-home.png`, fullPage: true });
  out[key] = { url: page.url(), bodyText: (await page.locator("body").innerText()).replace(/\n{2,}/g, "\n").slice(0, 1800) };
  await browser.close();
};

await shop("admin@t17shopa.example", "shopA");
await shop("admin@t17shopb.example", "shopB");
console.log(JSON.stringify(out, null, 2));
