import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const OID = process.argv[2];
const { browser, page, errors } = await launch();
const t0=Date.now(); const nav = await timedGoto(page, PANEL + '/orders/'+OID);
let usable=null; for(let i=0;i<60;i++){ const n=(await page.evaluate(()=>document.body.innerText)).length; if(n>1200){usable=Date.now()-t0;break;} await page.waitForTimeout(700);}
await page.waitForTimeout(4000);
const txt=(await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
console.log('nav',JSON.stringify(nav),'usableMs',usable);
console.log(txt.slice(txt.indexOf('Заказы\n')+7, txt.indexOf('Заказы\n')+3000));
const menus = await page.$$('button[aria-haspopup="menu"]'); const found=[];
for(let i=0;i<menus.length;i++){ await menus[i].click().catch(()=>{}); await page.waitForTimeout(800);
  found.push(await page.$$eval('[role=menuitem]', e=>e.map(x=>(x.innerText||'').trim()))); await page.keyboard.press('Escape'); await page.waitForTimeout(300);}
console.log('MENUS', JSON.stringify(found));
const btns = await page.$$eval('button', e=>[...new Set(e.map(x=>(x.innerText||'').trim()))].filter(Boolean));
console.log('BTNS', JSON.stringify(btns));
await shot(page,'s10-order-'+OID.slice(-6));
save('s10-order.json',{nav,usable,txt:txt.slice(0,5000),found,btns,errors});
console.log('errors',JSON.stringify(errors.slice(0,3)));
await browser.close();
