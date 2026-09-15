import { launch, shot, timedGoto, save, PANEL, SHOP } from './lib.mjs';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/pages/qa-test-q02'); await page.waitForTimeout(8000);
await page.fill('input[name=title]', 'Тестовая страница QA');
await page.fill('textarea[name=body]', '# Тестовая страница\n\nЭта страница создана живой приёмкой q02 и будет удалена.');
for (const n of ['published','in_footer']) {
  const cb = page.locator(`input[name=${n}]`);
  if (await cb.count()) { const checked = await cb.first().isChecked().catch(()=>false);
    if (!checked) await cb.first().click({force:true}).catch(async()=>{ await page.locator('button[role=switch]').first().click(); }); }
}
await page.waitForTimeout(700);
const t0=Date.now();
await page.locator('button:has-text("Save")').click();
await page.waitForTimeout(6000);
console.log('saveMs', Date.now()-t0, 'url', page.url());
await shot(page,'s08-page-saved');
const txt=(await page.evaluate(()=>document.body.innerText));
const i=txt.indexOf('Тестовая страница QA');
console.log('row:', txt.slice(i, i+160).replace(/\n+/g,' | '));
// storefront
const t1=Date.now();
const nav = await timedGoto(page, SHOP + '/ru/pages/qa-test-q02', {waitUntil:'load'}); await page.waitForTimeout(4000);
console.log('SF page status', nav.status, 'ms', nav.ms);
console.log((await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n').slice(0,500));
await shot(page,'s08-storefront-page');
const foot = await page.evaluate(()=>{const a=[...document.querySelectorAll('footer a, a')].filter(x=>/Тестовая страница QA/.test(x.innerText)); return a.map(x=>x.getAttribute('href'));});
console.log('footerLinks', JSON.stringify(foot), 'checkedMs', Date.now()-t1);
save('s08-fill.json',{errors});
console.log('errors',JSON.stringify(errors.slice(0,3)));
await browser.close();
