// playwright is not a dependency of this repository; the main checkout has it
// installed and the browser binaries cached, so it is loaded from there.
const { chromium } = await import('/Users/ivanprotsko/upready/projects/upready-store/node_modules/playwright/index.mjs');

const OUT = '/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-scheduler-ops/artifacts/docs/w16-mp-scheduler-ops';
const PANEL = 'http://localhost:5316';
const TAG = process.argv[2] ?? 'sync';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 1200 } });
const p = await ctx.newPage();

await p.goto(`${PANEL}/login`, { waitUntil: 'networkidle' });
await p.fill('input[name="email"]', 'owner@cherkashino.example');
await p.fill('input[type="password"]', 'supersecret');
await p.click('button[type="submit"]');
await p.waitForTimeout(4000);
console.log('after login:', p.url());

await p.goto(`${PANEL}/settings/marketplaces/sync`, { waitUntil: 'networkidle' });
await p.waitForTimeout(6000);
console.log('sync url:', p.url());

// The panel scrolls in an INNER container, so fullPage lies (w01's finding).
// Ask the DOM for the real height and open the page at it.
const h = await p.evaluate(() => {
  const all = [...document.querySelectorAll('*')];
  const box = all.filter((el) => el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 300);
  return Math.max(document.body.scrollHeight, ...box.map((el) => el.scrollHeight), 1200);
});
console.log('measured scroll height:', h);
await p.setViewportSize({ width: 1600, height: Math.min(h + 120, 4000) });
await p.waitForTimeout(1500);

await p.screenshot({ path: `${OUT}/${TAG}-screen.png` });

const txt = await p.locator('body').innerText();
for (const probe of [
  'Синхронизация',
  'ни разу не запускалась',
  'Wildberries',
  'Ozon',
  'ошибка',
  'истекает через',
  'ключ не сохранён',
  '401',
]) {
  console.log(`  has «${probe}»:`, txt.includes(probe));
}
await b.close();
