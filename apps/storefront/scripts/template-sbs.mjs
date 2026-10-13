#!/usr/bin/env node
// The lab beside the storefront (t-2026-10-12-33, docs/templates/BLOCK-CONTRACT.md §Template Contract): a template's
// home, category and product pages on the storefront with `?template=<id>`, at 1280, 768 and 360 px, full page, each
// beside the 16.09 lab's shot of the same page (`artifacts/docs/store-templates-lab/shots/<id>-*.webp`). One JPEG per
// pair, `sbs-<page>-<width>.jpg`, and a `side-by-side.html` showing them all, into
// `artifacts/templates/shots/<date>-<id>/`: the sheet a template hand-in shows. Pairs, names, labels and the sheet
// itself: `./template-sbs/plan.mjs`.
//
//   node scripts/template-sbs.mjs <id> --base http://localhost:8130 [--locale ru] [--host globex.shipshift.dev] [--out <dir>]
//
// The stand, its flag and `--host` are the shots script's (`template-shots.mjs`): the storefront runs with
// STOREFRONT_TEMPLATE_PREVIEW=1, and `--host` goes as `x-forwarded-host`, so the pages carry the shop's catalogue.
// `--locale` is `ru` unless given: the lab drew Russian pages. The category page is the first category the playground
// links, then the home page, that lists a product; the product page is the first product it lists.
//
// A pair is composed by the browser itself, an HTML page with both pictures screenshotted as a JPEG at quality 55:
// no image library. Exit 0: every pair written and under 400 KB; 1: a pair over the limit or a page that did not
// answer 200; 2: nothing was shot (no stand, no playground, no such template).
import { chromium } from "@playwright/test"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  LAB_DIR,
  WIDTHS,
  categoryPaths,
  composeHtml,
  composeWidth,
  oversize,
  planPairs,
  productPaths,
  sheetHtml,
} from "./template-sbs/plan.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..", "..", "..")

const FLAGS = ["base", "locale", "host", "out"]
function args(argv) {
  const out = { ids: [] }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (key === "--") continue
    if (!key.startsWith("--")) {
      out.ids.push(key)
      continue
    }
    const name = key.slice(2)
    if (!FLAGS.includes(name)) throw new Error(`unknown flag ${key}`)
    out[name] = argv[++i]
    if (out[name] === undefined) throw new Error(`${key} needs a value`)
  }
  return out
}

const opts = args(process.argv.slice(2))
if (opts.ids.length !== 1) {
  console.error("usage: pnpm template:sbs <template id> --base <storefront url> [--locale ru] [--host <shop host>] [--out <dir>]")
  process.exit(2)
}
const [id] = opts.ids
const base = (opts.base ?? "http://localhost:8000").replace(/\/+$/, "")
const locale = opts.locale ?? "ru"
const today = new Date().toISOString().slice(0, 10)
const outDir = path.resolve(opts.out ?? path.join(repoRoot, "artifacts", "templates", "shots", `${today}-${id}`))
const labDir = path.join(repoRoot, LAB_DIR)
const headers = opts.host ? { "x-forwarded-host": opts.host } : {}

const commit = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot }).toString().trim()
  } catch {
    return "unknown"
  }
})()

/** Scrolls to the end and back so lazy images load, then waits for the network and the fonts (as the shots do). */
async function settle(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {})
  await page.evaluate(() =>
    Promise.all(
      [...document.images]
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise((resolve) => {
              img.addEventListener("load", resolve, { once: true })
              img.addEventListener("error", resolve, { once: true })
              setTimeout(resolve, 5000)
            })
        )
    )
  )
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(200)
}

const pathnames = (page, selector) => page.$$eval(selector, (els) => els.map((a) => new URL(a.href).pathname))

const problems = []
const browser = await chromium.launch()
let paths
let title = id
const written = []

try {
  // The template on the playground, and the category and product pages its sheet shows.
  const probe = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: headers })
  const probePage = await probe.newPage()
  const labUrl = `${base}/${locale}/template-lab`
  const response = await probePage.goto(labUrl, { waitUntil: "domcontentloaded", timeout: 180_000 }).catch((e) => ({ status: () => e.message }))
  if (!response || response.status() !== 200) {
    throw Object.assign(new Error(`${labUrl} answered ${response?.status()}: is the storefront running with STOREFRONT_TEMPLATE_PREVIEW=1?`), { exit: 2 })
  }
  await probePage.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {})
  const templates = await probePage.$$eval("[data-template-id]", (els) =>
    els.map((el) => ({ id: el.dataset.templateId, valid: el.dataset.templateValid === "true", title: el.textContent?.trim() }))
  )
  const template = templates.find((t) => t.id === id)
  if (!template) {
    throw Object.assign(new Error(`${id} is not a template of the playground (${templates.map((t) => t.id).join(", ")})`), { exit: 2 })
  }
  if (!template.valid) throw Object.assign(new Error(`${id} is invalid on the playground: it does not preview`), { exit: 2 })
  title = template.title || id

  const links = await pathnames(probePage, "[data-block-playground] a[href]")
  await probePage.goto(`${base}/${locale}`, { waitUntil: "domcontentloaded", timeout: 180_000 })
  links.push(...(await pathnames(probePage, "a[href]")))
  paths = { home: `/${locale}`, category: null, product: null }
  for (const category of categoryPaths(links)) {
    const res = await probePage.goto(`${base}${category}`, { waitUntil: "domcontentloaded", timeout: 180_000 })
    if (res?.status() !== 200) continue
    await probePage.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {})
    const [product] = productPaths(await pathnames(probePage, "main a[href]"))
    if (product) {
      paths = { ...paths, category, product }
      break
    }
  }
  await probe.close()
  if (!paths.category) problems.push("no category with a product on the playground or the home page: no category and no product page")

  const { pairs, notices } = planPairs(id, fs.existsSync(labDir) ? fs.readdirSync(labDir) : [])
  fs.mkdirSync(outDir, { recursive: true })
  const compose = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage()
  const dataUrl = (type, buffer) => `data:${type};base64,${buffer.toString("base64")}`

  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, extraHTTPHeaders: headers })
    const page = await context.newPage()
    page.on("pageerror", (error) => problems.push(`${width}px pageerror: ${error.message}`))
    for (const pair of pairs.filter((p) => p.width === width && paths[p.page])) {
      const url = `${base}${paths[pair.page]}?template=${id}`
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 })
      if (res?.status() !== 200) problems.push(`${paths[pair.page]}?template=${id} answered ${res?.status()} at ${width} px`)
      await settle(page)
      const shot = await page.screenshot({ fullPage: true, animations: "disabled" })
      const lab = pair.lab ? dataUrl("image/webp", fs.readFileSync(path.join(labDir, pair.lab))) : null
      await compose.setViewportSize({ width: composeWidth(pair), height: 900 })
      await compose.setContent(composeHtml(pair, { lab, storefront: dataUrl("image/png", shot) }), { waitUntil: "load" })
      const file = path.join(outDir, pair.file)
      await compose.locator("#pair").screenshot({ path: file, type: "jpeg", quality: 55 })
      written.push({ file: pair.file, bytes: fs.statSync(file).size })
    }
    await context.close()
  }

  const shown = pairs.filter((p) => written.some((w) => w.file === p.file))
  fs.writeFileSync(
    path.join(outDir, "side-by-side.html"),
    sheetHtml({ id, title, date: today, commit, base, host: opts.host, locale, paths, pairs: shown, notices, problems })
  )
  for (const notice of notices) console.log(notice)
} catch (error) {
  console.error(`template:sbs: ${error.message}`)
  await browser.close()
  process.exit(error.exit ?? 1)
}
await browser.close()

const over = oversize(written)
for (const w of written) console.log(`  ${w.file} ${Math.ceil(w.bytes / 1000)} KB`)
console.log(`${written.length} pairs → ${path.join(outDir, "side-by-side.html")}`)
for (const p of [...problems, ...over]) console.log(`  ! ${p}`)
process.exit(problems.length || over.length ? 1 : 0)
