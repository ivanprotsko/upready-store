import { launch, shot, timedGoto, waitUsable, creds, save, PANEL, STATE } from './lib.mjs';
import fs from 'node:fs';

const out = { step: 1, panel: PANEL };
const { browser, ctx, page, errors } = await launch({ storage: false });

const nav = await timedGoto(page, PANEL + '/', { waitUntil: 'domcontentloaded' });
out.nav = nav;
// wait for anything interactive
const w = await waitUsable(page, 'input, button', 60000);
out.firstControl = w;
await page.waitForTimeout(1500);
out.title = await page.title();
out.langSample = await page.evaluate(() => document.body.innerText.slice(0, 1200));
out.inputs = await page.$$eval('input', els => els.map(e => ({ type: e.type, name: e.name, placeholder: e.placeholder, aria: e.getAttribute('aria-label'), id: e.id })));
out.buttons = await page.$$eval('button, a[href]', els => els.slice(0, 40).map(e => ({ tag: e.tagName, text: (e.innerText||'').trim().slice(0,80), href: e.getAttribute('href') })));
out.url = page.url();
out.shots = [await shot(page, '01-login-form')];
out.errors = errors.slice();
save('01-login-form.json', out);
console.log(JSON.stringify({ nav: out.nav, firstControl: out.firstControl, title: out.title, url: out.url, inputs: out.inputs, buttons: out.buttons.filter(b=>b.text), errors: out.errors }, null, 1));
console.log('--- TEXT ---\n' + out.langSample);
await browser.close();
