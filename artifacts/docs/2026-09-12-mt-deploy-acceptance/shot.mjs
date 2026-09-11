// Acceptor harness: open a URL with real eyes, capture above-the-fold frame + console.
import { chromium } from 'playwright';

const [url, name, scheme = 'light', vw = '1440', vh = '900'] = process.argv.slice(2);
if (!url || !name) { console.error('usage: shot.mjs <url> <name> [light|dark] [w] [h]'); process.exit(2); }

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: +vw, height: +vh },
  colorScheme: scheme,
  locale: 'ru-RU',
});
const page = await ctx.newPage();
const console_errors = [];
const failed = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console_errors.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
page.on('pageerror', e => console_errors.push(`pageerror: ${String(e).slice(0, 300)}`));
page.on('requestfailed', r => failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 160)}`));
const bad = [];
page.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(0, 160)}`); });

let resp;
try { resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); }
catch (e) { console.log(JSON.stringify({ url, name, error: String(e).slice(0, 300) }, null, 2)); await browser.close(); process.exit(1); }

await page.waitForTimeout(1200);
const dir = process.env.SHOTS || '.';
const file = `${dir}/${name}-${scheme}.png`;
await page.screenshot({ path: file });

const info = await page.evaluate(() => ({
  title: document.title,
  h1: [...document.querySelectorAll('h1,h2')].slice(0, 6).map(e => e.textContent.trim().slice(0, 90)),
  htmlDataTheme: document.documentElement.getAttribute('data-theme'),
  htmlClass: document.documentElement.className.slice(0, 120),
  bodyBg: getComputedStyle(document.body).backgroundColor,
  bodyFg: getComputedStyle(document.body).color,
  buttons: [...document.querySelectorAll('a[href],button')].slice(0, 24).map(e => (e.textContent || '').trim().slice(0, 50)).filter(Boolean),
  spinnerOnly: document.body.innerText.trim().length < 40,
  textLen: document.body.innerText.trim().length,
}));

console.log(JSON.stringify({
  url, finalUrl: page.url(), status: resp?.status(), name, scheme, file,
  ...info,
  console_errors, failed_requests: failed, bad_responses: bad,
}, null, 2));
await browser.close();
