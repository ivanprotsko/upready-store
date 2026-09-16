#!/usr/bin/env node
/**
 * Мерка ЖИВОГО магазина клиента (правило 18f: реальность, а не суждение).
 * Три страницы × два вьюпорта: полностраничный снимок в design/before/ + факты в design/before/facts.json.
 *
 *   node design/measure-live.mjs
 *   BASE=https://cherkashino.shipshift.dev/ru node design/measure-live.mjs
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { launch, auditPage, auditContrast, VIEWPORTS, AXE_CORE } from "../lib/audit.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, "before")
const BASE = process.env.BASE || "https://cherkashino.shipshift.dev/ru"
const PAGES = [
  { id: "home", path: "/" },
  { id: "category", path: "/categories/myod-cherkashino" },
  { id: "product", path: "/products/mumie-balzam-gornogo-altaya-100-gramm-cherkashino" },
]

mkdirSync(OUT, { recursive: true })
const axeSource = readFileSync(AXE_CORE, "utf8")
const browser = await launch()
const facts = { measuredAt: new Date().toISOString(), base: BASE, pages: {} }

for (const p of PAGES) {
  facts.pages[p.id] = {}
  for (const [vp, cfg] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport: { width: cfg.width, height: cfg.height }, deviceScaleFactor: cfg.deviceScaleFactor, isMobile: cfg.isMobile, hasTouch: cfg.hasTouch, locale: "ru-RU" })
    const page = await ctx.newPage()
    const url = BASE.replace(/\/$/, "") + (p.path === "/" ? "" : p.path)
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 })
    await page.waitForTimeout(1200)
    // прокрутка до низа, чтобы lazy-картинки встали в свои коробки
    await page.evaluate(async () => {
      const step = window.innerHeight
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120))
      }
      window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 400))
    })
    const shot = join(OUT, `${p.id}-${vp}.png`)
    await page.screenshot({ path: shot, fullPage: true })
    const a = await auditPage(page)
    a.contrast = await auditContrast(page, axeSource)
    a.status = res ? res.status() : null
    a.url = url
    a.shot = shot
    facts.pages[p.id][vp] = a
    console.log(`${p.id}/${vp}: HTTP ${a.status} · размеров шрифта ${a.type.sizes.length} · отступов ${a.spacing.length} · контраст-нарушений ${a.contrast.length} · overflowX ${a.overflowX.overflow}px · картинок ${a.images.length} (без коробки ${a.images.filter((i) => !i.aspectBox).length})`)
    await ctx.close()
  }
}
await browser.close()
writeFileSync(join(OUT, "facts.json"), JSON.stringify(facts, null, 1))
console.log(`\nфакты: ${join(OUT, "facts.json")}`)
