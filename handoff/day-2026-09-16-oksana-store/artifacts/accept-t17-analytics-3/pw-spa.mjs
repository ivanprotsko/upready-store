import { createRequire } from "module";
const req = createRequire("/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-analytics/apps/storefront/package.json");
const { chromium } = req("@playwright/test");
const ART = process.argv[2];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const hits = [];
ctx.on("request", (r) => {
  const u = r.url();
  if (/mc\.yandex\.ru\/watch|google-analytics\.com\/g\/collect/.test(u)) {
    hits.push({ when: Date.now(), kind: /yandex/.test(u) ? "ym" : "ga4", pageUrl: decodeURIComponent((u.match(/(?:page-url|[?&]dl)=([^&]+)/) || [])[1] || ""), full: u.slice(0, 90) });
  }
});
const page = await ctx.newPage();
await page.goto("http://t17shopa.localhost:8317/ru", { waitUntil: "domcontentloaded" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
await page.waitForTimeout(2500);
await page.getByRole("button", { name: /принять|accept/i }).first().click({ force: true, timeout: 15000 });
await page.waitForTimeout(5000);
const firstLoadHits = hits.length;
const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")).filter(Boolean));
const target = hrefs.find((h) => h === "/store") || hrefs.find((h) => h === "/cart");
const before = hits.length;
// A real in-app click, not a full reload: Next's <Link> handles it client-side.
await page.click(`a[href="${target}"]`, { force: true, timeout: 15000 });
await page.waitForTimeout(6000);
const after = hits.slice(before);
await page.screenshot({ path: `${ART}/shopA-after-spa-nav.png` });
console.log(JSON.stringify({
  navigatedTo: target,
  finalUrl: page.url(),
  fullReload: await page.evaluate(() => performance.getEntriesByType("navigation").length),
  hitsOnFirstLoad: firstLoadHits,
  hitsAfterInAppNavigation: after,
}, null, 2));
await browser.close();
