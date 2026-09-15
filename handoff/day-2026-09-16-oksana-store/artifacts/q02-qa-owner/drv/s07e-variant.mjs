import { launch, shot, timedGoto, save, PANEL, SHOP } from './lib.mjs';
const PICK = process.argv[2];
const { browser, page, errors } = await launch();
await timedGoto(page, PANEL + '/home-settings'); await page.waitForTimeout(8000);
const cur = await page.locator('button:has-text("Анонс"), button:has-text("Первый экран")').first().innerText().catch(()=>'?');
// the selector for Первый экран: find the button right after the label
const btn = await page.evaluateHandle(()=>{
  const labels=[...document.querySelectorAll('*')].filter(e=>e.children.length===0 && e.innerText?.trim()==='Первый экран');
  if(!labels.length) return null; let p=labels[0].parentElement;
  for(let i=0;i<4&&p;i++){ const b=p.querySelector('button'); if(b) return b; p=p.parentElement; }
  return null;});
const el = btn.asElement();
if (!el) { console.log('no first-screen selector'); await browser.close(); process.exit(0); }
await el.click(); await page.waitForTimeout(1500);
const opts = await page.$$eval('[role=option],[role=menuitem]', e=>e.map(x=>(x.innerText||'').replace(/\n+/g,' | ').trim().slice(0,90)));
console.log('OPTIONS:', JSON.stringify(opts,null,1));
if (PICK){
  const p = page.locator('[role=option],[role=menuitem]').filter({hasText:PICK}).first();
  if (await p.count()) { await p.click(); await page.waitForTimeout(1500); console.log('picked', PICK); }
  else { await page.keyboard.press('Escape'); console.log('option not found'); }
  await page.waitForTimeout(800);
  await page.locator('[data-testid=home-settings-save]').click();
  await page.waitForTimeout(6000);
  await shot(page,'s07-variant-saved');
  await timedGoto(page, SHOP+'/ru', {waitUntil:'load'}); await page.waitForTimeout(6000);
  await shot(page,'s07-storefront-variant');
  const b = await page.evaluate(()=>document.body.innerText.slice(0,500).replace(/\n{2,}/g,'\n'));
  console.log('SF:', b);
}
save('s07-variant.json',{opts,errors});
await browser.close();
