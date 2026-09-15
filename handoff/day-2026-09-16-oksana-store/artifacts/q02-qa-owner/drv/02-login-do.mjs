import { launch, shot, timedGoto, waitUsable, creds, save, PANEL, STATE } from './lib.mjs';
import fs from 'node:fs';

const out = { step: 1 };
const { browser, ctx, page, errors } = await launch({ storage: false });
await timedGoto(page, PANEL + '/');
await waitUsable(page, 'input[name=email]', 60000);
const c = creds();
await page.fill('input[name=email]', c.email);
await page.fill('input[name=password]', c.pass);
const t0 = Date.now();
await page.click('button:has-text("Продолжить с Email")');
// wait for navigation away from /login
let landed = null;
try { await page.waitForURL(u => !String(u).includes('/login'), { timeout: 60000 }); landed = page.url(); }
catch (e) { landed = 'STILL: ' + page.url(); }
out.loginMs = Date.now() - t0;
out.landedUrl = landed;
// wait for the dashboard to become usable
const usable = await waitUsable(page, 'nav, aside, [role=navigation]', 60000);
out.navUsable = usable;
await page.waitForTimeout(3000);
out.totalMs = Date.now() - t0;
out.title = await page.title();
out.bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
out.sidebar = await page.evaluate(() => {
  const el = document.querySelector('nav, aside');
  return el ? el.innerText.slice(0, 2000) : null;
});
out.links = await page.$$eval('a[href]', els => [...new Set(els.map(e => e.getAttribute('href')))].slice(0, 80));
out.shots = [await shot(page, '01b-after-login')];
out.errors = errors.slice();
await ctx.storageState({ path: STATE });
save('02-login-done.json', out);
console.log(JSON.stringify({ loginMs: out.loginMs, totalMs: out.totalMs, landedUrl: out.landedUrl, title: out.title, navUsable: out.navUsable, links: out.links, errors: out.errors }, null, 1));
console.log('--- SIDEBAR ---\n' + out.sidebar);
console.log('--- BODY ---\n' + out.bodyText);
await browser.close();
