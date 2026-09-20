import { launch, timedGoto, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const nav = await timedGoto(page, PANEL + '/products');
await page.waitForTimeout(6000);
const u = page.url();
const rows = await page.$$eval('tbody tr a[href*="/products/prod_"]', els => els.slice(0,40).map(e => ({href:e.getAttribute('href'), t:(e.innerText||'').trim().split('\n')[0]}))).catch(e=>String(e));
console.log(JSON.stringify({nav, url:u, loggedIn: !u.includes('/login'), rows, errors}, null, 1));
await browser.close();
