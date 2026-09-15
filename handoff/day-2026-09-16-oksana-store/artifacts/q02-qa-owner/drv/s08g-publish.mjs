import { launch, shot, timedGoto, save, PANEL, SHOP } from './lib.mjs';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/pages/qa-test-q02'); await page.waitForTimeout(8000);
const before = await page.evaluate(()=>[...document.querySelectorAll('input[type=checkbox]')].map(c=>({n:c.name, checked:c.checked})));
console.log('before', JSON.stringify(before));
// click the switch buttons (role=switch or the button that precedes the checkbox)
const sw = await page.$$('button[role=switch], button[id$="-form-item"]');
console.log('switch-ish buttons', sw.length);
for (const b of sw) { const t = await b.innerText().catch(()=>''); await b.click().catch(e=>console.log('click fail', String(e).slice(0,60))); await page.waitForTimeout(500); }
const mid = await page.evaluate(()=>[...document.querySelectorAll('input[type=checkbox]')].map(c=>({n:c.name, checked:c.checked})));
console.log('afterClicks', JSON.stringify(mid));
await page.fill('textarea[name=body]', '# Тестовая страница\n\nЭта страница создана живой приёмкой q02 и будет удалена.');
await shot(page,'s08-page-before-save');
await page.locator('button:has-text("Save")').click(); await page.waitForTimeout(6000);
await timedGoto(page, PANEL + '/pages'); await page.waitForTimeout(7000);
const txt=(await page.evaluate(()=>document.body.innerText)); const i=txt.indexOf('Тестовая страница QA');
console.log('row:', txt.slice(i,i+170).replace(/\n+/g,' | '));
const nav = await timedGoto(page, SHOP + '/ru/pages/qa-test-q02', {waitUntil:'load'}); await page.waitForTimeout(4000);
console.log('SF status', nav.status);
const body = await page.evaluate(()=>document.body.innerText);
console.log('SF has heading', /Тестовая страница/.test(body));
const foot = await page.evaluate(()=>[...document.querySelectorAll('a')].filter(x=>/Тестовая страница QA/.test(x.innerText)).map(x=>x.getAttribute('href')));
console.log('footerLinks', JSON.stringify(foot));
await shot(page,'s08-storefront-page2');
save('s08-publish.json',{before,mid,errors});
await browser.close();
