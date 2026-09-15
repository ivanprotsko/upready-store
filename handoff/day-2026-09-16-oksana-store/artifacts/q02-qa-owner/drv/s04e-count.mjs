import { launch, timedGoto, PANEL, SHOP } from './lib.mjs';
const { browser, page } = await launch();
await timedGoto(page, PANEL + '/products/prod_01M2GRC5XMX78M72NZSXTM8B6X/media');
await page.waitForTimeout(7000);
const all = await page.$$eval('img', els=>[...new Set(els.map(e=>e.src))]);
console.log('PANEL distinct imgs:', all.length);
all.forEach(u=>console.log('  ', u.replace(/^.*tenants\//,'')));
await browser.close();
