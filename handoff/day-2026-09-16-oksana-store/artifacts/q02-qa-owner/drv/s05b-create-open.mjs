import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const t0=Date.now();
const nav = await timedGoto(page, PANEL + '/products/create');
let usableMs=null;
for (let i=0;i<40;i++){ const n = await page.$$eval('input,textarea', e=>e.length); if (n>2){ usableMs = Date.now()-t0; break;} await page.waitForTimeout(1000);}
await page.waitForTimeout(2000);
const out = { nav, usableMs, url: page.url(),
  txt: (await page.evaluate(()=>{const d=document.querySelector('[role=dialog],[role=alertdialog]'); return (d||document.body).innerText;})).slice(0,4000),
  fields: await page.$$eval('input,textarea,select', e=>e.map(x=>({t:x.tagName+':'+(x.type||''), n:x.name, ph:x.placeholder}))),
  buttons: await page.$$eval('button', e=>e.map(x=>(x.innerText||'').trim()).filter(Boolean)), errors };
out.shot = await shot(page,'s05-create-open');
save('s05-create-open.json', out);
console.log(JSON.stringify({nav,usableMs,fields:out.fields,buttons:out.buttons,errors},null,1));
console.log('--- DIALOG TXT ---\n'+out.txt.replace(/\n{2,}/g,'\n'));
await browser.close();
