#!/usr/bin/env node
/**
 * Кадры лаборатории: каждый шаблон × три страницы × два вьюпорта, целой страницей.
 *   node shots.mjs            # все шаблоны
 *   node shots.mjs ferma      # только эти
 *   node shots.mjs --fold     # только первый экран (быстрая сверка композиции)
 * Выход: shots/<шаблон>-<страница>-<вьюпорт>.webp, каждый ≤ 200 КБ.
 */
import { readFileSync, mkdirSync, existsSync, statSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { launch, VIEWPORTS } from "./lib/audit.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, "shots")
const PAGES = ["index", "catalog", "product"]
const argv = process.argv.slice(2)
const fold = argv.includes("--fold")
const only = argv.filter((a) => !a.startsWith("--"))

const idx = JSON.parse(readFileSync(join(HERE, "dist", "index.json"), "utf8"))
const list = idx.templates.filter((t) => !only.length || only.includes(t.id))
mkdirSync(SHOTS, { recursive: true })

const browser = await launch()
let big = 0
for (const t of list) {
  for (const page of PAGES) {
    for (const [vp, cfg] of Object.entries(VIEWPORTS)) {
      const ctx = await browser.newContext({
        viewport: { width: cfg.width, height: cfg.height },
        deviceScaleFactor: cfg.deviceScaleFactor, isMobile: cfg.isMobile, hasTouch: cfg.hasTouch, locale: "ru-RU",
      })
      const p = await ctx.newPage()
      await p.goto(pathToFileURL(join(HERE, "dist", t.id, `${page}.html`)).href, { waitUntil: "load" })
      await p.evaluate(() => document.fonts.ready)
      await p.waitForTimeout(250)
      const png = join(SHOTS, `${t.id}-${page}-${vp}${fold ? "-fold" : ""}.png`)
      await p.screenshot({ path: png, fullPage: !fold })
      const webp = png.replace(/\.png$/, ".webp")
      // десктоп отдаём в натуральную ширину, мобиль ужимаем с 2× до 640 — текст остаётся читаемым,
      // а кадр укладывается в 200 КБ (критерий приёмки)
      // Потолок 200 КБ — критерий приёмки, поэтому качество подбирается ЛЕСТНИЦЕЙ,
      // а не подбирается на глаз: длинная мобильная страница ужимается сильнее.
      // Потолок 200 КБ — критерий приёмки, поэтому ступени подбираются ЛЕСТНИЦЕЙ,
      // а не на глаз: очень длинная мобильная страница теряет и качество, и ширину.
      const ladder = vp === "mobile"
        ? [["640x>", "68"], ["640x>", "54"], ["560x>", "50"], ["480x>", "46"]]
        : [["1280x>", "68"], ["1280x>", "56"], ["1100x>", "52"]]
      for (const [cap, q] of ladder) {
        execFileSync("magick", [png, "-resize", cap, "-quality", q, "-define", "webp:method=6", webp])
        if (statSync(webp).size <= 200 * 1024) break
      }
      execFileSync("rm", ["-f", png])
      const kb = statSync(webp).size / 1024
      if (kb > 200) { big += 1; console.log(`  ! ${webp.split("/").pop()} ${kb.toFixed(0)} КБ > 200`) }
      await ctx.close()
    }
  }
  console.log(`${t.id}: 6 кадров`)
}
await browser.close()
console.log(big ? `кадров тяжелее 200 КБ: ${big}` : "все кадры ≤ 200 КБ")
