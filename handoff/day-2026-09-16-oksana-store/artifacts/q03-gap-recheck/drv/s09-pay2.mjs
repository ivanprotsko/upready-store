import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/Users/ivanprotsko/upready/projects/upready-store/node_modules/playwright/index.mjs';
const ROOT = '/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/q03-gap-recheck';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU', storageState: path.join(ROOT, '.buyer2.json') });
const page = await ctx.newPage();
const errors = []; page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const shot = n => page.screenshot({ path: path.join(ROOT, 'shots', n + '-1280x900.png') });
const txt = async () => (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, '\n');
const out = {};
await page.goto('https://cherkashino.shipshift.dev/ru/checkout?step=payment', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(12000);
await page.locator('button:has-text("Оплата вручную")').first().click({ timeout: 20000 });
await page.waitForTimeout(6000);
out.afterPayClick = (await txt()).slice(0, 1400);
console.log('TESTIDS', JSON.stringify(await page.$$eval('[data-testid]', els => els.map(e => e.getAttribute('data-testid')))));
console.log('BUTTONS', JSON.stringify(await page.$$eval('button', els => els.map(e => ({ t: (e.innerText || '').trim().slice(0, 40), d: e.disabled })).filter(x => x.t))));
await shot('s09-payment-open');
// заполнить демо-карту
for (const [tid, v] of [['demo-card-number-input', '4242424242424242'], ['demo-card-expiry-input', '12/30'], ['demo-card-cvc-input', '123']]) {
  const l = page.locator(`[data-testid="${tid}"]`).first();
  if (await l.count()) { await l.fill(v); await l.press('Tab'); out['f_' + tid] = true; }
}
await page.waitForTimeout(5000);
await shot('s09-card-filled');
const submit = page.locator('button:has-text("Оплатить")').first();
out.submitCount = await submit.count();
out.submitDisabled = out.submitCount ? await submit.isDisabled() : null;
out.submitText = out.submitCount ? (await submit.innerText()).trim() : null;
console.log('SUBMIT', JSON.stringify({ c: out.submitCount, d: out.submitDisabled, t: out.submitText }));
if (out.submitCount && !out.submitDisabled) {
  const t0 = Date.now();
  await submit.click();
  await page.waitForURL(u => /\/order\//.test(String(u)), { timeout: 150000 }).catch(e => out.waitErr = String(e).slice(0, 120));
  await page.waitForTimeout(10000);
  out.orderMs = Date.now() - t0;
  out.orderUrl = page.url();
  out.brandAfterPay = await page.evaluate(() => ({ mode: document.documentElement.getAttribute('data-mode'), theme: document.documentElement.getAttribute('data-theme'), title: document.title }));
  out.thankYou = (await txt()).slice(0, 1600);
  await shot('s09-thankyou-after-pay');
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(10000);
  out.brandReloaded = await page.evaluate(() => ({ mode: document.documentElement.getAttribute('data-mode'), theme: document.documentElement.getAttribute('data-theme'), title: document.title }));
  out.thankYouReloaded = (await txt()).slice(0, 1200);
  await shot('s09-thankyou-reloaded');
}
out.errors = errors.slice(0, 12);
fs.writeFileSync(path.join(ROOT, 'raw', 's09-order.json'), JSON.stringify(out, null, 1));
console.log('ORDER_URL', out.orderUrl || '(none)');
console.log('BRAND_AFTER_PAY', JSON.stringify(out.brandAfterPay), '| RELOADED', JSON.stringify(out.brandReloaded));
console.log('THANKYOU\n' + (out.thankYou || out.afterPayClick || '').slice(0, 1000));
await browser.close();
