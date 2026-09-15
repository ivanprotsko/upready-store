import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/products/prod_01M2GRC5XMX78M72NZSXTM8B6X/media');
await page.waitForTimeout(7000);
const thumbs = await page.$$('img');
let target=null; for (const t of thumbs){ const s=await t.getAttribute('src')||''; if(/1789428/.test(s)){target=t;break;} }
await target.click({force:true}); await page.waitForTimeout(2000);
await shot(page,'s04-del-1-selected');
const cur = await page.evaluate(()=>{const im=[...document.querySelectorAll('img')].filter(i=>i.width>200); return im.map(i=>i.src.replace(/^.*tenants\//,''));});
console.log('big image now:', JSON.stringify(cur));
await page.click('button[aria-label="Удалить текущее изображение"]');
await page.waitForTimeout(2500);
await shot(page,'s04-del-2-dialog');
const dlg = await page.evaluate(()=>{const d=document.querySelector('[role=dialog],[role=alertdialog]'); return d? d.innerText.slice(0,600):null;});
const btns = await page.$$eval('[role=dialog] button, [role=alertdialog] button', e=>e.map(x=>(x.innerText||x.getAttribute('aria-label')||'').trim()));
console.log('dialog:', JSON.stringify(dlg), 'btns:', JSON.stringify(btns));
if (btns.length) {
  const confirm = await page.$('[role=alertdialog] button:has-text("Удалить"), [role=dialog] button:has-text("Удалить")');
  if (confirm) { await confirm.click(); console.log('confirmed'); }
  await page.waitForTimeout(5000);
}
await shot(page,'s04-del-3-after');
await timedGoto(page, PANEL + '/products/prod_01M2GRC5XMX78M72NZSXTM8B6X/media');
await page.waitForTimeout(6000);
const left = await page.$$eval('img', els=>[...new Set(els.map(e=>e.src))].filter(s=>/1789428/.test(s)).length);
console.log('testImagesLeft', left, 'errors', JSON.stringify(errors));
save('s04-del-probe.json',{dlg,btns,left,errors});
await browser.close();
