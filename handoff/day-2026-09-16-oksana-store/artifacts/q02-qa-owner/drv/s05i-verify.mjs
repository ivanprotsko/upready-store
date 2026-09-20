import { launch, shot, timedGoto, save, PANEL, SHOP } from './lib.mjs';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/products?q=ТЕСТ');
await page.waitForTimeout(8000);
const rows = await page.$$eval('tbody tr', els=>els.map(r=>r.innerText.replace(/\n+/g,' | ')));
console.log('PANEL ROWS:', JSON.stringify(rows,null,1));
const href = await page.$$eval('tbody tr a', e=>[...new Set(e.map(x=>x.getAttribute('href')))]);
console.log('hrefs', JSON.stringify(href));
if (href[0]) {
  await timedGoto(page, PANEL + href[0]); await page.waitForTimeout(7000);
  const t = (await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
  console.log('PRODUCT PAGE:\n'+t.slice(t.indexOf('Товары\nТЕСТ')>=0?t.indexOf('Товары\nТЕСТ'):0, 2500));
  await shot(page,'s05-created-product');
}
save('s05-verify.json',{rows,href,errors});
await browser.close();
