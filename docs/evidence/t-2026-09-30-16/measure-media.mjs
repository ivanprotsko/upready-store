#!/usr/bin/env node
/**
 * t-2026-09-30-16 — stand measurement of the profile media base (q-media-base-url-not-exported).
 *
 *   PLAYWRIGHT_PATH=<.../playwright> BASE=http://localhost:8612 TAG=<run> node docs/evidence/t-2026-09-30-16/measure-media.mjs
 *
 * Reads the hero and tile urls the stand's own build baked into
 * apps/storefront/src/lib/profile/profile.generated.json, then for each of them:
 *   1. GET straight from the backend (status, content-type, bytes);
 *   2. GET through the storefront's /_next/image, the way the page requests it;
 *   3. whether the home page rendered it, and whether Chromium decoded it (naturalWidth > 0).
 * Also reads the wordmark in the header and takes one screenshot of the home page.
 */
import { createRequire } from "node:module"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "../../..")
const require = createRequire(join(ROOT, "apps/storefront/package.json"))
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright")

const BASE = process.env.BASE || "http://localhost:8612"
const LOCALE = process.env.LOCALE || "en"
// Names this run's output files, one pair per stand.
const TAG = process.env.TAG || "stand"
const SHOTS = join(HERE, "shots")
mkdirSync(SHOTS, { recursive: true })

const profile = JSON.parse(
  readFileSync(join(ROOT, "apps/storefront/src/lib/profile/profile.generated.json"), "utf8")
)
const media = [
  { slot: "hero", url: profile.home.hero?.image },
  ...profile.home.categoryTiles.map((tile) => ({ slot: `tile:${tile.categoryHandle}`, url: tile.image })),
]

const out = {
  base: BASE,
  tag: TAG,
  taken: new Date().toISOString(),
  profile: profile.id,
  brand: profile.brand?.name,
  heroLayout: profile.home.hero?.layout ?? null,
  media: [],
  page: {},
}

for (const item of media) {
  const direct = await fetch(item.url)
  const directBytes = (await direct.arrayBuffer()).byteLength
  const viaNext = await fetch(`${BASE}/_next/image?url=${encodeURIComponent(item.url)}&w=640&q=75`)
  await viaNext.arrayBuffer()
  out.media.push({
    ...item,
    direct: { status: direct.status, type: direct.headers.get("content-type"), bytes: directBytes },
    nextImage: { status: viaNext.status, type: viaNext.headers.get("content-type") },
  })
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const responses = []
page.on("response", (response) => {
  if (response.url().includes("/_next/image") || response.url().includes("/static/store-profiles/")) {
    responses.push({ url: response.url(), status: response.status() })
  }
})
const nav = await page.goto(`${BASE}/${LOCALE}`, { waitUntil: "networkidle" })
out.page.url = page.url()
out.page.status = nav?.status() ?? null
await page.evaluate(async () => {
  // Let lazy images below the fold load before reading them.
  for (let y = 0; y < document.body.scrollHeight; y += 600) {
    window.scrollTo(0, y)
    await new Promise((r) => setTimeout(r, 120))
  }
  window.scrollTo(0, 0)
})
await page.waitForLoadState("networkidle")

const images = await page.evaluate(() =>
  [...document.querySelectorAll("img")].map((img) => ({
    src: img.currentSrc || img.src,
    alt: img.alt,
    naturalWidth: img.naturalWidth,
    complete: img.complete,
  }))
)
const original = (src) => {
  try {
    const u = new URL(src)
    return u.pathname === "/_next/image" ? u.searchParams.get("url") : src
  } catch {
    return src
  }
}
for (const item of out.media) {
  const rendered = images.filter((img) => original(img.src) === item.url)
  item.onPage = {
    rendered: rendered.length,
    decoded: rendered.filter((img) => img.complete && img.naturalWidth > 0).length,
    alt: rendered[0]?.alt ?? null,
  }
}
out.page.imagesOnPage = images.length
out.page.wordmark = await page
  .locator("header a")
  .first()
  .innerText()
  .catch(() => null)
out.page.title = await page.title()
out.page.mediaResponses = responses.filter((r) => out.media.some((m) => r.url.includes(encodeURIComponent(m.url)) || r.url === m.url))

await page.screenshot({ path: join(SHOTS, `home-${TAG}-1440.png`), fullPage: true })
await browser.close()

writeFileSync(join(HERE, `measure-media-${TAG}.json`), `${JSON.stringify(out, null, 2)}\n`)
for (const m of out.media) {
  console.log(
    `${m.slot.padEnd(26)} direct ${m.direct.status} ${m.direct.type} ${m.direct.bytes} B · ` +
      `/_next/image ${m.nextImage.status} ${m.nextImage.type} · on page ${m.onPage.rendered}, decoded ${m.onPage.decoded}`
  )
}
console.log(`page ${out.page.status} ${out.page.url} · wordmark "${out.page.wordmark}" · title "${out.page.title}"`)
