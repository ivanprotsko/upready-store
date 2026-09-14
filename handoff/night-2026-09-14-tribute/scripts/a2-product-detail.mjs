import { open, login, PANEL, ART } from "./lib.mjs";
const ID = "prod_01M2EY6NV1RDYSW4KPAXGNWQ1A"; // Cube No. 1
const { b, p, errs, bad } = await open();
await login(p);
await p.goto(`${PANEL}/products/${ID}`, { waitUntil: "networkidle", timeout: 90000 });
await p.waitForTimeout(2500);
console.log("BODY:", (await p.innerText("body")).replace(/\n+/g," | ").slice(0, 2500));
const acts = await p.$$eval("a,button", els => [...new Set(els.map(e=>`${e.tagName}|${e.getAttribute("href")||""}|${(e.innerText||"").trim().slice(0,30)}`))].filter(x=>x.split("|")[2]||x.split("|")[1]));
console.log("ACTIONS:", JSON.stringify(acts));
console.log("ERRS:", JSON.stringify(errs.slice(0,5)), "BAD:", JSON.stringify(bad.slice(0,5)));
await p.screenshot({ path: `${ART}/a2-product-detail.png`, fullPage: true });
await b.close();
