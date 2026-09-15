import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/products/prod_01M2GRC5XMX78M72NZSXTM8B6X/variants/variant_01M2GRC6CJB0VZGW034SG084G0');
await page.waitForTimeout(6000);
for (let i=0;i<6;i++){ const b = await page.$('button:has-text("Показать больше")'); if(!b) break; await b.click(); await page.waitForTimeout(1500); }
const txt = await page.evaluate(()=>document.body.innerText);
const seg = txt.slice(txt.indexOf('Цены'));
console.log(seg.slice(0,1500));
await shot(page,'s03-all-prices');
save('s03-all-prices.json',{seg: seg.slice(0,3000), errors});
await browser.close();
