import { open, login, PANEL, ART } from "./lib.mjs";
const ID = "prod_01M2EY6NV1RDYSW4KPAXGNWQ1A";
const { b, p, errs, bad } = await open({ w: 1600, h: 950 });
await login(p);
await p.goto(`${PANEL}/products/${ID}/media`, { waitUntil: "domcontentloaded", timeout: 60000 });
for (let i = 1; i <= 8; i++) {
  await p.waitForTimeout(5000);
  const has = await p.$('input[type=file]');
  const dlg = await p.$$eval('[role=dialog]', els => els.map(e=>(e.innerText||"").replace(/\n+/g," | ").slice(0,200)));
  console.log(`t=${i*5}s fileInput=${!!has} dialogs=${JSON.stringify(dlg)}`);
  if (has) break;
}
const t = (await p.innerText("body")).replace(/\n+/g," | ");
console.log("BODY TAIL:", t.slice(-500));
console.log("ERRS:", JSON.stringify(errs.slice(0,5)));
console.log("BAD:", JSON.stringify(bad.slice(0,8)));
await p.screenshot({ path: `${ART}/a10-media-wait.png` });
await b.close();
