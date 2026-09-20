import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/Users/ivanprotsko/upready/projects/upready-store/node_modules/playwright/index.mjs';
const ROOT = '/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/q03-gap-recheck';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU', storageState: path.join(ROOT, '.owner-state.json') });
const page = await ctx.newPage();
const out = {};
for (const [name, url] of [['settings-locale', '/settings/locale'], ['shipping-create', '/shipping/create'], ['order-card', '/orders']]) {
  await page.goto('https://panel-store.upready.dev' + url, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(9000);
  if (name === 'order-card') {
    const row = page.locator('tr:has-text("#10"), a:has-text("#10")').first();
    if (await row.count()) { await row.click({ timeout: 20000 }).catch(() => {}); await page.waitForTimeout(10000); }
  }
  const t = (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, '\n');
  out[name] = { url: page.url(), text: t.slice(0, 2000) };
  await page.screenshot({ path: path.join(ROOT, 'shots', 'p03-' + name + '-1280x900.png') });
  console.log('=== ' + name + ' ' + page.url() + '\n' + t.replace(/\n/g, ' | ').slice(0, 1300) + '\n');
}
fs.writeFileSync(path.join(ROOT, 'raw', 'p03-extra.json'), JSON.stringify(out, null, 1));
await browser.close();
