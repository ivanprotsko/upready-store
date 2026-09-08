#!/usr/bin/env node
/**
 * Tall home-page frames for the upready.dev showcase rail (t-2026-09-08-01, 2026-09-09).
 *
 *   node artifacts/docs/landing-shots/shoot.mjs
 *
 * 1440x1920 is chosen so ONE frame carries the whole opening of the shop: header, the
 * hero band (560), the Categories heading and a full row of tiles. The card on the landing
 * is 3/4, so the frame is cropped to that ratio from the top — the same crop the card does
 * at render time, done once here where it can be checked.
 */
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const PW = "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs"
const { chromium } = await import(PW)
if (!chromium) throw new Error("playwright: chromium missing from the namespace")

const STANDS = [
  { slug: "electronics", port: 8061 },
  { slug: "womens-fashion", port: 8081 },
  { slug: "home-goods", port: 8110 },
  { slug: "supplements", port: 8070 },
  { slug: "sneakers", port: 8028 },
]

const browser = await chromium.launch()
for (const stand of STANDS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1920 }, deviceScaleFactor: 1 })
  const url = `http://localhost:${stand.port}/en`
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 40000 })
    await page.locator('[data-testid="profile-hero"]').waitFor({ state: "visible", timeout: 25000 })
  } catch (error) {
    console.log(`${stand.slug}: FAILED — ${error.message.split("\n")[0]}`)
    await page.close()
    continue
  }
  // The stands run `next dev`, which paints its own indicator over the bottom-left corner.
  // It is a fact about our development machine, not about the shop, and the frame goes on
  // a marketing page — so it is hidden here rather than cropped out later.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" })
  await page.waitForTimeout(2500)
  const out = join(HERE, `${stand.slug}.png`)
  await page.screenshot({ path: out })
  const heroText = await page.locator('[data-testid="profile-hero-headline"]').textContent()
  console.log(`${stand.slug}: ${out} · hero "${heroText?.slice(0, 42)}"`)
  await page.close()
}
await browser.close()
