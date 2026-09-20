import { launch, shot, save, SHOP } from './lib.mjs';
const EMAIL = 'ivanprotsko+q03@ivanprotsko.com';
const { browser, page, errors } = await launch({ storage: false });
const out = { email: EMAIL };
const txt = async () => (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, '\n');
const fill = async (n, v) => { const l = page.locator(`input[name="${n}"]`).first(); if (await l.count()) await l.fill(v); };

await page.goto(SHOP + '/ru/products/gepachisty-cherkashino', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(6000);
await page.locator('button:has-text("В корзину")').first().click({ timeout: 30000 });
await page.waitForTimeout(6000);
await page.goto(SHOP + '/ru/checkout?step=address', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(9000);

await page.locator('text=Контакты').first().click({ timeout: 20000 });
await page.waitForTimeout(3000);
await fill('first_name', 'Иван'); await fill('last_name', 'Тестовый');
await fill('email', EMAIL); await fill('phone', '+79001234567');
await page.locator('button:has-text("Сохранить")').first().click({ timeout: 20000 });
await page.waitForTimeout(6000);

await page.locator('text=Адрес доставки').first().click({ timeout: 20000 });
await page.waitForTimeout(3000);
await fill('address_1', 'ул. Ленина, д. 1, кв. 2');
await fill('postal_code', '630099'); await fill('city', 'Новосибирск');
const sels = page.locator('select:visible');
const nsel = await sels.count();
for (let i = 0; i < nsel; i++) {
  const opts = await sels.nth(i).locator('option').allTextContents();
  if (opts.some(o => /Новосибирск/i.test(o))) { await sels.nth(i).selectOption({ label: opts.find(o => /Новосибирск/i.test(o)) }); out.provinceSet = opts.find(o => /Новосибирск/i.test(o)); }
}
await shot(page, 's04-address-filled');
await page.locator('button:has-text("Сохранить")').first().click({ timeout: 20000 });
await page.waitForTimeout(7000);
// выбрать курьера
const courier = page.locator('text=Курьером').first();
if (await courier.count()) { await courier.click({ timeout: 15000 }).catch(() => {}); await page.waitForTimeout(5000); }
out.afterAddress = (await txt()).slice(0, 2200);
console.log('=== AFTER ADDRESS ===\n' + out.afterAddress);
await shot(page, 's04-checkout-ready');
save('s04.json', { out, errors: errors.slice(0, 10) });
await page.context().storageState({ path: '/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/q03-gap-recheck/.buyer-state.json' });
await browser.close();
