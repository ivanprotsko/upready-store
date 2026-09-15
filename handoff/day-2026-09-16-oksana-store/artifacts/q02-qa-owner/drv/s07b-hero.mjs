import { launch, shot, timedGoto, save, PANEL, SHOP } from './lib.mjs';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/home-settings'); await page.waitForTimeout(7000);
const fields = await page.$$eval('input,textarea', e=>e.map((x,i)=>({i,tag:x.tagName,type:x.type,name:x.name,id:x.id,v:(x.value||'').slice(0,60),lbl:(x.closest('div')?.previousElementSibling?.innerText||x.labels?.[0]?.innerText||'').trim().slice(0,30)})));
console.log('FIELDS', JSON.stringify(fields,null,0));
save('s07-fields.json',{fields,errors});
await browser.close();
