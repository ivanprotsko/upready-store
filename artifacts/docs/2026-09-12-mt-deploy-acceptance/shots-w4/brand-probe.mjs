// Acceptor: where do flags/4x3 and medusa.svg actually sit on a tenant storefront, and are they visible?
import { chromium } from 'playwright';
const hosts = process.argv.slice(2);
const browser = await chromium.launch();
const out = [];
for (const host of hosts) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.goto(`https://${host}.shipshift.dev/ru`, { waitUntil: 'networkidle', timeout: 60000 });
  const found = await page.evaluate(() => {
    const chain = el => { const p = []; let n = el; while (n && n.tagName && p.length < 6) { p.push(n.tagName.toLowerCase() + (n.getAttribute?.('data-testid') ? `[${n.getAttribute('data-testid')}]` : '')); n = n.parentElement; } return p.join(' < '); };
    const pick = m => [...document.images].filter(i => i.currentSrc.includes(m) || i.src.includes(m)).map(i => {
      const r = i.getBoundingClientRect();
      const cs = getComputedStyle(i);
      return { src: (i.currentSrc || i.src).split('/').slice(3).join('/'), box: `${Math.round(r.width)}x${Math.round(r.height)} @ ${Math.round(r.x)},${Math.round(r.y)}`, visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0, alt: i.alt, chain: chain(i) };
    });
    const nearFlag = [...document.images].filter(i => (i.currentSrc || i.src).includes('flags/4x3')).map(i => (i.closest('div,header,nav,span,button')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60));
    return { flags: pick('flags/4x3'), medusa: pick('medusa.svg'), flagNeighbourText: nearFlag };
  });
  out.push({ host, ...found });
  await page.screenshot({ path: `${process.env.SHOTS}/${host}-header.png`, clip: { x: 0, y: 0, width: 1280, height: 220 } });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${process.env.SHOTS}/${host}-footer.png` });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
