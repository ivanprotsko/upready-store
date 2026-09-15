import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const notes=[]; const T0=Date.now();
await timedGoto(page, PANEL + '/products/create');
for (let i=0;i<40;i++){ if (await page.$$eval('input[name=title]', e=>e.length)) break; await page.waitForTimeout(1000); }
await page.waitForTimeout(1500);
const D = page.locator('[role=dialog]').last();
await D.locator('input[name=title]').fill('ТЕСТ QA — не покупать');
await D.locator('textarea[name=description]').fill('Временный товар живой приёмки q02. Будет удалён.');
await D.locator('input[type=file]').setInputFiles('/tmp/q02-test-photo.png');
await page.waitForTimeout(3000);
await D.locator('button:has-text("Продолжить")').click();
await page.waitForTimeout(3000);
// --- categories
try {
  const catBtn = D.locator('button:has-text("Добавить")').first();
  await catBtn.click(); await page.waitForTimeout(2500);
  await shot(page,'s05-category-picker');
  const ptxt = await page.locator('[role=dialog]').last().innerText();
  notes.push('CATEGORY PICKER:\n'+ptxt.replace(/\n{2,}/g,'\n').slice(0,900));
} catch(e){ notes.push('category picker: '+String(e).slice(0,150)); }
save('s05-create-full-a.json',{notes,errors});
console.log(notes.join('\n'));
console.log('buttons:', JSON.stringify(await page.locator('[role=dialog]').last().locator('button').allInnerTexts().then(a=>[...new Set(a.map(s=>s.trim()))])));
await browser.close();
