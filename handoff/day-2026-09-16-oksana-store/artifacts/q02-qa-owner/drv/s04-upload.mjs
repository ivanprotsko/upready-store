import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const t0=Date.now();
await timedGoto(page, PANEL + '/products/prod_01M2GRC5XMX78M72NZSXTM8B6X/media');
await page.waitForTimeout(5000);
await page.click('a:has-text("Редактировать"), button:has-text("Редактировать"), [role=button]:has-text("Редактировать")');
await page.waitForTimeout(3000);
const step1 = await page.evaluate(()=>document.body.innerText.slice(-1500));
await shot(page,'s04-media-editor');
const fi = await page.$('input[type=file]');
console.log('fileInput?', !!fi);
console.log('EDITOR TEXT:', step1.replace(/\n{2,}/g,'\n').slice(-800));
if (fi) {
  const tu = Date.now();
  await fi.setInputFiles('/tmp/q02-test-photo.png');
  await page.waitForTimeout(4000);
  console.log('uploadUiMs', Date.now()-tu);
  await shot(page,'s04-after-pick');
  const btn = await page.$('button:has-text("Сохранить")');
  console.log('saveBtn?', !!btn);
  if (btn) { await btn.click(); await page.waitForTimeout(8000); }
  await shot(page,'s04-after-save');
  console.log('url', page.url());
  console.log('TXT', (await page.evaluate(()=>document.body.innerText)).slice(-500).replace(/\n{2,}/g,'\n'));
}
save('s04-upload.json',{step1, totalMs: Date.now()-t0, url: page.url(), errors});
console.log('errors', JSON.stringify(errors));
await browser.close();
