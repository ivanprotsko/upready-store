#!/usr/bin/env node
/**
 * Runtime theme-coverage gate.
 *
 * The repaint gate (theme-repaint-gate.mjs) is a PARSE: it proves no literal Tailwind
 * colour is left in the source. It cannot prove the result is READABLE. This gate is the
 * other half — it drives a real browser over the real stand and measures, per rendered
 * text node, the WCAG 2.1 contrast between the composited foreground and the composited
 * background, in both modes and both viewports.
 *
 * Usage:
 *   node apps/storefront/scripts/theme-coverage-gate.mjs --url http://localhost:8044 \
 *        [--json out.json] [--modes light,dark] [--viewports 390,1440] \
 *        [--pages home,category,pdp,cart,account] [--locale ru]
 *
 * Exit codes: 0 = every check passed, 1 = a check failed, 2 = operational error
 * (browser missing, page 500, navigation timeout) — an operational error is NOT a
 * verdict on the theme and must never be read as one.
 */

import { writeFileSync, mkdirSync } from "node:fs"
import { inflateSync } from "node:zlib"
import { dirname, resolve as resolvePath } from "node:path"

// ---------------------------------------------------------------------------
// 0. CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("--")) continue
    const eq = a.indexOf("=")
    if (eq > -1) args[a.slice(2, eq)] = a.slice(eq + 1)
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) args[a.slice(2)] = argv[++i]
    else args[a.slice(2)] = "true"
  }
  return args
}
const args = parseArgs(process.argv.slice(2))

if (args.help === "true" || args.h === "true") {
  console.log(
    "usage: theme-coverage-gate.mjs --url <base> [--json <path>] [--modes light,dark]\n" +
      "       [--viewports 390,1440] [--pages home,category,pdp,cart,account] [--locale ru]\n" +
      "       [--timeout 30000] [--headed]",
  )
  process.exit(0)
}

const BASE = String(args.url || "").replace(/\/+$/, "")
if (!BASE) {
  console.error("theme-coverage-gate: --url is required (e.g. --url http://localhost:8044)")
  process.exit(2)
}
const LOCALE = args.locale || "ru"
const MODES = String(args.modes || "light,dark").split(",").map((s) => s.trim()).filter(Boolean)
const VIEWPORT_WIDTHS = String(args.viewports || "390,1440").split(",").map((s) => Number(s.trim())).filter((n) => n > 0)
const VIEWPORT_HEIGHT = { 390: 844, 1440: 900 }   // the two shapes the brief names; anything else gets 900
const PAGE_KINDS = String(args.pages || "home,category,pdp,cart,account").split(",").map((s) => s.trim()).filter(Boolean)
const NAV_TIMEOUT = Number(args.timeout || 30000)
const HEADLESS = args.headed !== "true"
// Per cell, at most this many failing nodes get the pixel re-measurement of stage 2.
const MAX_PIXEL_PROBES = Number(args["pixel-probes"] || 60)
const JSON_OUT = args.json && args.json !== "true" ? resolvePath(args.json) : null

// Theme axes, mirrored from apps/storefront/src/lib/theme/attributes.ts. The pre-paint
// script reads localStorage BEFORE the first paint, so the only way to force a mode is to
// write the key with addInitScript and then assert the attribute landed after load.
const MODE_ATTR = "data-mode"
const MODE_STORAGE_KEY = "upready-store.mode"
const THEME_ATTR = "data-theme"
const THEME_STORAGE_KEY = "upready-store.theme"
const THEME_ID = args.theme || null   // null = leave whatever the profile serves

// ---------------------------------------------------------------------------
// 1. Allow-list — every entry needs a REASON. Empty by default, and the run reports
//    how many nodes it suppressed, so an allow-list can never be a silent exclusion.
//    A match is by CSS-ish selector substring AND (optionally) page kind.
// ---------------------------------------------------------------------------
const ALLOW_LIST = [
  // { match: "nextjs-portal", reason: "Next.js dev overlay, not product surface" },
]
function allowed(selector) {
  return ALLOW_LIST.find((e) => selector.includes(e.match)) || null
}

// ---------------------------------------------------------------------------
// 2. Playwright. `playwright` is not linked into apps/storefront/node_modules in this
//    workspace, only `@playwright/test` is — and @playwright/test re-exports chromium.
//    Never require.resolve() a package that ships an ESM wrapper: the CJS entry hands
//    back a namespace with no chromium and the failure lands far from the import.
// ---------------------------------------------------------------------------
async function loadChromium() {
  const tried = []
  for (const spec of ["playwright", "@playwright/test", "playwright-core"]) {
    try {
      const mod = await import(spec)
      const chromium = mod.chromium ?? mod.default?.chromium
      if (chromium && typeof chromium.launch === "function") return { chromium, spec }
      tried.push(`${spec}: imported but no chromium (keys: ${Object.keys(mod).slice(0, 8).join(",")})`)
    } catch (err) {
      tried.push(`${spec}: ${err.message.split("\n")[0]}`)
    }
  }
  throw new Error(`no usable chromium\n  ${tried.join("\n  ")}`)
}

// ---------------------------------------------------------------------------
// 3. The in-page probe. Everything below runs INSIDE the browser; it must be
//    self-contained (no closures over module scope).
// ---------------------------------------------------------------------------
function inPageProbe() {
  // --- colour parsing: the browser always normalises computed colours to
  //     rgb()/rgba()/color(srgb ...), so a narrow parser is enough.
  function parseColor(str) {
    if (!str) return null
    const s = str.trim()
    if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 }
    let m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.%]+))?\s*\)$/i)
    if (m) {
      let a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4])
      return { r: +m[1], g: +m[2], b: +m[3], a: isFinite(a) ? a : 1 }
    }
    m = s.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/i)
    if (m) return { r: +m[1] * 255, g: +m[2] * 255, b: +m[3] * 255, a: m[4] === undefined ? 1 : +m[4] }
    m = s.match(/^#([0-9a-f]{3,8})$/i)
    if (m) {
      const h = m[1]
      const ex = h.length <= 4 ? h.split("").map((c) => c + c).join("") : h
      return {
        r: parseInt(ex.slice(0, 2), 16), g: parseInt(ex.slice(2, 4), 16), b: parseInt(ex.slice(4, 6), 16),
        a: ex.length === 8 ? parseInt(ex.slice(6, 8), 16) / 255 : 1,
      }
    }
    return null
  }
  const rgbStr = (c) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`
  // real alpha compositing: out = fg*a + bg*(1-a)
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  })
  function luminance(c) {
    const ch = (v) => {
      const x = v / 255
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)
  }
  function contrast(a, b) {
    const la = luminance(a), lb = luminance(b)
    const hi = Math.max(la, lb), lo = Math.min(la, lb)
    return (hi + 0.05) / (lo + 0.05)
  }

  // --- the canvas colour: per CSS the root's background propagates to the canvas, and
  //     if the root is transparent the body's does. White is the last resort.
  function canvasColor() {
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue
      const c = parseColor(getComputedStyle(el).backgroundColor)
      if (c && c.a >= 1) return c
    }
    return { r: 255, g: 255, b: 255, a: 1 }
  }

  // --- composite the ancestor background chain down to an opaque colour.
  function compositedBackground(el, canvas) {
    const layers = []           // topmost first
    let overImage = false
    let node = el
    while (node) {
      const cs = getComputedStyle(node)
      if (cs.backgroundImage && cs.backgroundImage !== "none") overImage = true
      const c = parseColor(cs.backgroundColor)
      if (c && c.a > 0) {
        layers.push(c)
        if (c.a >= 1) break
      }
      node = node.parentElement
    }
    const bottom = layers.length && layers[layers.length - 1].a >= 1 ? null : canvas
    let out = bottom || layers.pop()
    for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i], out)
    return { color: out, overImage }
  }

  // --- effective opacity: opacity is not inherited but the RENDERED result multiplies.
  function chainOpacity(el) {
    let o = 1, node = el
    while (node && node !== document.documentElement) {
      const v = parseFloat(getComputedStyle(node).opacity)
      if (isFinite(v)) o *= v
      node = node.parentElement
    }
    return o
  }

  // --- a stable, human-readable handle for a node.
  function selectorFor(el) {
    const bits = []
    let node = el, depth = 0
    while (node && node.nodeType === 1 && depth < 4) {
      let part = node.tagName.toLowerCase()
      if (node.id) { bits.unshift(part + "#" + node.id); break }
      const cls = (node.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean)
      if (cls.length) part += "." + cls.slice(0, 6).join(".")
      else {
        const sibs = node.parentElement ? Array.from(node.parentElement.children).filter((s) => s.tagName === node.tagName) : []
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(node) + 1})`
      }
      bits.unshift(part)
      node = node.parentElement
      depth++
    }
    return bits.join(" > ")
  }

  // --- Is something PAINTED behind this text that no computed colour can describe?
  //     An <img>/<video>/<canvas>/<svg> that overlaps the text rect but is neither an
  //     ancestor nor a descendant of it is a painted layer the colour walk cannot see.
  //     Nodes flagged here are handed to the stage-2 pixel measurement rather than judged
  //     against a guessed canvas colour.
  const MEDIA = Array.from(document.querySelectorAll("img,video,canvas,svg,picture")).map((m) => ({
    el: m, rect: m.getBoundingClientRect(),
  })).filter((m) => m.rect.width > 2 && m.rect.height > 2)
  function mediaBehind(el, rect) {
    for (const m of MEDIA) {
      if (m.el === el || m.el.contains(el) || el.contains(m.el)) continue
      const r = m.rect
      if (rect.left < r.right && rect.right > r.left && rect.top < r.bottom && rect.bottom > r.top) return true
    }
    return false
  }

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TITLE", "HEAD", "META", "LINK"])
  // whitespace + zero-width + BOM + word-joiner: text made only of these renders nothing
  const BLANK = /^[\s​‌‍⁠﻿ ]*$/

  const canvas = canvasColor()
  const findings = []
  let examined = 0

  for (const el of document.querySelectorAll("*")) {
    if (SKIP_TAGS.has(el.tagName)) continue
    // the node must render its OWN text: a direct, non-blank text-node child
    let ownText = ""
    for (const n of el.childNodes) if (n.nodeType === 3) ownText += n.nodeValue
    if (BLANK.test(ownText)) continue
    const text = ownText.trim()

    const cs = getComputedStyle(el)
    if (cs.display === "none" || cs.visibility === "hidden") continue
    const op = chainOpacity(el)
    if (op <= 0.01) continue
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue

    examined++

    const bgInfo = compositedBackground(el, canvas)
    const bg = bgInfo.color
    const rawFg = parseColor(cs.color)
    if (!rawFg) continue
    // fold both the colour's own alpha and the rendered opacity into one composite
    const fg = over({ ...rawFg, a: Math.max(0, Math.min(1, rawFg.a * op)) }, bg)

    const ratio = contrast(fg, bg)
    const fontSize = parseFloat(cs.fontSize) || 16
    const weightRaw = cs.fontWeight
    const weight = weightRaw === "bold" ? 700 : weightRaw === "normal" ? 400 : parseInt(weightRaw, 10) || 400
    const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700)
    const threshold = large ? 3.0 : 4.5

    if (ratio + 1e-9 < threshold) {
      const media = bgInfo.overImage || mediaBehind(el, rect)
      const probeId = media ? String(findings.length) : null
      if (probeId !== null) el.setAttribute("data-tgate-probe", probeId)
      findings.push({
        probeId,
        mediaBehind: media,
        selector: selectorFor(el),
        text: text.length > 40 ? text.slice(0, 40) + "…" : text,
        fg: rgbStr(fg),
        bg: rgbStr(bg),
        fgRaw: { r: rawFg.r, g: rawFg.g, b: rawFg.b, a: Math.max(0, Math.min(1, rawFg.a * op)) },
        ratio: Math.round(ratio * 100) / 100,
        threshold,
        large,
        fontSize,
        weight,
        overImage: bgInfo.overImage,
      })
    }
  }

  // --- body background assertion, deliberately SEPARATE from the contrast walk.
  //     Its absence from an earlier brief is a recorded process failure; it is a check
  //     in its own right, not a side effect of the contrast pass.
  let bodyBg = null
  {
    const probe = document.createElement("div")
    probe.setAttribute("style", "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;background-color:var(--background)")
    document.documentElement.appendChild(probe)
    const declared = parseColor(getComputedStyle(probe).backgroundColor)
    probe.remove()
    const rawVar = getComputedStyle(document.documentElement).getPropertyValue("--background").trim()
    // Where the paint actually comes from: `body` may be transparent and inherit the
    // canvas from `html`. Both render identically, so this is recorded, not failed on —
    // but it is the difference between "body has a background rule" and "it does not",
    // and a report that cannot tell them apart is not worth reading.
    const ownBody = parseColor(getComputedStyle(document.body).backgroundColor)
    let paintedBy = "canvas(fallback)"
    for (let n = document.body; n; n = n.parentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor)
      if (c && c.a >= 1) { paintedBy = n.tagName.toLowerCase(); break }
    }
    const actualInfo = compositedBackground(document.body, canvas)
    const actual = actualInfo.color
    const within = (x, y) => Math.abs(x - y) <= 1
    const ok =
      !!declared && declared.a > 0 &&
      within(Math.round(actual.r), Math.round(declared.r)) &&
      within(Math.round(actual.g), Math.round(declared.g)) &&
      within(Math.round(actual.b), Math.round(declared.b))
    bodyBg = {
      ok,
      declaredVar: rawVar || "(--background is empty)",
      declared: declared ? rgbStr(declared) : null,
      actual: rgbStr(actual),
      resolvable: !!declared && declared.a > 0,
      bodyOwnBackground: ownBody ? (ownBody.a > 0 ? rgbStr(ownBody) : "transparent") : "transparent",
      bodyOwnIsOpaque: !!ownBody && ownBody.a >= 1,
      paintedBy,
    }
  }

  return {
    findings,
    examined,
    bodyBg,
    mode: document.documentElement.getAttribute("data-mode"),
    theme: document.documentElement.getAttribute("data-theme"),
    canvas: rgbStr(canvas),
  }
}

// ---------------------------------------------------------------------------
// 3b. Stage 2 — pixel measurement for text painted over media.
//
//   The colour walk of stage 1 can only see COMPUTED colours. Hero copy sitting on an
//   <img> therefore composites down to the canvas and reads as white-on-white: a false
//   positive on both stands. Rather than guess, or exclude the hero, stage 2 MEASURES the
//   painted background: the glyphs are made transparent with a scoped stylesheet (layout
//   and background untouched, unlike visibility:hidden which would make the element
//   unshootable), the element is screenshotted, and the PNG is decoded here.
//
//   The verdict uses the MEAN background colour; the luminance spread and the worst-case
//   ratio are reported alongside so a textured background is visible as such and never
//   hides behind a comfortable average.
// ---------------------------------------------------------------------------
function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG")
  let pos = 8, w = 0, h = 0, depth = 0, colorType = 0, interlace = 0
  const idat = []
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString("ascii", pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4)
      depth = data[8]; colorType = data[9]; interlace = data[12]
    } else if (type === "IDAT") idat.push(data)
    else if (type === "IEND") break
    pos += 12 + len
  }
  if (depth !== 8 || interlace !== 0 || ![0, 2, 6].includes(colorType)) {
    throw new Error(`unsupported PNG: depth=${depth} colorType=${colorType} interlace=${interlace}`)
  }
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 1
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(h * stride)
  let p = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[p++]
    const line = raw.subarray(p, p + stride); p += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= ch ? prev[x - ch] : 0
      let v = line[x]
      if (filter === 1) v = (v + a) & 255
      else if (filter === 2) v = (v + b) & 255
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255
      else if (filter === 4) {
        const pp = a + b - c
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c)
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255
      }
      cur[x] = v
    }
  }
  return { w, h, ch, data: out }
}

const lum = (c) => {
  const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
}
const ratioOf = (a, b) => {
  const la = lum(a), lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
const overWhite = (c) => ({ r: c.r * c.a + 255 * (1 - c.a), g: c.g * c.a + 255 * (1 - c.a), b: c.b * c.a + 255 * (1 - c.a) })
const asRgb = (c) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`

function pixelStats(png) {
  const { w, h, ch, data } = png
  let sr = 0, sg = 0, sb = 0, n = 0, minL = 1, maxL = 0
  let minC = null, maxC = null
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 20000)))   // cap the sample at ~20k px
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * ch
      const px = ch === 1
        ? { r: data[i], g: data[i], b: data[i] }
        : { r: data[i], g: data[i + 1], b: data[i + 2] }
      if (ch === 4 && data[i + 3] < 255) {
        const a = data[i + 3] / 255
        px.r = px.r * a + 255 * (1 - a); px.g = px.g * a + 255 * (1 - a); px.b = px.b * a + 255 * (1 - a)
      }
      sr += px.r; sg += px.g; sb += px.b; n++
      const L = lum(px)
      if (L < minL) { minL = L; minC = px }
      if (L > maxL) { maxL = L; maxC = px }
    }
  }
  if (!n) return null
  return { mean: { r: sr / n, g: sg / n, b: sb / n }, minC, maxC, spread: maxL - minL, sampled: n }
}

async function refineOverMedia(page, findings) {
  const stats = { measured: 0, resolved: 0, failedToMeasure: 0 }
  const candidates = findings.filter((f) => f.mediaBehind && f.probeId !== null).slice(0, MAX_PIXEL_PROBES)
  for (const f of candidates) {
    const sel = `[data-tgate-probe="${f.probeId}"]`
    const loc = page.locator(sel).first()
    let styleHandle = null, shot = null
    try {
      styleHandle = await page.addStyleTag({
        content: `${sel}, ${sel} * { color: transparent !important; text-shadow: none !important; ` +
          `-webkit-text-stroke-color: transparent !important; caret-color: transparent !important; }`,
      })
      shot = await loc.screenshot({ timeout: 8000, animations: "disabled", scale: "css" })
    } catch {
      shot = null
    } finally {
      if (styleHandle) await styleHandle.evaluate((e) => e.remove()).catch(() => {})
    }
    if (!shot) { stats.failedToMeasure++; f.pixel = { ok: false, reason: "screenshot failed" }; continue }
    let st
    try { st = pixelStats(decodePng(shot)) } catch (e) { st = null; f.pixel = { ok: false, reason: e.message } }
    if (!st) { stats.failedToMeasure++; continue }
    stats.measured++
    const fgOnMean = {
      r: f.fgRaw.r * f.fgRaw.a + st.mean.r * (1 - f.fgRaw.a),
      g: f.fgRaw.g * f.fgRaw.a + st.mean.g * (1 - f.fgRaw.a),
      b: f.fgRaw.b * f.fgRaw.a + st.mean.b * (1 - f.fgRaw.a),
    }
    const rMean = ratioOf(fgOnMean, st.mean)
    const rWorst = Math.min(ratioOf(fgOnMean, st.minC), ratioOf(fgOnMean, st.maxC))
    f.pixel = {
      ok: true,
      bg: asRgb(st.mean), fg: asRgb(fgOnMean),
      ratio: Math.round(rMean * 100) / 100,
      worstRatio: Math.round(rWorst * 100) / 100,
      luminanceSpread: Math.round(st.spread * 1000) / 1000,
      sampledPixels: st.sampled,
    }
    if (rMean + 1e-9 >= f.threshold) {
      f.resolvedByPixel = true
      stats.resolved++
    } else {
      // the measurement stands in for the guess: report the real numbers
      f.fg = f.pixel.fg
      f.bg = f.pixel.bg
      f.ratio = f.pixel.ratio
    }
  }
  return stats
}

// ---------------------------------------------------------------------------
// 4. Route discovery — never hardcode a slug that has not been proven to answer 200.
// ---------------------------------------------------------------------------
async function discoverRoutes(page) {
  const home = `${BASE}/${LOCALE}`
  const res = await page.goto(home, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT })
  if (!res || res.status() >= 400) throw new Error(`home ${home} answered ${res ? res.status() : "no response"}`)
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")),
  )
  const pick = (re) => {
    for (const h of hrefs) if (h && re.test(h) && !/^https?:/i.test(h)) return h
    return null
  }
  const withLocale = (p) => {
    if (!p) return null
    if (p.startsWith(`/${LOCALE}/`)) return `${BASE}${p}`
    return `${BASE}/${LOCALE}${p.startsWith("/") ? p : "/" + p}`
  }
  return {
    home,
    category: withLocale(pick(/\/categories\/[^/?#]+$/)) || `${BASE}/${LOCALE}/store`,
    pdp: withLocale(pick(/\/products\/[^/?#]+$/)),
    cart: `${BASE}/${LOCALE}/cart`,
    account: `${BASE}/${LOCALE}/account`,
  }
}

// ---------------------------------------------------------------------------
// 5. Run
// ---------------------------------------------------------------------------
const started = Date.now()
let browser = null
let exitCode = 0

function opErr(msg) {
  console.error(`\nOPERATIONAL ERROR: ${msg}`)
  console.error("exit 2 — this is not a verdict on the theme.")
  process.exitCode = 2
}

try {
  const { chromium, spec } = await loadChromium()
  if (!chromium) throw new Error("chromium is undefined after import")   // assert, per brief
  browser = await chromium.launch({ headless: HEADLESS })

  const bootCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const bootPage = await bootCtx.newPage()
  const ROUTES = await discoverRoutes(bootPage)
  await bootCtx.close()

  for (const kind of PAGE_KINDS) {
    if (!ROUTES[kind]) throw new Error(`page kind "${kind}" has no discovered URL`)
  }

  console.log(`theme-coverage-gate  base=${BASE}  locale=${LOCALE}  playwright=${spec}`)
  console.log(`routes:`)
  for (const kind of PAGE_KINDS) console.log(`  ${kind.padEnd(9)} ${ROUTES[kind]}`)
  console.log(
    `matrix: ${PAGE_KINDS.length} pages x ${MODES.length} modes x ${VIEWPORT_WIDTHS.length} viewports = ` +
      `${PAGE_KINDS.length * MODES.length * VIEWPORT_WIDTHS.length} loads\n`,
  )

  const cells = []
  let suppressed = 0

  for (const mode of MODES) {
    for (const width of VIEWPORT_WIDTHS) {
      const height = VIEWPORT_HEIGHT[width] || 900
      const context = await browser.newContext({ viewport: { width, height } })
      // The pre-paint script reads localStorage before the first paint, so both keys are
      // written BEFORE navigation, not after it.
      await context.addInitScript(
        ({ modeKey, mode, themeKey, theme }) => {
          try {
            window.localStorage.setItem(modeKey, mode)
            if (theme) window.localStorage.setItem(themeKey, theme)
          } catch { /* private mode / storage disabled: the assertion below catches it */ }
        },
        { modeKey: MODE_STORAGE_KEY, mode, themeKey: THEME_STORAGE_KEY, theme: THEME_ID },
      )
      const page = await context.newPage()
      page.setDefaultTimeout(NAV_TIMEOUT)

      for (const kind of PAGE_KINDS) {
        const url = ROUTES[kind]
        const res = await page.goto(url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT }).catch((e) => {
          throw new Error(`navigation failed ${url} (${mode}/${width}): ${e.message.split("\n")[0]}`)
        })
        const status = res ? res.status() : 0
        if (!res || status >= 400) throw new Error(`${url} answered ${status || "no response"}`)

        // A mode that does not land is a THEME defect, not an operational one: record it
        // as a failing cell and keep walking, so one broken axis cannot hide the rest.
        const appliedMode = await page.evaluate(() => document.documentElement.dataset.mode)
        const modeApplied = appliedMode === mode

        const probe = await page.evaluate(inPageProbe)
        const pixel = await refineOverMedia(page, probe.findings)

        // group identical (selector, fg, bg) so a skeleton grid collapses to one line
        const groups = new Map()
        for (const f of probe.findings) {
          if (f.resolvedByPixel) continue          // the guessed canvas was wrong; the MEASURED background passes
          const hit = allowed(f.selector)
          if (hit) { suppressed++; continue }
          delete f.fgRaw                            // internal, not part of the record
          const key = `${f.selector}|${f.fg}|${f.bg}`
          const g = groups.get(key)
          if (g) { g.count++; if (f.ratio < g.ratio) g.ratio = f.ratio }
          else groups.set(key, { ...f, count: 1 })
        }
        const grouped = [...groups.values()].sort((a, b) => a.ratio - b.ratio)
        const nodes = grouped.reduce((n, g) => n + g.count, 0)

        cells.push({
          page: kind, url, mode, viewport: `${width}x${height}`,
          status, examined: probe.examined, canvas: probe.canvas,
          theme: probe.theme, appliedMode,
          failingNodes: nodes, failingGroups: grouped.length, groups: grouped,
          pixelPass: pixel,
          bodyBg: probe.bodyBg,
          modeApplied,
          failed: nodes > 0 || !probe.bodyBg.ok || !modeApplied,
        })
      }
      await context.close()
    }
  }

  // ---- report -------------------------------------------------------------
  const failingCells = cells.filter((c) => c.failed)
  const totalNodes = cells.reduce((n, c) => n + c.failingNodes, 0)
  const totalGroups = cells.reduce((n, c) => n + c.failingGroups, 0)
  const bodyBgFails = cells.filter((c) => !c.bodyBg.ok)
  const overImageNodes = cells.reduce(
    (n, c) => n + c.groups.filter((g) => g.mediaBehind).reduce((m, g) => m + g.count, 0), 0)
  const pixMeasured = cells.reduce((n, c) => n + c.pixelPass.measured, 0)
  const pixResolved = cells.reduce((n, c) => n + c.pixelPass.resolved, 0)
  const pixFailed = cells.reduce((n, c) => n + c.pixelPass.failedToMeasure, 0)

  for (const c of cells) {
    const head = `${c.page.padEnd(9)} ${c.mode.padEnd(5)} ${c.viewport.padEnd(9)}`
    const verdict = c.failed ? "FAIL" : "pass"
    console.log(
      `${verdict}  ${head} examined=${String(c.examined).padStart(4)}  ` +
        `failing nodes=${String(c.failingNodes).padStart(4)} (${c.failingGroups} distinct)  ` +
        `body-bg=${c.bodyBg.ok ? "ok" : "MISMATCH"}(painted by <${c.bodyBg.paintedBy}>)` +
        (c.modeApplied ? "" : `  ${MODE_ATTR} NOT APPLIED (asked ${c.mode}, got ${c.appliedMode})`),
    )
    if (!c.bodyBg.ok) {
      console.log(
        `      body background: declared --background=${c.bodyBg.declaredVar} -> ${c.bodyBg.declared || "UNRESOLVABLE"}` +
          `  actual composited=${c.bodyBg.actual}`,
      )
    }
    for (const g of c.groups.slice(0, 12)) {
      const tag = g.pixel && g.pixel.ok
        ? ` [measured over media, luminance spread ${g.pixel.luminanceSpread}, worst ${g.pixel.worstRatio.toFixed(2)}]`
        : g.mediaBehind ? " [over media, NOT measurable — colours are the CSS chain]" : ""
      console.log(
        `      ${g.ratio.toFixed(2)} < ${g.threshold.toFixed(1)}  ` +
          `${g.fg} on ${g.bg}${tag}  x${g.count}\n` +
          `        ${g.selector}\n        "${g.text}"`,
      )
    }
    if (c.groups.length > 12) console.log(`      … ${c.groups.length - 12} more distinct failures (see --json)`)
  }

  console.log(`\n== summary =========================================================`)
  console.log(`base                       : ${BASE}`)
  console.log(`cells (page x mode x vp)   : ${cells.length}`)
  console.log(`failing cells              : ${failingCells.length}`)
  console.log(`failing nodes (total)      : ${totalNodes}`)
  console.log(`distinct failure groups    : ${totalGroups}`)
  console.log(`  of which over media      : ${overImageNodes} nodes`)
  console.log(`pixel stage (over media)   : measured ${pixMeasured}, resolved ${pixResolved}, unmeasurable ${pixFailed}`)
  console.log(`body-background assertion  : ${bodyBgFails.length === 0 ? "PASS on all " + cells.length + " cells" : "FAIL on " + bodyBgFails.length + "/" + cells.length + " cells"}`)
  const paintSrc = [...new Set(cells.map((c) => c.bodyBg.paintedBy))].join(", ")
  const ownOpaque = cells.filter((c) => c.bodyBg.bodyOwnIsOpaque).length
  console.log(`  background painted by      : <${paintSrc}>  (body carries its own opaque rule on ${ownOpaque}/${cells.length} cells)`)
  console.log(`allow-list entries         : ${ALLOW_LIST.length} (suppressed ${suppressed} nodes)`)
  console.log(`elapsed                    : ${((Date.now() - started) / 1000).toFixed(1)}s`)

  exitCode = failingCells.length > 0 ? 1 : 0
  console.log(`verdict                    : ${exitCode === 0 ? "GREEN" : "RED"}`)

  if (JSON_OUT) {
    mkdirSync(dirname(JSON_OUT), { recursive: true })
    writeFileSync(
      JSON_OUT,
      JSON.stringify(
        {
          base: BASE, locale: LOCALE, modes: MODES, viewports: VIEWPORT_WIDTHS, pages: PAGE_KINDS,
          startedAt: new Date(started).toISOString(), elapsedMs: Date.now() - started,
          allowList: ALLOW_LIST, suppressedNodes: suppressed,
          totals: {
            cells: cells.length, failingCells: failingCells.length,
            failingNodes: totalNodes, failingGroups: totalGroups,
            overMediaNodes: overImageNodes, bodyBgFailingCells: bodyBgFails.length,
            pixelMeasured: pixMeasured, pixelResolved: pixResolved, pixelUnmeasurable: pixFailed,
          },
          cells,
        },
        null, 2,
      ) + "\n",
    )
    console.log(`json                       : ${JSON_OUT}`)
  }
  process.exitCode = exitCode
} catch (err) {
  opErr(err && err.stack ? err.stack.split("\n").slice(0, 6).join("\n") : String(err))
} finally {
  if (browser) await browser.close().catch(() => {})
}
