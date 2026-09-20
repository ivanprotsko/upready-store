import { launch, shot, timedGoto, save, PANEL, SHOP } from './lib.mjs';
const TITLE = process.argv[2]; const VARIANT = process.argv[3];
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/home-settings'); await page.waitForTimeout(8000);
await page.fill('#hero-title', TITLE);
let variantNote='(не менял)';
if (VARIANT) {
  // Первый экран selector button currently "Анонс"
  const b = page.locator('button:has-text("Анонс")').first();
  if (await b.count()) { await b.click(); await page.waitForTimeout(1200);
    const opts = await page.$$eval('[role=option],[role=menuitem]', e=>e.map(x=>(x.innerText||'').trim().slice(0,60)));
    variantNote = 'варианты первого экрана: '+JSON.stringify(opts);
    const pick = page.locator('[role=option],[role=menuitem]').filter({hasText: VARIANT}).first();
    if (await pick.count()) { await pick.click(); variantNote += ' -> выбран '+VARIANT; }
    await page.waitForTimeout(1000);
  }
}
const t0=Date.now();
await page.click('button:has-text("Сохранить")'); await page.waitForTimeout(6000);
console.log('saveMs', Date.now()-t0);
console.log(variantNote);
const after = (await page.evaluate(()=>document.body.innerText)).match(/Последнее сохранение:[^\n]*/);
console.log('panel:', after && after[0]);
await shot(page,'s07-saved-'+(VARIANT||'title'));
const t1=Date.now();
await timedGoto(page, SHOP + '/ru', {waitUntil:'load'}); await page.waitForTimeout(6000);
const body = await page.evaluate(()=>document.body.innerText);
console.log('storefrontHasTitle', body.includes(TITLE), 'checkedMs', Date.now()-t1);
console.log('HEAD:', body.replace(/\n{2,}/g,'\n').slice(0,400));
await shot(page,'s07-storefront-'+(VARIANT||'title'));
save('s07-change.json',{TITLE,VARIANT,variantNote,errors});
await browser.close();
