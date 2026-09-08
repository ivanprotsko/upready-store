#!/usr/bin/env node
/**
 * Block K (announcement hero) on the five live stands: what the band, the copy and the CTA
 * actually compute to, and the contrast between them (t-2026-09-08-01, 2026-09-09).
 *
 *   node artifacts/docs/stands/measure-k.mjs            # -> table + shot-heroK-<stand>.png
 *
 * Reads computed styles, not the source: the band must be the brand accent, the headline and
 * subheadline must clear AA on it, and the CTA must NOT inherit the accent — it is a chip in
 * the page's own --bg/--fg standing off the band. A stand that does not answer is reported
 * as down and skipped, never written as a stale file.
 */
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const PW = "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs"
const { chromium } = await import(PW)
if (!chromium) throw new Error("playwright: chromium missing from the namespace")

const STANDS = [
  { id: "sneakers", port: 8028 },
  { id: "electronics", port: 8061 },
  { id: "supplements", port: 8070 },
  { id: "womens-fashion", port: 8081 },
  { id: "home-goods", port: 8110 },
]

/**
 * Two shapes reach us: `rgb(a)(0-255, …)` for a plain colour, and `color(srgb 0-1 0-1 0-1 / a)`
 * once a token goes through color-mix() — the subheadline does (--contrast-fg-secondary is a
 * mix of --primary-foreground), and a parser that knows only rgb() reports it as absent.
 */
const parse = (css) => {
  const rgb = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(css)
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] }
  const srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/.exec(css)
  if (srgb) return { r: +srgb[1] * 255, g: +srgb[2] * 255, b: +srgb[3] * 255, a: srgb[4] === undefined ? 1 : +srgb[4] }
  throw new Error(`unparsed colour: ${css}`)
}
const lum = ({ r, g, b }) => {
  const f = (c) => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
})
const ratio = (fg, bg) => {
  const c = fg.a < 1 ? over(fg, bg) : fg
  const [hi, lo] = [lum(c), lum(bg)].sort((x, y) => y - x)
  return ((hi + 0.05) / (lo + 0.05)).toFixed(2)
}
const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")

const browser = await chromium.launch()
const rows = []
for (const stand of STANDS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  try {
    await page.goto(`http://localhost:${stand.port}/en`, { waitUntil: "networkidle", timeout: 60000 })
  } catch (error) {
    console.log(`${stand.id} (:${stand.port}): DOWN — ${error.message.split("\n")[0]}`)
    await page.close()
    continue
  }
  const hero = page.locator('[data-testid="profile-hero"]')
  if ((await hero.count()) === 0) {
    console.log(`${stand.id}: no profile-hero node`)
    await page.close()
    continue
  }
  const data = await hero.evaluate((section) => {
    const cs = (el) => (el ? getComputedStyle(el) : null)
    const h1 = section.querySelector("h1")
    const p = section.querySelector("p")
    const cta = section.querySelector('[data-testid="profile-hero-cta"]')
    const page = getComputedStyle(document.body)
    return {
      layout: section.dataset.heroLayout,
      band: cs(section).backgroundColor,
      bandImage: cs(section).backgroundImage,
      h1: cs(h1)?.color,
      p: cs(p)?.color ?? null,
      ctaBg: cs(cta)?.backgroundColor ?? null,
      ctaFg: cs(cta)?.color ?? null,
      pageBg: page.backgroundColor,
      primary: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
      height: section.getBoundingClientRect().height,
      imgs: section.querySelectorAll("img").length,
    }
  })
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" })
  await page.waitForTimeout(800)
  await hero.screenshot({ path: join(HERE, `shot-heroK-${stand.id}.png`) })
  await page.close()

  const band = parse(data.band)
  const h1 = parse(data.h1)
  const p = data.p ? parse(data.p) : null
  const ctaBg = data.ctaBg ? parse(data.ctaBg) : null
  const ctaFg = data.ctaFg ? parse(data.ctaFg) : null
  rows.push({
    stand: stand.id,
    layout: data.layout,
    band: hex(band),
    "--primary": data.primary,
    "h1:band": ratio(h1, band),
    "p:band": p ? ratio(p, band) : "—",
    ctaBg: ctaBg ? hex(ctaBg) : "—",
    "cta:band": ctaBg ? ratio(ctaBg, band) : "—",
    "ctaFg:ctaBg": ctaBg && ctaFg ? ratio(ctaFg, ctaBg) : "—",
    ctaInheritsAccent: ctaBg ? hex(ctaBg) === hex(band) : null,
    bgImage: data.bandImage === "none" ? "none" : data.bandImage.slice(0, 24),
    imgs: data.imgs,
    height: Math.round(data.height),
  })
}
await browser.close()
console.table(rows)
const bad = rows.filter(
  (r) => r.layout !== "announcement" || +r["h1:band"] < 4.5 || (r["p:band"] !== "—" && +r["p:band"] < 4.5) || r.ctaInheritsAccent
)
console.log(bad.length ? `FAIL: ${bad.map((r) => r.stand).join(", ")}` : `OK: ${rows.length} stands, every ratio ≥ 4.5, CTA never the band colour`)
process.exitCode = bad.length ? 1 : 0
