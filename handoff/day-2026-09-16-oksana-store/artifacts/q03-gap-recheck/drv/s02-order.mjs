import { launch, shot, save, SHOP } from './lib.mjs';
const EMAIL = 'ivanprotsko+q03@ivanprotsko.com';
const { browser, page, errors } = await launch({ storage: false });
const out = {};
const dump = async (tag) => {
  const t = (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, '\n');
  console.log('--- ' + tag + ' ---\n' + t.slice(0, 1500));
};
await page.goto(SHOP + '/ru/products/gepachisty-cherkashino', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(6000);
await page.locator('button:has-text("В корзину")').first().click({ timeout: 30000 });
await page.waitForTimeout(6000);
await page.goto(SHOP + '/ru/checkout?step=address', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(9000);

// 1. Контакты
await page.locator('text=Контакты').first().click({ timeout: 20000 });
await page.waitForTimeout(3000);
console.log('CONTACT INPUTS', JSON.stringify(await page.$$eval('input', els => els.map(e => ({ n: e.name, p: e.placeholder, t: e.type })))));
await shot(page, 's02-sheet-contacts');
await dump('contacts-sheet');
save('s02-partial.json', { errors: errors.slice(0, 10) });
await browser.close();
