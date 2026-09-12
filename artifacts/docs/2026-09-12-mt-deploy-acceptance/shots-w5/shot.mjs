// node shot.mjs <url> <out.png> [width] [height] [full] [colorScheme]  — one frame + compact DOM summary
import { chromium } from "playwright";
const [url, out, w = "1280", h = "900", full = "1", scheme = "light"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, locale: "ru-RU", colorScheme: scheme });
const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
const info = await page.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const short = (s) => { try { const u = new URL(s); const inner = u.searchParams.get("url"); return (inner ? new URL(inner).pathname : u.pathname).replace(/^.*\/static\/store-profiles\//, "sp:"); } catch { return s; } };
  const imgs = [...document.images].map((i) => `${short(i.currentSrc || i.src)} ${i.naturalWidth}x${i.naturalHeight}${vis(i) ? "" : " HIDDEN"}`);
  const tids = [...document.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid"));
  const count = (p) => tids.filter((t) => t.includes(p)).length;
  const html = document.documentElement;
  return { title: document.title, theme: html.getAttribute("data-theme"), mode: html.getAttribute("data-mode"), lang: html.lang, h1: [...document.querySelectorAll("h1")].map((e) => e.textContent.trim()), productWrappers: document.querySelectorAll('[data-testid="product-wrapper"]').length, navTestids: [...new Set(tids.filter((t) => t.startsWith("nav-")))], tileLike: count("tile"), imgs, docHeight: document.documentElement.scrollHeight, productLinks: [...new Set([...document.querySelectorAll('a[href*="/products/"]')].map((a) => a.getAttribute("href")))], bodyText: document.body.innerText.replace(/\s+/g, " ").slice(0, 600) };
});
await page.screenshot({ path: out, fullPage: full === "1" });
console.log(JSON.stringify({ url: page.url(), status: resp.status(), ...info }, null, 1));
await browser.close();
