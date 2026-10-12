// Crawl InSales demo shops and Tilda store templates headless: home (+ one collection and one product page where the
// shop has them), every section with its type code, settings and content counters; section crops and home shots.
// Limits (brief t-2026-10-12-33): headless, >= 2 s between navigations to one host, stop everything on 403/429,
// no login, no cart, no clicks, no form is filled. Raw HTML is not kept.
// Usage: T33_TOOLS=<dir with node_modules/playwright-core> node crawl.mjs <targets.json> <outDir>
//   targets.json: [{ source, slug, theme, demo, shots: true|false }]
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"
const { chromium } = createRequire(process.env.T33_TOOLS + "/")("playwright-core")
const EXE = process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell"
const [targetsFile, out] = process.argv.slice(2)
const targets = JSON.parse(fs.readFileSync(targetsFile, "utf8")).filter((t) => !process.env.ONLY || process.env.ONLY.split(",").includes(t.slug))
for (const d of ["full", "sec", "data"]) fs.mkdirSync(path.join(out, d), { recursive: true })
const log = (o) => fs.appendFileSync(path.join(out, "fetch-log.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...o }) + "\n")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const lastHit = new Map()
const HIDE = `[class*="cookie" i]:not(html):not(body),[id*="cookie" i],.t-popup:not(.t-popup_show),.t706__cartwin,.t-body_scroll-locked .t-popup,[class*="age-verif"],.modal.is-open,.modal-overlay,.jivo-iframe-container,#jivo-iframe-container,jdiv,.b24-widget-button-wrapper{display:none!important}html,body{overflow:visible!important}`

async function go(page, url) {
  const host = new URL(url).host; const wait = 2000 - (Date.now() - (lastHit.get(host) || 0)); if (wait > 0) await sleep(wait)
  lastHit.set(host, Date.now())
  let r; try { r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }) } catch (e) { log({ url, error: String(e).slice(0, 200) }); return null }
  const status = r ? r.status() : 0; log({ url, final: page.url(), status })
  if (status === 403 || status === 429) { console.log("STOP", status, url); process.exitCode = 3; throw new Error("STOP " + status) }
  await page.waitForLoadState("load", { timeout: 25000 }).catch(() => {})
  await page.addStyleTag({ content: HIDE }).catch(() => {})
  return status
}
async function scrollThrough(page) {
  await page.evaluate(async () => { const h = () => document.documentElement.scrollHeight; for (let y = 0; y < h() && y < 30000; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 140)) } window.scrollTo(0, 0) })
  await sleep(900)
  await page.evaluate(() => Promise.race([Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r }))), new Promise((r) => setTimeout(r, 6000))])).catch(() => {})
  await sleep(400)
}

// Runs in the page. One row per section: InSales widget (`.layout[class*=widget-type_]`) or Tilda record (`#allrecords > .t-rec`).
function collect(source) {
  const DERIVED = /-(is-dark|is-light|minor-shade|major-shade|half-shade)(-is-dark|-is-light)?$/
  const els = source === "insales"
    ? [...document.querySelectorAll(".layout[class*='widget-type_']")].filter((el) => !el.parentElement.closest(".layout[class*='widget-type_']"))
    : [...document.querySelectorAll("#allrecords .t-rec, .t-records .t-rec")].filter((el) => !el.parentElement.closest(".t-rec"))
  const text = (el) => (el.innerText || "").replace(/\s+/g, " ").trim()
  return els.map((el, i) => {
    const r = el.getBoundingClientRect(); const q = (s) => el.querySelectorAll(s).length
    let code, settings = []
    if (source === "insales") {
      const m = el.className.match(/widget-type_((?:system_)?widget_v4_[a-z0-9_]+)/); code = m ? m[1] : "unknown"
      for (const part of (el.getAttribute("style") || "").split(";")) {
        const mm = part.match(/^\s*--([a-z0-9_-]+)\s*:\s*(.*)$/i); if (!mm || DERIVED.test(mm[1])) continue
        settings.push({ name: mm[1], value: mm[2].trim().slice(0, 120) })
      }
    } else {
      code = "T" + (el.dataset.recordType || "?")
      const seen = new Set()
      const recCls = [el.className, ...[...el.querySelectorAll(":scope > div, :scope > div > div")].slice(0, 4).map((c) => c.className)].join(" ")
      for (const m of recCls.matchAll(/\bt-rec_(pt|pb)(-res-480)?_(\d+)/g)) { const n = (m[1] === "pt" ? "padding_top" : "padding_bottom") + (m[2] ? "_mobile" : ""); if (!seen.has(n)) { seen.add(n); settings.push({ name: n, value: m[3] + "px" }) } }
      for (const m of recCls.matchAll(/\bt\d+__(witharrows|withbullets|stretched|with-arrows|withshadow|centered|fullscreen|imgleft|imgright)\b/g)) if (!seen.has(m[1])) { seen.add(m[1]); settings.push({ name: m[1], value: "true" }) }
      for (const m of recCls.matchAll(/\bt-catalog__grid-cont_col-(\d+)|\bt-col_(\d+)\b/g)) if (!seen.has("columns")) { seen.add("columns"); settings.push({ name: "columns", value: m[1] || m[2] }) }
      for (const n of [el, ...el.querySelectorAll("[class^='t'][data-tile-ratio], [data-blocks-per-row], [data-store-parts-switch], [data-slider-items], [data-slider-timeout], [data-slider-with-cycle], [data-auto-correct-mobile-width], [data-field-type], [data-tooltip-hook], [data-filter], [data-timer-date]")].slice(0, 40))
        for (const a of n.attributes) if (a.name.startsWith("data-") && !seen.has(a.name) && !/^data-(record-id|elem-id|lid|product-gen-uid|product-uid|product-lid|original|content-loaded|product-inv|product-img|product-url|tooltip-hook|elem-type|animationappear-|offset-top)/.test(a.name)) { seen.add(a.name); settings.push({ name: a.name.replace(/^data-/, ""), value: a.value.slice(0, 120) }) }
      for (const s of el.querySelectorAll("script")) {
        const src = s.textContent || ""; const om = src.match(/t_store_init\([^,]+,\s*(\{[\s\S]{0,6000}?\})\s*\)/) || src.match(/opts\s*=\s*(\{[\s\S]{0,6000}?\});/)
        if (!om) continue
        for (const km of om[1].matchAll(/"?([a-zA-Z_][a-zA-Z0-9_]{1,40})"?\s*:\s*("(?:[^"\\]|\\.)*"|'[^']*'|true|false|-?\d+(?:\.\d+)?)/g)) if (!seen.has(km[1])) { seen.add(km[1]); settings.push({ name: km[1], value: km[2].replace(/^["']|["']$/g, "").slice(0, 120) }) }
      }
    }
    const t = text(el)
    const inner = [...el.querySelectorAll(":scope > *, :scope > * > *")].slice(0, 6).map((c) => c.tagName.toLowerCase() + "." + [...c.classList].slice(0, 3).join(".")).join(" ")
    const hrefs = [...el.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"))
    const iframes = [...el.querySelectorAll("iframe")].map((f) => f.src || f.dataset.src || f.getAttribute("data-original") || "")
    return {
      i, code, id: el.id || el.dataset.widgetDropItemId || null, top: Math.round(r.top + scrollY), height: Math.round(r.height),
      h: el.querySelector("h1,h2,h3,.t-title,.t-section__title,[class*='heading']")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 90) || null,
      text: t.slice(0, 600), textLen: t.length, inner: inner.slice(0, 300), settings,
      n: {
        img: q("img") + q("[style*='background-image'], .t-bgimg"),
        productLinks: new Set(hrefs.filter((h) => /\/product\/|\/tproduct\//.test(h || "")).map((h) => h.split("?")[0])).size,
        collectionLinks: hrefs.filter((h) => /\/collection\//.test(h || "")).length,
        blogLinks: hrefs.filter((h) => /\/blogs?\/|\/articles?\/|\/tpost\//.test(h || "")).length,
        price: q("[class*='price' i]"), form: q("form"), email: q("input[type=email], input[name*=email i]"), tel: q("input[type=tel], input[name*=phone i]"),
        textarea: q("textarea"), button: q("button, a.button, .btn, .t-btn, [class*='button']"),
        video: q("video") + iframes.filter((s) => /youtube|vimeo|rutube|vk\.com\/video|vkvideo/.test(s)).length,
        map: iframes.filter((s) => /maps|yandex\.ru\/map|2gis/.test(s)).length + q("[class*='ymaps'], [class*='map-container'], .t-map"),
        accordion: q("details, [class*='accordion' i], [class*='collapse' i], .t-faq, [class*='faq' i]"),
        slider: q("[class*='slider' i], [class*='swiper' i], [class*='slick' i], [class*='splide' i], [class*='carousel' i], .t-slds"),
        timer: q("[class*='timer' i], [class*='countdown' i]"),
        stars: q("[class*='rating' i], [class*='stars' i]"), menu: q("nav, [class*='menu' i]"),
        social: hrefs.filter((h) => /vk\.com|t\.me\/|telegram|instagram|youtube\.com|ok\.ru|wa\.me|whatsapp|dzen\.ru|pinterest|facebook|tiktok/.test(h || "")).length,
        cart: q("[class*='cart' i], [class*='basket' i]"), search: q("input[type=search], [class*='search' i]"),
        quantity: q("input[name*=quantity i], [class*='counter' i], [class*='quantity' i]"),
        select: q("select, input[type=radio], [class*='variant' i], [class*='option' i]"),
        filter: q("[class*='filter' i]"), sort: q("[class*='sort' i]"), compare: q("[class*='compare' i]"), favorite: q("[class*='favorite' i], [class*='wishlist' i]")
      }
    }
  })
}

// Runs in the page: Russian-market markers in the visible text and links, with the section they sit in.
function signals(source) {
  const RX = {
    "one-click": /купить в (1|один) клик|в 1 клик|заказ в один клик|быстрый заказ/i,
    preorder: /предзаказ/i,
    marketplaces: /ozon|wildberries|яндекс[ .]?маркет|мегамаркет|avito|авито|\bwb\b/i,
    "sbp-payment": /\bсбп\b|система быстрых платежей|юkassa|юкасса|yookassa|робокасс|cloudpayments|тинькофф|т-банк|\bмир\b/i,
    installments: /долями|сплит|рассрочк|оплата частями|в кредит/i,
    "delivery-services": /сдэк|cdek|boxberry|почта россии|dpd|яндекс доставк|5post|ozon rocket/i,
    "pickup-points": /пункт(ы|ов|е)? выдачи|\bпвз\b|самовывоз|постамат/i,
    "delivery-calc": /рассчитать (стоимость )?доставк|расч[её]т доставк|стоимость доставки|срок доставки/i,
    "product-of-day": /товар дня|хит дня|скидка дня|предложение дня/i,
    bonuses: /бонус|кешб[еэ]к|cashback|баллами|баллов/i,
    callback: /обратный звонок|перезвоним|заказать звонок/i,
    compare: /сравнени[ея]|к сравнению/i,
    wishlist: /избранное|в избранное/i,
    messengers: /telegram|телеграм|whatsapp|ватсап|\bvk\b|вконтакте|max\b/i,
    "promo-code": /промокод/i,
    "free-delivery": /бесплатн(ая|ой) доставк|доставка бесплатно/i
  }
  const secs = source === "insales"
    ? [...document.querySelectorAll(".layout[class*='widget-type_']")].filter((el) => !el.parentElement.closest(".layout[class*='widget-type_']"))
    : [...document.querySelectorAll("#allrecords .t-rec, .t-records .t-rec")].filter((el) => !el.parentElement.closest(".t-rec"))
  const out = {}
  secs.forEach((el, i) => {
    const t = ((el.innerText || el.textContent || "") + " " + [...el.querySelectorAll("a[href], img[alt]")].map((a) => a.getAttribute("href") || a.getAttribute("alt")).join(" ")).replace(/\s+/g, " ")
    for (const [k, rx] of Object.entries(RX)) { const m = t.match(rx); if (!m) continue; (out[k] ??= []).push({ i, snippet: t.slice(Math.max(0, m.index - 50), m.index + 70).trim() }) }
  })
  return out
}

const browser = await chromium.launch({ executablePath: EXE })
const result = fs.existsSync(path.join(out, "crawl.json")) ? JSON.parse(fs.readFileSync(path.join(out, "crawl.json"), "utf8")) : {}
const save = () => fs.writeFileSync(path.join(out, "crawl.json"), JSON.stringify(result, null, 1))
try {
  for (const t of targets) {
    const base = t.demo.replace(/\/$/, ""); const res = (result[t.slug] = { source: t.source, theme: t.theme, demo: base, pages: {} })
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36" })
    const page = await ctx.newPage()
    const st = await go(page, base + (t.source === "insales" ? "/" : "")); if (st == null) { res.error = "home failed"; await ctx.close(); save(); continue }
    await scrollThrough(page)
    const sections = await page.evaluate(collect, t.source)
    res.pages.home = { url: page.url(), status: st, title: await page.title(), sections, signals: await page.evaluate(signals, t.source) }
    const has = (f) => fs.existsSync(path.join(out, "full", f)); const cropped = fs.readdirSync(path.join(out, "sec")).some((f) => f.startsWith(`${t.source}-${t.slug}--`))
    if (t.shots && !has(`${t.source}-${t.slug}-1280.jpg`)) await page.screenshot({ path: path.join(out, "full", `${t.source}-${t.slug}-1280.jpg`), fullPage: true, type: "jpeg", quality: 55 }).catch((e) => log({ shot: t.slug, error: String(e).slice(0, 160) }))
    for (const s of cropped ? [] : sections) {
      if (s.height < 30 || s.height > 5000) continue
      const sel = t.source === "insales" ? `[data-widget-drop-item-id="${s.id}"]` : `[id="${s.id}"]`
      await page.locator(sel).first().screenshot({ path: path.join(out, "sec", `${t.source}-${t.slug}--${String(s.i).padStart(2, "0")}--${s.code}.jpg`), type: "jpeg", quality: 60, timeout: 8000 }).catch(() => {})
    }
    // One collection and one product page, links taken from the home page only (no search, no clicks).
    const links = await page.evaluate((source) => {
      const hrefs = [...document.querySelectorAll("a[href]")].map((a) => a.href).filter((h) => h.startsWith(location.origin))
      if (source === "insales") return { collection: hrefs.find((h) => /\/collection\/(?!all\b)[^/?#]+\/?$/.test(h) && !/\/collection\/(main|frontpage)\b/.test(h)) || null, product: hrefs.find((h) => /\/product\/[^/?#]+/.test(h)) || null }
      return { collection: null, product: hrefs.find((h) => /\/tproduct\//.test(h) && !h.includes("#")) || null }
    }, t.source)
    for (const kind of ["collection", "product"]) {
      const url = links[kind]; if (!url) continue
      const s2 = await go(page, url.split("#")[0]); if (s2 == null) continue
      await scrollThrough(page)
      res.pages[kind] = { url: page.url(), status: s2, title: await page.title(), sections: await page.evaluate(collect, t.source), signals: await page.evaluate(signals, t.source) }
    }
    if (t.shots && !has(`${t.source}-${t.slug}-360.jpg`)) {
      await page.setViewportSize({ width: 360, height: 780 })
      const s4 = await go(page, base + (t.source === "insales" ? "/" : ""))
      if (s4 != null) { await scrollThrough(page); await page.screenshot({ path: path.join(out, "full", `${t.source}-${t.slug}-360.jpg`), fullPage: true, type: "jpeg", quality: 55 }).catch((e) => log({ shot: t.slug + "-360", error: String(e).slice(0, 160) })) }
    }
    await ctx.close(); save()
    console.log(t.source, t.slug, Object.entries(res.pages).map(([k, v]) => k + ":" + v.sections.length).join(" "))
  }
} catch (e) { console.log("ABORT", String(e).slice(0, 300)) }
save(); await browser.close()
