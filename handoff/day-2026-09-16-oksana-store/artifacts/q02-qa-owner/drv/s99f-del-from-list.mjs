import { launch, timedGoto, shot, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const log=[];
await timedGoto(page, PANEL + '/promotions'); await page.waitForTimeout(9000);
// row menu is usually the last menu button in the row
const menus = await page.$$('button[aria-haspopup="menu"]');
log.push('menus '+menus.length);
for (let i=menus.length-1;i>=0;i--){
  await menus[i].click().catch(()=>{}); await page.waitForTimeout(900);
  const items = await page.$$eval('[role=menuitem]', e=>e.map(x=>(x.innerText||'').trim()));
  log.push(i+':'+JSON.stringify(items));
  if (items.includes('Удалить')){
    const pos = await page.evaluate(()=>{const it=[...document.querySelectorAll('[role=menuitem]')].find(x=>x.innerText.trim()==='Удалить'); const r=it.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};});
    await page.mouse.click(pos.x,pos.y); await page.waitForTimeout(3000);
    await shot(page,'s99-promo-confirm');
    const d = await page.evaluate(()=>{const ds=[...document.querySelectorAll('[role=alertdialog],[role=dialog]')];const x=ds[ds.length-1]; return x? x.innerText.slice(0,300):null;});
    log.push('dialog text '+JSON.stringify(d));
    const cb = await page.evaluate(()=>{const ds=[...document.querySelectorAll('[role=alertdialog]')];const x=ds[ds.length-1]; if(!x) return null;
      return [...x.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect(); return {t:(b.innerText||'').trim(),x:r.x+r.width/2,y:r.y+r.height/2};});});
    if (cb){ const del=cb.find(b=>b.t==='Удалить'); await page.mouse.click(del.x,del.y); log.push('clicked confirm at '+JSON.stringify(del)); }
    await page.waitForTimeout(8000);
    break;
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
}
await timedGoto(page, PANEL+'/promotions'); await page.waitForTimeout(9000);
const t = await page.evaluate(()=>document.body.innerText);
log.push('stillThere '+/QATESTQ02/.test(t));
console.log(log.join('\n'));
console.log('errors', JSON.stringify(errors.slice(0,5)));
save('s99-del-from-list.json',{log,errors});
await browser.close();
