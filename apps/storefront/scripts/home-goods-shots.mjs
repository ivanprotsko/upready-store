// W8 contact shots for home-goods. Both modes, both viewports, the pages that carry
// the two traps the previous theme hit: a collection row that does not fill, and
// product frames that flare white in dark mode.
// `playwright` is not linked into this workspace; only `@playwright/test` is, and it
// re-exports chromium — the same resolution the coverage gate documents at its line 95.
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const OUT = '/Users/ivanprotsko/upready/worktrees/upready-store/feat/store/home-goods/artifacts/docs/home-goods-shots'
const BASE = 'http://localhost:8110'
const PAGES = [
  ['home', '/'],
  ['listing', '/store'],
  ['pdp', '/products/braiser'],
  ['account', '/account'],
]
const VIEWS = [['1440', 1440, 900], ['390', 390, 844]]
const log = []
const browser = await chromium.launch()
for (const mode of ['light', 'dark']) {
  for (const [vname, w, h] of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: mode })
    const page = await ctx.newPage()
    for (const [name, path] of PAGES) {
      const file = `${OUT}/${name}-${mode}-${vname}.png`
      try {
        const r = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 })
        // The mode is SET, then READ BACK off <html>: an asked-for mode is not a got mode.
        await page.evaluate((m) => {
          document.documentElement.setAttribute('data-mode', m)
        }, mode)
        await page.waitForTimeout(600)
        const got = await page.evaluate(() => ({
          mode: document.documentElement.getAttribute('data-mode'),
          theme: document.documentElement.getAttribute('data-theme'),
          bodyBg: getComputedStyle(document.body).backgroundColor,
        }))
        await page.screenshot({ path: file, fullPage: false })
        log.push(`${name}-${mode}-${vname}  http ${r?.status()}  got mode=${got.mode} theme=${got.theme} bodyBg=${got.bodyBg}`)
      } catch (e) {
        log.push(`${name}-${mode}-${vname}  FAILED  ${e.message.split('\n')[0]}`)
      }
    }
    await ctx.close()
  }
}
await browser.close()
fs.writeFileSync(`${OUT}/shots.log`, log.join('\n') + '\n')
console.log(log.join('\n'))
