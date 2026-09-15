import { launch, timedGoto, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/promotions'); await page.waitForTimeout(9000);
const t = (await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
const i = t.indexOf('Акции', 40);
console.log(t.slice(i, i+500));
console.log('errors', JSON.stringify(errors.slice(0,4)));
await browser.close();
