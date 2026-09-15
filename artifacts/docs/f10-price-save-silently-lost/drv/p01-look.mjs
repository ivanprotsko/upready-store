import { launch, open, shot, save, PANEL, PRODUCT } from './lib.mjs';
const { browser, ctx, page, errors } = await launch();
const loggedIn = await open(page, ctx, `/products/${PRODUCT}/prices`, { settle: 10000 });
const info = await page.evaluate(() => ({
  url: location.href,
  fields: document.querySelectorAll('[data-field]').length,
  inputs: document.querySelectorAll('input').length,
  dialogs: document.querySelectorAll('[role=dialog]').length,
  headers: Array.from(document.querySelectorAll('th,[role=columnheader]')).map(e => (e.innerText||'').trim()).slice(0, 8),
  bodyHead: document.body.innerText.slice(0, 400),
  inputSample: Array.from(document.querySelectorAll('input')).slice(0, 6).map(i => ({ attrs: Array.from(i.attributes).map(a => a.name + '=' + a.value).join(' ').slice(0, 200), val: i.value })),
  gridAttrs: Array.from(document.querySelectorAll('[data-container-id],[data-cell-id],[data-col]')).length,
}));
console.log(JSON.stringify({ loggedIn, info, errors }, null, 1));
save('p01-look.json', { loggedIn, info, errors });
console.log(await shot(page, 'p01-look'));
await browser.close();
