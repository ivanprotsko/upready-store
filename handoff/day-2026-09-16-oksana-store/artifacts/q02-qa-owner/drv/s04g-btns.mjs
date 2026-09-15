import { launch, timedGoto, PANEL } from './lib.mjs';
const { browser, page } = await launch();
await timedGoto(page, PANEL + '/products/prod_01M2GRC5XMX78M72NZSXTM8B6X/media');
await page.waitForTimeout(7000);
const b = await page.$$eval('button,a', e=>e.map(x=>({t:(x.innerText||'').trim().slice(0,40), al:x.getAttribute('aria-label'), title:x.getAttribute('title')})).filter(x=>x.t||x.al||x.title));
console.log(JSON.stringify(b,null,0));
await browser.close();
