// Probe: open one URL headless, print how sections are marked in the DOM. No clicks, no login, no cart.
// Usage: T33_TOOLS=<dir with node_modules> node probe.mjs <url> <out.json>
import fs from "node:fs"; import { createRequire } from "node:module"
const { chromium } = createRequire(process.env.T33_TOOLS + "/")("playwright-core")
const EXE = process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell"
const [url, out] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: EXE })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" })).newPage()
const r = await page.goto(url, { waitUntil: "load", timeout: 45000 }); console.log("status", r?.status(), page.url())
const info = await page.evaluate(() => {
  const pick = (el) => ({ tag: el.tagName.toLowerCase(), id: el.id, cls: el.className?.toString().slice(0, 200), attrs: [...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => a.name + "=" + a.value.slice(0, 80)), style: (el.getAttribute("style") || "").slice(0, 400), h: el.querySelector("h1,h2,h3")?.textContent?.trim().slice(0, 60), height: Math.round(el.getBoundingClientRect().height) })
  const layouts = [...document.querySelectorAll("[class*='widget-type_'], .t-rec, [data-widget-type]")]
  return { title: document.title, count: layouts.length, items: layouts.slice(0, 60).map(pick), bodyChildren: [...document.body.children].slice(0, 30).map(pick) }
})
fs.writeFileSync(out, JSON.stringify(info, null, 1)); console.log("sections", info.count)
await browser.close()
