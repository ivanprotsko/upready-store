import { open, login, PANEL, ART } from "./lib.mjs";
const { b, p, errs } = await open({ w: 1600, h: 950 });
await login(p);
const rawKeyRe = /\b[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+){1,4}\b/g;
for (const [route, shot] of [["home-settings","a41-1-home-ru"], ["pages","a41-2-pages-ru"], ["products","a41-3-products-ru"]]) {
  await p.goto(`${PANEL}/${route}`, { waitUntil: "networkidle", timeout: 90000 });
  await p.waitForTimeout(5000);
  const t = (await p.innerText("body")).replace(/\n+/g," | ");
  const raw = [...new Set((t.match(rawKeyRe)||[]).filter(k=>!/\.(dev|ru|com|png|webp)\b/.test(k)&&!/\d/.test(k)))];
  console.log(`\n### /${route}`);
  console.log("TEXT:", t.slice(120, 520));
  console.log("RAW KEYS:", JSON.stringify(raw));
  await p.screenshot({ path: `${ART}/${shot}.png`, fullPage: true });
}
console.log("ERRS:", JSON.stringify(errs.slice(0,3)));
await b.close();
