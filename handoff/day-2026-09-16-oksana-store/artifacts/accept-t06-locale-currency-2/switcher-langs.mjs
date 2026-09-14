import { chromium } from 'playwright'
const dir = '/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/accept-t06-locale-currency-2'
const b = await chromium.launch()
for (const [name, url] of [['acme','http://acme.localhost:8161/ru'],['globex','http://globex.localhost:8161/en'],['no-tenant','http://localhost:8161/en']]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  const res = await p.goto(url, { waitUntil: 'networkidle', timeout: 90000 })
  await p.locator('[data-testid="nav-region-select-button"]').first().click({ timeout: 15000 })
  await p.waitForTimeout(1500)
  const ids = await p.locator('[id^="region-language-"]').evaluateAll(els => els.map(e => e.id.replace('region-language-','')))
  const labels = await p.locator('[id^="region-language-"]').evaluateAll(els => els.map(e => (e.closest('label')||e.parentElement)?.innerText?.trim().replace(/\n/g,'/') || ''))
  const trigger = await p.locator('[data-testid="nav-country-select-button"]').first().innerText().catch(()=>'?')
  const langTrigger = await p.locator('[data-testid="nav-region-select-button"]').first().innerText().catch(()=>'?')
  console.log(`=== ${name} status=${res.status()} url=${p.url()}`)
  console.log(`    lang trigger="${langTrigger.replace(/\n/g,' ')}"  country/currency trigger="${trigger.replace(/\n/g,' ')}"`)
  console.log(`    switcher language options (${ids.length}): ${ids.join(', ')}`)
  console.log(`    labels: ${labels.join(' | ')}`)
  await p.screenshot({ path: `${dir}/${name}-switcher-open.png`, fullPage: false })
  await ctx.close()
}
await b.close()
