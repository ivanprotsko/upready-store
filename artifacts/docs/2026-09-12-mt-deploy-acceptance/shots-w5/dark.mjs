// node dark.mjs <outdir> [handle] — storefront home: click the mode toggle (nav at 1280, bottom-nav at 390), frame + DOM
import { chromium } from "playwright";
const [out = ".", handle = "abs-priem-0812"] = process.argv.slice(2);
const shop = `http://${handle}.localhost:8041/ru`;
const browser = await chromium.launch();
const run = async (w, h, tid, name) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: "ru-RU" });
  const page = await ctx.newPage();
  await page.goto(shop, { waitUntil: "networkidle", timeout: 120000 });
  const modeBefore = await page.evaluate(() => document.documentElement.getAttribute("data-mode"));
  const btn = page.locator(`[data-testid=${tid}]`).first();
  const toggleVisible = await btn.isVisible().catch(() => false);
  if (toggleVisible) await btn.click();
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const html = document.documentElement, cs = getComputedStyle(document.body);
    const hero = document.querySelector('img[src*="home-hero"]');
    const vis = (i) => i.getBoundingClientRect().width > 0;
    const tiles = [...document.images].filter((i) => /tile-/.test(i.currentSrc || i.src) && vis(i)).length;
    const cards = [...document.images].filter((i) => /-hero\.webp/.test(i.currentSrc || i.src) && !/home-hero/.test(i.currentSrc || i.src) && vis(i)).length;
    return { theme: html.getAttribute("data-theme"), mode: html.getAttribute("data-mode"), bg: cs.backgroundColor, fg: cs.color, hero: !!hero && hero.naturalWidth > 0, tiles, cards, h1: document.querySelector("h1")?.textContent.trim() };
  });
  await page.screenshot({ path: `${out}/${name}`, fullPage: true });
  console.log(JSON.stringify({ viewport: `${w}x${h}`, toggle: tid, toggleVisible, modeBefore, ...info, file: name }));
  await ctx.close();
};
await run(1280, 900, "nav-mode-toggle", "dark-ru-1280.png");
await run(390, 844, "bottom-nav-mode-toggle", "dark-ru-390.png");
await browser.close();
