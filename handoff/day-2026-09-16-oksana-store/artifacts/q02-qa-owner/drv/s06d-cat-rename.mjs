import { launch, shot, timedGoto, save, PANEL, SHOP } from './lib.mjs';
const NAME = process.argv[2], WITHIMG = process.argv[3]==='img';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/categories/pcat_01M2GQWY21SSF86N68NZ0WP4ZS'); await page.waitForTimeout(8000);
const menus = await page.$$('button[aria-haspopup="menu"]');
await menus[2].click(); await page.waitForTimeout(800);
await page.locator('[role=menuitem]:has-text("Редактировать")').first().click(); await page.waitForTimeout(4000);
const D = page.locator('[role=dialog]').last();
await D.locator('input[name=name]').fill(NAME);
if (WITHIMG) { await D.locator('input[type=file]').setInputFiles('/tmp/q02-test-photo.png'); await page.waitForTimeout(4000);
  console.log('imageUrlAfterUpload=', await D.locator('input[name=imageUrl]').inputValue()); }
else { await D.locator('input[name=imageUrl]').fill(''); }
const t0=Date.now();
await D.locator('button:has-text("Сохранить")').click();
await page.waitForTimeout(6000);
console.log('saveMs', Date.now()-t0, 'url', page.url());
await shot(page,'s06-cat-saved');
// storefront home tile
const t1=Date.now();
await timedGoto(page, SHOP + '/ru', {waitUntil:'load'}); await page.waitForTimeout(6000);
const body = await page.evaluate(()=>document.body.innerText);
console.log('homeHasName', body.includes(NAME.replace(' (тест)','')) , 'homeHasNewName', body.includes(NAME), 'after', Date.now()-t1, 'ms');
await shot(page,'s06-storefront-home-'+(WITHIMG?'img':'plain'));
save('s06-rename-'+(WITHIMG?'img':'plain')+'.json',{name:NAME, errors});
console.log('errors', JSON.stringify(errors.slice(0,3)));
await browser.close();
