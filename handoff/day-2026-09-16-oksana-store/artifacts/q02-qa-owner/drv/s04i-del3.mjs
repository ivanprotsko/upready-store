import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const notes=[];
for (let round=0; round<3; round++){
  await timedGoto(page, PANEL + '/products/prod_01M2GRC5XMX78M72NZSXTM8B6X/media');
  await page.waitForTimeout(7000);
  const idx = await page.evaluate(()=>{const im=[...document.querySelectorAll('img')]; for(let i=0;i<im.length;i++){ if(/1789428/.test(im[i].src)&&im[i].clientWidth<100) return i;} return -1;});
  if (idx<0){ notes.push('r'+round+' none-left'); break; }
  const imgs = await page.$$('img'); const b = await imgs[idx].boundingBox();
  await page.mouse.click(b.x+b.width/2, b.y+b.height/2); await page.waitForTimeout(1800);
  const big = await page.evaluate(()=>[...document.querySelectorAll('img')].filter(i=>i.clientWidth>200).map(i=>i.src.replace(/^.*tenants\//,'')));
  notes.push('r'+round+' big='+JSON.stringify(big));
  const tb = await page.$('button:has-text("Удалить текущее изображение")');
  const tbb = await tb.boundingBox();
  await page.mouse.click(tbb.x+tbb.width/2, tbb.y+tbb.height/2);
  await page.waitForTimeout(2500);
  await shot(page,'s04-del-dialog-r'+round);
  const dtxt = await page.evaluate(()=>{const ds=[...document.querySelectorAll('[role=alertdialog],[role=dialog]')]; return ds.map(d=>d.innerText.slice(0,300));});
  notes.push('r'+round+' dialogs='+JSON.stringify(dtxt));
  // click by coordinates on the confirm button inside the topmost alertdialog
  const cb = await page.evaluate(()=>{
    const ds=[...document.querySelectorAll('[role=alertdialog]')]; const d=ds[ds.length-1]; if(!d) return null;
    const bs=[...d.querySelectorAll('button')].map(x=>({t:(x.innerText||'').trim(), r:x.getBoundingClientRect()}));
    return bs.map(x=>({t:x.t, x:x.r.x+x.r.width/2, y:x.r.y+x.r.height/2}));
  });
  notes.push('r'+round+' confirmBtns='+JSON.stringify(cb));
  if (cb && cb.length){
    const del = cb.find(x=>/Удалить|Подтвер|Да/i.test(x.t)) || cb[cb.length-1];
    await page.mouse.click(del.x, del.y);
    notes.push('r'+round+' clicked '+del.t);
  }
  await page.waitForTimeout(6000);
}
await timedGoto(page, PANEL + '/products/prod_01M2GRC5XMX78M72NZSXTM8B6X/media');
await page.waitForTimeout(7000);
const all = await page.$$eval('img', e=>[...new Set(e.map(x=>x.src.replace(/^.*tenants\//,'')))]);
console.log(notes.join('\n')); console.log('REMAINING', JSON.stringify(all,null,1));
save('s04-del3.json',{notes,all,errors});
await browser.close();
