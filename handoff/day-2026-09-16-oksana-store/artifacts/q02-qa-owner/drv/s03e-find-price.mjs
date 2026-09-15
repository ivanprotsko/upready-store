import { launch, shot, timedGoto, waitUsable, save, PANEL } from './lib.mjs';
const PID='prod_01M2GRC5XMX78M72NZSXTM8B6X', VID='variant_01M2GRC6CJB0VZGW034SG084G0';
const { browser, page, errors } = await launch();
const res = {};
// 1) try known medusa routes
for (const p of [`/products/${PID}/prices`, `/products/${PID}/edit`, `/products/${PID}/variants/${VID}/prices`]) {
  const nav = await timedGoto(page, PANEL + p);
  await page.waitForTimeout(3000);
  const t = await page.evaluate(()=>document.body.innerText);
  res[p] = { status: nav.status, url: page.url(), has404: /не найден|not found|404/i.test(t), snippet: t.slice(-1200) };
}
// 2) open variant page and click the "..." on the Цены card
const nav = await timedGoto(page, PANEL + `/products/${PID}/variants/${VID}`);
await waitUsable(page, 'text=Цены', 60000).catch(()=>{});
await page.waitForTimeout(3500);
const menus = await page.$$('button[aria-haspopup="menu"], button:has(svg)');
res.menuCount = menus.length;
// find the card containing "Цены" and its menu button
const opened = await page.evaluate(() => {
  const hs = [...document.querySelectorAll('h1,h2,h3')].filter(h=>h.innerText.trim()==='Цены');
  if (!hs.length) return 'no Цены header';
  let el = hs[0]; for (let i=0;i<5 && el;i++){ const b = el.querySelector?.('button'); if (b) { b.click(); return 'clicked in depth '+i; } el = el.parentElement; }
  return 'no button near';
});
res.opened = opened;
await page.waitForTimeout(1500);
res.menuItems = await page.$$eval('[role=menuitem],[role=menu] *', els=>[...new Set(els.map(e=>(e.innerText||'').trim()).filter(t=>t&&t.length<60))]).catch(e=>String(e));
res.shot = await shot(page, 's03-price-menu');
save('s03-find-price.json', { res, errors });
console.log(JSON.stringify(res, null, 1).slice(0, 5000));
await browser.close();
