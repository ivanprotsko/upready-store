import { chromium } from 'playwright';
const b = await chromium.launch();
const out = [];
for (const host of process.argv.slice(2)) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(`https://${host}.shipshift.dev/ru`, { waitUntil: 'networkidle', timeout: 60000 });
  out.push({ host, ...await p.evaluate(() => {
    const m = [...document.images].filter(i => (i.currentSrc || i.src).includes('medusa.svg'));
    return { medusa: m.map(i => { const r = i.getBoundingClientRect(); const cs = getComputedStyle(i); return { box: `${Math.round(r.width)}x${Math.round(r.height)} @ ${Math.round(r.x)},${Math.round(r.y)}`, visible: r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'&&Number(cs.opacity)>0 }; }),
             bottomNavText: ([...document.querySelectorAll('nav')].map(n=>(n.innerText||'').replace(/\s+/g,' ').trim()).filter(Boolean).slice(-1)[0]||'').slice(0,80) };
  }) });
  await p.screenshot({ path: `${process.env.SHOTS}/${host}-mobile.png`, fullPage: false });
  await ctx.close();
}
await b.close();
console.log(JSON.stringify(out));
