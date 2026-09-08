/** Screenshot of index.html in both themes, for a human-eyes check of the page. */
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
const HERE = dirname(fileURLToPath(import.meta.url))
const PW = "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs"
const { chromium } = await import(PW)

const browser = await chromium.launch()
for (const light of [false, true]) {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1400 } })
  await page.goto("file://" + join(HERE, "index.html"))
  if (light) await page.click("#theme")
  await page.waitForTimeout(300)
  const out = join(HERE, light ? "shot-light.png" : "shot-dark.png")
  await page.screenshot({ path: out, fullPage: true })
  console.log("wrote", out)
  await page.close()
}
await browser.close()
