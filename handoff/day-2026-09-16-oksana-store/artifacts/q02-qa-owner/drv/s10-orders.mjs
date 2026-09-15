import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const t0=Date.now(); const nav = await timedGoto(page, PANEL + '/orders');
let usable=null; for(let i=0;i<60;i++){ const n=await page.$$eval('tbody tr', e=>e.length); if(n){usable=Date.now()-t0;break;} await page.waitForTimeout(700);}
await page.waitForTimeout(3000);
const txt=(await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
console.log('nav',JSON.stringify(nav),'usableMs',usable);
console.log(txt.slice(txt.indexOf('Доставка')+10, txt.indexOf('Доставка')+2000));
const links = await page.$$eval('tbody a', e=>[...new Set(e.map(x=>x.getAttribute('href')))]);
console.log('orderLinks', JSON.stringify(links));
await shot(page,'s10-orders-list');
save('s10-list.json',{nav,usable,txt:txt.slice(0,3500),links,errors});
console.log('errors',JSON.stringify(errors.slice(0,3)));
await browser.close();
