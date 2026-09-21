// Letterbox probe: what is left of a product frame beside a photo of another ratio must
// continue the photo's own edge colour.
//
// The shared frame is 3:4 and so are almost all marketplace photos, so on a real catalog
// there is usually no letterbox to look at. The probe therefore makes one: it takes a
// white packshot and a full-bleed infographic from the catalog, forces their frames to
// 1:1 in the page (the photo stays `contain`, so a strip appears on each side) and reads
// pixels from a screenshot of the frame. For each strip the mean colour must be within
// MAX_DISTANCE (RGB, Euclidean) of the adjacent 8px column of the photo.
//
//   BASE_URL=http://cherkashino.localhost:8121 node apps/storefront/e2e/image-letterbox.e2e.mjs
//   SHOTS=<dir> keeps the two close-ups, PATH_NAME overrides /ru/store.
//   PLAYWRIGHT path to the playwright package, when it is not in the workspace store.
import { mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL("../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url)
    .pathname
const { chromium } = require(PLAYWRIGHT)

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8000"
const PATH_NAME = process.env.PATH_NAME ?? "/ru/store"
const SHOTS = process.env.SHOTS
const MAX_DISTANCE = 8
const FRAME = '[data-product-media="card"][data-product-media-state="photo"]'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const failures = []

/** Decodes a PNG in the page and returns the mean colour of the two strips and their neighbours. */
const readStrips = (png, naturalRatio) =>
  page.evaluate(
    async ({ base64, ratio }) => {
      const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob()
      const bitmap = await createImageBitmap(blob)
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext("2d")
      context.drawImage(bitmap, 0, 0)
      const { width, height } = bitmap
      const strip = Math.floor((width - height * ratio) / 2)
      // Rows near the top and bottom are cut by the frame's radius.
      const top = Math.round(height * 0.15)
      const rows = Math.round(height * 0.7)
      const mean = (x, w) => {
        const { data } = context.getImageData(x, top, w, rows)
        const sum = [0, 0, 0]
        for (let i = 0; i < data.length; i += 4) {
          sum[0] += data[i]
          sum[1] += data[i + 1]
          sum[2] += data[i + 2]
        }
        return sum.map((value) => value / (data.length / 4))
      }
      return {
        strip,
        left: { strip: mean(2, strip - 4), photo: mean(strip + 1, 8) },
        right: { strip: mean(width - strip + 2, strip - 4), photo: mean(width - strip - 9, 8) },
      }
    },
    { base64: png.toString("base64"), ratio: naturalRatio }
  )

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

try {
  await page.goto(`${BASE_URL}${PATH_NAME}`, { waitUntil: "networkidle" })
  const frames = page.locator(FRAME)
  const count = await frames.count()
  const picked = { packshot: null, infographic: null }

  for (let i = 0; i < count && !(picked.packshot && picked.infographic); i++) {
    const frame = frames.nth(i)
    if (!(await frame.isVisible())) continue
    await frame.scrollIntoViewIfNeeded()
    const info = await frame.evaluate(async (node) => {
      const img = node.querySelector("img:not([data-product-media-backdrop])")
      if (!img) return null
      if (!img.complete) await img.decode().catch(() => {})
      return { ratio: img.naturalWidth / img.naturalHeight, alt: img.alt }
    })
    // Only photos narrower than 1:1 get side strips in the forced square.
    if (!info || !(info.ratio > 0.5 && info.ratio < 0.9)) continue
    const edge = await readEdge(frame)
    const kind = Math.min(...edge) > 235 ? "packshot" : Math.min(...edge) < 200 ? "infographic" : null
    if (kind && !picked[kind]) picked[kind] = { frame, ...info }
  }

  for (const kind of ["packshot", "infographic"]) {
    const target = picked[kind]
    if (!target) {
      failures.push(`${kind}: no such photo on ${PATH_NAME}, nothing was measured`)
      continue
    }
    await target.frame.evaluate((node) => {
      node.style.aspectRatio = "1 / 1"
    })
    await page.waitForTimeout(300)
    const png = await target.frame.screenshot()
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true })
      writeFileSync(join(SHOTS, `letterbox-${kind}.png`), png)
    }
    const result = await readStrips(png, target.ratio)
    for (const side of ["left", "right"]) {
      const d = distance(result[side].strip, result[side].photo)
      const line = `${kind} "${target.alt}" ${side}: strip ${result.strip}px, distance ${d.toFixed(1)}`
      console.log(line)
      if (d >= MAX_DISTANCE) failures.push(`${line} (limit ${MAX_DISTANCE})`)
    }
  }
} finally {
  await browser.close()
}

/** Mean colour of the photo's leftmost 8px column in the untouched 3:4 frame. */
async function readEdge(frame) {
  const png = await frame.screenshot()
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob()
    const bitmap = await createImageBitmap(blob)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext("2d")
    context.drawImage(bitmap, 0, 0)
    const top = Math.round(bitmap.height * 0.15)
    const { data } = context.getImageData(1, top, 8, Math.round(bitmap.height * 0.7))
    const sum = [0, 0, 0]
    for (let i = 0; i < data.length; i += 4) {
      sum[0] += data[i]
      sum[1] += data[i + 1]
      sum[2] += data[i + 2]
    }
    return sum.map((value) => value / (data.length / 4))
  }, png.toString("base64"))
}

if (failures.length) {
  console.error(`FAILED: ${failures.length} failure(s)`)
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}
console.log("PASSED: 0 failure(s)")
