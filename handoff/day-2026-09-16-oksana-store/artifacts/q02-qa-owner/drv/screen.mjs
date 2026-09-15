// usage: node drv/screen.mjs <path> <shotname> [waitSelector] [extraWaitMs]
import { launch, shot, timedGoto, waitUsable, save, PANEL } from './lib.mjs';
const [p, name, sel, extra] = process.argv.slice(2);
const { browser, page, errors } = await launch();
const nav = await timedGoto(page, PANEL + p);
const t0 = Date.now();
let usable = null;
if (sel) usable = await waitUsable(page, sel, 90000);
await page.waitForTimeout(Number(extra || 2500));
const out = {
  path: p, nav, usable, sinceNavMs: nav.ms + (Date.now() - t0),
  url: page.url(),
  text: await page.evaluate(() => document.body.innerText.slice(0, 6000)),
  buttons: await page.$$eval('button', els => els.map(e => (e.innerText||e.getAttribute('aria-label')||'').trim()).filter(Boolean).slice(0,60)),
  inputs: await page.$$eval('input,select,textarea', els => els.map(e => ({t:e.tagName+':'+(e.type||''), n:e.name, ph:e.placeholder, al:e.getAttribute('aria-label')})).slice(0,60)),
  errors,
};
out.shot = await shot(page, name);
save(name + '.json', out);
console.log(JSON.stringify({path:p,nav,usable,sinceNavMs:out.sinceNavMs,url:out.url,errors,buttons:out.buttons}, null, 1));
console.log('--- TEXT ---\n' + out.text);
await browser.close();
