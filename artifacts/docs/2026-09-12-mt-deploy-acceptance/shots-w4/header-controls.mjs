// Acceptor: which header controls each tenant storefront actually renders.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const rows = [];
for (const host of process.argv.slice(2)) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(`https://${host}.shipshift.dev/ru`, { waitUntil: 'networkidle', timeout: 60000 });
  rows.push({ host, ...await page.evaluate(() => {
    const vis = sel => [...document.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const t = s => vis(`[data-testid="${s}"]`).length;
    const header = document.querySelector('header') || document.querySelector('nav');
    const ids = [...new Set([...(header?.querySelectorAll('[data-testid]') || [])].map(e => e.getAttribute('data-testid')))];
    return {
      headerTestids: ids,
      langControl: t('nav-locale-select-button') + t('nav-language-select-button'),
      countryControl: t('nav-country-select-button'),
      headerText: (header?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      priceSample: [...document.querySelectorAll('[data-testid="home-product-card"]')].slice(0, 2).map(e => (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60)),
    };
  }) });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(rows, null, 1));
