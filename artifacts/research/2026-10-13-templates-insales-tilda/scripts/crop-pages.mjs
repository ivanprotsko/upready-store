// Element shots of chosen collection/product-page sections at 1280, by the ids crawl.mjs recorded. No clicks, no cart.
// >= 2 s between navigations to a host; stop on 403/429. Usage: T33_TOOLS=… node crop-pages.mjs <crawl.json> <outDir> <slug>:<page>:<id>:<file> …
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"
const { chromium } = createRequire(process.env.T33_TOOLS + "/")("playwright-core")
const EXE = process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell"
const [crawlFile, out, ...jobs] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true })
const crawl = JSON.parse(fs.readFileSync(crawlFile, "utf8"))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const last = new Map(); let loaded = null
const browser = await chromium.launch({ executablePath: EXE })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" })).newPage()
for (const job of jobs) {
  const [slug, kind, id, file] = job.split(":"); const url = crawl[slug].pages[kind].url
  if (loaded !== url) {
    const host = new URL(url).host; const w = 2000 - (Date.now() - (last.get(host) || 0)); if (w > 0) await sleep(w); last.set(host, Date.now())
    const r = await page.goto(url, { waitUntil: "load", timeout: 45000 }).catch(() => null); const st = r ? r.status() : 0
    fs.appendFileSync(path.join(out, "fetch-log.jsonl"), JSON.stringify({ at: new Date().toISOString(), url, status: st }) + "\n")
    if (st === 403 || st === 429) { console.log("STOP", st); break }
    await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) } scrollTo(0, 0) })
    await sleep(1200); loaded = url
  }
  const sel = crawl[slug].source === "insales" ? `[data-widget-drop-item-id="${id}"]` : `[id="${id}"]`
  try { await page.locator(sel).first().screenshot({ path: path.join(out, file), type: "jpeg", quality: 60, timeout: 10000 }); console.log("ok", file) } catch (e) { console.log("fail", file, String(e).slice(0, 120)) }
}
await browser.close()
