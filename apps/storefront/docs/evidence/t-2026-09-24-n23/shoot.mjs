// t-2026-09-24-n23 evidence (rule 27f): node shoot.mjs <before|after>
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
const PW = "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs"
const { chromium } = await import(PW)
const mode = process.argv[2] ?? "after"
const OUT = "/Users/ivanprotsko/upready/worktrees/upready-store/feat/o26-course-pecheni-page/apps/storefront/docs/evidence/t-2026-09-24-n23"
const HOST = "http://olavka-com.localhost:8243/ru/products/"
const COURSE = HOST + "course-ochishchenie-pecheni"
const REGULAR = HOST + "mumie-altayskoe-ochischennoe-naturalnoe-100-cherkashino"
const WIDTHS = [1440, 768, 390]
const THEMES = ["light", "dark"]
const HIDE_DEV = "nextjs-portal{display:none!important}"
const log = []

const browser = await chromium.launch()
async function open(url, width, theme) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, locale: "ru-RU" })
  await context.addInitScript((mode) => localStorage.setItem("upready-store.mode", mode), theme)
  const page = await context.newPage()
  const covers = []
  page.on("request", (r) => { if (/liver-\d+\.webp/.test(r.url())) covers.push(r.url().split("/").pop()) })
  await page.goto(url, { waitUntil: "networkidle", timeout: 180000 })
  await page.addStyleTag({ content: HIDE_DEV })
  // next dev hydrates late: the buy box's observers (the phone's sticky bar) start only then.
  await page.waitForTimeout(3000)
  await page.waitForFunction(() => [...document.images].filter((i) => i.getBoundingClientRect().top < innerHeight).every((i) => i.complete), null, { timeout: 30000 }).catch(() => {})
  return { context, page, covers }
}
const file = (screen, width, theme) => {
  mkdirSync(path.join(OUT, screen), { recursive: true })
  return path.join(OUT, screen, `${width}-${theme}.png`)
}
const scrollTo = (page, id) => page.evaluate((id) => {
  const el = document.querySelector(`[data-testid="${id}"]`)
  window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 88)
}, id)

for (const width of WIDTHS) for (const theme of THEMES) {
  if ((mode === "before" || mode === "after") && !process.env.COURSE_ONLY) {
    const screen = mode === "before" ? "regular-product-regression-before" : "regular-product-regression"
    const { context, page } = await open(REGULAR, width, theme)
    await page.screenshot({ path: file(screen, width, theme), fullPage: true })
    await context.close()
  }
  if (mode !== "after") continue

  const { context, page, covers } = await open(COURSE, width, theme)
  const current = await page.locator('[data-testid="course-cover"]').evaluate((img) => img.currentSrc.split("/").pop())
  log.push({ width, theme, requested: [...new Set(covers)], currentSrc: current })
  await page.screenshot({ path: file("course-top", width, theme) })

  // Scrolled the way a reader does (wheel steps): the buy box's IntersectionObserver
  // misses a single programmatic jump of several thousand pixels.
  for (let i = 0; i < 80; i++) {
    const top = await page.locator('[data-testid="course-faq"]').evaluate((el) => el.getBoundingClientRect().top)
    if (top <= 100) break
    await page.mouse.wheel(0, Math.min(400, top - 88))
    await page.waitForTimeout(80)
  }
  if (width < 1024) await page.locator('[data-testid="mobile-actions"]').waitFor({ state: "visible", timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
  const buy = await page.locator('[data-testid="product-buy-card"]').boundingBox()
  const bar = await page.locator('[data-testid="mobile-actions"]').boundingBox().catch(() => null)
  log.push({ width, theme, midscroll: { buyBoxTop: buy && Math.round(buy.y), mobileBarTop: bar && Math.round(bar.y), viewport: 900 } })
  await page.screenshot({ path: file("course-sticky-midscroll", width, theme) })

  for (const [screen, id] of [["course-about", "course-about"], ["course-programme", "course-block"], ["course-testimonials", "course-testimonials"]]) {
    await page.locator(`[data-testid="${id}"]`).screenshot({ path: file(screen, width, theme) })
  }
  await page.locator('[data-testid="course-faq-item"] summary').nth(3).click()
  await page.waitForTimeout(300)
  await page.locator('[data-testid="course-faq"]').screenshot({ path: file("course-faq-open", width, theme) })
  await context.close()
}
await browser.close()
if (log.length) writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), `shoot-log-${mode}.json`), JSON.stringify(log, null, 2))
console.log(JSON.stringify(log))
