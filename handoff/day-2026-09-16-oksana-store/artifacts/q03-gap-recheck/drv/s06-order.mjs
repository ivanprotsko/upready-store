import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/Users/ivanprotsko/upready/projects/upready-store/node_modules/playwright/index.mjs';
const ROOT = '/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/q03-gap-recheck';
const SHOP = 'https://cherkashino.shipshift.dev';
const EMAIL = 'ivanprotsko+q03@ivanprotsko.com';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
const page = await ctx.newPage();
const errors = []; page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const shot = n => page.screenshot({ path: path.join(ROOT, 'shots', n + '-1280x900.png') });
const txt = async () => (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, '\n');
const fill = async (n, v) => { const l = page.locator(`input[name="${n}"]`).first(); if (await l.count()) await l.fill(v); };
const out = { email: EMAIL, startedAt: new Date().toISOString() };

await page.goto(SHOP + '/ru/products/gepachisty-cherkashino', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(6000);
await page.locator('button:has-text("В корзину")').first().click({ timeout: 30000 });
await page.waitForTimeout(6000);
await page.goto(SHOP + '/ru/checkout?step=address', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(9000);

await page.locator('button:has-text("Контакты")').first().click({ timeout: 20000 });
await page.waitForTimeout(3000);
await fill('first_name', 'Иван'); await fill('last_name', 'Тестовый');
await fill('email', EMAIL); await fill('phone', '+79001234567');
await page.locator('button:has-text("Сохранить")').first().click({ timeout: 20000 });
await page.waitForTimeout(6000);

await page.locator('button:has-text("Адрес доставки")').first().click({ timeout: 20000 });
await page.waitForTimeout(3000);
await fill('address_1', 'ул. Ленина, д. 1, кв. 2');
await fill('postal_code', '630099'); await fill('city', 'Новосибирск');
const sels = page.locator('select:visible');
for (let i = 0, n = await sels.count(); i < n; i++) {
  const opts = await sels.nth(i).locator('option').allTextContents();
  const m = opts.find(o => /Новосибирск/i.test(o));
  if (m) { await sels.nth(i).selectOption({ label: m }); out.province = m; }
}
await shot('s06-address-filled');
await page.locator('button:has-text("Сохранить")').first().click({ timeout: 20000 });
await page.waitForTimeout(8000);

// доставка: клик по [role=radio] force
const radios = page.locator('[role=radio]');
out.radioCount = await radios.count();
out.radioLabels = await radios.evaluateAll(els => els.map(e => (e.closest('label')?.innerText || e.parentElement?.innerText || '').trim().slice(0, 50)));
await radios.first().click({ force: true });
await page.waitForTimeout(8000);
out.afterShipping = (await txt()).slice(0, 1600);
await shot('s06-shipping-selected');

// оплата
const payRadios = page.locator('[role=radio]');
out.payRadioLabels = await payRadios.evaluateAll(els => els.map(e => (e.closest('label')?.innerText || e.parentElement?.innerText || '').trim().slice(0, 50)));
for (let i = 0, n = await payRadios.count(); i < n; i++) {
  const t = (await payRadios.nth(i).evaluate(e => (e.closest('label')?.innerText || e.parentElement?.innerText || ''))).trim();
  if (/Оплата вручную|вручную/i.test(t)) { await payRadios.nth(i).click({ force: true }); out.paySelected = t.slice(0, 40); }
}
await page.waitForTimeout(6000);
// демо-карта
for (const [tid, v] of [['demo-card-number-input', '4242424242424242'], ['demo-card-expiry-input', '12/30'], ['demo-card-cvc-input', '123']]) {
  const l = page.locator(`[data-testid="${tid}"]`).first();
  if (await l.count()) { await l.fill(v); await l.press('Tab'); out['f_' + tid] = true; }
}
await page.waitForTimeout(4000);
await shot('s06-payment-filled');
const submit = page.locator('[data-testid=submit-order-button]').first();
out.submitExists = await submit.count() > 0;
out.submitDisabled = out.submitExists ? await submit.isDisabled() : null;
out.submitText = out.submitExists ? (await submit.innerText()).trim() : null;
console.log('PRE_SUBMIT', JSON.stringify({ radioCount: out.radioCount, radioLabels: out.radioLabels, paySelected: out.paySelected, submitDisabled: out.submitDisabled, submitText: out.submitText }));
if (out.submitExists && !out.submitDisabled) {
  const t0 = Date.now();
  await submit.click();
  await page.waitForURL(u => /\/order\//.test(String(u)), { timeout: 120000 }).catch(e => out.waitErr = String(e).slice(0, 150));
  await page.waitForTimeout(9000);
  out.orderMs = Date.now() - t0;
  out.orderUrl = page.url();
  out.thankYouText = (await txt()).slice(0, 1800);
  out.brand = await page.evaluate(() => ({ mode: document.documentElement.getAttribute('data-mode'), theme: document.documentElement.getAttribute('data-theme'), title: document.title }));
  await shot('s06-thankyou-after-pay');
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(9000);
  out.thankYouReloaded = (await txt()).slice(0, 1200);
  out.brandReloaded = await page.evaluate(() => ({ mode: document.documentElement.getAttribute('data-mode'), theme: document.documentElement.getAttribute('data-theme'), title: document.title }));
  await shot('s06-thankyou-reloaded');
}
out.errors = errors.slice(0, 15);
fs.writeFileSync(path.join(ROOT, 'raw', 's06-order.json'), JSON.stringify(out, null, 1));
console.log('ORDER_URL', out.orderUrl || '(none)');
console.log('BRAND', JSON.stringify(out.brand), 'RELOADED', JSON.stringify(out.brandReloaded));
console.log('THANKYOU\n' + (out.thankYouText || '').slice(0, 1200));
await browser.close();
