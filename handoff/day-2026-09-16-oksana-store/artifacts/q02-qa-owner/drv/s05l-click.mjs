import { launch, shot, timedGoto, save, SHOP } from './lib.mjs';
const { browser, page, errors } = await launch();
await timedGoto(page, SHOP + '/ru/store', {waitUntil:'load'});
await page.waitForTimeout(6000);
const card = await page.evaluate(()=>{
  const a=[...document.querySelectorAll('a')].find(x=>/ТЕСТ QA/.test(x.innerText));
  return a? {href:a.getAttribute('href'), text:a.innerText.replace(/\n+/g,' | ')} : null;
});
console.log('CARD', JSON.stringify(card));
if (card){
  const t0=Date.now();
  const r = await page.goto(SHOP + card.href, {waitUntil:'load'}).catch(e=>({status:()=>'ERR',e}));
  await page.waitForTimeout(4000);
  console.log('status', r.status && r.status(), 'ms', Date.now()-t0, 'url', page.url());
  const t = await page.evaluate(()=>document.body.innerText);
  console.log(t.replace(/\n{2,}/g,'\n').slice(0,700));
  await shot(page,'s05-storefront-product-clicked');
}
save('s05-click.json',{card,errors});
console.log('errors', JSON.stringify(errors.slice(0,4)));
await browser.close();
