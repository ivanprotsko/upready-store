import { open, login, PANEL, ART } from "./lib.mjs";
const routes = ["categories", "home-settings", "pages", "orders", "promotions", "settings/domains"];
const { b, p } = await open({ w: 1600, h: 950 });
await login(p);
const rawKeyRe = /\b[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+){1,4}\b/g;
for (const r of routes) {
  await p.goto(`${PANEL}/${r}`, { waitUntil: "networkidle", timeout: 90000 }).catch(e=>console.log(r,"NAV",String(e).slice(0,50)));
  await p.waitForTimeout(4000);
  const txt = (await p.innerText("body")).replace(/\n+/g, " | ");
  const acts = await p.$$eval("a,button", els => [...new Set(els.map(e=>`${e.getAttribute("href")||e.tagName}:${(e.innerText||"").trim().slice(0,22)}`))].filter(x=>x.split(":")[1]));
  const raw = [...new Set((txt.match(rawKeyRe)||[]).filter(k=>!k.includes(".dev")&&!k.includes(".ru")&&!k.includes(".com")&&!/\d/.test(k)))];
  console.log(`\n### /${r}`);
  console.log("TEXT:", txt.slice(130, 620));
  console.log("ACTIONS:", JSON.stringify(acts.slice(0, 22)));
  console.log("RAW-I18N-KEYS:", JSON.stringify(raw));
  await p.screenshot({ path: `${ART}/a18-${r.replace(/\//g,"-")}.png`, fullPage: true });
}
await b.close();
