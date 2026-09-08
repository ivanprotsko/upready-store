#!/usr/bin/env node
/**
 * Home page of every store stand, shot full-length, after the hero was switched off
 * (STORE_PROFILE_HERO=off, t-2026-09-08-01).
 *
 *   node artifacts/docs/stands/shot-home.mjs
 *
 * A stand that does not answer is reported as down and skipped — the run never writes a
 * stale file under a live-looking name. Two shots per stand: the fold (what the visitor
 * meets) and the whole page.
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

const browser = await chromium.launch()
for (const stand of STANDS) {
  const url = `http://localhost:${stand.port}/en`
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 })
  } catch (error) {
    console.log(`${stand.id} (:${stand.port}): DOWN — ${error.message.split("\n")[0]}`)
    await page.close()
    continue
  }
  const hero = await page.locator('[data-testid="profile-hero"]').count()
  await page.waitForTimeout(1500)
  const fold = join(HERE, `shot-home-${stand.id}-fold.png`)
  const full = join(HERE, `shot-home-${stand.id}-full.png`)
  await page.screenshot({ path: fold })
  await page.screenshot({ path: full, fullPage: true })
  console.log(`${stand.id} (:${stand.port}): hero nodes ${hero} · ${fold} · ${full}`)
  await page.close()
}
await browser.close()
