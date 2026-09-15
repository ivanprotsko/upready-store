import { launch, shot, timedGoto, save, SHOP } from './lib.mjs';
const { browser, page, errors } = await launch({storage:false});
await timedGoto(page, SHOP + '/ru/products/svechi-asd-s-chesnokom-10-sht-cherkashino', {waitUntil:'load'});
await page.waitForTimeout(5000);
await page.locator('button:has-text("В корзину")').first().click(); await page.waitForTimeout(6000);
await timedGoto(page, SHOP + '/ru/cart', {waitUntil:'load'}); await page.waitForTimeout(6000);
await page.locator('a:has-text("Оформить заказ"), button:has-text("Оформить заказ")').first().click();
await page.waitForTimeout(9000);
// delivery method
await page.locator('text=Оксана Черкашина pickup').first().click().catch(e=>console.log('pickup click',String(e).slice(0,60)));
await page.waitForTimeout(3000);
// address sheet
await page.locator('button:has-text("Адрес доставки")').first().click(); await page.waitForTimeout(3000);
await shot(page,'s10-address-sheet');
const ins = await page.$$eval('input,select,textarea', e=>e.map(x=>({n:x.name,ph:x.placeholder,t:x.type})));
console.log('ADDR INPUTS', JSON.stringify(ins));
const txt=(await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
console.log(txt.slice(0,1200));
save('s10-addr.json',{ins,errors});
await browser.close();
