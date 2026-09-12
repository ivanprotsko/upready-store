// Волна 7, п.10: смена адреса с перехватом ответа API и тоста.
// node w3-w7-address2.mjs <email> <oldHandle> <newHandle> <shotsDir>
import { chromium } from 'playwright';
const [email, oldHandle, newHandle, shots] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
const calls = [];
p.on('response', async (r) => {
  const req = r.request();
  if (req.method() === 'GET') return;
  const body = await r.text().catch(() => '');
  calls.push({ method: req.method(), url: r.url().slice(0, 140), status: r.status(), body: body.replace(/\s+/g, ' ').slice(0, 300) });
});
const out = { oldHandle, newHandle };
try {
  await p.goto('http://localhost:5185/login', { waitUntil: 'load', timeout: 120000 });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', 'supersecret');
  await p.keyboard.press('Enter');
  await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 60000 });
  await p.goto('http://localhost:5185/settings/domains', { waitUntil: 'load', timeout: 120000 });
  await p.waitForTimeout(4000);
  await p.getByRole('button', { name: /^\s*Change address\s*$/i }).first().click();
  await p.waitForTimeout(1500);
  const field = p.locator('form input').first();
  await field.fill(newHandle);
  await p.waitForTimeout(800);
  const submit = p.locator('form button[type="submit"]').first();
  out.submitDisabled = await submit.isDisabled();
  calls.length = 0;
  await submit.click();
  await p.waitForTimeout(7000);
  out.calls = calls;
  out.toast = (await p.locator('[role="status"], [data-sonner-toast], .toast, [aria-live]').allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, ' ').slice(0, 200)).filter(Boolean);
  out.after = (await p.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 260);
  await p.screenshot({ path: `${shots}/master-address-apply2.png`, fullPage: true });
} catch (e) {
  out.exception = String(e.message).slice(0, 300);
  out.calls = calls;
  await p.screenshot({ path: `${shots}/master-address-apply2-fail.png` }).catch(() => {});
}
console.log(JSON.stringify(out, null, 2));
await b.close();
