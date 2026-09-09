#!/usr/bin/env node
/**
 * Frames of the saved compositions, in the format the upready.dev showcase cards are cut from.
 *
 *   node artifacts/docs/composer/serve.mjs &        # the stand must be up on :8303
 *   node artifacts/docs/composer/shoot.mjs           # every version whose frame is missing or older than its last edit
 *   node artifacts/docs/composer/shoot.mjs --all     # every version, again
 *   node artifacts/docs/composer/shoot.mjs v-20260909-kerbstone-dark   # just these ids
 *
 * Desktop versions: viewport 1440×1920 at 1× — the frame the landing-shots recipe already uses
 * (upready-dev/artifacts/docs/recipe-showcase-cards.md §1.1) — then the 960×1280 WebP the card
 * takes, made with the exact magick call from that recipe. Mobile versions: 390×520 at 2×, and the
 * WebP is an upscale to the card size, which the run says out loud. Output: shots/<id>.png and
 * shots/<id>.webp next to this file, outside git.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const PW = "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs"
const LAB = process.env.LAB || "http://localhost:8303"
const SHOTS = join(HERE, "shots")

const args = process.argv.slice(2)
const all = args.includes("--all")
const only = args.filter((a) => !a.startsWith("--"))

const registry = JSON.parse(readFileSync(join(HERE, "versions.json"), "utf8"))
if (!registry.versions.length) {
  console.log("versions.json holds no saved versions — nothing to shoot")
  process.exit(0)
}
try {
  await fetch(`${LAB}/data.json`)
} catch {
  console.error(`${LAB} does not answer — start the stand first: node artifacts/docs/composer/serve.mjs`)
  process.exit(1)
}

const stale = (v) => {
  const png = join(SHOTS, `${v.id}.png`)
  return !existsSync(png) || statSync(png).mtime.getTime() < Date.parse(v.updatedAt)
}
const todo = registry.versions.filter((v) => (only.length ? only.includes(v.id) : all || stale(v)))
const unknown = only.filter((id) => !registry.versions.some((v) => v.id === id))
if (unknown.length) console.error(`not in versions.json: ${unknown.join(", ")}`)
if (!todo.length) {
  console.log(`every frame is fresh (${registry.versions.length} versions) — pass --all to shoot again`)
  process.exit(unknown.length ? 1 : 0)
}

const { chromium } = await import(PW)
if (!chromium) throw new Error("playwright: chromium missing from the namespace")
mkdirSync(SHOTS, { recursive: true })
const browser = await chromium.launch()
let failed = 0
for (const v of todo) {
  const mobile = v.spec.width === "mobile"
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 520 } : { width: 1440, height: 1920 }, deviceScaleFactor: mobile ? 2 : 1 })
  const png = join(SHOTS, `${v.id}.png`)
  const webp = join(SHOTS, `${v.id}.webp`)
  try {
    await page.goto(`${LAB}/view?v=${encodeURIComponent(v.id)}`, { waitUntil: "networkidle", timeout: 60000 })
    await page.waitForSelector('body[data-ready="1"], body[data-error]', { timeout: 30000 })
    const error = await page.evaluate(() => document.body.dataset.error ?? null)
    if (error) throw new Error(error)
    await page.waitForTimeout(400)
    await page.screenshot({ path: png })
    execFileSync("magick", [png, "-resize", "960x1280!", "-quality", "82", "-define", "webp:method=6", webp])
    const size = execFileSync("magick", ["identify", "-format", "%wx%h", webp]).toString()
    const kb = Math.round(statSync(webp).size / 1024)
    console.log(`${v.id.padEnd(40)} ${v.label.slice(0, 32).padEnd(32)} ${(mobile ? "390×520@2 → " : "1440×1920 → ") + size} · ${kb} KB${mobile ? " · UPSCALED from 780×1040" : ""}`)
  } catch (error) {
    failed++
    console.log(`${v.id.padEnd(40)} FAILED — ${String(error.message).split("\n")[0]}`)
  }
  await page.close()
}
await browser.close()
console.log(`\n${todo.length - failed}/${todo.length} shot → ${SHOTS}/<id>.png + .webp (960×1280, the card format)`)
process.exit(failed ? 1 : 0)
