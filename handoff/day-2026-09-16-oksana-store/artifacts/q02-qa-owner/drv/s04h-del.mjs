import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
let deleted = 0, notes = [];
for (let round=0; round<3; round++){
  await timedGoto(page, PANEL + '/products/prod_01M2GRC5XMX78M72NZSXTM8B6X/media');
  await page.waitForTimeout(7000);
  const idx = await page.evaluate(()=>{
    const imgs=[...document.querySelectorAll('img')];
    for (let i=0;i<imgs.length;i++){ if(/1789428/.test(imgs[i].src) && imgs[i].clientWidth < 100) return i; }
    return -1;
  });
  if (idx<0) { notes.push('round'+round+': no small test thumb'); break; }
  const imgs = await page.$$('img');
  const box = await imgs[idx].boundingBox();
  await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
  await page.waitForTimeout(2000);
  const big = await page.evaluate(()=>[...document.querySelectorAll('img')].filter(i=>i.clientWidth>200).map(i=>i.src.replace(/^.*tenants\//,'')));
  notes.push('round'+round+' big='+JSON.stringify(big));
  if (!big.some(s=>/1789428/.test(s))) { notes.push('round'+round+': thumbnail click did not switch the main image'); break; }
  await page.click('button:has-text("Удалить текущее изображение")');
  await page.waitForTimeout(2000);
  await shot(page,'s04-del-dialog');
  const dtxt = await page.evaluate(()=>{const d=document.querySelector('[role=alertdialog],[role=dialog]'); return d?d.innerText.slice(0,400):null;});
  notes.push('dialog='+JSON.stringify(dtxt));
  const btn = await page.$('[role=alertdialog] button:has-text("Удалить"), [role=dialog] button:has-text("Удалить"), button:has-text("Подтвердить")');
  if (btn) { await btn.click(); deleted++; }
  await page.waitForTimeout(5000);
}
await timedGoto(page, PANEL + '/products/prod_01M2GRC5XMX78M72NZSXTM8B6X/media');
await page.waitForTimeout(7000);
const all = await page.$$eval('img', e=>[...new Set(e.map(x=>x.src.replace(/^.*tenants\//,'')))]);
console.log(notes.join('\n'));
console.log('deletedClicks', deleted, 'remaining', JSON.stringify(all,null,1));
save('s04-del.json',{notes, deleted, all, errors});
await browser.close();
