import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const T0=Date.now();
await timedGoto(page, PANEL + '/promotions/create'); await page.waitForTimeout(8000);
const D = page.locator('[role=dialog]').last();
await page.$$eval('input[name=template_id]', els=>els[3].click());
await page.waitForTimeout(1000);
await D.locator('button:has-text("Продолжить")').click(); await page.waitForTimeout(4000);
await page.$$eval('input[name=status]', els=>els[1].click());   // Активно
await D.locator('input[name=code]').fill('QATESTQ02');
await D.locator('input[name="application_method.value"]').fill('10');
await D.locator('input[name=limit]').fill('100');
await page.waitForTimeout(600);
await shot(page,'s09-step2-filled');
await D.locator('button:has-text("Продолжить")').click(); await page.waitForTimeout(4000);
await shot(page,'s09-step3-campaign');
console.log('STEP3:\n'+(await D.innerText()).replace(/\n{2,}/g,'\n').slice(0,1200));
const btns = await page.evaluate(()=>{const ds=[...document.querySelectorAll('[role=dialog]')];const d=ds[ds.length-1];
  return [...d.querySelectorAll('button')].map(b=>(b.innerText||'').trim()).filter(Boolean);});
console.log('BTNS', JSON.stringify(btns));
const savebtn = page.locator('[role=dialog] button:has-text("Сохранить"), [role=dialog] button:has-text("Создать")').last();
if (await savebtn.count()) { const t=Date.now(); await savebtn.click(); await page.waitForTimeout(7000); console.log('saveMs', Date.now()-t, 'url', page.url()); }
await shot(page,'s09-after-save');
await timedGoto(page, PANEL+'/promotions'); await page.waitForTimeout(7000);
const t=(await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
console.log('LIST:\n'+t.slice(t.indexOf('Акции')+6, t.indexOf('Акции')+800));
console.log('totalMs', Date.now()-T0);
save('s09-create-done.json',{errors});
await browser.close();
