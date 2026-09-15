import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const nav = await timedGoto(page, PANEL + '/categories/pcat_01M2GQWY21SSF86N68NZ0WP4ZS');
await page.waitForTimeout(8000);
const txt=(await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
console.log(txt.slice(txt.indexOf('Категории',60), txt.indexOf('Категории',60)+1600));
const menus = await page.$$('button[aria-haspopup="menu"]');
const found=[];
for (let i=0;i<menus.length;i++){ await menus[i].click().catch(()=>{}); await page.waitForTimeout(800);
  found.push(await page.$$eval('[role=menuitem]', e=>e.map(x=>(x.innerText||'').trim()))); await page.keyboard.press('Escape'); await page.waitForTimeout(300);}
console.log('MENUS', JSON.stringify(found));
await shot(page,'s06-category-page');
save('s06-cat.json',{nav,txt:txt.slice(0,2500),found,errors});
await browser.close();
