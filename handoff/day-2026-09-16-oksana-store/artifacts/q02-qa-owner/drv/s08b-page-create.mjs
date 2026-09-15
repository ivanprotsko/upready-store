import { launch, shot, timedGoto, save, PANEL, SHOP } from './lib.mjs';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/pages'); await page.waitForTimeout(6000);
const btns = await page.$$eval('button,a', e=>e.map(x=>(x.innerText||'').trim()).filter(Boolean));
console.log('BUTTONS', JSON.stringify([...new Set(btns)].slice(-14)));
// open the "create" control
const create = page.locator('button:has-text("Создать"), a:has-text("Создать"), button:has-text("Добавить")').first();
console.log('createCount', await create.count());
if (await create.count()) { await create.click(); await page.waitForTimeout(4000); }
await shot(page,'s08-page-create');
const D = page.locator('[role=dialog]').last();
const has = await D.count();
console.log('dialog', has);
if (has) { console.log((await D.innerText()).replace(/\n{2,}/g,'\n').slice(0,1200));
  const c = await page.evaluate(()=>{const ds=[...document.querySelectorAll('[role=dialog]')];const d=ds[ds.length-1];
   return [...d.querySelectorAll('input,textarea,select,button')].map(e=>({tag:e.tagName,name:e.name,id:e.id,type:e.type,t:(e.innerText||'').trim().slice(0,25)}));});
  console.log('CTRL',JSON.stringify(c)); }
else { console.log('URL now', page.url()); console.log((await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n').slice(-1500)); }
save('s08-create.json',{errors});
await browser.close();
