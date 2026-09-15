import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const PID='prod_01M2GRC5XMX78M72NZSXTM8B6X';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + `/products/${PID}/prices`);
await page.waitForTimeout(8000);
const t0 = Date.now();
let found=false, steps=0, px=0;
const box = await page.$('[role=grid], .overflow-auto, [data-testid]');
for (let i=0;i<400 && !found;i++){
  await page.keyboard.press('Tab').catch(()=>{});
  const cols = await page.$$eval('th,[role=columnheader]', els=>els.map(e=>(e.innerText||'').trim()));
  if (cols.some(c=>/RUB/i.test(c))) { found=true; }
  steps++;
  if (i%25===0) { const c = await page.$$eval('th,[role=columnheader]', els=>els.map(e=>(e.innerText||'').trim()).filter(x=>/Цена/.test(x))); process.stdout.write(i+':'+JSON.stringify(c.slice(0,2))+' '); }
}
const ms = Date.now()-t0;
const cols = await page.$$eval('th,[role=columnheader]', els=>els.map(e=>(e.innerText||'').trim()));
console.log('\nfound=',found,'steps=',steps,'ms=',ms,'cols now=',JSON.stringify(cols));
await shot(page, 's03-prices-rub');
save('s03-rub-scroll.json', {found, steps, ms, cols, errors});
await browser.close();
