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
await page.waitForTimeout(500);
// realistic: press Enter to enter edit mode, then Backspace x8, then type
await page.keyboard.press('Enter'); await page.waitForTimeout(400);
for (let i=0;i<10;i++) await page.keyboard.press('Backspace');
await page.waitForTimeout(300);
const cleared = await page.evaluate(()=>({tag:document.activeElement?.tagName, val:document.activeElement?.value}));
await page.keyboard.type(NEW);
await page.waitForTimeout(400);
const typed = await page.evaluate(()=>({tag:document.activeElement?.tagName, val:document.activeElement?.value}));
await shot(page,'s03-price-clear-typed');
await page.click('button:has-text("Сохранить")');
await page.waitForTimeout(6000);
console.log(JSON.stringify({cleared, typed, url: page.url(), errors}, null, 1));
save('s03-price-clear-type.json', {cleared, typed, url: page.url(), errors});
await browser.close();
