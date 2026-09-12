// Приёмка трека 1 глазами: сколько фильтров «Size» на /ru/store магазина мастера.
import { chromium } from 'playwright';
const [url, shot] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'ru-RU' });
await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await p.waitForTimeout(6000);
const visible = await p.evaluate(() => {
  const hits = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim();
    if (/^size$/i.test(t) || /^размер$/i.test(t)) {
      const r = el.getBoundingClientRect();
      hits.push({ text: t, tag: el.tagName, visible: r.width > 0 && r.height > 0, top: Math.round(r.top), left: Math.round(r.left) });
    }
  }
  return hits;
});
const products = await p.locator('a[href*="/products/"]').count();
console.log(JSON.stringify({ url, sizeLabels: visible, sizeVisible: visible.filter((h) => h.visible).length, productLinks: products }, null, 2));
await p.screenshot({ path: shot, fullPage: true });
await b.close();
