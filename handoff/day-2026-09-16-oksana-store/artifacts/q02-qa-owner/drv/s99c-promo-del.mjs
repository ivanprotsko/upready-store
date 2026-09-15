import { launch, timedGoto, shot, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/promotions/promo_01M2H6ARB8HDX7HYEJJJQTHT38'); await page.waitForTimeout(8000);
const menus = await page.$$('button[aria-haspopup="menu"]');
const log=[];
for (let i=menus.length-1;i>=0;i--){
  await menus[i].click().catch(()=>{}); await page.waitForTimeout(800);
  const items = await page.$$eval('[role=menuitem]', e=>e.map(x=>(x.innerText||'').trim()));
  log.push(i+':'+JSON.stringify(items));
  if (items.some(t=>t==='Удалить')) {
    const pos = await page.evaluate(()=>{const it=[...document.querySelectorAll('[role=menuitem]')].find(x=>x.innerText.trim()==='Удалить'); const r=it.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};});
    await page.mouse.click(pos.x,pos.y); await page.waitForTimeout(2500);
    const cb = await page.evaluate(()=>{const ds=[...document.querySelectorAll('[role=alertdialog]')];const d=ds[ds.length-1]; if(!d) return null;
      return [...d.querySelectorAll('button')].map(x=>{const r=x.getBoundingClientRect(); return {t:(x.innerText||'').trim(), x:r.x+r.width/2, y:r.y+r.height/2};});});
    log.push('dialog '+JSON.stringify(cb));
    if (cb){ const d=cb.find(x=>/^Удалить$|Подтвер/i.test(x.t))||cb[cb.length-1]; await page.mouse.click(d.x,d.y); await page.waitForTimeout(7000); }
    break;
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
}
await timedGoto(page, PANEL+'/promotions'); await page.waitForTimeout(7000);
const left = /QATESTQ02/.test(await page.evaluate(()=>document.body.innerText));
console.log(log.join('\n')); console.log('promoStillThere', left);
save('s99-promo-del.json',{log,left,errors});
await browser.close();
