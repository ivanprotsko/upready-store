#!/usr/bin/env node
/**
 * t-2026-09-30-15 — stand measurement of the theme-bridge fixes, read through Chromium's
 * computed styles (never pixels), plus the screenshots the acceptance asks for.
 *
 *   BASE=http://olavka-com.localhost:8613 node docs/evidence/t-2026-09-30-15/measure.mjs
 *
 * Per preset × mode (data-theme / data-mode flipped on <html>, the switch the design
 * system offers a visitor), with transitions off so no read returns the previous preset:
 *   - --contrast-fg-primary / -secondary composited on --contrast-bg-base (cause E);
 *   - --fg-disabled-on-surface on --bg-disabled, and whether --bg-disabled equals --muted;
 *   - --fg-accent (the price ink) against --primary and the page.
 * On the served electronics build: the PDP price colour and the home hero CTA colours.
 */
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(HERE, "../../../apps/storefront/package.json"))
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright")

const BASE = process.env.BASE || "http://olavka-com.localhost:8613"
const LOCALE = process.env.LOCALE || "ru"
const SHOTS = join(HERE, "shots")
mkdirSync(SHOTS, { recursive: true })

const PRESETS = ["electronics", "geist", "home-goods", "medusa", "sneakers", "supplements", "womens-fashion"]
const MODES = ["light", "dark"]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const out = { base: BASE, taken: new Date().toISOString(), presets: [], served: {} }

await page.goto(`${BASE}/${LOCALE}`, { waitUntil: "networkidle" })
await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" })

// --- per preset × mode, on probes ---
out.presets = await page.evaluate(
  ({ PRESETS, MODES }) => {
    const parse = (s) => {
      let m = /^rgba?\(([^)]+)\)$/.exec(s)
      if (m) {
        const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
        return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }
      }
      m = /^color\(srgb ([^)]+)\)$/.exec(s)
      if (m) {
        const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number)
        return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] ?? 1 }
      }
      return null
    }
    const ch = (c) => {
      const s = c / 255
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    const lum = (c) => 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)
    const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 })
    const ratio = (fg, bg) => {
      const a = lum(over(fg, bg))
      const b = lum(bg)
      return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100
    }
    const probe = document.createElement("div")
    document.body.appendChild(probe)
    const read = (prop, v) => {
      probe.style.cssText = ""
      probe.style[prop] = `var(${v})`
      return getComputedStyle(probe)[prop]
    }
    const html = document.documentElement
    const rows = []
    for (const theme of PRESETS) {
      for (const mode of MODES) {
        html.setAttribute("data-theme", theme)
        html.setAttribute("data-mode", mode)
        const c = (v) => read("color", v)
        const bg = (v) => read("backgroundColor", v)
        const contrastBg = parse(bg("--contrast-bg-base"))
        const fgP = parse(c("--contrast-fg-primary"))
        const fgS = parse(c("--contrast-fg-secondary"))
        const bgDisabled = bg("--bg-disabled")
        const muted = bg("--muted")
        const fgDis = parse(c("--fg-disabled-on-surface"))
        const page = parse(bg("--background"))
        const accent = c("--fg-accent")
        rows.push({
          theme,
          mode,
          contrastFgPrimaryOnContrastBg: ratio(fgP, contrastBg),
          contrastFgSecondaryOnContrastBg: ratio(fgS, contrastBg),
          bgDisabled,
          bgDisabledIsMuted: bgDisabled === muted,
          fgDisabledOnSurfaceOnBgDisabled: ratio(fgDis, parse(bgDisabled)),
          fgAccent: accent,
          fgAccentIsPrimary: accent === c("--primary"),
          fgAccentOnPage: ratio(parse(accent), page),
        })
      }
    }
    probe.remove()
    return rows
  },
  { PRESETS, MODES }
)

// --- the served electronics build ---
const readServed = () =>
  page.evaluate(() => {
    const html = document.documentElement
    const cs = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const s = getComputedStyle(el)
      return { color: s.color, background: s.backgroundColor }
    }
    const probe = document.createElement("div")
    document.body.appendChild(probe)
    probe.style.color = "var(--primary)"
    const primary = getComputedStyle(probe).color
    probe.style.color = "var(--primary-foreground)"
    const primaryFg = getComputedStyle(probe).color
    probe.remove()
    return {
      theme: html.getAttribute("data-theme"),
      mode: html.getAttribute("data-mode"),
      primary,
      primaryForeground: primaryFg,
      heroLayout: document.querySelector('[data-testid="profile-hero"]')?.getAttribute("data-hero-layout") ?? null,
      heroBand: cs('[data-testid="profile-hero"]'),
      heroCta: cs('[data-testid="profile-hero-cta"]'),
      price: cs('[data-testid="product-price"]'),
      cardPrice: cs('[data-testid="price"]'),
      disabledButton: cs('[data-testid="add-product-button"][disabled]'),
    }
  })

// The shop on BASE applies its own preset at runtime; the acceptance is about electronics,
// so every served page is switched to it on <html> — the same switch as above.
const HOME_PROFILE = process.env.HOME_PROFILE || "http://localhost:8613" // no shop: the build profile's hero
const settle = async (mode) => {
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" })
  await page.evaluate((m) => {
    document.documentElement.setAttribute("data-theme", "electronics")
    document.documentElement.setAttribute("data-mode", m)
  }, mode)
}
for (const mode of MODES) {
  for (const [name, base] of [["home-shop", BASE], ["home-profile", HOME_PROFILE]]) {
    await page.goto(`${base}/${LOCALE}`, { waitUntil: "networkidle" })
    await settle(mode)
    out.served[`${name}-${mode}`] = {
      base,
      ...(await readServed()),
      subheadline: await page.evaluate(() => {
        const el = document.querySelector('[data-testid="profile-hero"] p')
        return el ? { color: getComputedStyle(el).color, className: el.className } : null
      }),
    }
    await page.screenshot({ path: join(SHOTS, `${name}-electronics-${mode}-1440.png`) })
  }

  // the shop's home may carry no product link; its catalog always does
  await page.goto(`${BASE}/${LOCALE}/store`, { waitUntil: "networkidle" })
  const href = await page.evaluate(() => document.querySelector('a[href*="/products/"]')?.getAttribute("href") ?? null)
  if (!href) {
    out.served[`pdp-${mode}`] = { error: "no product link in the catalog" }
    continue
  }
  await page.goto(new URL(href, BASE).toString(), { waitUntil: "networkidle" })
  await settle(mode)
  out.served[`pdp-${mode}`] = { path: new URL(href, BASE).pathname, ...(await readServed()) }
  await page.screenshot({ path: join(SHOTS, `pdp-electronics-${mode}-1440.png`) })
}

await browser.close()
writeFileSync(join(HERE, "measure.json"), JSON.stringify(out, null, 2) + "\n")
const fails = out.presets.filter(
  (r) =>
    r.contrastFgPrimaryOnContrastBg < 4.5 ||
    r.contrastFgSecondaryOnContrastBg < 4.5 ||
    !r.bgDisabledIsMuted ||
    r.fgDisabledOnSurfaceOnBgDisabled < 4.5 ||
    r.fgAccentOnPage < 4.5
)
console.table(out.presets.map((r) => ({ ...r, bgDisabled: undefined, fgAccent: undefined })))
console.log(JSON.stringify(out.served, null, 1))
console.log(fails.length ? `FAIL: ${fails.length} cells` : `ok: ${out.presets.length} cells`)
process.exit(fails.length ? 1 : 0)
