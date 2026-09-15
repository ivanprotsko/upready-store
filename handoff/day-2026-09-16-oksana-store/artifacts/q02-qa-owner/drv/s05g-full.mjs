import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const notes=[]; const T0=Date.now();
await timedGoto(page, PANEL + '/products/create');
for (let i=0;i<40;i++){ if (await page.$$eval('input[name=title]', e=>e.length)) break; await page.waitForTimeout(1000); }
await page.waitForTimeout(1200);
let D = page.locator('[role=dialog]').last();
await D.locator('input[name=title]').fill('ТЕСТ QA — не покупать');
await D.locator('textarea[name=description]').fill('Временный товар живой приёмки q02. Будет удалён.');
await D.locator('input[type=file]').setInputFiles('/tmp/q02-test-photo.png');
await page.waitForTimeout(3000);
await D.locator('button:has-text("Продолжить")').click(); await page.waitForTimeout(3000);
// category
await D.locator('input[name=categories]').click(); await page.waitForTimeout(2000);
await shot(page,'s05-cat-popup');
const catTxt = await page.evaluate(()=>{const p=document.querySelector('[role=listbox],[cmdk-list],[data-radix-popper-content-wrapper]'); return p?p.innerText.slice(0,600):null;});
notes.push('CAT POPUP: '+JSON.stringify(catTxt));
const opt = page.locator('[role=option]:has-text("Мёд"), div:has-text("Мёд")').first();
try { await page.locator('[role=option]').filter({hasText:'Мёд'}).first().click({timeout:8000}); notes.push('category Мёд picked'); }
catch(e){ notes.push('category pick failed: '+String(e).slice(0,120)); }
await page.keyboard.press('Escape').catch(()=>{});
await page.waitForTimeout(1200);
await shot(page,'s05-step2-filled');
await D.locator('button:has-text("Продолжить")').click(); await page.waitForTimeout(3500);
await shot(page,'s05-step3-variants');
notes.push('STEP3:\n'+(await D.innerText()).replace(/\n{2,}/g,'\n').slice(0,2000));
const f3 = await page.evaluate(()=>{const ds=[...document.querySelectorAll('[role=dialog]')];const d=ds[ds.length-1];
  return [...d.querySelectorAll('input,button')].map(e=>({tag:e.tagName,type:e.type,name:e.name,ph:e.placeholder,txt:(e.innerText||'').trim().slice(0,30)}));});
notes.push('STEP3 CONTROLS: '+JSON.stringify(f3));
console.log(notes.join('\n'));
save('s05g.json',{notes,errors});
await browser.close();
