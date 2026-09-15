import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/promotions/create'); await page.waitForTimeout(8000);
const D = page.locator('[role=dialog]').last();
// pick percentage_off_order (4th template)
await page.locator('button:has-text("promotions.templates.percentage_off_order")').first().click().catch(async()=>{
  await page.$$eval('input[name=template_id]', els=>els[3].click());
});
await page.waitForTimeout(1200);
await D.locator('button:has-text("Продолжить")').click(); await page.waitForTimeout(4000);
await shot(page,'s09-step2-details');
console.log('STEP2:\n'+(await D.innerText()).replace(/\n{2,}/g,'\n').slice(0,2500));
const c = await page.evaluate(()=>{const ds=[...document.querySelectorAll('[role=dialog]')];const d=ds[ds.length-1];
 return [...d.querySelectorAll('input,textarea,select,button')].map(e=>({tag:e.tagName,name:e.name,type:e.type,ph:e.placeholder,t:(e.innerText||'').trim().slice(0,28)}));});
console.log('CTRL', JSON.stringify(c).slice(0,2500));
save('s09-step2.json',{c,errors});
await browser.close();
