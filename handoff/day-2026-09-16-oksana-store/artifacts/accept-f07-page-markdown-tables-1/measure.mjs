import { createRequire } from "node:module"

const require = createRequire("file:///Users/ivanprotsko/.npm/_npx/e41f203b7505f1fb/x.js")
const playwright = require("playwright-core")
const chromium = playwright.chromium
if (!chromium) {
  throw new Error(`no chromium export; keys: ${Object.keys(playwright).join(",")}`)
}

const OUT =
  "/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/accept-f07-page-markdown-tables-1"

const PAGES = ["contacts", "offer", "privacy"]

const browser = await chromium.launch()

for (const key of PAGES) {
  const url = `file:///tmp/f07/${key}.html`

  for (const [w, h] of [
    [1280, 900],
    [390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    await page.goto(url, { waitUntil: "load" })

    const m = await page.evaluate(() => {
      const t = document.body.innerText
      return {
        pipe: t.includes("|"),
        sep: t.includes("|---|"),
        dashRunAsText: /(^|\n)\s*---+\s*(\n|$)/.test(t),
        tables: document.querySelectorAll("table").length,
        rows: document.querySelectorAll("tbody tr").length,
        hrs: document.querySelectorAll("hr").length,
        ems: document.querySelectorAll("em").length,
        gluedToken: document.body.innerHTML.includes("ЮРАДРЕС"),
        tokenIntact: t.includes("{{ЮР_АДРЕС}}"),
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        bodyScroll: document.body.scrollWidth,
        textLen: t.length,
      }
    })

    console.log(`${key} ${w}x${h} ${JSON.stringify(m)}`)
    await page.screenshot({ path: `${OUT}/${key}-${w}x${h}.png`, fullPage: false })
    await page.close()
  }
}

await browser.close()
