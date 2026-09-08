/**
 * Human-eyes check for the seam fix: the Categories strip of the two stands whose grid
 * cells kept a white gutter (womens-fashion, supplements), shot at 2x so a 1-2 CSS px
 * hairline between the image and the card border would be visible if it survived.
 */
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const PW = "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs"
const { chromium } = await import(PW)
if (!chromium) throw new Error("playwright: chromium missing from the namespace")

const STANDS = [
  { id: "womens-fashion", url: "http://localhost:8081/en" },
  { id: "supplements", url: "http://localhost:8070/en" },
]

const browser = await chromium.launch()
for (const stand of STANDS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 })
  await page.goto(stand.url, { waitUntil: "networkidle" })
  const section = page.locator('[data-testid="category-tiles"]')
  await section.waitFor({ state: "visible", timeout: 20000 })
  await page.waitForTimeout(1200)
  const out = join(HERE, `shot-categories-${stand.id}.png`)
  await section.screenshot({ path: out })
  console.log(`${stand.id}: ${out}`)
  await page.close()
}
await browser.close()
