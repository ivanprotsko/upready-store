import { open, login, PANEL } from "./lib.mjs";
const ID = "prod_01M2EY6NV1RDYSW4KPAXGNWQ1A";
const routes = ["edit", "media", "prices", "attributes", "organization", "sales-channels", "options"];
const { b, p } = await open();
await login(p);
for (const r of routes) {
  const bad = [];
  p.removeAllListeners("response");
  p.on("response", x => { if (x.status() >= 400) bad.push(`${x.status()} ${x.url().slice(-60)}`); });
  await p.goto(`${PANEL}/products/${ID}/${r}`, { waitUntil: "networkidle", timeout: 60000 }).catch(e=>console.log(r, "NAV FAIL", String(e).slice(0,80)));
  await p.waitForTimeout(1800);
  const fields = await p.$$eval("input,textarea,select", els => els.map(e=>`${e.tagName}:${e.getAttribute("name")||e.getAttribute("id")||e.getAttribute("type")||"?"}`));
  const heads = (await p.innerText("body")).replace(/\n+/g," | ").slice(0, 260);
  console.log(`--- /${r} :: fields=${JSON.stringify([...new Set(fields)])} bad=${JSON.stringify(bad.slice(0,3))}`);
  console.log(`    text: ${heads.slice(120)}`);
}
await b.close();
