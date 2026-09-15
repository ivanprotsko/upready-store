import { launch, timedGoto, PANEL, shot } from './lib.mjs';
const { browser, page, errors } = await launch();
const n = await timedGoto(page, PANEL + '/promotions/promo_01M2H6ARB8HDX7HYEJJJQTHT38'); await page.waitForTimeout(7000);
const t = (await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
console.log('url', page.url());
console.log(t.slice(t.indexOf('Акции')+6, t.indexOf('Акции')+700));
console.log('errors', JSON.stringify(errors.slice(0,4)));
await shot(page,'s99-promo-after-delete');
await browser.close();
