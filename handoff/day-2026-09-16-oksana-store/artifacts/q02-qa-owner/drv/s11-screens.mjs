import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const paths = process.argv.slice(2);
const { browser, page, errors } = await launch();
const out=[];
for (const p of paths){
  const t0=Date.now(); const nav = await timedGoto(page, PANEL + p);
  let usable=null;
  for(let i=0;i<45;i++){ const n=(await page.evaluate(()=>document.body.innerText)).length; if(n>900){usable=Date.now()-t0;break;} await page.waitForTimeout(600);}
  await page.waitForTimeout(3000);
  const txt=(await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
  const i = txt.indexOf('Доставка')+10;
  const body = txt.slice(i, i+1800);
  const name = 's11'+p.replace(/\//g,'_');
  await shot(page, name);
  out.push({p, status: nav.status, navMs: nav.ms, usableMs: usable, body, url: page.url(), errs: errors.slice(-3)});
  console.log('===== '+p+'  status='+nav.status+' navMs='+nav.ms+' usableMs='+usable+' url='+page.url());
  console.log(body);
}
save('s11-screens.json',{out});
await browser.close();
