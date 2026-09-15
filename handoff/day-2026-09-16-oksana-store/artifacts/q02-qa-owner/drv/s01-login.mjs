import { launch, shot, timedGoto, waitUsable, save, creds, PANEL, STATE } from './lib.mjs';
const { browser, ctx, page, errors } = await launch({ storage: false });
const nav = await timedGoto(page, PANEL + '/');
const first = await waitUsable(page, 'input[name=email]', 60000);
await page.waitForTimeout(1200);
const out = { step: 1, nav, firstControl: first, title: await page.title(), url: page.url() };
out.loginScreenText = await page.evaluate(() => document.body.innerText.trim());
out.links = await page.$$eval('a', els => els.map(e => ({t:(e.innerText||'').trim(), h:e.getAttribute('href')})).filter(x=>x.t||x.h));
out.buttons = await page.$$eval('button', els => els.map(e => (e.innerText||e.getAttribute('aria-label')||'').trim()));
out.hasResetLink = /забыл|восстанов|reset|forgot/i.test(out.loginScreenText + JSON.stringify(out.links));
out.shotForm = await shot(page, 's01-login-form');
const { email, pass } = creds();
const t0 = Date.now();
await page.fill('input[name=email]', email);
await page.fill('input[name=password]', pass);
let steps = 1; // one screen
await Promise.all([
  page.waitForURL(u => !String(u).includes('/login'), { timeout: 60000 }).catch(()=>{}),
  page.click('button[type=submit], button:has-text("Продолжить")'),
]);
out.submitMs = Date.now() - t0;
const navReady = await waitUsable(page, 'a[href="/products"]', 60000);
out.dashboardReady = navReady;
out.totalLoginMs = nav.ms + out.submitMs + navReady.ms;
out.landedUrl = page.url();
out.dashTitle = await page.title();
out.screensToLogin = steps;
await page.waitForTimeout(1500);
out.shotAfter = await shot(page, 's01-after-login');
out.errors = errors;
await ctx.storageState({ path: STATE });
save('s01-login.json', out);
console.log(JSON.stringify({...out, loginScreenText: out.loginScreenText}, null, 1));
await browser.close();
