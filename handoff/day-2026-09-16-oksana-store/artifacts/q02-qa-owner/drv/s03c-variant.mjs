import { launch, shot, timedGoto, waitUsable, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch();
const nav = await timedGoto(page, PANEL + '/products/prod_01M2GRC5XMX78M72NZSXTM8B6X');
await waitUsable(page, 'table', 90000); await page.waitForTimeout(3500);
// click the variant row
const before = page.url();
await page.click('table tbody tr td:nth-child(2)').catch(async()=>{ await page.click('table tbody tr'); });
await page.waitForTimeout(4000);
const out = { nav, before, after: page.url(), txt: (await page.evaluate(()=>document.body.innerText)).slice(0,4000),
  buttons: await page.$$eval('button', e=>e.map(x=>(x.innerText||'').trim()).filter(Boolean)),
  links: await page.$$eval('a', e=>e.map(x=>x.getAttribute('href')).filter(h=>h&&h.includes('variant'))) , errors };
out.shot = await shot(page, 's03-variant');
save('s03-variant.json', out);
console.log(JSON.stringify({after:out.after, buttons:out.buttons, links:out.links, errors}, null, 1));
console.log('---\n'+out.txt.slice(0,2500));
await browser.close();
