import { launch, timedGoto, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const out=[];
for (const p of ['/customers','/reviews','/analytics','/branding','/journal','/import','/settings','/campaigns','/inventory','/settings/store']){
  const nav = await timedGoto(page, PANEL+p); await page.waitForTimeout(4500);
  const t = (await page.evaluate(()=>document.body.innerText)).replace(/\n{2,}/g,'\n');
  const tail = t.slice(t.indexOf('Доставка')+10, t.indexOf('Доставка')+260).replace(/\n/g,' / ');
  out.push({p, status:nav.status, url:page.url(), tail});
  console.log(p, '|', nav.status, '|', page.url().replace('https://panel-store.upready.dev',''), '|', tail.slice(0,150));
}
save('s11-probe.json',{out,errors});
await browser.close();
