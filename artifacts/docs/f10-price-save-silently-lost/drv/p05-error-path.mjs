/**
 * The other half of the task's acceptance: when the value is NOT accepted, the
 * screen must say so in Russian and must NOT close.
 * The save request is answered with a server error (route interception), which is
 * the failure the owner would see on a real backend error.
 *   node p05-error-path.mjs [--status=500]
 */
import { launch, open, shot, save, apiPrices, anchorOnPriceCell, PANEL, PRODUCT, PRICE_FIELD } from './lib.mjs';

const STATUS = Number((process.argv.find(a => a.startsWith('--status=')) || '--status=500').split('=')[1]);
const { browser, ctx, page, errors, engine } = await launch({ engine: 'chromium' });

await open(page, ctx, engine, `/products/${PRODUCT}/prices`, { settle: 6000 });
await page.waitForSelector(`input[data-field="${PRICE_FIELD}"]`, { timeout: 60000 }).catch(() => {});
const before = await apiPrices(ctx);

await page.route('**/tenants/products/*/variants/batch', route =>
  route.fulfill({ status: STATUS, contentType: 'application/json', body: JSON.stringify({ message: 'Цена отклонена сервером (тест)', type: 'invalid_data' }) })
);

await anchorOnPriceCell(page);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
for (let k = 0; k < 10; k++) await page.keyboard.press('Backspace');
await page.keyboard.type('1499');
await page.waitForTimeout(400);
await page.click('button:has-text("Сохранить")');

const samples = [];
for (const ms of [600, 900, 1500, 2500]) {
  await page.waitForTimeout(ms === 600 ? 600 : ms - samples.at(-1).at);
  samples.push({
    at: ms,
    ...(await page.evaluate(() => ({
      toasters: document.querySelectorAll('[data-sonner-toaster],[data-sonner-toast]').length,
      text: Array.from(document.querySelectorAll('[data-sonner-toast]')).map(e => (e.innerText || '').replace(/\n/g, ' | ').trim()),
      bodyHasError: /Цена не сохранена/.test(document.body.innerText),
    }))),
  });
}
const shotToast = await shot(page, 'p05-error-toast');

const screen = await page.evaluate(() => ({
  url: location.href,
  dialogs: document.querySelectorAll('[role=dialog]').length,
  toast: Array.from(document.querySelectorAll('[role=status],[data-sonner-toast],li')).map(e => (e.innerText || '').trim()).filter(Boolean).slice(0, 8),
  body: document.body.innerText.slice(0, 1200),
}));
const shotPath = await shot(page, 'p05-error-path');
const after = await apiPrices(ctx);
const out = {
  PANEL, status: STATUS, before, after,
  drawerStillOpen: /\/prices$/.test(new URL(screen.url).pathname) && screen.dialogs > 0,
  errorVisible: /Цена не сохранена/.test(screen.body),
  serverMessageVisible: /Цена отклонена сервером/.test(screen.body),
  samples, shotToast, screen, shot: shotPath, errors,
};
console.log(JSON.stringify({ url: screen.url, dialogs: screen.dialogs, drawerStillOpen: out.drawerStillOpen, errorVisible: out.errorVisible, serverMessageVisible: out.serverMessageVisible, samples, beforeRub: before.rub, afterRub: after.rub, toast: screen.toast.slice(0, 4) }, null, 1));
save('p05-error-path.json', out);
await browser.close();
