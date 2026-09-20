import { launch, shot, timedGoto, save, PANEL, SHOP } from './lib.mjs';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/products/prod_01M2GRC5XMX78M72NZSXTM8B6X/variants/variant_01M2GRC6CJB0VZGW034SG084G0');
await page.waitForTimeout(6000);
const panelTxt = await page.evaluate(()=>document.body.innerText);
const prices = (panelTxt.match(/(RUB|USD)\n[^\n]+/g)||[]);
console.log('PANEL PRICES', JSON.stringify(prices));
// storefront
const t0=Date.now();
const nav = await timedGoto(page, SHOP + '/ru/products/svechi-asd-s-chesnokom-10-sht-cherkashino', {waitUntil:'load'});
await page.waitForTimeout(4000);
const sfTxt = await page.evaluate(()=>document.body.innerText);
const m = sfTxt.match(/[\d\s  ]{3,}[₽]|\d[\d  ]*,\d\d ?₽/g);
console.log('SF status', nav.status, 'ms', nav.ms, 'priceHits', JSON.stringify(m&&m.slice(0,6)));
console.log('SF head:', sfTxt.slice(0,700).replace(/\n{2,}/g,'\n'));
await shot(page, 's03-storefront-price');
save('s03-verify-price.json', {prices, nav, sfSnippet: sfTxt.slice(0,3000), errors});
await browser.close();
