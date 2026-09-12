// node pairs-shot.mjs <url> <outprefix> [toggle=1] [w=1280] [h=900] — light frame, then (optionally) click the mode toggle WITHOUT reload, dark frame; prints layers + images per surface
import { chromium } from "playwright";
const [url, out, toggle = "1", w = "1280", h = "900"] = process.argv.slice(2);
const mobile = +w < 600;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, locale: "ru-RU", isMobile: mobile, hasTouch: mobile });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120)));
const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 180000 });
const measure = () => page.evaluate(() => {
  const html = document.documentElement;
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none"; };
  const short = (s) => { try { const u = new URL(s); const inner = u.searchParams.get("url"); return (inner ? decodeURIComponent(inner) : u.pathname).replace(/^.*\/static\//, "static/").slice(-60); } catch { return String(s).slice(-60); } };
  const layers = [...document.querySelectorAll("[data-mode-image]")].map((s) => `${s.getAttribute("data-mode-image")}:${vis(s) ? "shown" : "hidden"}`);
  const shownLayerSrcs = [...document.querySelectorAll("[data-mode-image] img")].filter((i) => vis(i)).map((i) => short(i.currentSrc || i.src));
  const imgs = [...document.images].filter((i) => vis(i)).map((i) => `${short(i.currentSrc || i.src)} ${i.naturalWidth}x${i.naturalHeight}`);
  const empty = [...document.images].filter((i) => vis(i) && i.complete && i.naturalWidth === 0).length;
  const tids = ["profile-hero", "category-tile", "category-child-tile", "product-preview", "image-gallery", "zoomable-image"].map((t) => `${t}=${document.querySelectorAll(`[data-testid^="${t}"]`).length}`);
  return { mode: html.getAttribute("data-mode"), theme: html.getAttribute("data-theme"), marker: window.__pairsMarker ?? null, layers: layers.join(" "), shownLayerSrcs, visibleImgs: imgs.length, emptyImgs: empty, firstImgs: imgs.slice(0, 6), tids: tids.join(" "), h1: document.querySelector("h1")?.textContent.trim().slice(0, 60) };
});
await page.evaluate(() => { window.__pairsMarker = "no-reload-" + Math.random().toString(36).slice(2, 8); });
const light = await measure();
await page.screenshot({ path: `${out}-light.png`, fullPage: true });
let dark = null;
if (toggle === "1") {
  const tid = mobile ? "bottom-nav-mode-toggle" : "nav-mode-toggle";
  const present = await page.evaluate((t) => !!document.querySelector(`[data-testid=${t}]`), tid);
  if (present) await page.evaluate((t) => document.querySelector(`[data-testid=${t}]`).click(), tid);
  await page.waitForTimeout(2500);
  dark = await measure();
  dark.toggleUsed = present ? tid : "absent";
  await page.screenshot({ path: `${out}-dark.png`, fullPage: true });
}
console.log(JSON.stringify({ url: page.url(), status: resp.status(), viewport: `${w}x${h}`, light, dark, pageErrors: errors }, null, 0));
await browser.close();
