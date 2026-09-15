import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const notes=[]; const t0=Date.now();
await timedGoto(page, PANEL + '/products/create');
for (let i=0;i<40;i++){ const n=await page.$$eval('input[name=title]', e=>e.length); if(n) break; await page.waitForTimeout(1000);}
await page.waitForTimeout(1500);
await page.fill('input[name=title]', 'ТЕСТ QA — не покупать');
await page.fill('textarea[name=description]', 'Временный товар, созданный живой приёмкой q02. Будет удалён.');
const fi = await page.$('input[type=file]'); await fi.setInputFiles('/tmp/q02-test-photo.png');
await page.waitForTimeout(3500);
await shot(page,'s05-step1-details');
// step 2 Организация
await page.click('button:has-text("Продолжить")'); await page.waitForTimeout(3500);
const step2 = await page.evaluate(()=>{const d=document.querySelector('[role=dialog]'); return (d||document.body).innerText.slice(0,2500);});
notes.push('STEP2:\n'+step2.replace(/\n{2,}/g,'\n'));
await shot(page,'s05-step2-organization');
save('s05-create-progress.json',{notes, errors});
console.log(notes.join('\n'));
console.log('buttons', JSON.stringify(await page.$$eval('[role=dialog] button', e=>[...new Set(e.map(x=>(x.innerText||'').trim()))])));
console.log('inputs', JSON.stringify(await page.$$eval('[role=dialog] input', e=>e.map(x=>({n:x.name,ph:x.placeholder,t:x.type})))));
// keep the browser state for the next script? no: continue here
await page.waitForTimeout(500);
await browser.close();
