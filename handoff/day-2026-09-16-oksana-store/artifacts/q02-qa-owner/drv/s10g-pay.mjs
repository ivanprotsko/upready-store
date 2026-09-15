import { launch, shot, timedGoto, save, SHOP } from './lib.mjs';
const { browser, page, errors } = await launch({storage:false});
const log=[];
await timedGoto(page, SHOP + '/ru/products/svechi-asd-s-chesnokom-10-sht-cherkashino', {waitUntil:'load'});
await page.waitForTimeout(5000);
await page.locator('button:has-text("В корзину")').first().click(); await page.waitForTimeout(6000);
await timedGoto(page, SHOP + '/ru/cart', {waitUntil:'load'}); await page.waitForTimeout(6000);
await page.locator('a:has-text("Оформить заказ")').first().click(); await page.waitForTimeout(9000);
const radios = await page.$$('input[type=radio], [role=radio]');
if (radios.length) { await radios[0].click({force:true}).catch(()=>{}); await page.waitForTimeout(4000); }
await page.locator('button:has-text("Адрес доставки")').first().click(); await page.waitForTimeout(2500);
await page.fill('input[name=address_1]', 'ул. Ленина, д. 1, кв. 3');
let sb = page.locator('[role=dialog] button, button:has-text("Сохранить")');
await page.locator('button:has-text("Сохранить")').last().click().catch(()=>{}); await page.waitForTimeout(3500);
await page.locator('button:has-text("Контакты")').first().click().catch(()=>{}); await page.waitForTimeout(2500);
for (const [n,v] of [['first_name','Тест'],['last_name','Приёмка'],['email','ivanprotsko+qaowner@ivanprotsko.com'],['phone','+79991234567']]) {
  const f = page.locator(`input[name=${n}]`); if (await f.count()) await f.first().fill(v).catch(()=>{});
}
await page.locator('button:has-text("Сохранить")').last().click().catch(()=>{}); await page.waitForTimeout(4000);
// payment
await page.locator('button:has-text("Выберите способ оплаты"), button:has-text("Оплата вручную")').first().click().catch(e=>log.push('pay open '+String(e).slice(0,60)));
await page.waitForTimeout(4000);
await shot(page,'s10-payment-sheet');
const t1=(await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
log.push('PAYSHEET:\n'+t1.slice(0,1200));
const btns = await page.$$eval('button', e=>[...new Set(e.map(x=>(x.innerText||'').trim()))].filter(Boolean));
log.push('BTNS '+JSON.stringify(btns));
// try to pay
const pay = page.locator('button:has-text("Оплатить")').first();
if (await pay.count()) { const t0=Date.now(); await pay.click(); await page.waitForTimeout(12000); log.push('payMs '+(Date.now()-t0)+' url '+page.url()); }
await shot(page,'s10-after-pay');
const t2=(await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
log.push('AFTER:\n'+t2.slice(0,900));
console.log(log.join('\n'));
save('s10-pay.json',{log,url:page.url(),errors});
await browser.close();
