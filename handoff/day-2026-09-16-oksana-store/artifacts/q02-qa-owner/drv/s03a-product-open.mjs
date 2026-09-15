import { launch, shot, timedGoto, waitUsable, save, PANEL } from './lib.mjs';
const id = process.argv[2];
const { browser, page, errors } = await launch();
const nav = await timedGoto(page, PANEL + '/products/' + id);
const u = await waitUsable(page, 'h1, h2', 90000);
await page.waitForTimeout(4000);
const out = { nav, usable: u, url: page.url(),
  text: await page.evaluate(() => document.body.innerText.slice(0, 7000)),
  buttons: await page.$$eval('button', els => els.map(e=>(e.innerText||e.getAttribute('aria-label')||'').trim()).filter(Boolean)),
  links: await page.$$eval('a', els => els.map(e=>({t:(e.innerText||'').trim().slice(0,40), h:e.getAttribute('href')})).filter(x=>x.h&&!x.h.startsWith('/products?')).slice(0,40)),
  errors };
out.shot = await shot(page, 's03-product-' + (process.argv[3]||'open'));
save('s03-product-open.json', out);
console.log(JSON.stringify({nav:out.nav,usable:out.usable,buttons:out.buttons,links:out.links,errors}, null, 1));
console.log('--- TEXT ---\n' + out.text);
await browser.close();
