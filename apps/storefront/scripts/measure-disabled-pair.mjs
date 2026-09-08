/**
 * measure-disabled-pair — measures the d-11 pair on a LIVE stand, in every preset the
 * stand's own stylesheet carries, in both modes.
 *
 * The pair is the disabled PDP add-to-cart button: `disabled:text-ui-fg-disabled` read on
 * `disabled:bg-ui-bg-disabled`. That is the control d-11 was written about, and the one that
 * measured 1.04:1 on womens-fashion after a fix computed against the presets that existed then.
 *
 * Why it re-discovers the preset list instead of taking it as an argument: the claim this script
 * exists to check is "worst case across all presets", and that claim is only worth its list. The
 * list is read out of the [data-theme="…"][data-mode="…"] selectors of the CSS the STAND serves,
 * so the answer names the presets that were actually on the stand at the time it ran.
 *
 * Two traps this script is built around, both of which produce a WRONG number in silence:
 *
 *   1. the button carries `transition: color, background-color … 0.15s`. Reading computed style
 *      straight after flipping `data-theme` returns the PREVIOUS preset's colours — measured here
 *      2026-09-08: the flip to electronics/dark moved --fg-disabled-on-surface at once while the
 *      button still reported the womens-fashion ink, and only settled 800 ms later. So transitions
 *      are turned off with an injected stylesheet before anything is read.
 *   2. even with transitions off, a stale read cannot be told from a real one by looking at it.
 *      Every cell is therefore read twice with a gap; a cell whose two reads disagree is reported
 *      as unstable rather than quietly averaged away.
 *
 * Usage:
 *   node scripts/measure-disabled-pair.mjs --url http://localhost:8081/en/products/ondine-slip-dress
 *     [--selector '[data-testid="add-product-button"]'] [--min 4.5] [--json out.json]
 *
 * Exit code is 0 when every measured pair clears --min (default 4.5:1) and every cell is stable.
 */

import { writeFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

// --- args ------------------------------------------------------------------
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const url = arg("url")
const selector = arg("selector", '[data-testid="add-product-button"]')
const jsonOut = arg("json")
const min = Number(arg("min", "4.5"))
if (!url) {
  console.error("measure-disabled-pair: --url is required (e.g. --url http://localhost:8081/en/products/<handle>)")
  process.exit(2)
}

// --- chromium. Never require.resolve() a package that ships an ESM wrapper (rule 19f) ---
async function loadChromium() {
  const tried = []
  for (const spec of ["playwright", "@playwright/test", "playwright-core"]) {
    try {
      const mod = await import(spec)
      const chromium = mod.chromium ?? mod.default?.chromium
      if (chromium && typeof chromium.launch === "function") return { chromium, spec }
      tried.push(`${spec}: imported, no chromium (keys: ${Object.keys(mod).slice(0, 8).join(",")})`)
    } catch (err) {
      tried.push(`${spec}: ${err.message.split("\n")[0]}`)
    }
  }
  throw new Error(`no usable chromium\n  ${tried.join("\n  ")}`)
}

// --- the in-page probe: self-contained, no closures over module scope -------
function inPageProbe(sel) {
  const parse = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const lum = (c) => {
    const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
  }
  const over = (fg, bg) => ({                      // composite a translucent ink over its backdrop
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  })
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b)
    const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
    return (hi + 0.05) / (lo + 0.05)
  }
  const rgb = (c) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`

  // the painted backdrop: walk up until something is not fully transparent
  const backdrop = (el) => {
    let node = el
    while (node && node !== document.documentElement) {
      const c = parse(getComputedStyle(node).backgroundColor)
      if (c && c.a > 0) return { colour: c, from: node === el ? "self" : node.tagName.toLowerCase() }
      node = node.parentElement
    }
    const c = parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }
    return { colour: c, from: "html" }
  }

  const el = document.querySelector(`${sel}[disabled]`) || document.querySelector(sel)
  if (!el) return { error: `no element matches ${sel}` }
  const cs = getComputedStyle(el)
  const box = el.getBoundingClientRect()
  const ink = parse(cs.color)
  const bg = backdrop(el)
  const inkOver = ink.a < 1 ? over(ink, bg.colour) : ink
  return {
    disabled: el.hasAttribute("disabled"),
    label: (el.textContent || "").trim().slice(0, 40),
    painted: box.width > 0 && box.height > 0 && cs.visibility !== "hidden" && cs.display !== "none",
    fg: rgb(inkOver),
    fgRaw: cs.color,
    bg: rgb(bg.colour),
    bgFrom: bg.from,
    ratio: Math.round(ratio(inkOver, bg.colour) * 100) / 100,
  }
}

// the preset list, read out of the stylesheets the STAND serves
function inPagePresets() {
  const found = new Map()
  for (const sheet of Array.from(document.styleSheets)) {
    let rules
    try { rules = sheet.cssRules } catch { continue }          // a cross-origin sheet stays unread
    for (const rule of Array.from(rules || [])) {
      const sel = rule.selectorText
      if (!sel) continue
      const re = /\[data-theme="([a-z0-9-]+)"\]\[data-mode="(light|dark)"\]/g
      let m
      while ((m = re.exec(sel))) found.set(`${m[1]}|${m[2]}`, [m[1], m[2]])
    }
  }
  return Array.from(found.values())
}

// --- run -------------------------------------------------------------------
const { chromium, spec } = await loadChromium()
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(url, { waitUntil: "networkidle", timeout: 60000 })
await page.addStyleTag({                                        // trap 1: no colour may be in flight
  content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
})

const pairs = (await page.evaluate(inPagePresets)).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
if (!pairs.length) { await browser.close(); throw new Error("the stand's stylesheets carry no [data-theme][data-mode] block — nothing to measure") }

const rows = []
for (const [theme, mode] of pairs) {
  await page.evaluate(([t, m]) => {
    document.documentElement.setAttribute("data-theme", t)
    document.documentElement.setAttribute("data-mode", m)
    void document.documentElement.offsetHeight                  // force a style recalc
  }, [theme, mode])
  const first = await page.evaluate(inPageProbe, selector)
  await page.waitForTimeout(200)
  const second = await page.evaluate(inPageProbe, selector)     // trap 2: a stale read looks fine
  const stable = !first.error && !second.error && first.fg === second.fg && first.bg === second.bg
  rows.push({ theme, mode, ...second, stable, ...(stable ? {} : { firstRead: { fg: first.fg, bg: first.bg, ratio: first.ratio } }) })
}
await browser.close()

const measured = rows.filter((r) => !r.error)
const failing = measured.filter((r) => r.ratio < min)
const unstable = measured.filter((r) => !r.stable)
const worst = measured.reduce((a, b) => (a && a.ratio <= b.ratio ? a : b), null)

const report = {
  measuredAt: new Date().toISOString(),
  url,
  selector,
  chromium: spec,
  transitionsDisabled: true,
  readsPerCell: 2,
  min,
  presets: Array.from(new Set(pairs.map((p) => p[0]))).sort(),
  cells: rows.length,
  worst: worst && { theme: worst.theme, mode: worst.mode, ratio: worst.ratio, fg: worst.fg, bg: worst.bg },
  failing: failing.map((r) => ({ theme: r.theme, mode: r.mode, ratio: r.ratio })),
  unstable: unstable.map((r) => ({ theme: r.theme, mode: r.mode })),
  rows,
}

const pad = (s, n) => String(s).padEnd(n)
console.log(`disabled pair · ${selector} · ${url}`)
console.log(`presets on this stand: ${report.presets.join(", ")} (${report.presets.length}), ${rows.length} preset x mode cells\n`)
for (const r of rows) {
  if (r.error) { console.log(`${pad(r.theme, 16)} ${pad(r.mode, 6)} ERROR ${r.error}`); continue }
  const flag = r.ratio < min ? "FAIL" : "ok  "
  const notes = [r.disabled ? null : "NOT disabled", r.painted ? null : "NOT painted", r.stable ? null : "UNSTABLE"].filter(Boolean)
  console.log(`${pad(r.theme, 16)} ${pad(r.mode, 6)} ${pad(r.ratio.toFixed(2) + ":1", 9)} ${flag}  ${pad(r.fg, 20)} on ${pad(r.bg, 20)} (bg from ${r.bgFrom}${notes.length ? ", " + notes.join(", ") : ""})`)
}
console.log(`\nworst: ${worst ? `${worst.ratio.toFixed(2)}:1 on ${worst.theme} ${worst.mode}` : "n/a"} · target ${min}:1 · failing cells: ${failing.length} of ${measured.length} · unstable cells: ${unstable.length}`)

if (jsonOut) {
  mkdirSync(dirname(jsonOut), { recursive: true })
  writeFileSync(jsonOut, JSON.stringify(report, null, 2) + "\n")
  console.log(`json: ${jsonOut}`)
}
process.exit(failing.length || unstable.length ? 1 : 0)
