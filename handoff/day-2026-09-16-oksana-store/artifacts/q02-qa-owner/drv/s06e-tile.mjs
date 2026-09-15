import { launch, timedGoto, SHOP } from './lib.mjs';
const { browser, page } = await launch();
await timedGoto(page, SHOP + '/ru', {waitUntil:'load'}); await page.waitForTimeout(6000);
const r = await page.evaluate(()=>{
  const a=[...document.querySelectorAll('a')].filter(x=>/АСД/.test(x.innerText));
  return a.map(x=>({href:x.getAttribute('href'), text:x.innerText.replace(/\n+/g,'|').slice(0,40), imgs:[...x.querySelectorAll('img')].map(i=>i.src.slice(0,160))}));
});
console.log(JSON.stringify(r,null,1).slice(0,2000));
await browser.close();
