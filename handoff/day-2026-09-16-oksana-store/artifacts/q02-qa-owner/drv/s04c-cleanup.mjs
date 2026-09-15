import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/products/prod_01M2GRC5XMX78M72NZSXTM8B6X?view=edit');
await page.waitForTimeout(6000);
// open the media edit drawer
await page.click('a:has-text("Редактировать"), button:has-text("Редактировать")').catch(()=>{});
await page.waitForTimeout(3000);
let removed = 0;
for (let round=0; round<4; round++){
  const idx = await page.evaluate(() => {
    const imgs=[...document.querySelectorAll('img')];
    const i = imgs.findIndex(x=>/17894287|1789428/.test(x.src));
    return i;
  });
  if (idx < 0) break;
  // hover over that thumbnail and find its delete control
  const handles = await page.$$('img');
  const h = handles[idx];
  await h.hover(); await page.waitForTimeout(600);
  const card = await h.evaluateHandle(el => el.closest('div[class*="group"], li, div'));
  const btn = await card.asElement()?.$('button');
  if (btn) { await btn.click({force:true}); await page.waitForTimeout(800); removed++; }
  else break;
  // maybe a menu appears
  const del = await page.$('[role=menuitem]:has-text("Удалить"), button:has-text("Удалить")');
  if (del) { await del.click().catch(()=>{}); await page.waitForTimeout(800); }
}
await shot(page,'s04-cleanup');
const left = await page.evaluate(()=>[...document.querySelectorAll('img')].filter(x=>/1789428/.test(x.src)).length);
console.log('removedClicks',removed,'testImgsLeft',left);
const sv = await page.$('button:has-text("Сохранить")');
if (sv) { await sv.click(); await page.waitForTimeout(7000); }
console.log('url', page.url());
save('s04-cleanup.json',{removed,left,errors});
await browser.close();
