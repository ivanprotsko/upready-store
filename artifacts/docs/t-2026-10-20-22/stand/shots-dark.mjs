import { createRequire } from "node:module"
const require = createRequire("/Users/ivanprotsko/upready/worktrees/upready-store/feat/t22-region-popup/apps/storefront/package.json")
const { chromium } = require("@playwright/test")
const [exe, out, scheme] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: exe })
for (const [loc, w, h] of [["en", 1280, 800], ["ru", 1280, 800], ["en", 390, 844], ["ru", 390, 844]]) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, isMobile: w < 500, hasTouch: w < 500,
    userAgent: w < 500 ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1" : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" })
  const p = await c.newPage(); await p.goto(`http://localhost:8000/${loc}`, { waitUntil: "networkidle" })
  await p.getByTestId("region-popup-other").waitFor({ timeout: 15000 })
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" })
  await p.waitForTimeout(400)
  const dark = await p.evaluate(() => document.documentElement.className + " | " + getComputedStyle(document.body).backgroundColor)
  console.log(loc, w, scheme, dark)
  await p.screenshot({ path: `${out}/popup-${loc}-${w < 500 ? "mobile" : "desktop"}-${scheme}.png` })
  await c.close()
}
await browser.close()
