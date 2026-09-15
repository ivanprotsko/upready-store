import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const notes=[];
await timedGoto(page, PANEL + '/products/create');
for (let i=0;i<40;i++){ if (await page.$$eval('input[name=title]', e=>e.length)) break; await page.waitForTimeout(1000); }
await page.waitForTimeout(1200);
const D = page.locator('[role=dialog]').last();
await D.locator('input[name=title]').fill('ТЕСТ QA — не покупать');
await D.locator('button:has-text("Продолжить")').click();
await page.waitForTimeout(3000);
// list all interactive controls in step 2 with their labels
const ctrls = await page.evaluate(()=>{
  const ds=[...document.querySelectorAll('[role=dialog]')]; const d=ds[ds.length-1];
  return [...d.querySelectorAll('button,input,[role=combobox],[role=switch]')].map(e=>({
    tag:e.tagName, role:e.getAttribute('role'), type:e.type, name:e.name,
    txt:(e.innerText||'').trim().slice(0,40),
    label:(e.closest('div')?.previousElementSibling?.innerText||'').trim().slice(0,50),
    aria:e.getAttribute('aria-label')
  }));
});
notes.push(JSON.stringify(ctrls,null,0));
console.log(notes.join('\n'));
save('s05f.json',{ctrls,errors});
await browser.close();
