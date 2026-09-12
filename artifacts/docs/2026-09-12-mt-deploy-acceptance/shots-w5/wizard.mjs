// node wizard.mjs <handle> <outdir> [theme] [mode] — runs /start/onboarding end to end on the local stand
import { chromium } from "playwright";
const [handle = "abs-priem", out = ".", theme = "geist", mode = "light"] = process.argv.slice(2);
const base = "http://localhost:8041";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" });
await page.goto(`${base}/start/onboarding`, { waitUntil: "networkidle", timeout: 120000 });
await page.screenshot({ path: `${out}/wizard-step1.png` });
await page.fill("[data-testid=demo-shop-name]", "Приёмка абстракт");
await page.fill("[data-testid=demo-shop-handle]", handle);
await page.click("[data-testid=demo-step1-next]");
await page.fill("[data-testid=demo-owner-email]", `owner-${handle}@example.test`);
await page.fill("[data-testid=demo-owner-password]", "supersecret1");
await page.click("[data-testid=demo-step2-next]");
await page.click(`[data-testid=demo-preset-${theme}]`);
await page.click(`[data-testid=demo-mode-${mode}]`);
await page.screenshot({ path: `${out}/wizard-step3.png`, fullPage: true });
const t0 = Date.now();
await page.click("[data-testid=demo-create-shop]");
await page.waitForSelector("[data-testid=demo-onboarding-done], [data-testid=demo-onboarding-error]", { timeout: 180000 });
const ms = Date.now() - t0;
await page.screenshot({ path: `${out}/wizard-done.png`, fullPage: true });
const done = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  return {
    done: !!q("[data-testid=demo-onboarding-done]"),
    error: q("[data-testid=demo-onboarding-error]")?.textContent?.trim() ?? null,
    seeded: q("[data-testid=demo-catalog-seeded]")?.textContent?.trim() ?? null,
    empty: q("[data-testid=demo-catalog-empty]")?.textContent?.trim() ?? null,
    storefrontHref: q("[data-testid=demo-done-storefront]")?.getAttribute("href") ?? null,
    text: q("[data-testid=demo-onboarding-done]")?.innerText?.replace(/\s+/g, " ").slice(0, 900) ?? null,
  };
});
console.log(JSON.stringify({ handle, theme, mode, ms, ...done }, null, 1));
await browser.close();
