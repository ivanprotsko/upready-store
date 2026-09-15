import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const t0=Date.now();
const nav = await timedGoto(page, PANEL + '/categories');
let usable=null;
for (let i=0;i<40;i++){ const n=await page.$$eval('tbody tr, a[href^="/categories/pcat_"]', e=>e.length); if(n){usable=Date.now()-t0;break;} await page.waitForTimeout(700);}
await page.waitForTimeout(2500);
const txt = (await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
console.log('nav',JSON.stringify(nav),'usableMs',usable);
console.log(txt.slice(txt.indexOf('Категории', 60), txt.indexOf('Категории',60)+1500));
const links = await page.$$eval('a[href^="/categories/pcat_"]', e=>[...new Set(e.map(x=>x.getAttribute('href')))]);
console.log('cats', JSON.stringify(links));
await shot(page,'s06-categories-list');
save('s06-list.json',{nav,usable,txt:txt.slice(0,3000),links,errors});
console.log('errors',JSON.stringify(errors));
await browser.close();
