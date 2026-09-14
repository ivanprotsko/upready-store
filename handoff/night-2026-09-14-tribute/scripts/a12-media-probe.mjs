import { open, login, PANEL, ART } from "./lib.mjs";
const ID = "prod_01M2EY6NV1RDYSW4KPAXGNWQ1A";
const { b, p } = await open({ w: 1600, h: 950 });
await login(p);
await p.goto(`${PANEL}/products/${ID}/media`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForFunction(() => document.querySelectorAll('[role=dialog]').length > 0, { timeout: 60000 });
await p.waitForTimeout(2000);
const info = await p.evaluate(() => {
  const d = document.querySelector('[role=dialog]');
  const btns = [...d.querySelectorAll('button,a')].map(e => {
    const r = e.getBoundingClientRect();
    return { tag: e.tagName, txt: (e.innerText||e.getAttribute('aria-label')||"").trim().slice(0,30), href: e.getAttribute('href')||"", w: Math.round(r.width), h: Math.round(r.height), vis: getComputedStyle(e).visibility };
  });
  return { hidden: d.getAttribute('aria-hidden'), inert: d.hasAttribute('inert'), btns };
});
console.log(JSON.stringify(info, null, 1).slice(0, 1800));
await p.screenshot({ path: `${ART}/a12-media-probe.png` });
await b.close();
