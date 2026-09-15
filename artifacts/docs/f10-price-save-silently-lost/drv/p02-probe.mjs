/**
 * Probe (rule 18h: symptom -> facts, not a hypothesis): runs the reported
 * scenario (Enter -> Backspace x10 -> type -> click "Сохранить", no blur of
 * its own) and records BOTH the DOM event order (blur/mousedown/submit) and
 * the request body the panel actually sends. Non-destructive when the bug is
 * present: the payload then carries the OLD price.
 *   node p02-probe.mjs <new-price>
 */
import { launch, open, shot, save, PANEL, PRODUCT, apiPrice } from './lib.mjs';

const NEW = process.argv[2] || '1400';
const { browser, ctx, page, errors } = await launch();

const reqs = [];
page.on('request', r => {
  if (r.method() !== 'GET' && /\/tenants\//.test(r.url())) {
    reqs.push({ method: r.method(), url: r.url(), body: (r.postData() || '').slice(0, 2000) });
  }
});
const resps = [];
page.on('response', async r => {
  if (r.request().method() !== 'GET' && /\/tenants\//.test(r.url())) {
    resps.push({ status: r.status(), url: r.url(), body: (await r.text().catch(() => '')).slice(0, 500) });
  }
});

await open(page, ctx, `/products/${PRODUCT}/prices`, { settle: 6000 });
await page.waitForSelector('[data-field]', { timeout: 60000 });
const before = await apiPrice(ctx).catch(e => ({ error: String(e) }));

// walk the anchor to the "Цена RUB" column, exactly as the QA run did
let tabs = 0;
for (; tabs < 200; tabs++) {
  const cols = await page.$$eval('th,[role=columnheader]', els => els.map(e => (e.innerText || '').trim()));
  if (cols.some(c => /Цена RUB/i.test(c))) break;
  await page.keyboard.press('Tab');
}
await page.waitForTimeout(500);

await page.evaluate(() => {
  window.__ev = [];
  const push = (t, extra) => window.__ev.push({ t, at: Math.round(performance.now()), ...extra });
  const desc = el => ({
    tag: el?.tagName,
    field: el?.getAttribute?.('data-field') || undefined,
    val: el?.value,
    txt: (el?.innerText || '').trim().slice(0, 24) || undefined,
  });
  document.addEventListener('blur', e => push('blur', desc(e.target)), true);
  document.addEventListener('focus', e => push('focus', desc(e.target)), true);
  document.addEventListener('mousedown', e => push('mousedown', desc(e.target)), true);
  document.addEventListener('click', e => push('click', desc(e.target)), true);
  document.addEventListener('submit', e => push('submit', desc(e.target)), true);
});

const anchor = await page.evaluate(() => ({
  tag: document.activeElement?.tagName,
  container: document.activeElement?.getAttribute?.('data-container-id'),
  field: document.activeElement?.getAttribute?.('data-field'),
}));

await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const editing = await page.evaluate(() => ({
  tag: document.activeElement?.tagName,
  field: document.activeElement?.getAttribute?.('data-field'),
  val: document.activeElement?.value,
}));
for (let i = 0; i < 10; i++) await page.keyboard.press('Backspace');
await page.waitForTimeout(300);
const cleared = await page.evaluate(() => ({ tag: document.activeElement?.tagName, val: document.activeElement?.value }));
await page.keyboard.type(NEW);
await page.waitForTimeout(400);
const typed = await page.evaluate(() => ({ tag: document.activeElement?.tagName, field: document.activeElement?.getAttribute?.('data-field'), val: document.activeElement?.value }));
const shotBefore = await shot(page, 'p02-before-save');

await page.click('button:has-text("Сохранить")');
await page.waitForTimeout(6000);

const events = await page.evaluate(() => window.__ev || []);
const after = await apiPrice(ctx).catch(e => ({ error: String(e) }));
const out = { PANEL, tabs, anchor, editing, cleared, typed, url: page.url(), reqs, resps, events, before, after, errors, shotBefore };
console.log(JSON.stringify(out, null, 1));
save('p02-probe.json', out);
await browser.close();
