import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const t0=Date.now(); const nav = await timedGoto(page, PANEL + '/pages');
let usable=null; for(let i=0;i<40;i++){ const n=await page.$$eval('tbody tr,a[href^="/pages/"]', e=>e.length); if(n){usable=Date.now()-t0;break;} await page.waitForTimeout(700);}
await page.waitForTimeout(3000);
const txt=(await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
console.log('nav',JSON.stringify(nav),'usableMs',usable);
console.log(txt.slice(txt.indexOf('Доставка')+10, txt.indexOf('Доставка')+2200));
await shot(page,'s08-pages-list');
save('s08-list.json',{nav,usable,txt:txt.slice(0,4000),errors});
console.log('errors',JSON.stringify(errors.slice(0,3)));
await browser.close();
