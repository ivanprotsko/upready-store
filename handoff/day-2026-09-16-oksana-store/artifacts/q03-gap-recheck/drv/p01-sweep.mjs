import { launch, shot, save, creds, PANEL, STATE } from './lib.mjs';
const { browser, ctx, page, errors } = await launch({ storage: false });
const out = { started: new Date().toISOString(), screens: [] };

await page.goto(PANEL + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForSelector('input[name=email]', { timeout: 60000 });
const loginText = await page.evaluate(() => document.body.innerText.trim());
out.login = { hasResetLink: /забыл|восстанов|reset|forgot/i.test(loginText), text: loginText.slice(0, 300) };
out.shotLogin = await shot(page, 'p01-login');
const { email, pass } = creds();
await page.fill('input[name=email]', email);
await page.fill('input[name=password]', pass);
await Promise.all([
  page.waitForURL(u => !String(u).includes('/login'), { timeout: 90000 }).catch(() => {}),
  page.click('button[type=submit]'),
]);
await page.waitForSelector('a[href="/products"]', { timeout: 90000 });
await ctx.storageState({ path: STATE });
out.loggedIn = page.url();

const ROUTES = [
  ['home', '/'],
  ['products', '/products'],
  ['products-import', '/products/import'],
  ['product-attributes', '/product-attributes'],
  ['reviews', '/reviews'],
  ['journal', '/journal'],
  ['customers', '/customers'],
  ['orders', '/orders'],
  ['shipping', '/shipping'],
  ['pages', '/pages'],
  ['settings-requisites', '/settings/requisites'],
  ['settings-analytics', '/settings/analytics'],
  ['settings-branding', '/settings/branding'],
  ['settings-payments', '/settings/payments'],
  ['settings-domains', '/settings/domains'],
  ['settings-notifications', '/settings/notifications'],
];
for (const [name, route] of ROUTES) {
  const t0 = Date.now();
  const rec = { name, route };
  try {
    await page.goto(PANEL + route, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(4500);
    const body = await page.evaluate(() => document.body.innerText.trim());
    rec.ms = Date.now() - t0;
    rec.notFound = /Страница не найдена|Page not found|404/i.test(body.slice(0, 400));
    rec.rawKeys = (body.match(/\b[a-z][a-zA-Z]*\.[a-zA-Z]+\.[a-zA-Z.]+\b/g) || []).slice(0, 6);
    rec.text = body.slice(0, 900);
    rec.shot = await shot(page, 'p01-' + name);
  } catch (e) { rec.error = String(e).slice(0, 200); }
  out.screens.push(rec);
  console.log(`${name.padEnd(22)} ${rec.error ? 'ERR' : (rec.notFound ? '404' : 'ok ')} ${rec.ms || ''}ms`);
}
out.errors = errors.slice(0, 20);
save('p01-sweep.json', out);
await browser.close();
console.log('DONE');
