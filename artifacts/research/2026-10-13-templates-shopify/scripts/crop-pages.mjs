// Element shots of chosen product/collection-page sections at 1280. Popups hidden; >=1.5 s per host; stop on 403/429. No clicks, no cart.
// Usage: node crop-pages.mjs <outDir> <url>::<section key>::<file name> ...
import fs from "node:fs"; import path from "node:path"; import { chromium } from "playwright-core"
const [out, ...jobs] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true })
const EXE = process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell"
const HIDE = `.shopify-section-group-popup-group,.shopify-section-group-overlay-group,[id*="newsletter-popup" i],[class*="newsletter-popup"],[class*="age-verif"],.privacy-banner,#shopify-pc__banner,.shopify-pc__banner__dialog,.modal.modal--is-active,.modal__overlay,dialog[open],[class*="popup--"]{display:none!important}html,body{overflow:visible!important}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const last = new Map()
const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" }); const page = await ctx.newPage()
for (const job of jobs) {
  const [url, key, file] = job.split("::"); const host = new URL(url).host
  const w = 1500 - (Date.now() - (last.get(host) || 0)); if (w > 0) await sleep(w); last.set(host, Date.now())
  const r = await page.goto(url, { waitUntil: "load", timeout: 45000 }).catch((e) => null); const st = r ? r.status() : 0
  fs.appendFileSync(path.join(out, "fetch-log.jsonl"), JSON.stringify({ at: new Date().toISOString(), url, status: st }) + "\n")
  if (st === 403 || st === 429) { console.log("STOP", st); break }
  await page.addStyleTag({ content: HIDE }).catch(() => {})
  await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) } scrollTo(0, 0) })
  await sleep(1200)
  const loc = page.locator(`[id$="__${key}"], [id="shopify-section-${key}"]`).first()
  try { await loc.screenshot({ path: path.join(out, file), type: "jpeg", quality: 60, timeout: 10000 }); console.log("ok", file) } catch (e) { console.log("fail", file, String(e).slice(0, 120)) }
}
await browser.close()
