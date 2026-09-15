import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const PID='prod_01M2H554BCXVRS040BSRKGX7Z6';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/products/'+PID); await page.waitForTimeout(8000);
// click every menu-ish button in the header card and log the menu
const found=[];
const btns = await page.$$('button[aria-haspopup="menu"]');
console.log('menu buttons', btns.length);
for (let i=0;i<btns.length;i++){
  await btns[i].click().catch(()=>{}); await page.waitForTimeout(1000);
  const items = await page.$$eval('[role=menuitem]', e=>e.map(x=>(x.innerText||'').trim()));
  found.push({i, items});
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
}
console.log(JSON.stringify(found));
// also: the status badge element
const badge = await page.evaluate(()=>{const e=[...document.querySelectorAll('*')].find(x=>x.children.length===0 && x.innerText?.trim()==='Опубликован'); if(!e) return null; let p=e, path=[]; for(let i=0;i<4&&p;i++){path.push(p.tagName+'.'+(p.className||'').toString().slice(0,60)); p=p.parentElement;} return path;});
console.log('badge path', JSON.stringify(badge));
save('s05-menu.json',{found,badge,errors});
await browser.close();
