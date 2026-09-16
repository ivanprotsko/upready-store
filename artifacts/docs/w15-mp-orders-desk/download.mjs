import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require_ = createRequire("/Users/ivanprotsko/upready/projects/upready-store/package.json");
const { chromium } = require_("playwright");

const browser = await chromium.launch({ acceptDownloads: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:5195/login", { waitUntil: "domcontentloaded" });
await page.waitForSelector('input[name="email"]');
await page.fill('input[name="email"]', "owner-cherkashino@example.test");
await page.fill('input[name="password"]', "w13-acceptance-scratch");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes("login"));

await page.goto("http://localhost:5195/marketplace-orders?source=ozon", {
  waitUntil: "domcontentloaded",
});
await page.waitForSelector('[data-testid="feed-row"]');
console.log("count line:", (await page.textContent('[data-testid="count-line"]')).trim());
console.log("button label:", (await page.textContent('[data-testid="export-csv"]')).trim());

const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.click('[data-testid="export-csv"]'),
]);
const path = await download.path();
const lines = readFileSync(path, "utf8").trimEnd().split("\r\n");
console.log("downloaded:", download.suggestedFilename());
console.log("lines in file (with header):", lines.length);
console.log("data rows:", lines.length - 1);
console.log("first data row:", lines[1]);
await browser.close();
