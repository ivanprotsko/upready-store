/**
 * Which cell does the QA harness actually edit? It stopped tabbing as soon as
 * the "Цена RUB" HEADER was visible, and a virtualized column's header shows up
 * before the anchor reaches it. Non-destructive: enters edit mode, reads the
 * field, presses Escape, saves nothing.
 *   node p04-qa-anchor.mjs --runs=4
 */
import { launch, open, save, PANEL, PRODUCT } from './lib.mjs';

const RUNS = Number((process.argv.find(a => a.startsWith('--runs=')) || '--runs=4').split('=')[1]);
const { browser, ctx, page, errors, engine } = await launch({ engine: 'chromium' });
const runs = [];

for (let i = 0; i < RUNS; i++) {
  await open(page, ctx, engine, `/products/${PRODUCT}/prices`, { settle: 8000 });
  let tabs = 0;
  for (; tabs < 200; tabs++) {
    const cols = await page.$$eval('th,[role=columnheader]', els => els.map(e => (e.innerText || '').trim()));
    if (cols.some(c => /Цена RUB/i.test(c))) break;
    await page.keyboard.press('Tab');
  }
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const at = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    field: document.activeElement?.getAttribute?.('data-field'),
    val: document.activeElement?.value,
  }));
  await page.keyboard.press('Escape');
  runs.push({ n: i + 1, tabs, ...at });
  console.log(`run ${i + 1}: tabs=${tabs} field=${at.field} val=${JSON.stringify(at.val)}`);
}
save('p04-qa-anchor.json', { PANEL, runs, errors });
const fields = [...new Set(runs.map(r => r.field))];
console.log('\ndistinct fields hit by the QA loop:', JSON.stringify(fields));
await browser.close();
