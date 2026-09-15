import { launch, timedGoto, save, PANEL } from './lib.mjs';
const NEW = process.argv[2];
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + `/products/prod_01M2GRC5XMX78M72NZSXTM8B6X/prices`);
await page.waitForTimeout(8000);
for (let i=0;i<200;i++){ const c = await page.$$eval('th,[role=columnheader]', e=>e.map(x=>(x.innerText||'').trim())); if (c.some(x=>/Цена RUB/i.test(x))) break; await page.keyboard.press('Tab'); }
await page.waitForTimeout(500);
await page.keyboard.press('Enter'); await page.waitForTimeout(400);
for (let i=0;i<10;i++) await page.keyboard.press('Backspace');
await page.keyboard.type(NEW); await page.waitForTimeout(400);
await page.keyboard.press('Enter');           // commit the cell
await page.waitForTimeout(800);
await page.click('button:has-text("Сохранить")');
await page.waitForTimeout(6000);
console.log('url', page.url());
save('s03-price-blur.json',{url:page.url(),errors});
await browser.close();
