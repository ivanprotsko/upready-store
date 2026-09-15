import { launch, shot, timedGoto, save, SHOP } from './lib.mjs';
const { browser, page, errors } = await launch({storage:false});
const log=[];
const dump = async (tag) => { const t=(await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n'); log.push(tag+': '+t.slice(0,60).replace(/\n/g,' ')); return t; };
await timedGoto(page, SHOP + '/ru/products/svechi-asd-s-chesnokom-10-sht-cherkashino', {waitUntil:'load'}); await page.waitForTimeout(5000);
await page.locator('button:has-text("В корзину")').first().click(); await page.waitForTimeout(6000);
await timedGoto(page, SHOP + '/ru/cart', {waitUntil:'load'}); await page.waitForTimeout(6000);
await page.locator('a:has-text("Оформить заказ")').first().click(); await page.waitForTimeout(9000);
// 1) shipping
const rr = await page.$$('input[type=radio]');
if (rr.length) { await rr[0].click({force:true}); await page.waitForTimeout(4000); }
log.push('shipping radios '+rr.length);
// 2) address
await page.locator('button:has-text("Адрес доставки")').first().click(); await page.waitForTimeout(2500);
await page.fill('input[name=address_1]', 'ул. Ленина, д. 1, кв. 3');
let btns = await page.$$eval('[role=dialog] button, [data-state=open] button', e=>[...new Set(e.map(x=>(x.innerText||'').trim()))].filter(Boolean));
log.push('addr sheet btns '+JSON.stringify(btns));
for (const nm of ['Сохранить','Готово','Продолжить','Применить']) { const b=page.locator(`button:has-text("${nm}")`); if (await b.count()) { await b.last().click().catch(()=>{}); break; } }
await page.waitForTimeout(4000);
// 3) contacts
await page.locator('button:has-text("Контакты")').first().click(); await page.waitForTimeout(2500);
for (const [n,v] of [['first_name','Тест'],['last_name','Приёмка'],['email','ivanprotsko+qaowner@ivanprotsko.com'],['phone','+79991234567']]) {
  const f=page.locator(`input[name=${n}]`); if (await f.count()) await f.first().fill(v);
}
btns = await page.$$eval('[data-state=open] button, [role=dialog] button', e=>[...new Set(e.map(x=>(x.innerText||'').trim()))].filter(Boolean));
log.push('contacts sheet btns '+JSON.stringify(btns));
for (const nm of ['Сохранить','Готово','Продолжить']) { const b=page.locator(`button:has-text("${nm}")`); if (await b.count()) { await b.last().click().catch(()=>{}); break; } }
await page.waitForTimeout(4500);
await dump('after contacts');
// 4) payment
const pm = page.locator('button:has-text("Выберите способ оплаты")');
if (await pm.count()) { await pm.first().click(); await page.waitForTimeout(3000); }
const pmBtns = await page.$$eval('button', e=>[...new Set(e.map(x=>(x.innerText||'').trim()))].filter(Boolean));
log.push('after payment open btns '+JSON.stringify(pmBtns));
await shot(page,'s10-pay-state');
const manual = page.locator('button:has-text("Оплата вручную")');
if (await manual.count()) { await manual.first().click().catch(()=>{}); await page.waitForTimeout(3500); }
const payBtn = page.locator('[data-testid=submit-order-button]');
log.push('payBtn count '+await payBtn.count()+' disabled='+await payBtn.first().isDisabled().catch(()=>'?'));
if (await payBtn.count() && !(await payBtn.first().isDisabled())) {
  const t0=Date.now(); await payBtn.first().click(); await page.waitForTimeout(15000);
  log.push('payMs '+(Date.now()-t0)+' url '+page.url());
  await shot(page,'s10-thankyou');
  const t=(await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n'); log.push('THANKYOU:\n'+t.slice(0,600));
}
console.log(log.join('\n'));
save('s10-pay2.json',{log,url:page.url(),errors});
await browser.close();
