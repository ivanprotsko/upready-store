import { chromium } from 'playwright'
const dir = '/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/accept-t06-locale-currency-2'
const b = await chromium.launch()
const cases = [
  ['acme', 'http://acme.localhost:8161/ru', 'ru'],
  ['globex', 'http://globex.localhost:8161/en', 'en'],
]
for (const [name, url] of cases) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  const res = await p.goto(url, { waitUntil: 'networkidle', timeout: 90000 })
  await p.screenshot({ path: `${dir}/${name}-home.png`, fullPage: false })
  // open the region/language switcher
  let opened = false, langs = '(not opened)'
  try {
    await p.locator('[data-testid="nav-region-select-button"]').first().click({ timeout: 15000 })
    await p.waitForTimeout(1200)
    opened = true
    await p.screenshot({ path: `${dir}/${name}-switcher-open.png`, fullPage: false })
    const dlg = p.locator('[role="dialog"]').first()
    langs = await dlg.innerText().catch(() => '(no dialog text)')
  } catch (e) {
    langs = 'ERR ' + e.message.split('\n')[0]
  }
  const body = await p.locator('body').innerText().catch(() => '')
  console.log(`=== ${name} status=${res.status()} url=${p.url()} switcherOpened=${opened}`)
  console.log(`--- switcher dialog text:\n${langs}`)
  console.log(`--- price-looking lines: ${(body.match(/[₽$€]\s?[\d\s.,]+|[\d\s.,]+\s?[₽$€]/g) || []).slice(0, 8).join(' | ')}`)
  await ctx.close()
}
await b.close()
