/**
 * f12-owner-raw-keys — measurement helpers.
 *
 * The stand is a LOCAL copy of the live shop: postgres database
 * `upready_store_f12` cloned from `upready_store_cherkashina` (the 2026-09-12
 * migration of olavka.ru into tenant `cherkashino`, port 5433), backend
 * `medusa develop` on :9040, panel `vite` on :5190 serving THIS worktree
 * (after `git merge origin/dev`, so the round-1 findings' fixes and the
 * neighbours' merged work are both live). The owner logs in as the tenant's
 * own seeded test identity `owner-cherkashino@example.test` (memory
 * `upready-store-stand-traps-2026-09-15.md`), pointed at the real tenant_admin
 * row copied by the clone.
 */
import fs from "node:fs"
import path from "node:path"
import { chromium } from "../../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs"

export const ROOT = path.resolve(
  new URL(".", import.meta.url).pathname,
  ".."
)
export const SHOTS = path.join(ROOT, "shots")
export const RAW = path.join(ROOT, "raw")
export const PANEL = process.env.PANEL_URL || "http://localhost:5190"
export const BACKEND = process.env.BACKEND_URL || "http://localhost:9040"
export const EMAIL = "owner-cherkashino@example.test"
export const PASSWORD = "supersecret1"

/** The task's own three regexes (prompts/f12-owner-raw-keys.md "Приёмка"). */
export const RAW_KEY_RE = /[a-z][a-z_]+\.[a-z_]+\.[a-z_]+/g
export const MACHINE_VALUE_RE =
  /Pp_system_default|Canceled|Default option|Sales channel of tenant|Russian Federation|Show password|ИСТИНА|ЛОЖЬ/g

export async function launch() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ru-RU",
  })
  const page = await ctx.newPage()
  const errors = []
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 300))
  })
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 300)))
  return { browser, ctx, page, errors }
}

export async function login(page) {
  await page.goto(PANEL + "/login", { waitUntil: "domcontentloaded" })
  await page.fill('input[autocomplete="email"]', EMAIL)
  await page.fill('input[autocomplete="current-password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 60000 })
}

export async function shot(page, name) {
  const p = path.join(SHOTS, `${name}-1280x900.png`)
  await page.screenshot({ path: p, fullPage: false })
  return p
}

export function save(name, obj) {
  const p = path.join(RAW, name.endsWith(".json") ? name : `${name}.json`)
  fs.writeFileSync(p, JSON.stringify(obj, null, 2))
  return p
}

/**
 * Measures one screen against the task's three regexes. `innerText` is used
 * deliberately (not `textContent`): it is what a sighted owner actually sees,
 * respecting CSS visibility — a Tailwind `sr-only` node (clip+1px, not
 * `display:none`) is NOT excluded by `innerText` per spec, so this also
 * settles round 1's open question about "Show password": if that string
 * shows up here, it genuinely reaches the rendered text a scan would flag.
 */
/**
 * For each element on the page whose OWN text node equals `text` exactly,
 * report its rendered box and the clip/overflow that could shrink it to
 * nothing. Used to tell a genuine on-screen leak from a Tailwind `sr-only`
 * label (1×1px, `clip: rect(0,0,0,0)`, `overflow: hidden` — laid out, but with
 * zero visible area, so `innerText` still returns it per spec even though no
 * sighted user sees it).
 */
async function elementVisibility(page, text) {
  return page.evaluate((needle) => {
    const out = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
    let el
    while ((el = walker.nextNode())) {
      const ownText = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join("")
        .trim()
      if (ownText !== needle) continue
      const rect = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      out.push({
        tag: el.tagName.toLowerCase(),
        className: el.className,
        width: rect.width,
        height: rect.height,
        display: cs.display,
        visibility: cs.visibility,
        clip: cs.clip,
      })
    }
    return out
  }, text)
}

const isInvisible = (v) =>
  (v.width === 0 && v.height === 0) ||
  v.display === "none" ||
  v.visibility === "hidden" ||
  /rect\(0px,\s*0px,\s*0px,\s*0px\)/.test(v.clip)

/**
 * Measures one screen against the task's three regexes. `innerText` is used
 * deliberately (not `textContent`): it is what a sighted owner actually sees,
 * respecting CSS visibility for most cases — EXCEPT a Tailwind `sr-only` node
 * (clip+1px, not `display:none`), which `innerText` still returns per spec.
 * Every `machineValueMatches` hit is therefore re-checked against the DOM
 * (`elementVisibility`) and split into `visibleMachineValueMatches` (a real
 * defect) and `invisibleMachineValueMatches` (confirmed sr-only, not one).
 */
export async function measureScreen(page, name) {
  await page.waitForTimeout(400)
  const bodyText = await page.evaluate(() => document.body.innerText)
  const title = await page.title()
  const rawKeyMatches = [...new Set([...bodyText.matchAll(RAW_KEY_RE)].map((m) => m[0]))]
  const machineValueMatches = [
    ...new Set([...bodyText.matchAll(MACHINE_VALUE_RE)].map((m) => m[0])),
  ]
  const hasMedusaInTitle = /medusa/i.test(title)

  const visibleMachineValueMatches = []
  const invisibleMachineValueMatches = []
  for (const match of machineValueMatches) {
    const els = await elementVisibility(page, match)
    if (els.length && els.every(isInvisible)) {
      invisibleMachineValueMatches.push({ match, evidence: els })
    } else {
      visibleMachineValueMatches.push({ match, evidence: els })
    }
  }

  return {
    name,
    url: page.url(),
    title,
    hasMedusaInTitle,
    rawKeyMatches,
    machineValueMatches,
    visibleMachineValueMatches,
    invisibleMachineValueMatches,
  }
}
