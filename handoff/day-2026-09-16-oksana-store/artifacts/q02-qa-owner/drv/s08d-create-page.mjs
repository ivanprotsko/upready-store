import { launch, shot, timedGoto, save, PANEL, SHOP } from './lib.mjs';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/pages'); await page.waitForTimeout(6000);
const ins = await page.$$('input[type=text]');
// find by placeholder
const key = page.locator('input[placeholder="delivery"]'); const title = page.locator('input[placeholder="Доставка"]');
await key.fill('qa-test-q02'); await title.fill('Тестовая страница QA');
const t0=Date.now();
await page.locator('button:has-text("Новая страница")').click();
await page.waitForTimeout(6000);
console.log('createMs', Date.now()-t0, 'url', page.url());
await shot(page,'s08-page-created');
const txt=(await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
console.log(txt.slice(txt.indexOf('Страница\t')||0).slice(0,2500));
save('s08-created.json',{url:page.url(),txt:txt.slice(0,4000),errors});
console.log('errors',JSON.stringify(errors.slice(0,3)));
await browser.close();
