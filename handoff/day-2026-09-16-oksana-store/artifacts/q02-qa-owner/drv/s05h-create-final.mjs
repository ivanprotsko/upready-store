import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const notes=[]; const T0=Date.now();
await timedGoto(page, PANEL + '/products/create');
for (let i=0;i<40;i++){ if (await page.$$eval('input[name=title]', e=>e.length)) break; await page.waitForTimeout(1000); }
await page.waitForTimeout(1200);
const D = page.locator('[role=dialog]').last();
await D.locator('input[name=title]').fill('ТЕСТ QA — не покупать');
await D.locator('textarea[name=description]').fill('Временный товар живой приёмки q02. Будет удалён.');
await D.locator('input[type=file]').setInputFiles('/tmp/q02-test-photo.png');
await page.waitForTimeout(3000);
await D.locator('button:has-text("Продолжить")').click(); await page.waitForTimeout(3000);
await D.locator('input[name=categories]').click(); await page.waitForTimeout(1800);
await page.getByText('Мёд', {exact:true}).first().click(); await page.waitForTimeout(1200);
notes.push('catValue=' + await D.locator('input[name=categories]').inputValue().catch(()=>'?'));
await page.keyboard.press('Escape'); await page.waitForTimeout(800);
await D.locator('button:has-text("Продолжить")').click(); await page.waitForTimeout(3500);
// stock: enable manage inventory
const mi = D.locator('input[name="variants.0.manage_inventory"]');
if (await mi.count()) { await mi.first().click({force:true}).catch(async()=>{ await page.locator('[role=switch]').last().click(); }); }
await page.waitForTimeout(800);
// price in RUB
const rub = D.locator('input[name="variants.0.prices.rub"]');
notes.push('rubFieldCount=' + await rub.count());
if (await rub.count()) { await rub.first().fill('999'); await page.keyboard.press('Enter'); }
await page.waitForTimeout(1000);
await shot(page,'s05-step3-filled');
notes.push('rubValue=' + await rub.first().inputValue().catch(()=>'?'));
const tPub = Date.now();
await D.locator('button:has-text("Опубликовать")').click();
await page.waitForTimeout(9000);
notes.push('publishMs=' + (Date.now()-tPub) + ' url=' + page.url());
await shot(page,'s05-after-publish');
const body = (await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
notes.push('AFTER:\n'+body.slice(0,1200));
notes.push('totalCreateMs=' + (Date.now()-T0));
console.log(notes.join('\n')); console.log('errors', JSON.stringify(errors));
save('s05-create-final.json',{notes,errors,url:page.url()});
await browser.close();
