// Волна 7, добор: подвал/анкор атрибуции на магазине мастера (п.3) и цифра цены на acme (п.6).
// node w3-w7b.mjs <shotsDir> <tag>
import { chromium } from 'playwright';

const SHOTS = process.argv[2] || '.';
const TAG = process.argv[3] || 'a';
const MONEY = /(?:€|\$|₽|руб)\s?[\d][\d\s.,]*|[\d][\d\s.,]*\s?(?:€|\$|₽|руб)/g;

const browser = await chromium.launch();
const out = {};

const footerOf = async (page) => {
  const footer = page.locator('footer').first();
  const text = (await footer.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  const links = await footer.locator('a').evaluateAll((els) =>
    els.map((a) => ({ text: a.textContent.trim().slice(0, 60), href: a.getAttribute('href'), rel: a.getAttribute('rel'), target: a.getAttribute('target') })),
  ).catch(() => []);
  return { text: text.slice(0, 300), upready: links.filter((l) => (l.href || '').includes('upready.dev')) };
};

for (const [key, url] of [['master', 'http://w7master14.localhost:8044/ru'], ['acme', 'http://acme.localhost:8044/ru']]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  out[`footer_${key}`] = await footerOf(page);
  await page.screenshot({ path: `${SHOTS}/${key}-footer-${TAG}.png`, fullPage: true });
  await ctx.close();
}

for (const loc of ['ru', 'en']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: loc === 'ru' ? 'ru-RU' : 'en-US' });
  const page = await ctx.newPage();
  await page.goto(`http://acme.localhost:8044/${loc}/products/acme-shirt-live`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  const main = (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ');
  out[`product_${loc}`] = {
    money: [...new Set(main.match(MONEY) || [])].slice(0, 8),
    head: main.slice(0, 240),
    badge: await page.locator('[data-testid="nav-region-select-button"], [data-testid="nav-country-select-button"]').first().innerText().catch(() => null),
  };
  await page.screenshot({ path: `${SHOTS}/acme-product-${loc}-${TAG}.png` });
  // каталог: цены в сетке
  await page.goto(`http://acme.localhost:8044/${loc}/store`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  const grid = (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ');
  out[`store_${loc}`] = { money: [...new Set(grid.match(MONEY) || [])].slice(0, 8) };
  await ctx.close();
}

console.log(JSON.stringify(out, null, 2));
await browser.close();
