/**
 * The owner's scenario from the task, N times over, measured (rule 18f):
 * Enter -> Backspace x10 -> type -> click "Сохранить" WITHOUT pressing Enter
 * and without moving the focus by hand. Per run it records which cell was
 * edited (data-field), the DOM event order around the click, the request body
 * the panel sent, and the price the engine holds afterwards.
 *
 *   node p03-scenario.mjs --engine=chromium|webkit --base=1400 --runs=5
 *       [--commit=click|metaenter|enter] [--storefront] [--verify-ui] [--tag=name]
 *
 * --commit=click     the owner clicks "Сохранить" (the task's steps 1-4)
 * --commit=metaenter the owner saves from the keyboard, Cmd/Ctrl+Enter (KeyboundForm)
 * --commit=enter     Enter first (commits the cell), then the click
 */
import { launch, open, shot, save, apiPrices, anchorOnPriceCell, storefrontPrice, panelVariantPrice, PANEL, PRODUCT, PRICE_FIELD } from './lib.mjs';

const arg = (name, def) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const has = name => process.argv.includes(`--${name}`);

const ENGINE = arg('engine', 'chromium');
const BASE = Number(arg('base', '1400'));
const RUNS = Number(arg('runs', '1'));
const TAG = arg('tag', `${ENGINE}-${BASE}`);
const WITH_SF = has('storefront');
const COMMIT = arg('commit', 'click');
const VERIFY_UI = has('verify-ui');

const { browser, ctx, page, errors, engine } = await launch({ engine: ENGINE });
const runs = [];

for (let i = 0; i < RUNS; i++) {
  const value = String(BASE + i);
  const reqs = [];
  const onReq = r => {
    if (r.method() !== 'GET' && /\/tenants\/products\//.test(r.url())) {
      reqs.push({ method: r.method(), url: r.url().replace(PANEL, ''), body: (r.postData() || '').slice(0, 1500) });
    }
  };
  page.on('request', onReq);

  await open(page, ctx, engine, `/products/${PRODUCT}/prices`, { settle: 6000 });
  await page.waitForSelector(`input[data-field="${PRICE_FIELD}"]`, { timeout: 60000 }).catch(() => {});
  const before = await apiPrices(ctx);
  const { tabs, cellId } = await anchorOnPriceCell(page);

  await page.evaluate(() => {
    window.__ev = [];
    const push = (t, el) => window.__ev.push({
      t, at: Math.round(performance.now()), tag: el?.tagName,
      field: el?.getAttribute?.('data-field') || undefined,
      val: el?.value, txt: (el?.innerText || '').trim().slice(0, 16) || undefined,
    });
    for (const type of ['blur', 'focus', 'mousedown', 'click', 'submit']) {
      document.addEventListener(type, e => push(type, e.target), true);
    }
  });

  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const editing = await page.evaluate(() => ({ tag: document.activeElement?.tagName, field: document.activeElement?.getAttribute?.('data-field'), val: document.activeElement?.value }));
  for (let k = 0; k < 10; k++) await page.keyboard.press('Backspace');
  await page.waitForTimeout(250);
  await page.keyboard.type(value);
  await page.waitForTimeout(400);
  const typed = await page.evaluate(() => ({ tag: document.activeElement?.tagName, field: document.activeElement?.getAttribute?.('data-field'), val: document.activeElement?.value }));
  const shotTyped = await shot(page, `${TAG}-run${i + 1}-typed`);

  if (COMMIT === 'metaenter') {
    await page.keyboard.press('Meta+Enter');
  } else {
    if (COMMIT === 'enter') {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
    }
    await page.click('button:has-text("Сохранить")');
  }
  await page.waitForTimeout(6000);
  const events = await page.evaluate(() => window.__ev || []);
  const screen = await page.evaluate(() => ({ url: location.href, body: document.body.innerText.slice(0, 300) }));
  const shotAfter = await shot(page, `${TAG}-run${i + 1}-after`);
  const after = await apiPrices(ctx);
  page.off('request', onReq);

  const sent = reqs.map(r => { try { return JSON.parse(r.body).update?.[0]?.prices?.find(p => p.currency_code === 'rub')?.amount; } catch { return null; } }).filter(v => v != null);
  const panelAfterReload = VERIFY_UI ? await panelVariantPrice(page, ctx, engine, open) : null;
  const sf = WITH_SF ? await storefrontPrice(ctx, page) : null;
  const run = {
    n: i + 1, engine, commit: COMMIT, value: Number(value), tabs, cellId, editing, typed, sentRub: sent,
    beforeRub: before.rub, afterRub: after.rub,
    verdict: after.rub === Number(value) ? 'SAVED' : 'LOST',
    blurBeforeSubmit: (() => {
      const submit = events.find(e => e.t === 'submit');
      const blur = events.find(e => e.t === 'blur' && e.field === PRICE_FIELD);
      return submit && blur ? blur.at <= submit.at : false;
    })(),
    panelAfterReload,
    events, reqs, before, after, screen, storefront: sf, shots: [shotTyped, shotAfter],
  };
  runs.push(run);
  console.log(`run ${run.n}: typed=${run.typed.val} field=${run.typed.field} sentRub=${JSON.stringify(run.sentRub)} before=${run.beforeRub} after=${run.afterRub} -> ${run.verdict} (blurBeforeSubmit=${run.blurBeforeSubmit})${panelAfterReload ? ' panel=' + panelAfterReload : ''}${sf ? ' storefront=' + sf.price : ''}`);
}

const out = { PANEL, engine, commit: COMMIT, tag: TAG, runs, errors };
save(`p03-${TAG}.json`, out);
console.log(`\n${runs.filter(r => r.verdict === 'SAVED').length}/${runs.length} SAVED  (${TAG})`);
await browser.close();
