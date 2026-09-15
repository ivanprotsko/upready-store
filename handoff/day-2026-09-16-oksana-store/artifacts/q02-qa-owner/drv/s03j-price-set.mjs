import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const NEW = process.argv[2];
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + `/products/prod_01M2GRC5XMX78M72NZSXTM8B6X/prices`);
await page.waitForTimeout(8000);
for (let i=0;i<200;i++){
  const cols = await page.$$eval('th,[role=columnheader]', els=>els.map(e=>(e.innerText||'').trim()));
  if (cols.some(c=>/Цена RUB/i.test(c))) break;
  await page.keyboard.press('Tab');
}
await page.waitForTimeout(600);
const before = await page.evaluate(()=>{const a=document.activeElement; return {tag:a?.tagName,type:a?.type,val:a?.value};});
await page.keyboard.press('Meta+A').catch(()=>{});
await page.keyboard.press('Backspace');
await page.waitForTimeout(300);
await page.keyboard.type(NEW);
await page.waitForTimeout(500);
const after = await page.evaluate(()=>{const a=document.activeElement; return {tag:a?.tagName,val:a?.value};});
console.log('before', JSON.stringify(before), 'after', JSON.stringify(after));
await page.click('button:has-text("Сохранить")');
await page.waitForTimeout(6000);
console.log('url', page.url());
await shot(page, 's03-price-set-'+NEW);
save('s03-price-set.json', {before, after, url: page.url(), errors});
await browser.close();
