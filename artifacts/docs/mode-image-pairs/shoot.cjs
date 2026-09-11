const { chromium } = require('/opt/homebrew/lib/node_modules/playwright');
const path = require('path');
const W = '/Users/ivanprotsko/upready/worktrees/upready-store/feat/mode-image-pairs';
const OUT = path.join(W, 'artifacts/docs/mode-image-pairs');
const URL = 'file://' + path.join(W, 'artifacts/mockups/2026-09-12-mode-image-pairs/index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  // Липкая шапка макета иначе въезжает в середину кадра секции.
  await page.addStyleTag({ content: '.bar{position:static !important}' });

  const shots = [
    ['shot-s1-panel-hero.png', 'section:nth-of-type(1)'],
    ['shot-s2-panel-category.png', 'section:nth-of-type(2)'],
    ['shot-s3-panel-product.png', 'section:nth-of-type(3)'],
    ['shot-s4-storefront-light.png', 'section:nth-of-type(4)'],
    ['shot-s5-nopair-light.png', 'section:nth-of-type(5)'],
    ['shot-s6-click-moment.png', 'section:nth-of-type(6)'],
  ];
  for (const [file, sel] of shots) {
    await page.locator(sel).screenshot({ path: path.join(OUT, file) });
  }
  // the same two frames after one click — this is the pair the eye compares
  await page.click('#mt');
  await page.waitForTimeout(400);
  await page.locator('section:nth-of-type(4)').screenshot({ path: path.join(OUT, 'shot-s4-storefront-dark.png') });
  await page.locator('section:nth-of-type(5)').screenshot({ path: path.join(OUT, 'shot-s5-nopair-dark.png') });

  // how many image elements are actually in the DOM, and how many are painted in each mode
  const counts = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.modeimg img')];
    const shown = all.filter((i) => getComputedStyle(i).display !== 'none');
    return { total: all.length, painted: shown.length, mode: document.documentElement.dataset.mode };
  });
  console.log('DOM image layers:', JSON.stringify(counts));
  console.log('page errors:', errors.length ? JSON.stringify(errors) : 'none');
  await browser.close();
})().catch((e) => { console.error('SHOOT FAILED:', e.message); process.exit(1); });
