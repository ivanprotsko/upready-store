import { launch, shot, timedGoto, waitUsable, save, PANEL } from './lib.mjs';
const url = '/products/prod_01M2GRC5XMX78M72NZSXTM8B6X/variants/variant_01M2GRC6CJB0VZGW034SG084G0/edit';
const { browser, page, errors } = await launch();
const nav = await timedGoto(page, PANEL + url);
await waitUsable(page, 'input', 60000); await page.waitForTimeout(3500);
const out = { nav, url: page.url(),
  txt: (await page.evaluate(()=>document.body.innerText)).slice(0,4000),
  inputs: await page.$$eval('input,textarea,select', els=>els.map(e=>({t:e.tagName+':'+(e.type||''), n:e.name, ph:e.placeholder, v:(e.value||'').slice(0,40), al:e.getAttribute('aria-label')}))),
  buttons: await page.$$eval('button', e=>e.map(x=>(x.innerText||'').trim()).filter(Boolean)), errors };
out.shot = await shot(page, 's03-price-edit-form');
save('s03-price-edit-form.json', out);
console.log(JSON.stringify({nav:out.nav,url:out.url,inputs:out.inputs,buttons:out.buttons,errors}, null, 1));
console.log('---\n'+out.txt);
await browser.close();
