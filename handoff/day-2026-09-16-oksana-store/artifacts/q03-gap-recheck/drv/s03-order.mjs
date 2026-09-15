import { launch, shot, save, SHOP } from './lib.mjs';
const EMAIL = 'ivanprotsko+q03@ivanprotsko.com';
const { browser, page, errors } = await launch({ storage: false });
const out = { email: EMAIL };
const txt = async () => (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, '\n');

await page.goto(SHOP + '/ru/products/gepachisty-cherkashino', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(6000);
await page.locator('button:has-text("В корзину")').first().click({ timeout: 30000 });
await page.waitForTimeout(6000);
await page.goto(SHOP + '/ru/checkout?step=address', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(9000);

// --- Контакты
await page.locator('text=Контакты').first().click({ timeout: 20000 });
await page.waitForTimeout(3000);
const ins = await page.$$eval('input:visible', els => els.map(e => ({ n: e.name, p: e.placeholder, id: e.id })));
console.log('CONTACT_INPUTS', JSON.stringify(ins));
const fill = async (names, value) => {
  for (const n of names) {
    const l = page.locator(`input[name="${n}"]`).first();
    if (await l.count() && await l.isVisible().catch(() => false)) { await l.fill(value); return n; }
  }
  return null;
};
out.c1 = await fill(['first_name', 'shipping_address.first_name'], 'Иван');
out.c2 = await fill(['last_name', 'shipping_address.last_name'], 'Тестовый');
out.c3 = await fill(['email'], EMAIL);
out.c4 = await fill(['phone', 'shipping_address.phone'], '+79001234567');
await shot(page, 's03-contacts-filled');
await page.locator('button:has-text("Сохранить")').first().click({ timeout: 20000 });
await page.waitForTimeout(6000);

// --- Адрес доставки
await page.locator('text=Адрес доставки').first().click({ timeout: 20000 });
await page.waitForTimeout(3000);
const ains = await page.$$eval('input:visible', els => els.map(e => ({ n: e.name, p: e.placeholder })));
console.log('ADDR_INPUTS', JSON.stringify(ains));
console.log('ADDR_TEXT', (await txt()).slice(-1200));
await shot(page, 's03-address-sheet');
save('s03-partial.json', { out, errors: errors.slice(0, 10) });
await browser.close();
