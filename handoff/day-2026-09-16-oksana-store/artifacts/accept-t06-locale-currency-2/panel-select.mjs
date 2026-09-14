import { chromium } from 'playwright'
const dir = '/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/accept-t06-locale-currency-2'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } })
const p = await ctx.newPage()
await p.goto('http://localhost:5281/login', { waitUntil: 'networkidle', timeout: 90000 })
await p.fill('input[type="email"]', 'admin@acme.test')
await p.fill('input[type="password"]', 'supersecret')
await p.click('button[type="submit"]')
await p.waitForTimeout(4000)
await p.goto('http://localhost:5281/settings/locale', { waitUntil: 'networkidle', timeout: 90000 })
await p.waitForTimeout(2500)
const sel = p.locator('[data-testid="default-locale"]')
const ariaControls = await sel.getAttribute('aria-controls')
await sel.click(); await p.waitForTimeout(900)
const scoped = ariaControls
  ? await p.locator(`#${ariaControls} [role="option"]`).allInnerTexts().catch(() => [])
  : []
console.log('aria-controls =', ariaControls)
console.log('default-locale Select options (scoped):', JSON.stringify(scoped))
await p.screenshot({ path: `${dir}/panel-03-default-locale-open.png` })
await b.close()
