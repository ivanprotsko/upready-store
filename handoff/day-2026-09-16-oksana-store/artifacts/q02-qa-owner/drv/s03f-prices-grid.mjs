import { launch, shot, timedGoto, save, PANEL } from './lib.mjs';
const PID='prod_01M2GRC5XMX78M72NZSXTM8B6X';
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + `/products/${PID}/prices`);
await page.waitForTimeout(8000);
const cols = await page.$$eval('th, [role=columnheader]', els=>els.map(e=>(e.innerText||'').trim()).filter(Boolean));
const rubIdx = cols.findIndex(c=>/RUB/i.test(c));
// also: does the product page offer a link to this screen?
await timedGoto(page, PANEL + `/products/${PID}`);
await page.waitForTimeout(5000);
const menus = await page.evaluate(async () => {
  const out = [];
  const btns = [...document.querySelectorAll('button')].filter(b => (b.innerText||'').trim()==='' && b.querySelector('svg'));
  return { candidateMenuButtons: btns.length };
});
// open the header "..." of the product
let items = [];
try {
  const hdr = await page.$$('button[aria-haspopup="menu"]');
  for (const b of hdr.slice(0,3)) {
    await b.click(); await page.waitForTimeout(900);
    const it = await page.$$eval('[role=menuitem]', els=>els.map(e=>(e.innerText||'').trim()));
    items.push(it); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  }
} catch(e) { items.push(String(e).slice(0,120)); }
save('s03-prices-grid.json', { colCount: cols.length, cols, rubIdx, menus, items, errors });
console.log(JSON.stringify({colCount: cols.length, rubIdx, first12: cols.slice(0,12), menus, items}, null, 1));
await browser.close();
