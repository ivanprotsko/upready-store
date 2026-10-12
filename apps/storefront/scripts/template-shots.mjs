#!/usr/bin/env node
// Shots of the template programme (t-2026-10-12-33, docs/templates/BLOCK-CONTRACT.md §5): every block anchor
// of the playground (`/<locale>/template-lab`) and every template preview (`/<locale>?template=<id>`), at
// 360, 768 and 1280 px, as PNGs plus an `index.html` contact sheet. With `--baseline <dir>` each PNG is
// compared pixel by pixel with the one of the same name there, in the browser's own canvas (no new
// dependency), and the sheet shows the share of changed pixels next to a diff image.
//
// The storefront must run with STOREFRONT_TEMPLATE_PREVIEW=1; the playground answers 404 otherwise, and the
// script stops there and says so.
//
//   node scripts/template-shots.mjs --base http://localhost:8130 --locale en \
//     [--host globex.shipshift.dev] [--out <dir>] [--baseline <dir>] [--widths 360,768,1280] [--saved <id>]
//
// `--saved <id>` shoots the home page the shop renders from its saved template (`POST /tenants/home/template`),
// with no `?template=` and no playground, under the file names the preview of `<id>` gets. Shoot the preview
// first, apply the template, then pass that run as `--baseline`: the diff is saved against preview.
//
// `--host` is sent as `x-forwarded-host`: a local storefront with no shop on `localhost` then resolves that
// shop by its address (`lib/tenant/request-shop.ts`), so the shots carry a real catalogue, not lorem.
//
// `playwright` is not linked into this workspace; only `@playwright/test` is, and it re-exports chromium.
import { chromium } from "@playwright/test"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "..", "..", "..")

function args(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith("--")) throw new Error(`unexpected argument ${key}`)
    const name = key.slice(2)
    if (!["base", "locale", "host", "out", "baseline", "widths", "saved"].includes(name)) {
      throw new Error(`unknown flag ${key}`)
    }
    out[name] = argv[++i]
    if (out[name] === undefined) throw new Error(`${key} needs a value`)
  }
  return out
}

const opts = args(process.argv.slice(2))
const base = (opts.base ?? "http://localhost:8000").replace(/\/+$/, "")
const locale = opts.locale ?? "en"
const widths = (opts.widths ?? "360,768,1280").split(",").map(Number)
const today = new Date().toISOString().slice(0, 10)
const outDir = path.resolve(opts.out ?? path.join(repoRoot, "artifacts", "templates", "shots", today))
const baselineDir = opts.baseline ? path.resolve(opts.baseline) : null
const headers = opts.host ? { "x-forwarded-host": opts.host } : {}

fs.mkdirSync(outDir, { recursive: true })

const commit = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot }).toString().trim()
  } catch {
    return "unknown"
  }
})()

/** Scrolls to the end and back so lazy images load, then waits for the network to settle. */
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
  await page.evaluate(() => Promise.all([...document.images].filter((img) => !img.complete).map((img) => new Promise((resolve) => {
    img.addEventListener("load", resolve, { once: true })
    img.addEventListener("error", resolve, { once: true })
    setTimeout(resolve, 5000)
  }))))
}

/** Hides every fixed or sticky bar outside the playground (site header, bottom nav, consent banner). */
async function hidePinnedOutside(page, selector) {
  await page.evaluate((sel) => {
    const keep = document.querySelector(sel)
    for (const el of document.querySelectorAll("body *")) {
      const pinned = ["fixed", "sticky"].includes(getComputedStyle(el).position)
      if (pinned && keep && !keep.contains(el) && !el.contains(keep)) el.style.setProperty("visibility", "hidden", "important")
    }
  }, selector)
}

const shots = []
const problems = []
const browser = await chromium.launch()

try {
  // What the playground lists: its anchors and its template links.
  const probe = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: headers })
  const probePage = await probe.newPage()
  const labUrl = `${base}/${locale}/template-lab`
  const response = await probePage.goto(labUrl, { waitUntil: "domcontentloaded", timeout: 180_000 })
  if (!response || response.status() !== 200) {
    throw new Error(`${labUrl} answered ${response?.status()}: is the storefront running with STOREFRONT_TEMPLATE_PREVIEW=1?`)
  }
  const anchors = opts.saved
    ? []
    : await probePage.$$eval("[data-block-anchor]", (els) =>
        els.map((el) => ({ anchor: el.id, block: el.dataset.blockAnchor, state: el.dataset.blockState }))
      )
  const templates = opts.saved
    ? [{ id: opts.saved, valid: true, title: `${opts.saved}, saved by the shop` }]
    : await probePage.$$eval("[data-template-id]", (els) =>
        els.map((el) => ({ id: el.dataset.templateId, valid: el.dataset.templateValid === "true", title: el.textContent }))
      )
  await probe.close()

  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, extraHTTPHeaders: headers })
    const page = await context.newPage()
    page.on("pageerror", (error) => problems.push(`${width}px pageerror: ${error.message}`))

    // Templates: the whole home page, as a shopper would scroll it.
    for (const template of templates) {
      const url = opts.saved ? `${base}/${locale}` : `${base}/${locale}?template=${template.id}`
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 })
      await settle(page)
      const facts = await page.evaluate(() => ({
        theme: document.documentElement.getAttribute("data-theme"),
        mode: document.documentElement.getAttribute("data-mode"),
        radius: getComputedStyle(document.documentElement).getPropertyValue("--radius").trim(),
        textBar: Boolean(document.querySelector('[data-block="announcement/text-bar"]')),
      }))
      const file = `template-${template.id}-${width}.png`
      await page.screenshot({ path: path.join(outDir, file), fullPage: true, animations: "disabled" })
      shots.push({ kind: "template", name: template.id, title: template.title, width, file, status: res?.status(), url, facts })
    }

    // Playground: one PNG per anchor. A `--saved` run shoots the home page alone.
    if (opts.saved) {
      await context.close()
      continue
    }
    const res = await page.goto(labUrl, { waitUntil: "domcontentloaded", timeout: 180_000 })
    await settle(page)
    await hidePinnedOutside(page, "[data-block-playground]")
    for (const { anchor, block, state } of anchors) {
      const file = `block-${anchor.replace(/^block-/, "")}-${width}.png`
      const target = page.locator(`#${anchor}`)
      const box = await target.boundingBox()
      if (!box || box.height < 1) {
        problems.push(`${width}px ${anchor}: nothing drawn`)
        shots.push({ kind: "block", name: anchor, block, state, width, file: null, status: res?.status(), note: "nothing drawn" })
        continue
      }
      await target.screenshot({ path: path.join(outDir, file), animations: "disabled" })
      shots.push({ kind: "block", name: anchor, block, state, width, file, status: res?.status(), height: Math.round(box.height) })
    }
    await context.close()
  }

  // Pixel diff against a baseline, in a canvas: no image library needed.
  if (baselineDir) {
    const page = await (await browser.newContext()).newPage()
    for (const shot of shots.filter((s) => s.file)) {
      const before = path.join(baselineDir, shot.file)
      if (!fs.existsSync(before)) {
        shot.diff = { note: "no baseline" }
        continue
      }
      const toUrl = (file) => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`
      const result = await page.evaluate(async ([a, b]) => {
        const load = (src) => new Promise((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = src
        })
        const [x, y] = await Promise.all([load(a), load(b)])
        if (x.width !== y.width || x.height !== y.height) {
          return { note: `size ${y.width}×${y.height} → ${x.width}×${x.height}`, ratio: 1 }
        }
        const canvas = (img) => {
          const c = document.createElement("canvas")
          c.width = img.width
          c.height = img.height
          const ctx = c.getContext("2d")
          ctx.drawImage(img, 0, 0)
          return ctx
        }
        const ca = canvas(x)
        const da = ca.getImageData(0, 0, x.width, x.height)
        const db = canvas(y).getImageData(0, 0, y.width, y.height)
        const out = ca.createImageData(x.width, x.height)
        let changed = 0
        for (let i = 0; i < da.data.length; i += 4) {
          const delta = Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2])
          const hit = delta > 24
          if (hit) changed++
          out.data[i] = hit ? 255 : da.data[i] * 0.3
          out.data[i + 1] = hit ? 0 : da.data[i + 1] * 0.3
          out.data[i + 2] = hit ? 0 : da.data[i + 2] * 0.3
          out.data[i + 3] = 255
        }
        ca.putImageData(out, 0, 0)
        return { ratio: changed / (x.width * x.height), image: ca.canvas.toDataURL("image/png") }
      }, [toUrl(path.join(outDir, shot.file)), toUrl(before)])
      if (result.image) {
        const diffFile = shot.file.replace(/\.png$/, ".diff.png")
        fs.writeFileSync(path.join(outDir, diffFile), Buffer.from(result.image.split(",")[1], "base64"))
        shot.diff = { ratio: result.ratio, file: diffFile }
      } else {
        shot.diff = { ratio: result.ratio, note: result.note }
      }
    }
  }
} finally {
  await browser.close()
}

/* ------------------------------------------------------------------ contact sheet */

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])

function rows(kind) {
  const names = [...new Set(shots.filter((s) => s.kind === kind).map((s) => s.name))]
  return names
    .map((name) => {
      const cells = widths
        .map((width) => {
          const shot = shots.find((s) => s.kind === kind && s.name === name && s.width === width)
          if (!shot?.file) return `<td class="miss">${esc(shot?.note ?? "no shot")}</td>`
          const diff = shot.diff
            ? `<div class="diff">${shot.diff.ratio !== undefined ? `${(shot.diff.ratio * 100).toFixed(2)} % changed` : ""} ${esc(shot.diff.note ?? "")}${shot.diff.file ? ` · <a href="${esc(shot.diff.file)}">diff</a>` : ""}</div>`
            : ""
          return `<td><a href="${esc(shot.file)}"><img loading="lazy" src="${esc(shot.file)}" alt="${esc(name)} at ${width}px"></a>${diff}</td>`
        })
        .join("")
      const first = shots.find((s) => s.kind === kind && s.name === name)
      const label =
        kind === "template"
          ? `<b>${esc(first.title ?? name)}</b><br><code>${opts.saved ? `/ (saved, no query)` : `?template=${esc(name)}`}</code><br>${esc(JSON.stringify(first.facts ?? {}))}`
          : `<b>${esc(first.block)}</b><br>${esc(first.state)}`
      return `<tr><th>${label}</th>${cells}</tr>`
    })
    .join("\n")
}

const head = `<tr><th></th>${widths.map((w) => `<th>${w} px</th>`).join("")}</tr>`
const html = `<!doctype html>
<meta charset="utf-8">
<title>Template shots ${today}</title>
<style>
  body { font: 14px/1.4 system-ui, sans-serif; margin: 24px; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 8px; vertical-align: top; text-align: left; }
  th { max-width: 220px; font-weight: 400; }
  img { display: block; width: 220px; height: auto; }
  td.miss { color: #a00; }
  .diff { font-size: 12px; color: #555; margin-top: 4px; }
</style>
<h1>Template shots</h1>
<p>${esc(today)} · commit ${esc(commit)} · ${esc(base)}${opts.host ? ` as ${esc(opts.host)}` : ""} · locale ${esc(locale)}${baselineDir ? ` · baseline ${esc(baselineDir)}` : ""}</p>
${problems.length ? `<h2>Problems</h2><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
<h2>Templates</h2>
<table>${head}${rows("template")}</table>
<h2>Playground</h2>
<table>${head}${rows("block")}</table>
`
fs.writeFileSync(path.join(outDir, "index.html"), html)
fs.writeFileSync(path.join(outDir, "shots.json"), `${JSON.stringify({ date: today, commit, base, host: opts.host ?? null, locale, widths, problems, shots }, null, 2)}\n`)

// The sheet itself as two images, templates and playground: what a PR body shows. The single PNGs stay
// out of git (`.gitignore`, the repository's rule for contact-sheet binaries); these two and the sheet go in.
{
  const sheet = await chromium.launch()
  try {
    const page = await (await sheet.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
    await page.goto(`file://${path.join(outDir, "index.html")}`)
    await page.evaluate(async () => {
      for (const img of document.images) img.loading = "eager"
      await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true })
        img.addEventListener("error", resolve, { once: true })
      }))))
    })
    const tables = page.locator("table")
    await tables.nth(0).screenshot({ path: path.join(outDir, "contact-templates.jpg"), type: "jpeg", quality: 80 })
    await tables.nth(1).screenshot({ path: path.join(outDir, "contact-playground.jpg"), type: "jpeg", quality: 80 })
  } finally {
    await sheet.close()
  }
}

console.log(`${shots.filter((s) => s.file).length} shots, ${problems.length} problems → ${path.join(outDir, "index.html")}`)
for (const p of problems) console.log(`  ! ${p}`)
