// Acceptor wave 2: what a tenant storefront actually shows at its own address.
import { chromium } from 'playwright';

const host = process.argv[2];
const shots = process.env.SHOTS || '.';
const base = `https://${host}.shipshift.dev/`;
const errors = [];
const bad = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 160)));
page.on('response', r => { if (r.status() >= 400 && !r.url().includes('_rsc')) bad.push(`${r.status()} ${r.url().slice(0, 120)}`); });

const out = { host, base };
try {
  const resp = await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
  out.status = resp?.status();
  out.url = page.url();
  out.title = await page.title();
  out.theme = await page.getAttribute('html', 'data-theme');
  out.mode = await page.getAttribute('html', 'data-mode');
  out.lang = await page.getAttribute('html', 'lang');
  out.dom = await page.evaluate(() => {
    const t = s => [...document.querySelectorAll(`[data-testid="${s}"]`)];
    const txt = els => els.map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const imgs = [...document.images];
    return {
      productCards: t('home-product-card').length,
      productTitles: txt(t('home-product-card')).slice(0, 6),
      thumbs: t('home-product-card-thumbnail').length,
      categoryChips: txt(t('nav-category-chip')).slice(0, 20),
      categoryLinks: txt(t('nav-category-link')).slice(0, 20),
      categoryTiles: txt(t('category-tile')).slice(0, 20),
      hero: t('profile-hero').length + t('hero-gallery-slide').length,
      h1: txt([...document.querySelectorAll('h1')]).slice(0, 3),
      h2: txt([...document.querySelectorAll('h2')]).slice(0, 8),
      imgTotal: imgs.length,
      imgBroken: imgs.filter(i => !i.complete || i.naturalWidth === 0).length,
      imgSrcSample: imgs.slice(0, 4).map(i => (i.currentSrc || i.src).slice(0, 110)),
      bodyTextLen: (document.body.innerText || '').length,
    };
  });
  await page.screenshot({ path: `${shots}/${host}-fold.png` });
  await page.screenshot({ path: `${shots}/${host}-full.png`, fullPage: true });
} catch (e) {
  out.error = String(e.message || e).split('\n')[0].slice(0, 200);
}
out.consoleErrors = errors.slice(0, 6);
out.httpErrors = bad.slice(0, 6);
console.log(JSON.stringify(out, null, 1));
await browser.close();
