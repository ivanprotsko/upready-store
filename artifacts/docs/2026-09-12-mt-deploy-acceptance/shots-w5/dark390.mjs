// node dark390.mjs <outdir> [handle] — 390x844 home: mode toggle in the bottom nav, clicked via DOM (Next dev overlay <nextjs-portal> intercepts the pointer), pageerror/console captured
import { chromium } from "playwright";
const [out = ".", handle = "abs-priem-0812"] = process.argv.slice(2);
const shop = `http://${handle}.localhost:8041/ru`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU", isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [], consoleErr = [];
page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
page.on("console", (m) => { if (m.type() === "error") consoleErr.push(m.text().slice(0, 160)); });
await page.goto(shop, { waitUntil: "networkidle", timeout: 120000 });
const modeBefore = await page.evaluate(() => document.documentElement.getAttribute("data-mode"));
const rect = await page.evaluate(() => { const b = document.querySelector("[data-testid=bottom-nav-mode-toggle]"); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
const portal = await page.evaluate(() => { const p = document.querySelector("nextjs-portal"); if (!p) return null; const r = p.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), text: (p.shadowRoot?.textContent || "").trim().slice(0, 80) }; });
await page.evaluate(() => document.querySelector("[data-testid=bottom-nav-mode-toggle]")?.click());
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const html = document.documentElement, cs = getComputedStyle(document.body);
  const hero = document.querySelector('img[src*="home-hero"]');
  const vis = (i) => i.getBoundingClientRect().width > 0;
  const tiles = [...document.images].filter((i) => /tile-/.test(i.currentSrc || i.src) && vis(i)).length;
  const cards = [...document.images].filter((i) => /-hero\.webp/.test(i.currentSrc || i.src) && !/home-hero/.test(i.currentSrc || i.src) && vis(i)).length;
  return { theme: html.getAttribute("data-theme"), mode: html.getAttribute("data-mode"), bg: cs.backgroundColor, fg: cs.color, hero: !!hero && hero.naturalWidth > 0, tiles, cards, h1: document.querySelector("h1")?.textContent.trim() };
});
await page.screenshot({ path: `${out}/dark-ru-390.png`, fullPage: true });
console.log(JSON.stringify({ viewport: "390x844", toggleRect: rect, portal, modeBefore, ...info, pageErrors: errors, consoleErrors: consoleErr.slice(0, 3), file: "dark-ru-390.png" }));
await browser.close();
