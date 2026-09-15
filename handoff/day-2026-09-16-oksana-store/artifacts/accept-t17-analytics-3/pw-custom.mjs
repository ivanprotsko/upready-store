import { createRequire } from "module";
const req = createRequire("/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-analytics/apps/storefront/package.json");
const { chromium } = req("@playwright/test");
const ART = process.argv[2];
const BASE = "http://localhost:5317";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const apiCalls = [];
page.on("request", (r) => { if (r.url().includes("analytics/summary")) apiCalls.push(r.url()); });
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.fill('input[name="email"]', "admin@t17shopa.example");
await page.fill('input[name="password"]', "supersecret");
await page.click('button[type="submit"]');
await page.waitForTimeout(6000);
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);

await page.getByRole("button", { name: "Произвольный" }).click();
await page.waitForTimeout(1500);
// Medusa's DatePicker is a react-aria segmented field: type digits into it.
const n = await page.locator('[data-testid="sales-summary-custom-from"]').count()
  + await page.locator('[data-testid="sales-summary-custom-to"]').count();
for (const testid of ["sales-summary-custom-from", "sales-summary-custom-to"]) {
  const seg = page.locator(`[data-testid="${testid}"] [role="spinbutton"]`).first();
  await seg.click();
  await page.keyboard.type("12092026");
  await page.waitForTimeout(800);
}
await page.waitForTimeout(6000);
await page.screenshot({ path: `${ART}/panel-shopA-home-custom-0912.png`, fullPage: true });
const text = (await page.locator("body").innerText()).replace(/\n{2,}/g, "\n");
console.log(JSON.stringify({
  dateInputs: n,
  summaryRequests: apiCalls,
  salesBlock: text.slice(text.indexOf("Продажи")).slice(0, 700),
}, null, 2));
// settings screen
await page.goto(`${BASE}/settings/analytics`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${ART}/panel-shopA-settings-analytics.png`, fullPage: true });
await browser.close();
