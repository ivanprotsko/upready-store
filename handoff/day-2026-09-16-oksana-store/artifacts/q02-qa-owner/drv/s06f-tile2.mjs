import { launch, shot, timedGoto, SHOP } from './lib.mjs';
const { browser, page } = await launch();
for (const p of ['/ru','/ru/store','/ru/categories/asd-cherkashino']){
  const nav = await timedGoto(page, SHOP+p, {waitUntil:'load'}); await page.waitForTimeout(5000);
  const hits = await page.evaluate(()=>[...document.querySelectorAll('img')].map(i=>i.src).filter(s=>/1789430173564/.test(s)));
  const catLinks = await page.evaluate(()=>[...document.querySelectorAll('a[href*="/categories/"]')].map(a=>({t:a.innerText.replace(/\n+/g,'|').slice(0,30), imgs:[...a.querySelectorAll('img')].length})));
  console.log(p, 'status', nav.status, 'ms', nav.ms, 'testImgOnPage', hits.length, 'catLinks', JSON.stringify(catLinks.slice(0,12)));
  await shot(page, 's06-sf-'+p.replace(/\//g,'_'));
}
await browser.close();
