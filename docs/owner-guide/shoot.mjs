#!/usr/bin/env node
// Shoots every frame of the owner guide from a running panel and records what each frame was shot from.
//
//   node docs/owner-guide/shoot.mjs --base http://localhost:5181 --logins <file> --ids <file> --out <dir> [--only a,b] [--no-lock] [--compare <dir>]
//
//   --base    the panel of a stand (never a live panel: the guide is shot on an anonymized copy)
//   --logins  JSON { owner|manager|operator: { email, password } } — logins that exist on that stand only
//   --ids     JSON with the stand's record ids the scenes name in `path`: product, course, lesson,
//             orderPack, orderPacked, orderShipped, orderPaymentWait, orderCourse (README.md)
//   --out     where the PNG files go; keep it outside the repository, frames are not committed
//   --only    shoot these scene ids only (the lock keeps the other entries as they are)
//   --no-lock do not touch shots.lock.json
//   --compare compare every new frame with the frame of the same name in <dir> (the frames the guide is published
//             with) and name the frames where more than 0.5 % of the pixels changed. Two shots of an unchanged
//             screen differ in a few anti-aliased pixels, so a byte-for-byte comparison would flag every frame.
//
// One Chromium, one tab per role, 1440×900, light theme, Russian. No video and no trace: `recordVideo`
// is never set and tracing is never started. Every request to a host other than the stand's is aborted
// and counted, so a frame cannot pull anything from a live service.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { SCENES } from "./scenes.mjs"
import { LOCK, REPO, hashSources, hashStrings, parseArgs, readCatalog, sceneI18n, sceneSources, sha256File } from "./lib.mjs"

const args = parseArgs(process.argv.slice(2), { base: "value", logins: "value", ids: "value", out: "value", only: "value", "no-lock": "flag", compare: "value" })
for (const need of ["base", "logins", "ids", "out"]) if (!args[need]) throw new Error(`нужен --${need}`)
const base = args.base.replace(/\/$/, "")
const standHost = new URL(base).hostname
const logins = JSON.parse(readFileSync(args.logins, "utf8"))
const ids = JSON.parse(readFileSync(args.ids, "utf8"))
const only = args.only ? new Set(args.only.split(",")) : null
const scenes = SCENES.filter((s) => !only || only.has(s.id))
if (only) for (const id of only) if (!SCENES.some((s) => s.id === id)) throw new Error(`нет сцены ${id}`)
mkdirSync(args.out, { recursive: true })

// @playwright/test is a dependency of the storefront (its e2e suites); the guide borrows it from there.
const require = createRequire(join(REPO, "apps/storefront/package.json"))
const { chromium } = require("@playwright/test")

const fill = (path) =>
  path.replace(/\{(\w+)\}/g, (_, k) => {
    if (!ids[k]) throw new Error(`в --ids нет ${k}`)
    return ids[k]
  })

const target = (page, t) => {
  // Only what is on screen: a page often keeps a hidden twin of a button (a drawer, a collapsed menu).
  if (t.role) return page.getByRole(t.role, { name: t.name, exact: true }).filter({ visible: true }).first()
  if (t.text) return page.getByText(t.text, { exact: true }).filter({ visible: true }).first()
  if (t.css) return page.locator(t.css).filter({ visible: true }).first()
  throw new Error(`цель без role/text/css: ${JSON.stringify(t)}`)
}

const browser = await chromium.launch({ headless: true })
const tabs = new Map()
let aborted = 0

async function tab(role) {
  if (tabs.has(role)) return tabs.get(role)
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU", colorScheme: "light", reducedMotion: "reduce" })
  await context.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname
    if (host === standHost || host === "localhost" || host === "127.0.0.1") return route.continue()
    aborted++
    return route.abort()
  })
  const page = await context.newPage()
  if (role) {
    const login = logins[role]
    if (!login) throw new Error(`в --logins нет роли ${role}`)
    await page.goto(base + "/login")
    await page.fill('input[name="email"]', login.email)
    await page.fill('input[name="password"]', login.password)
    await page.click('button[type="submit"]')
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 })
  }
  tabs.set(role, page)
  return page
}

const catalog = readCatalog()
const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, "utf8")) : { scenes: {} }
const git = (...a) => execFileSync("git", a, { cwd: REPO, encoding: "utf8" }).trim()
const commit = git("rev-parse", "HEAD")
const dirty = git("status", "--porcelain", "--", "apps/tenant-panel/src", "docs/owner-guide/scenes.mjs") !== ""
const failed = []
const changed = []

/** Share of pixels whose colour moved by more than 32 of 255 in any channel; 1 when the sizes differ. */
const pixelDiff = (page, before, after) =>
  page.evaluate(
    async ([a, b]) => {
      const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src })
      const [x, y] = await Promise.all([load(a), load(b)])
      if (x.width !== y.width || x.height !== y.height) return 1
      const read = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data }
      const p = read(x), q = read(y)
      let n = 0
      for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) > 32 || Math.abs(p[i + 1] - q[i + 1]) > 32 || Math.abs(p[i + 2] - q[i + 2]) > 32) n++
      return n / (p.length / 4)
    },
    [before, after].map((f) => "data:image/png;base64," + readFileSync(f).toString("base64"))
  )

for (const scene of scenes) {
  const page = await tab(scene.role)
  const file = join(args.out, `${scene.id}.png`)
  try {
    await page.goto(base + fill(scene.path), { waitUntil: "networkidle", timeout: 45000 }).catch(() => {})
    await page.waitForTimeout(800)
    for (const step of scene.steps ?? []) {
      if (step.click) await target(page, step.click).click({ timeout: 15000 })
      if (step.scroll) await target(page, step.scroll).scrollIntoViewIfNeeded({ timeout: 15000 })
      if (step.wait) await page.waitForTimeout(step.wait)
    }
    if (scene.mark) {
      const el = target(page, scene.mark)
      await el.scrollIntoViewIfNeeded({ timeout: 15000 })
      await el.evaluate((node) => {
        node.style.outline = "3px solid #e5484d"
        node.style.outlineOffset = "3px"
        node.style.borderRadius = node.style.borderRadius || "6px"
      })
    }
    await page.mouse.move(0, 0)
    await page.screenshot({ path: file, fullPage: Boolean(scene.full), animations: "disabled", caret: "hide" })
    const old = args.compare ? join(args.compare, `${scene.id}.png`) : null
    if (old && existsSync(old)) {
      const share = await pixelDiff(page, old, file)
      if (share > 0.005) changed.push(`${scene.id} (${(share * 100).toFixed(1)} % точек)`)
    } else if (old) changed.push(`${scene.id} (в ${args.compare} такого кадра нет)`)
    lock.scenes[scene.id] = {
      sources: hashSources(sceneSources(scene)),
      i18n: hashStrings(catalog, sceneI18n(scene)),
      frame: sha256File(file),
      path: scene.path,
      role: scene.role,
    }
    console.log(`снят ${scene.id}`)
  } catch (e) {
    failed.push(scene.id)
    console.log(`НЕ снят ${scene.id}: ${String(e.message ?? e).split("\n")[0]}`)
  }
}
await browser.close()

if (!args["no-lock"]) {
  lock.shotAt = new Date().toISOString()
  lock.commit = commit
  lock.dirty = dirty
  lock.scenes = Object.fromEntries(Object.entries(lock.scenes).filter(([id]) => SCENES.some((s) => s.id === id)).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + "\n")
}
console.log(`кадров ${scenes.length - failed.length} из ${scenes.length}; внешних запросов оборвано ${aborted}${failed.length ? `; не сняты: ${failed.join(", ")}` : ""}`)
if (args.compare) console.log(changed.length ? `выглядят иначе, чем в ${args.compare}: ${changed.join(", ")}` : `все кадры совпадают с ${args.compare}`)
process.exit(failed.length ? 1 : 0)
