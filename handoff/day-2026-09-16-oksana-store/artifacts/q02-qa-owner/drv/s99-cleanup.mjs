import { launch, shot, timedGoto, save, PANEL, SHOP } from './lib.mjs';
const { browser, page, errors } = await launch();
const log=[];
// 1) delete the test product
await timedGoto(page, PANEL + '/products/prod_01M2H554BCXVRS040BSRKGX7Z6'); await page.waitForTimeout(8000);
const menus = await page.$$('button[aria-haspopup="menu"]');
await menus[2].click(); await page.waitForTimeout(900);
await page.locator('[role=menuitem]:has-text("Удалить")').first().click(); await page.waitForTimeout(2500);
const cb = await page.evaluate(()=>{const ds=[...document.querySelectorAll('[role=alertdialog]')];const d=ds[ds.length-1]; if(!d) return null;
  return [...d.querySelectorAll('button')].map(x=>{const r=x.getBoundingClientRect(); return {t:(x.innerText||'').trim(), x:r.x+r.width/2, y:r.y+r.height/2};});});
log.push('product delete dialog '+JSON.stringify(cb));
if (cb){ const d=cb.find(x=>/Удалить|Подтвер/i.test(x.t))||cb[cb.length-1]; await page.mouse.click(d.x,d.y); await page.waitForTimeout(6000); }
// 2) delete the promo
await timedGoto(page, PANEL + '/promotions'); await page.waitForTimeout(7000);
const pm = await page.$$('button[aria-haspopup="menu"]');
for (let i=pm.length-1;i>=0;i--){ await pm[i].click().catch(()=>{}); await page.waitForTimeout(700);
  const items = await page.$$eval('[role=menuitem]', e=>e.map(x=>(x.innerText||'').trim()));
  if (items.some(t=>/Удалить/.test(t))) { log.push('promo menu '+JSON.stringify(items));
    await page.locator('[role=menuitem]:has-text("Удалить")').first().click(); await page.waitForTimeout(2200);
    const c2 = await page.evaluate(()=>{const ds=[...document.querySelectorAll('[role=alertdialog]')];const d=ds[ds.length-1]; if(!d) return null;
      return [...d.querySelectorAll('button')].map(x=>{const r=x.getBoundingClientRect(); return {t:(x.innerText||'').trim(), x:r.x+r.width/2, y:r.y+r.height/2};});});
    if (c2){ const d=c2.find(x=>/Удалить|Подтвер/i.test(x.t))||c2[c2.length-1]; await page.mouse.click(d.x,d.y); await page.waitForTimeout(6000); }
    break; }
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
}
// 3) the test page: unpublish + remove from footer (delete if offered)
await timedGoto(page, PANEL + '/pages/qa-test-q02'); await page.waitForTimeout(8000);
const pageBtns = await page.$$eval('button', e=>[...new Set(e.map(x=>(x.innerText||'').trim()))].filter(Boolean));
log.push('page editor btns '+JSON.stringify(pageBtns));
const sws = await page.$$('button[id$="-form-item"]');
for (const b of sws) { await b.click().catch(()=>{}); await page.waitForTimeout(400); }
const st = await page.evaluate(()=>[...document.querySelectorAll('input[type=checkbox]')].map(c=>({n:c.name,checked:c.checked})));
log.push('page switches now '+JSON.stringify(st));
await page.locator('button:has-text("Save")').click().catch(()=>{}); await page.waitForTimeout(6000);
console.log(log.join('\n'));
save('s99-cleanup.json',{log,errors});
await browser.close();
