import { launch, shot, timedGoto, save, PANEL, SHOP } from './lib.mjs';
const PID='prod_01M2H554BCXVRS040BSRKGX7Z6';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/products/'+PID); await page.waitForTimeout(7000);
// find the status control
const st = await page.evaluate(()=>{
  const els=[...document.querySelectorAll('button,[role=combobox],select')];
  return els.map(e=>({tag:e.tagName, role:e.getAttribute('role'), t:(e.innerText||'').trim().slice(0,30)})).filter(x=>/Опубликован|Черновик|статус/i.test(x.t));
});
console.log('status controls', JSON.stringify(st));
const b = page.locator('button:has-text("Опубликован")').first();
if (await b.count()) { await b.click(); await page.waitForTimeout(1500);
  const items = await page.$$eval('[role=option],[role=menuitem]', e=>e.map(x=>(x.innerText||'').trim()));
  console.log('options', JSON.stringify(items));
  await shot(page,'s05-status-menu');
  const d = page.locator('[role=option]:has-text("Черновик"), [role=menuitem]:has-text("Черновик")').first();
  if (await d.count()) { await d.click(); await page.waitForTimeout(5000); console.log('switched to Черновик'); }
}
await timedGoto(page, PANEL + '/products/'+PID); await page.waitForTimeout(6000);
const t = (await page.evaluate(()=>document.body.innerText));
console.log('nowStatus', /Черновик/.test(t) ? 'Черновик' : (/Опубликован/.test(t)?'Опубликован':'?'));
await shot(page,'s05-unpublished');
// storefront
await timedGoto(page, SHOP + '/ru/store', {waitUntil:'load'}); await page.waitForTimeout(6000);
const st2 = await page.evaluate(()=>/ТЕСТ QA/.test(document.body.innerText));
console.log('stillInCatalog', st2);
save('s05-unpublish.json',{st, stillInCatalog:st2, errors});
await browser.close();
