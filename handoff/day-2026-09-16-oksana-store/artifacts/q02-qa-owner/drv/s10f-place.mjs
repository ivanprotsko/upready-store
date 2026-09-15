import { launch, shot, timedGoto, save, SHOP } from './lib.mjs';
const { browser, page, errors } = await launch({storage:false});
const log=[];
await timedGoto(page, SHOP + '/ru/products/svechi-asd-s-chesnokom-10-sht-cherkashino', {waitUntil:'load'});
await page.waitForTimeout(5000);
await page.locator('button:has-text("В корзину")').first().click(); await page.waitForTimeout(6000);
await timedGoto(page, SHOP + '/ru/cart', {waitUntil:'load'}); await page.waitForTimeout(6000);
await page.locator('a:has-text("Оформить заказ"), button:has-text("Оформить заказ")').first().click();
await page.waitForTimeout(9000);
// shipping option radio
const radios = await page.$$('input[type=radio], [role=radio]');
log.push('radios '+radios.length);
if (radios.length) { await radios[0].click({force:true}).catch(()=>{}); await page.waitForTimeout(4000); }
// address
await page.locator('button:has-text("Адрес доставки")').first().click(); await page.waitForTimeout(2500);
await page.fill('input[name=address_1]', 'ул. Ленина, д. 1, кв. 3');
// manual address checkbox to get city/zip
const cb = page.locator('input[type=checkbox]').first();
if (await cb.count()) { await cb.click({force:true}).catch(()=>{}); await page.waitForTimeout(1500); }
const ins2 = await page.$$eval('input', e=>e.map(x=>({n:x.name,t:x.type})));
log.push('after manual: '+JSON.stringify(ins2));
for (const [n,v] of [['city','Черкашино'],['postal_code','649000'],['province','Республика Алтай'],['first_name','Тест'],['last_name','Приёмка']]) {
  const f = page.locator(`input[name=${n}]`); if (await f.count()) await f.first().fill(v).catch(()=>{});
}
await shot(page,'s10-address-filled');
// save the sheet
const savebtn = page.locator('button:has-text("Сохранить"), button:has-text("Готово"), button:has-text("Продолжить")').last();
if (await savebtn.count()) { await savebtn.click().catch(()=>{}); await page.waitForTimeout(4000); }
// contacts
await page.locator('button:has-text("Контакты")').first().click().catch(()=>{}); await page.waitForTimeout(2500);
const ins3 = await page.$$eval('input', e=>e.map(x=>({n:x.name,t:x.type,ph:x.placeholder})));
log.push('contacts inputs '+JSON.stringify(ins3));
for (const [n,v] of [['email','ivanprotsko+qaowner@ivanprotsko.com'],['phone','+79991234567'],['first_name','Тест'],['last_name','Приёмка']]) {
  const f = page.locator(`input[name=${n}]`); if (await f.count()) await f.first().fill(v).catch(()=>{});
}
await shot(page,'s10-contacts-filled');
const sb2 = page.locator('button:has-text("Сохранить"), button:has-text("Готово"), button:has-text("Продолжить")').last();
if (await sb2.count()) { await sb2.click().catch(()=>{}); await page.waitForTimeout(4000); }
await shot(page,'s10-checkout-ready');
const t=(await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
log.push('STATE:\n'+t.slice(0,1400));
const btns = await page.$$eval('button', e=>[...new Set(e.map(x=>(x.innerText||'').trim()))].filter(Boolean));
log.push('BTNS '+JSON.stringify(btns));
console.log(log.join('\n'));
save('s10-place.json',{log,errors});
await browser.close();
