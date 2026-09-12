// node themes2.mjs <handle> <outdir> — panel: each preset → save → wait until storefront data-theme matches → frame
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const [handle = "abs-priem-0812", out = "."] = process.argv.slice(2);
const panel = "http://localhost:5182", shop = `http://${handle}.localhost:8041/ru`;
const src = readFileSync("/Users/ivanprotsko/upready/worktrees/upready-store/feat/abstract-datasets/apps/storefront/src/lib/theme/presets.generated.ts", "utf8");
const labelToId = Object.fromEntries([...src.matchAll(/"([a-z-]+)":\s*"([^"]+)"/g)].map((m) => [m[2], m[1]]));
console.log("label→id", JSON.stringify(labelToId));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" });
const p = await ctx.newPage();
await p.goto(`${panel}/login`, { waitUntil: "networkidle" });
await p.fill('input[name="email"]', `owner-${handle}@example.test`);
await p.fill('input[name="password"]', "supersecret1");
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), p.click('button[type="submit"]')]);
await p.goto(`${panel}/home-settings`, { waitUntil: "networkidle" });
await p.waitForSelector("[data-testid=theme-preset]", { timeout: 30000 });
await p.click("[data-testid=theme-preset]");
const options = await p.$$eval("[role=option]", (els) => els.map((e) => e.textContent.trim()));
await p.keyboard.press("Escape");
const measure = async () => {
  const s = await ctx.newPage();
  await s.goto(shop, { waitUntil: "networkidle", timeout: 120000 });
  const info = await s.evaluate(() => {
    const html = document.documentElement;
    const hero = document.querySelector('img[src*="home-hero"]');
    const tiles = [...document.images].filter((i) => /tile-/.test(i.currentSrc || i.src) && i.getBoundingClientRect().width > 0).length;
    const cards = [...document.images].filter((i) => /-hero\.webp/.test(i.currentSrc || i.src) && !/home-hero/.test(i.currentSrc || i.src) && i.getBoundingClientRect().width > 0).length;
    const cs = getComputedStyle(document.body);
    return { theme: html.getAttribute("data-theme"), mode: html.getAttribute("data-mode"), hero: !!hero && hero.naturalWidth > 0, tiles, cards, h1: document.querySelector("h1")?.textContent.trim(), bg: cs.backgroundColor };
  });
  return { page: s, info };
};
const MARK = "Приёмка абстракт · кэш";
for (let i = 0; i < options.length; i++) {
  const label = options[i], expect = labelToId[label] ?? "?";
  await p.click("[data-testid=theme-preset]");
  await p.locator("[role=option]").nth(i).click();
  if (i === options.length - 1) await p.fill("[data-testid=hero-title]", MARK);
  await p.click("[data-testid=home-settings-save]");
  await p.waitForLoadState("networkidle");
  const t0 = Date.now();
  let m = await measure(), waited = 0;
  while (m.info.theme !== expect && waited < 130) { await m.page.close(); await p.waitForTimeout(10000); waited = Math.round((Date.now() - t0) / 1000); m = await measure(); }
  const file = `${out}/theme-${i + 1}-${m.info.theme}-${m.info.mode}.png`;
  await m.page.screenshot({ path: file, fullPage: true });
  await m.page.close();
  console.log(JSON.stringify({ label, expect, waitedS: Math.round((Date.now() - t0) / 1000), ...m.info, file: file.split("/").pop() }));
}
// hero title through the document cache: measure now and after another 90 s
let m = await measure(); console.log(JSON.stringify({ heroTitleCheck: "right after theme arrived", h1: m.info.h1, expected: MARK })); await m.page.close();
await p.waitForTimeout(90000);
m = await measure(); console.log(JSON.stringify({ heroTitleCheck: "+90s", h1: m.info.h1, expected: MARK })); await m.page.close();
await browser.close();
