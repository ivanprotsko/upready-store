import { chromium } from 'playwright'
const dir = '/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/accept-t06-locale-currency-2'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } })
const p = await ctx.newPage()
p.on('console', m => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 200)) })
await p.goto('http://localhost:5281/login', { waitUntil: 'networkidle', timeout: 90000 })
await p.screenshot({ path: `${dir}/panel-01-login.png` })
// login as acme admin
await p.fill('input[name="email"], input[type="email"]', 'admin@acme.test')
await p.fill('input[name="password"], input[type="password"]', 'supersecret')
await p.click('button[type="submit"]')
await p.waitForTimeout(4000)
console.log('after login url=', p.url())
await p.goto('http://localhost:5281/settings/locale', { waitUntil: 'networkidle', timeout: 90000 })
await p.waitForTimeout(2500)
await p.screenshot({ path: `${dir}/panel-02-locale-loaded.png`, fullPage: true })
const body = await p.locator('body').innerText().catch(() => '')
console.log('--- screen text (first 900 chars):\n' + body.slice(0, 900))
// what the default-locale select offers
const sel = p.locator('[data-testid="default-locale"]')
if (await sel.count()) {
  console.log('default-locale trigger text:', (await sel.innerText()).replace(/\n/g, ' '))
  await sel.click(); await p.waitForTimeout(800)
  const opts = await p.locator('[role="option"]').allInnerTexts().catch(() => [])
  console.log('default-locale options:', JSON.stringify(opts))
  await p.screenshot({ path: `${dir}/panel-03-default-locale-open.png` })
  await p.keyboard.press('Escape')
}
await b.close()
