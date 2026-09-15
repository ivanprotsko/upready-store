import { chromium } from 'playwright';
const dir = '/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/accept-t05-page-keys-1';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const shots = [
  ['ru-pages-delivery.png', 'http://oksana-t05.localhost:8141/ru/pages/delivery'],
  ['ru-pages-about-reserved.png', 'http://oksana-t05.localhost:8141/ru/pages/about'],
  ['ru-pages-unknown-404.png', 'http://oksana-t05.localhost:8141/ru/pages/unknown-slug'],
  ['ru-home-footer.png', 'http://oksana-t05.localhost:8141/ru'],
];
for (const [name, url] of shots) {
  const p = await ctx.newPage();
  const res = await p.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await p.screenshot({ path: `${dir}/${name}`, fullPage: true });
  const footer = await p.locator('footer').first().innerText().catch(() => '(no footer)');
  console.log(`${name} status=${res.status()} footerHasDelivery=${footer.includes('Доставка')} footerHasAbout=${footer.includes('О магазине')}`);
  await p.close();
}
await b.close();
