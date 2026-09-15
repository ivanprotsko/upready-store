import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
for (let round=0; round<3; round++){
  await timedGoto(page, PANEL + '/products/prod_01M2GRC5XMX78M72NZSXTM8B6X/media');
  await page.waitForTimeout(6000);
  // thumbnails at the bottom: click the one whose img src has 1789428
  const thumbs = await page.$$('img');
  let target = null;
  for (const t of thumbs) { const s = await t.getAttribute('src')||''; if (/1789428/.test(s)) { target = t; break; } }
  if (!target) { console.log('round',round,'no test image left'); break; }
  await target.click({force:true}); await page.waitForTimeout(1500);
  const del = await page.$('button[aria-label="Удалить текущее изображение"], button:has-text("Удалить текущее изображение")');
  console.log('round',round,'delBtn?',!!del);
  if (!del) { const btns = await page.$$eval('button', e=>e.map(x=>x.getAttribute('aria-label')||x.innerText)); console.log(JSON.stringify(btns)); break; }
  await del.click(); await page.waitForTimeout(1500);
  const conf = await page.$('button:has-text("Удалить"), button:has-text("Подтвердить")');
  if (conf) { await conf.click().catch(()=>{}); }
  await page.waitForTimeout(4000);
  console.log('round',round,'done');
}
await timedGoto(page, PANEL + '/products/prod_01M2GRC5XMX78M72NZSXTM8B6X/media');
await page.waitForTimeout(6000);
const left = await page.$$eval('img', els=>els.map(e=>e.src).filter(s=>/1789428/.test(s)).length);
console.log('testImagesLeft', left);
await shot(page,'s04-cleanup-final');
save('s04-cleanup2.json',{left, errors});
await browser.close();
