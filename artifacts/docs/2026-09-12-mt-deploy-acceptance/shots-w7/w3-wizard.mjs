// Проход мастера «Онбординг без оплаты» на стенде трека 3: создаёт магазин и печатает JSON.
// node w3-wizard.mjs <base> <handle> <name> <shotsDir>
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8044';
const HANDLE = process.argv[3];
const NAME = process.argv[4] || 'Приёмка волны 7';
const SHOTS = process.argv[5] || '.';
if (!HANDLE) { console.error('usage: node w3-wizard.mjs <base> <handle> [name] [shotsDir]'); process.exit(2); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror: ' + String(e.message).slice(0, 200)));
const out = { handle: HANDLE, base: BASE };

try {
  await page.goto(`${BASE}/start`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByTestId('demo-onboarding-direct').click();
  await page.getByTestId('demo-onboarding-wizard').waitFor({ timeout: 60000 });

  const nameField = page.getByTestId('demo-shop-name');
  const handleField = page.getByTestId('demo-shop-handle');
  await nameField.click();
  await nameField.pressSequentially(NAME, { delay: 25 });
  await handleField.click();
  await handleField.fill('');
  await handleField.pressSequentially(HANDLE, { delay: 25 });
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  const step1 = page.getByTestId('demo-step1-next');
  try {
    await page.waitForFunction(
      () => { const b = document.querySelector('[data-testid="demo-step1-next"]'); return b && !b.disabled; },
      null, { timeout: 20000 },
    );
  } catch {
    out.step1Blocked = {
      name: await nameField.inputValue().catch(() => null),
      handle: await handleField.inputValue().catch(() => null),
      body: (await page.locator('[data-testid="demo-onboarding-wizard"]').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 700),
    };
    await page.screenshot({ path: `${SHOTS}/wizard-step1-blocked-${HANDLE}.png` });
  }
  await step1.click({ timeout: 15000 });

  out.email = `owner@${HANDLE}.test`;
  out.password = 'supersecret';
  await page.getByTestId('demo-owner-email').fill(out.email);
  await page.getByTestId('demo-owner-password').fill(out.password);
  await page.getByTestId('demo-step2-next').click();

  const presets = page.getByTestId('demo-presets');
  await presets.waitFor({ timeout: 30000 });
  const choices = presets.locator('button, [role="radio"], input[type="radio"]');
  out.presetCount = await choices.count();
  if (out.presetCount > 0) { await choices.first().click({ timeout: 10000 }).catch((e) => { out.presetClick = String(e.message).slice(0, 120); }); }
  await page.screenshot({ path: `${SHOTS}/wizard-step3-${HANDLE}.png` });

  await page.getByTestId('demo-create-shop').click();
  const done = page.getByTestId('demo-onboarding-done');
  const err = page.getByTestId('demo-onboarding-error');
  await Promise.race([
    done.waitFor({ timeout: 180000 }).then(() => { out.result = 'done'; }),
    err.waitFor({ timeout: 180000 }).then(() => { out.result = 'error'; }),
  ]);
  if (out.result === 'done') {
    out.doneText = (await done.innerText()).replace(/\s+/g, ' ').slice(0, 600);
    const link = page.getByTestId('demo-done-storefront');
    out.storefront = await link.getAttribute('href').catch(() => null);
    out.seededBadge = await page.locator('[data-testid="demo-catalog-seeded"]').innerText().catch(() => null);
  } else {
    out.errorText = (await err.innerText()).replace(/\s+/g, ' ').slice(0, 600);
  }
  await page.screenshot({ path: `${SHOTS}/wizard-result-${HANDLE}.png` });
} catch (e) {
  out.result = out.result || 'exception';
  out.exception = String(e.message).slice(0, 400);
  await page.screenshot({ path: `${SHOTS}/wizard-fail-${HANDLE}.png` }).catch(() => {});
  out.url = page.url();
  out.bodyHead = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
}
out.logs = logs;
console.log(JSON.stringify(out, null, 2));
await browser.close();
