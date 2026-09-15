import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const t0=Date.now(); const nav = await timedGoto(page, PANEL + '/home-settings');
let usable=null;
for(let i=0;i<40;i++){ const n=await page.$$eval('input,textarea', e=>e.length); if(n>1){usable=Date.now()-t0;break;} await page.waitForTimeout(700);}
await page.waitForTimeout(3000);
const txt=(await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
console.log('nav',JSON.stringify(nav),'usableMs',usable);
console.log(txt.slice(txt.indexOf('Доставка')+10, txt.indexOf('Доставка')+3000));
const c = await page.$$eval('input,textarea,select,button', e=>e.map(x=>({tag:x.tagName,name:x.name,type:x.type,v:(x.value||'').slice(0,40),t:(x.innerText||'').trim().slice(0,30)})).filter(x=>x.name||x.t));
console.log('CTRL', JSON.stringify(c).slice(0,2500));
await shot(page,'s07-home-settings');
save('s07-home.json',{nav,usable,txt:txt.slice(0,4000),c,errors});
console.log('errors',JSON.stringify(errors.slice(0,3)));
await browser.close();
