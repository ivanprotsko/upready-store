import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const nav = await timedGoto(page, PANEL + '/products');
await page.waitForTimeout(7000);
const t0=Date.now();
await page.click('a:has-text("Создать"), button:has-text("Создать")');
await page.waitForTimeout(5000);
const out = { openMs: Date.now()-t0, url: page.url(),
  txt: (await page.evaluate(()=>document.body.innerText)).slice(-3500),
  fields: await page.$$eval('input,textarea,select', e=>e.map(x=>({t:x.tagName+':'+(x.type||''), n:x.name, ph:x.placeholder, al:x.getAttribute('aria-label')}))),
  buttons: await page.$$eval('button', e=>e.map(x=>(x.innerText||'').trim()).filter(Boolean)), errors };
out.shot = await shot(page,'s05-create-form');
save('s05-create-form.json', out);
console.log(JSON.stringify({openMs:out.openMs,url:out.url,buttons:out.buttons,fields:out.fields},null,1).slice(0,3500));
console.log('--- TXT ---\n'+out.txt.replace(/\n{2,}/g,'\n'));
await browser.close();
