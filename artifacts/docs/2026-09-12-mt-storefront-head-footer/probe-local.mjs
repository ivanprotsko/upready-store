// Pre-deploy acceptance: the LOCAL build (fix/mt-storefront-head-footer) serves the HTML
// for https://<host>.shipshift.dev/…, data comes from the PROD backend (GET only).
// Usage: SHOTS=<dir> LOCAL=http://127.0.0.1:8040 node probe-local.mjs <host>
import { chromium } from 'playwright';

const host = process.argv[2];
const shots = process.env.SHOTS || '.';
const local = process.env.LOCAL || 'http://127.0.0.1:8040';
const fqdn = `${host}.shipshift.dev`;
const errors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
await ctx.route('**/*', async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  if (u.hostname !== fqdn) return route.continue();
  try {
    const r = await route.fetch({
      url: `${local}${u.pathname}${u.search}`,
      headers: { ...req.headers(), host: fqdn, 'x-forwarded-proto': 'https', 'x-forwarded-host': fqdn },
      maxRedirects: 0,
    });
    const headers = { ...r.headers() };
    if (headers.location) headers.location = headers.location.replace(local, `https://${fqdn}`);
    await route.fulfill({ response: r, headers });
  } catch (e) {
    errors.push('route: ' + String(e.message || e).slice(0, 160));
    await route.abort();
  }
});
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 160)));

const extract = () => ({
  canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
  hreflangHosts: [...new Set([...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(l => new URL(l.href).host))],
  hreflangCount: document.querySelectorAll('link[rel="alternate"][hreflang]').length,
  jsonLdUrls: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => (s.textContent.match(/https?:\/\/[^"\/]+/g) || [])[0]).filter(Boolean),
  heroSubtitle: (document.querySelector('[data-testid="profile-hero"] p, [data-testid="profile-hero"] span, [data-testid^="home-hero"] p')?.innerText || '').trim().slice(0, 120),
  h1: (document.querySelector('h1')?.innerText || '').trim().slice(0, 80),
  footerHeadings: [...document.querySelectorAll('footer span, footer h2, footer h3')].map(e => e.innerText.trim()).filter(t => t && t.length < 30).slice(0, 8),
  footerExternal: [...document.querySelectorAll('footer a[href^="http"]')].map(a => new URL(a.href).host).filter(h => !h.endsWith('shipshift.dev')),
  footerCollections: [...document.querySelectorAll('footer a[href*="/collections/"]')].map(a => a.innerText.trim()),
  footerText: (document.querySelector('footer')?.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
  regionButtons: [...document.querySelectorAll('[data-testid="nav-region-select-button"], [data-testid="nav-country-select-button"]')].map(b => ({ label: b.getAttribute('aria-label'), text: b.innerText.trim(), flag: !!b.querySelector('img') })),
  filterLabels: [...document.querySelectorAll('[data-testid="refinement-list"] button, [data-testid="refinement-list"] label, main button')].map(b => b.innerText.trim()).filter(t => /colour|colourway|default option|цвет|расцветка|размер|size|ёмкость|capacity/i.test(t)).slice(0, 12),
  bodyHasDefaultOption: /Default option/.test(document.body.innerText),
});

const out = { host: fqdn };
try {
  const r1 = await page.goto(`https://${fqdn}/ru`, { waitUntil: 'networkidle', timeout: 90000 });
  out.home = { status: r1?.status(), url: page.url(), ...(await page.evaluate(extract)) };
  await page.screenshot({ path: `${shots}/${host}-local-home.png` });
  const r2 = await page.goto(`https://${fqdn}/ru/store`, { waitUntil: 'networkidle', timeout: 90000 });
  out.store = { status: r2?.status(), ...(await page.evaluate(extract)) };
  await page.screenshot({ path: `${shots}/${host}-local-store.png` });
  const r3 = await page.goto(`https://${fqdn}/en`, { waitUntil: 'networkidle', timeout: 90000 });
  out.en = { status: r3?.status(), canonical: await page.evaluate(() => document.querySelector('link[rel="canonical"]')?.href), heroSubtitle: (await page.evaluate(extract)).heroSubtitle, footerText: (await page.evaluate(extract)).footerText.slice(0, 160) };
} catch (e) {
  out.error = String(e.message || e).split('\n')[0].slice(0, 200);
}
out.errors = errors.slice(0, 8);
console.log(JSON.stringify(out, null, 1));
await browser.close();
