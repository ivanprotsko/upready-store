import { createRequire } from "module";
const req = createRequire("/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-analytics/apps/storefront/package.json");
const { chromium } = req("@playwright/test");
if (!chromium) throw new Error("chromium export missing");

const ART = process.argv[2];
const BASE = "http://localhost:8317";
const out = {};

const run = async (hostLabel, key) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const reqs = [];
  ctx.on("request", (r) => {
    const u = r.url();
    if (/mc\.yandex\.ru|googletagmanager\.com|google-analytics\.com/.test(u)) reqs.push(u);
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE.replace("localhost", hostLabel)}/ru`, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await page.waitForTimeout(3000);

  out[key] = { host: hostLabel, beforeConsent: { analyticsRequests: [...reqs] } };
  await page.screenshot({ path: `${ART}/${key}-before-consent.png`, fullPage: false });

  // find the consent banner's accept button
  const accept = page.getByRole("button", { name: /принять|accept|согласен/i }).first();
  const hasBanner = await accept.count().then((c) => c > 0);
  out[key].bannerVisible = hasBanner;

  if (hasBanner) {
    await accept.click({ force: true, timeout: 15000 });
    await page.waitForTimeout(4000);
    out[key].afterConsent = {
      analyticsRequests: [...reqs],
      hasYm: await page.evaluate(() => typeof window.ym === "function"),
      hasGtag: await page.evaluate(() => typeof window.gtag === "function"),
    };
    await page.screenshot({ path: `${ART}/${key}-after-consent.png` });

    // SPA navigation: click an in-app link and see whether a NEW counter hit fires
    const before = reqs.length;
    const link = page.locator('a[href*="/ru/"]').first();
    if (await link.count()) {
      await link.click({ force: true, timeout: 15000 }).catch((e) => { out[key].spaClickError = String(e).slice(0, 120); });
      await page.waitForTimeout(4000);
    }
    out[key].spa = {
      url: page.url(),
      newRequestsAfterNavigation: reqs.slice(before),
    };
    await page.screenshot({ path: `${ART}/${key}-after-spa-nav.png` });
  }
  await browser.close();
};

await run("t17shopa.localhost", "shopA");
await run("t17shopb.localhost", "shopB");
console.log(JSON.stringify(out, null, 2));
