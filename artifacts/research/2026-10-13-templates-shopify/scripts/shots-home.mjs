// Shots pass: home only, popups/cookie bars/overlays hidden with CSS before any shot. No login, no cart, no clicks.
// >=1.5 s between navigations to a host; stop everything on 403/429. Usage: node crawl-demos.mjs <themes-store.json> <outDir> <shotSlugsCsv>
import fs from "node:fs"; import path from "node:path"; import { chromium } from "playwright-core"
const [storeJson, out, shotCsv] = process.argv.slice(2)
const SHOT = new Set((shotCsv || "").split(",").filter(Boolean))
const themes = JSON.parse(fs.readFileSync(storeJson, "utf8"))
const EXE = process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell"
fs.mkdirSync(path.join(out, "full"), { recursive: true }); fs.mkdirSync(path.join(out, "sec"), { recursive: true }); fs.mkdirSync(path.join(out, "dom"), { recursive: true })
const log = (o) => fs.appendFileSync(path.join(out, "fetch-log.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...o }) + "\n")
const HIDE = `.shopify-section-group-popup-group,.shopify-section-group-overlay-group,[id*="newsletter-popup" i],[class*="newsletter-popup"],[class*="age-verif"],.privacy-banner,#shopify-pc__banner,.shopify-pc__banner__dialog,[class*="cookie-bar"],[class*="cookie-banner"],.modal.modal--is-active,.modal__overlay,.popup-overlay,dialog[open],[id*="PopupModal"],[class*="popup--"]{display:none!important}html,body{overflow:visible!important}`
const lastHit = new Map(); const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function go(page, url) {
  const host = new URL(url).host; const wait = 1500 - (Date.now() - (lastHit.get(host) || 0)); if (wait > 0) await sleep(wait)
  lastHit.set(host, Date.now())
  let r; try { r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }) } catch (e) { log({ url, error: String(e).slice(0, 200) }); return null }
  const status = r ? r.status() : 0; log({ url, final: page.url(), status })
  if (status === 403 || status === 429) { console.log("STOP", status, url); process.exitCode = 3; throw new Error("STOP " + status) }
  await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {})
  await page.keyboard.press("Escape").catch(() => {})
  await page.addStyleTag({ content: HIDE }).catch(() => {})
  await page.evaluate(() => document.body.classList.remove("modal-open", "overflow-hidden", "no-scroll")).catch(() => {})
  return status
}
async function scrollThrough(page) {
  await page.evaluate(async () => { const h = () => document.documentElement.scrollHeight; for (let y = 0; y < h(); y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) } window.scrollTo(0, 0) })
  await sleep(800)
  await page.evaluate(() => Promise.race([Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r }))), new Promise((r) => setTimeout(r, 6000))])).catch(() => {})
  await sleep(500)
}
const collect = () => [...document.querySelectorAll(".shopify-section[id^='shopify-section-']")].map((el, i) => {
  const r = el.getBoundingClientRect(); const q = (s) => el.querySelectorAll(s).length
  const inner = [...el.querySelectorAll(":scope > *, :scope > * > *")].slice(0, 6).map((c) => (c.tagName.toLowerCase() + "." + [...c.classList].slice(0, 4).join("."))).join(" ")
  const dst = el.dataset.sectionType || el.querySelector("[data-section-type]")?.dataset.sectionType || null
  const h = el.querySelector("h1,h2,h3")?.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || null
  return { i, id: el.id, key: el.id.replace(/^shopify-section-(template|sections)--\d+__/, ""), group: (el.className.match(/shopify-section-group-([a-z-]+)/) || [])[1] || null, cls: el.className, dst, inner, h, top: Math.round(r.top + scrollY), height: Math.round(r.height),
    n: { img: q("img"), product: new Set([...el.querySelectorAll("a[href*='/products/']")].map((a) => a.pathname)).size, collection: q("a[href*='/collections/']"), email: q("input[type=email]"), video: q("video,iframe[src*=youtube],iframe[src*=vimeo],video-section,deferred-media"), details: q("details"), button: q("button,a.button,.btn"), price: q("[class*=price]"), slider: q("[class*=slider],[class*=carousel],[class*=slideshow],[class*=flickity],[class*=swiper]"), select: q("select,fieldset,variant-radios,variant-selects,input[type=radio]"), qty: q("input[name=quantity],quantity-input,[class*=quantity]"), form: q("form"), stars: q("[class*=rating],[class*=review],[class*=stars]") } }
})
const browser = await chromium.launch({ executablePath: EXE })
const result = {}
try {
  for (const t of themes) {
    if (!t.demo || (process.env.ONLY && !process.env.ONLY.split(",").includes(t.slug))) continue
    const base = t.demo.replace(/\/$/, ""); const res = (result[t.slug] = { demo: base, pages: {} })
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36" })
    const page = await ctx.newPage()
    // home @1280
    const st = await go(page, base + "/"); if (st == null) { res.error = "home failed"; await ctx.close(); continue }
    await scrollThrough(page)
    res.pages.home = { url: page.url(), status: st, title: await page.title(), sections: await page.evaluate(collect) }
    fs.writeFileSync(path.join(out, "dom", t.slug + "-home.html"), await page.content())
    await page.evaluate(() => document.body.classList.remove("modal-open", "overflow-hidden", "no-scroll")).catch(() => {})
    if (SHOT.has(t.slug)) await page.screenshot({ path: path.join(out, "full", `${t.slug}-home-1280.jpg`), fullPage: true, type: "jpeg", quality: 60 })
    for (const s of res.pages.home.sections) {
      if (s.height < 20 || s.height > 6000) continue
      try { await page.locator(`[id="${s.id}"]`).screenshot({ path: path.join(out, "sec", `${t.slug}--${String(s.i).padStart(2, "0")}--${s.key.slice(0, 60)}.jpg`), type: "jpeg", quality: 60, timeout: 8000 }) } catch {}
    }
    const links = await page.evaluate(() => { const a = [...document.querySelectorAll("main a[href*='/products/'], a[href*='/products/']")].map((x) => x.href); const c = [...document.querySelectorAll("a[href*='/collections/']")].map((x) => x.href).filter((h) => !/\/products\//.test(h) && !/\/collections\/?$/.test(h)); return { p: a[0] || null, c: c.find((h) => !/\/collections\/all\b/.test(h)) || c[0] || null } })
    if (false && links.p) { const s2 = await go(page, links.p.split("?")[0]); if (s2 != null) { await scrollThrough(page); res.pages.product = { url: page.url(), status: s2, sections: await page.evaluate(collect) } } }
    if (false && links.c) { const s3 = await go(page, links.c.split("?")[0]); if (s3 != null) { await scrollThrough(page); res.pages.collection = { url: page.url(), status: s3, sections: await page.evaluate(collect) } } }
    // home @360
    if (SHOT.has(t.slug)) {
      await page.setViewportSize({ width: 360, height: 780 }); const s4 = await go(page, base + "/")
      if (s4 != null) { await scrollThrough(page); await page.screenshot({ path: path.join(out, "full", `${t.slug}-home-360.jpg`), fullPage: true, type: "jpeg", quality: 60 }) }
    }
    await ctx.close()
    fs.writeFileSync(path.join(out, "crawl.json"), JSON.stringify(result, null, 1))
    console.log(t.slug, Object.entries(res.pages).map(([k, v]) => k + ":" + v.sections.length).join(" "))
  }
} catch (e) { console.log("ABORT", String(e).slice(0, 300)) }
fs.writeFileSync(path.join(out, "crawl.json"), JSON.stringify(result, null, 1))
await browser.close()
