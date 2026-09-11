// Acceptor: walk one funnel from a cold start on the LIVE product. Stops BEFORE
// creating a shop (each creation mints a real tenant + LE cert — q-demo-tenants-cleanup).
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'https://shiftship.dev';
const funnel = process.argv[2] || '2';
const shots = process.env.SHOTS || '.';
const log = [];
const errors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
page.on('pageerror', e => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
page.on('response', r => { if (r.status() >= 400 && !r.url().includes('_rsc')) errors.push(`${r.status()} ${r.url().slice(0, 140)}`); });

const step = async (label, fn) => {
  try { await fn(); log.push(`OK   ${label} -> ${page.url()}`); }
  catch (e) { log.push(`FAIL ${label} -> ${page.url()} :: ${String(e.message || e).split('\n')[0].slice(0, 160)}`); throw e; }
};
const shot = async n => { await page.screenshot({ path: `${shots}/f${funnel}-${n}.png` }); };
const clickAndNavigate = async locator => {
  const before = page.url();
  await Promise.all([page.waitForURL(u => u.href !== before, { timeout: 20000 }), locator.click()]);
  await page.waitForLoadState('networkidle');
};

try {
  await step('cold start on the storefront', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector(`[data-testid="demo-funnel-${funnel}"]`);
  });

  await step('enter the funnel card', async () => {
    await clickAndNavigate(page.locator(`[data-testid="demo-funnel-${funnel}"]`));
  });

  for (let i = 0; i < 4; i++) {
    if (await page.locator('[data-testid="demo-pay-form"]').count()) break;
    await step(`intermediate step ${i + 1}`, async () => {
      const cta = page.locator('a[href], button').filter({ hasNotText: /назад|Shiftship|Открыть онбординг/i });
      const n = await cta.count();
      if (!n) throw new Error('no CTA on this step');
      const label = (await cta.first().innerText()).replace(/\s+/g, ' ').trim();
      const heading = (await page.locator('h1').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      log.push(`     screen "${heading}" — clicking "${label}" (${n} choices)`);
      await clickAndNavigate(cta.first());
    });
  }

  await step('checkout reached', async () => { await page.waitForSelector('[data-testid="demo-pay-form"]'); });
  const checkoutUrl = page.url();
  const summary = await page.locator('[data-testid="demo-pay-summary"]').innerText().catch(() => '(no summary)');
  log.push(`     SUMMARY :: ${summary.replace(/\s+/g, ' ').trim()}`);
  await shot('checkout');

  const fill = async number => {
    await page.goto(checkoutUrl, { waitUntil: 'networkidle' });
    await page.fill('#demo-card-number', number);
    await page.fill('#demo-card-expiry', '12 / 30');
    await page.fill('#demo-card-cvc', '123');
    await page.fill('#demo-card-holder', 'IVAN PROTSKO');
  };

  await step('a card ending 0000 shows a visible refusal', async () => {
    await fill('4000000000000000');
    await page.click('[data-testid="demo-pay-submit"]');
    await page.waitForSelector('[data-testid="demo-pay-declined"]', { timeout: 20000 });
  });
  log.push(`     DECLINE :: ${(await page.locator('[data-testid="demo-pay-declined"]').innerText()).replace(/\s+/g, ' ').trim()}`);
  await shot('declined');

  await step('a card ending 9999 offers a bank confirmation', async () => {
    await fill('4000000000009999');
    await page.click('[data-testid="demo-pay-submit"]');
    await page.waitForSelector('[data-testid="demo-pay-3ds"], [data-testid="demo-pay-confirm"]', { timeout: 20000 });
  });
  await shot('3ds');
  await step('the bank confirmation itself goes through', async () => {
    await page.click('[data-testid="demo-pay-confirm"]');
    await page.waitForURL(/onboarding/, { timeout: 30000 });
  });

  await step('4242 4242 4242 4242 goes through to onboarding', async () => {
    await fill('4242424242424242');
    await page.click('[data-testid="demo-pay-submit"]');
    await page.waitForURL(/onboarding/, { timeout: 30000 });
    await page.waitForSelector('[data-testid="demo-onboarding-wizard"]');
  });
  const paid = await page.locator('[data-testid="demo-onboarding-paid"]').innerText().catch(() => '(no paid banner)');
  log.push(`     PAID BANNER :: ${paid.replace(/\s+/g, ' ').trim()}`);
  await shot('onboarding');
} catch { /* recorded in log */ }

console.log(log.join('\n'));
console.log('\nERRORS (' + errors.length + '):\n' + errors.slice(0, 12).join('\n'));
await browser.close();
