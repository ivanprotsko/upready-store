import { launch, timedGoto, SHOP } from './lib.mjs';
const { browser, page } = await launch();
const nav = await timedGoto(page, SHOP+'/ru', {waitUntil:'load'}); await page.waitForTimeout(6000);
const b = await page.evaluate(()=>document.body.innerText);
console.log('status',nav.status,'hasTitle', b.includes('Проверка витрины — тест q02'), 'len', b.length);
console.log(b.replace(/\n{2,}/g,'\n').slice(0,300));
await browser.close();
