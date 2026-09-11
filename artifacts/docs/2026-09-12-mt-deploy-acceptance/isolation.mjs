// Acceptor wave 2: does an EMPTY tenant show another tenant's collections/products?
import { chromium } from 'playwright';
const host = process.argv[2];
const shots = process.env.SHOTS || '.';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
const page = await ctx.newPage();
const out = { host };
await page.goto(`https://${host}.shipshift.dev/`, { waitUntil: 'networkidle', timeout: 60000 });
out.url = page.url();
out.footerLinks = await page.evaluate(() =>
  [...document.querySelectorAll('footer a')].map(a => `${(a.innerText||'').replace(/\s+/g,' ').trim()} -> ${a.getAttribute('href')}`).filter(s => !s.startsWith(' ->')));
// follow the hero CTA
const cta = page.locator('a', { hasText: /^В каталог$|^Shop$/ }).first();
if (await cta.count()) {
  await cta.click();
  await page.waitForLoadState('networkidle');
  out.catalogUrl = page.url();
  out.catalogText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, 400);
  out.catalogCards = await page.locator('[data-testid="home-product-card"], [data-testid="product-wrapper"], li a[href*="/products/"]').count();
  await page.screenshot({ path: `${shots}/${host}-catalog.png` });
}
// first collection link from the footer, if any
const col = (out.footerLinks || []).map(s => s.split(' -> ')[1]).find(h => h && h.includes('/collections/'));
if (col) {
  await page.goto(new URL(col, page.url()).href, { waitUntil: 'networkidle' });
  out.collectionUrl = page.url();
  out.collectionText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, 400);
  out.collectionProductLinks = await page.locator('a[href*="/products/"]').count();
  await page.screenshot({ path: `${shots}/${host}-collection.png` });
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
