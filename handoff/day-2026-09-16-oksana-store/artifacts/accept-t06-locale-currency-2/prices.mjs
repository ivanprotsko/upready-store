import { chromium } from 'playwright'
const dir = '/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/accept-t06-locale-currency-2'
const b = await chromium.launch()
for (const [name, url] of [['acme','http://acme.localhost:8161/ru/store'],['globex','http://globex.localhost:8161/en/store']]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1200 } })
  const p = await ctx.newPage()
  const res = await p.goto(url, { waitUntil: 'networkidle', timeout: 90000 })
  await p.waitForTimeout(2500)
  const body = await p.locator('body').innerText().catch(()=>'')
  const prices = [...new Set((body.match(/[₽$€£]\s?[\d  .,]+|[\d  .,]+\s?[₽$€£]/g)||[]).map(s=>s.trim()))].slice(0,10)
  console.log(`=== ${name} status=${res.status()} url=${p.url()}`)
  console.log(`    prices on catalog: ${prices.join(' | ') || '(none found)'}`)
  await p.screenshot({ path: `${dir}/${name}-catalog.png`, fullPage: false })
  await ctx.close()
}
await b.close()
