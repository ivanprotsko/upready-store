#!/usr/bin/env node
/**
 * Contact-sheet shooter: theme x mode x page, at the 1440 viewport.
 *
 * Mode is forced the way theme-coverage-gate.mjs forces it and no other way: the
 * pre-paint script reads localStorage BEFORE the first paint, so the key is written with
 * addInitScript ahead of navigation and the landed `data-mode` is asserted after load. A
 * mode that does not land is recorded in the manifest, never silently accepted.
 *
 * playwright is not linked at the repo root — only apps/storefront carries @playwright/test.
 * The ESM entry is imported by absolute path: require.resolve() would hand back the CJS
 * wrapper whose namespace has no chromium (rule 19f).
 */

import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, "shots")
const PW = "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs"

const WIDTH = 1440
const HEIGHT = 1200
const MODES = ["light", "dark"]
const NAV_TIMEOUT = 60000

// Every route below was confirmed 200 by curl before the run; PDP handles were taken off
// each theme's own /en/store page, never guessed.
const THEMES = [
  {
    id: "supplements",
    port: 8070,
    pages: {
      home: "/en",
      category: "/en/categories/daily-foundations",
      pdp: "/en/products/ashwagandha-ksm",
    },
  },
  {
    id: "electronics",
    port: 8061,
    // The stand answered 500 on every route while the first shoot ran (05:53-05:55): its
    // backend had been started against the shared upready_store database while the storefront
    // presented a key from upready_store_electronics. Restarted from its own directory at
    // 05:58; all three routes below measured 200 before this entry was written.
    pages: {
      home: "/en",
      category: "/en/categories/headphones",
      pdp: "/en/products/bench-over-ear",
    },
  },
  {
    id: "womens-fashion",
    port: 8081,
    pages: {
      home: "/en",
      category: "/en/categories/outerwear",
      pdp: "/en/products/belair-wool-overcoat",
    },
  },
  {
    id: "home-goods",
    port: 8110,
    pages: {
      home: "/en",
      category: "/en/categories/the-kitchen",
      pdp: "/en/products/braiser",
    },
  },
]

// Freeze motion and hide the Next dev overlay: a contact sheet compares themes, and a
// half-played transition or a dev badge is neither theme nor product.
const CALM_CSS = `
*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;
  transition-duration:0s!important;transition-delay:0s!important;
  scroll-behavior:auto!important;caret-color:transparent!important}
nextjs-portal,#nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-tools-button]{display:none!important}
`

async function main() {
  mkdirSync(SHOTS, { recursive: true })
  const { chromium } = await import(PW)
  if (typeof chromium?.launch !== "function") throw new Error("no chromium on the playwright namespace")

  const browser = await chromium.launch({ headless: true })
  const manifest = []

  for (const mode of MODES) {
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
      colorScheme: mode === "dark" ? "dark" : "light",
      reducedMotion: "reduce",
    })
    await context.addInitScript(
      ({ key, value }) => {
        try { window.localStorage.setItem(key, value) } catch { /* asserted after load */ }
      },
      { key: "upready-store.mode", value: mode },
    )
    const page = await context.newPage()
    page.setDefaultTimeout(NAV_TIMEOUT)

    const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
    for (const theme of THEMES) {
      if (only.length && !only.includes(theme.id)) continue;   // re-shoot one stand, keep the rest
      for (const kind of ["home", "category", "pdp"]) {
        const file = `${theme.id}-${mode}-${kind}.png`
        const rec = { theme: theme.id, mode, kind, file, url: `http://localhost:${theme.port}${theme.pages[kind]}` }

        if (theme.down) {
          rec.status = "down"
          rec.reason = theme.down
          manifest.push(rec)
          console.log(`SKIP  ${file}  (${theme.down})`)
          continue
        }

        try {
          const res = await page.goto(rec.url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT })
          const code = res ? res.status() : 0
          rec.http = code
          if (!res || code >= 400) throw new Error(`answered ${code || "nothing"}`)

          await page.addStyleTag({ content: CALM_CSS })

          // Lazy images below the fold never decode if the page is never scrolled; walk
          // down three viewports and back so the fold we shoot is fully painted.
          await page.evaluate(async () => {
            for (let i = 1; i <= 3; i++) {
              window.scrollTo(0, i * window.innerHeight)
              await new Promise((r) => setTimeout(r, 250))
            }
            window.scrollTo(0, 0)
            await new Promise((r) => setTimeout(r, 400))
          })
          await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {})

          // Field names must not collide with the REQUESTED axes already on rec: an
          // Object.assign of a probe carrying `mode` would overwrite what we asked for
          // with what landed, and the mismatch it is meant to expose would vanish.
          const probe = await page.evaluate(() => ({
            landedMode: document.documentElement.dataset.mode || null,
            landedTheme: document.documentElement.dataset.theme || null,
            images: document.images.length,
            broken: Array.from(document.images).filter((i) => !i.complete || i.naturalWidth === 0).length,
            bg: getComputedStyle(document.body).backgroundColor,
            title: document.title,
          }))
          Object.assign(rec, probe)
          rec.modeApplied = probe.landedMode === mode

          await page.screenshot({ path: join(SHOTS, file), fullPage: false })
          rec.status = "ok"
          console.log(
            `SHOT  ${file}  http=${code} mode=${probe.landedMode}${rec.modeApplied ? "" : " !!MISMATCH"} ` +
              `theme=${probe.landedTheme} img=${probe.images} broken=${probe.broken} bg=${probe.bg}`,
          )
        } catch (err) {
          rec.status = "error"
          rec.reason = String(err.message).split("\n")[0]
          console.log(`FAIL  ${file}  ${rec.reason}`)
        }
        manifest.push(rec)
      }
    }
    await context.close()
  }

  await browser.close()
  writeFileSync(join(HERE, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n")

  // SWEEP_OK: a swallowed cell must reach BOTH ends. The journal above is the operator's
  // end; these two are the caller's — the manifest carries every failure into the HTML
  // grid as a visible tile, and the summary plus a non-zero exit stop a partial sheet
  // from being read as a complete one. Silence here would be indistinguishable from 24
  // good shots.
  const ok = manifest.filter((m) => m.status === "ok").length
  const bad = manifest.filter((m) => m.status !== "ok")
  const mism = manifest.filter((m) => m.status === "ok" && m.modeApplied === false)
  const brok = manifest.filter((m) => m.status === "ok" && m.broken > 0)
  console.log(`\nDONE ${ok}/${manifest.length} shot; manifest at ${join(HERE, "manifest.json")}`)
  if (bad.length) {
    console.log(`INCOMPLETE — ${bad.length} cell(s) produced no screenshot:`)
    for (const b of bad) console.log(`  ${b.file}: ${b.status} — ${b.reason}`)
  }
  for (const m of mism) console.log(`MODE-MISMATCH ${m.file}: asked ${m.mode}, document says ${m.landedMode}`)
  for (const b of brok) console.log(`BROKEN-IMAGES ${b.file}: ${b.broken}/${b.images} did not decode`)
  if (bad.length || mism.length) process.exitCode = 1
}

main().catch((e) => { console.error("FATAL", e); process.exit(2) })
