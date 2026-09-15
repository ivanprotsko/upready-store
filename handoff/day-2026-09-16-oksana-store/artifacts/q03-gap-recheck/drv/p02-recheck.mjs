import { launch, shot, save, PANEL } from './lib.mjs';
const { browser, page, errors } = await launch({ storage: true });
const out = [];
for (const [name, route, wait] of [['shipping','/shipping',12000],['orders','/orders',12000],['products-import','/products/import',12000],['home','/',12000]]) {
  const rec = { name, route };
  await page.goto(PANEL + route, { waitUntil: 'networkidle', timeout: 120000 }).catch(e => rec.err = String(e).slice(0,150));
  await page.waitForTimeout(wait);
  rec.url = page.url();
  rec.text = (await page.evaluate(() => document.body.innerText.trim())).slice(0, 1400);
  rec.shot = await shot(page, 'p02-' + name);
  out.push(rec);
  console.log('### ' + name + ' url=' + rec.url + '\n' + rec.text.replace(/\n+/g, ' | ').slice(0, 1200) + '\n');
}
save('p02-recheck.json', { out, errors: errors.slice(0,10) });
await browser.close();
