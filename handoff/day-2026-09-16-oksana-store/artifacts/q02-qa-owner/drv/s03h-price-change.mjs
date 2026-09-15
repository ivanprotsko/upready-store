import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const PID='prod_01M2GRC5XMX78M72NZSXTM8B6X';
const NEW = process.argv[2] || '1399';
const { browser, page, errors } = await launch();
const nav = await timedGoto(page, PANEL + `/products/${PID}/prices`);
await page.waitForTimeout(8000);
const t0 = Date.now();
let steps=0;
for (let i=0;i<200;i++){
  const cols = await page.$$eval('th,[role=columnheader]', els=>els.map(e=>(e.innerText||'').trim()));
  if (cols.some(c=>/Цена RUB/i.test(c))) break;
  await page.keyboard.press('Tab'); steps++;
}
// the focused cell should now be in/near RUB column; type the value
await page.waitForTimeout(500);
const focusedBefore = await page.evaluate(()=>{const a=document.activeElement; return {tag:a?.tagName, val:a?.value, aria:a?.getAttribute('aria-label')||a?.closest('td,[role=gridcell]')?.getAttribute('aria-colindex')};});
await page.keyboard.type(NEW);
await page.waitForTimeout(600);
const afterType = await page.evaluate(()=>{const a=document.activeElement; return {tag:a?.tagName, val:a?.value};});
await shot(page, 's03-price-typed');
// save
const saveBtn = await page.$('button:has-text("Сохранить")');
const tSave = Date.now();
await saveBtn.click();
await page.waitForTimeout(6000);
const savedMs = Date.now()-tSave;
const url = page.url();
const toast = await page.evaluate(()=>document.body.innerText.slice(0,600));
await shot(page, 's03-price-saved');
save('s03-price-change.json', {nav, tabSteps: steps, focusedBefore, afterType, savedMs, url, toast, totalMs: Date.now()-t0, errors});
console.log(JSON.stringify({tabSteps:steps, focusedBefore, afterType, savedMs, url, errors}, null, 1));
console.log('--- after save ---\n'+toast.slice(0,400));
await browser.close();
