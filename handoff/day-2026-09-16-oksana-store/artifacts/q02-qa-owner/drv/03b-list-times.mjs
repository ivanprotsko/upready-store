import { launch, timedGoto, waitUsable, save, PANEL } from './lib.mjs';
const runs = [];
for (let i = 0; i < 3; i++) {
  const { browser, page } = await launch();
  const nav = await timedGoto(page, PANEL + '/products');
  const u = await waitUsable(page, 'a[href^="/products/prod_"], table tbody tr', 120000);
  const rows = await page.$$eval('tbody tr', els => els.length).catch(()=>-1);
  runs.push({ i, navMs: nav.ms, tableMs: u.ms, totalMs: nav.ms + u.ms, ok: u.ok, rows });
  console.log(JSON.stringify(runs[runs.length-1]));
  await browser.close();
}
save('03b-list-times.json', runs);
