// Волна 7, пункты 10-11: смена адреса магазина в панели тенанта.
// node w3-w7-address.mjs <email> <newHandle> <shotsDir> [--apply]
import { chromium } from 'playwright';

const [email, oldHandle, newHandle, shots] = process.argv.slice(2);
const APPLY = process.argv.includes('--apply');
const dump = async (scope) => scope.evaluate((el) => ({
  text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 1800),
  tids: [...new Set([...el.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')))].slice(0, 25),
  inputs: [...el.querySelectorAll('input')].map((i) => (i.getAttribute('data-testid') || i.name || i.placeholder || i.type) + '=' + i.value.slice(0, 30)).slice(0, 8),
  buttons: [...el.querySelectorAll('button')].map((e) => e.textContent.trim().slice(0, 40)).filter(Boolean).slice(0, 14),
}));

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
const out = { email, newHandle, apply: APPLY };
try {
  await p.goto('http://localhost:5185/login', { waitUntil: 'load', timeout: 120000 });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', 'supersecret');
  await p.keyboard.press('Enter');
  await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 60000 });
  await p.goto('http://localhost:5185/settings/domains', { waitUntil: 'load', timeout: 120000 });
  await p.waitForTimeout(5000);
  out.screen = await dump(p.locator('main'));
  await p.screenshot({ path: `${shots}/master-panel-domains.png`, fullPage: true });

  const changeBtn = p.getByRole('button', { name: /Change address|Сменить адрес|Изменить адрес/i }).first();
  out.changeButton = await changeBtn.count();
  if (out.changeButton) {
    await changeBtn.click();
    await p.waitForTimeout(2500);
    out.dialog = await dump(p.locator('body'));
    await p.screenshot({ path: `${shots}/master-address-dialog.png`, fullPage: true });

    const idx = await p.$$eval('input', (els, h) => els.findIndex((e) => e.value === h), oldHandle);
    out.handleFieldIndex = idx;
    const field = p.locator('input').nth(idx >= 0 ? idx : 0);
    await field.fill('');
    await field.pressSequentially(newHandle, { delay: 30 });
    await p.waitForTimeout(2500);
    out.afterType = await dump(p.locator('body'));
    await p.screenshot({ path: `${shots}/master-address-typed.png`, fullPage: true });

    if (APPLY) {
      const submit = p.getByRole('button', { name: /^\s*(Change address|Сменить адрес|Применить|Сохранить|Confirm|Apply)\s*$/i }).last();
      out.submitLabel = await submit.innerText().catch(() => null);
      await submit.click();
      await p.waitForTimeout(9000);
      out.afterApply = await dump(p.locator('main'));
      await p.screenshot({ path: `${shots}/master-address-applied.png`, fullPage: true });
    }
  }
} catch (e) {
  out.exception = String(e.message).slice(0, 300);
  out.url = p.url();
  await p.screenshot({ path: `${shots}/master-address-fail.png` }).catch(() => {});
}
console.log(JSON.stringify(out, null, 2));
await b.close();
