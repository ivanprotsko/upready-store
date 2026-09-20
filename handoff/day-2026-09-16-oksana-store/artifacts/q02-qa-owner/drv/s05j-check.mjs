import { launch, shot, timedGoto, save, PANEL, SHOP } from './lib.mjs';
const PID='prod_01M2H554BCXVRS040BSRKGX7Z6';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/products/'+PID); await page.waitForTimeout(7000);
const t = (await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
const i = t.indexOf('ТЕСТ QA');
console.log('PANEL:\n'+t.slice(i, i+1400));
await shot(page,'s05-created-product');
// variant price
const vhref = await page.$$eval('a[href*="/variants/"]', e=>[...new Set(e.map(x=>x.getAttribute('href')))]);
console.log('variant links', JSON.stringify(vhref));
if (vhref[0]) { await timedGoto(page, PANEL + vhref[0].replace('/edit','')); await page.waitForTimeout(6000);
  const vt = (await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
  console.log('VARIANT:\n'+vt.slice(vt.indexOf('Цены')-300)); }
save('s05-check.json',{t:t.slice(i,i+2000),vhref,errors});
await browser.close();
