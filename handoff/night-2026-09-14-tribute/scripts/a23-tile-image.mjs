import { open, login, PANEL, SHOP, ART } from "./lib.mjs";
const { b, p } = await open({ w: 1600, h: 950 });
await login(p);
await p.goto(`${PANEL}/categories`, { waitUntil: "networkidle", timeout: 90000 });
await p.waitForTimeout(3000);
// find Spheres among all categories (list shows top-level; use the detail page path)
const links = await p.$$eval('a[href^="/categories/pcat_"]', els => [...new Set(els.map(e=>`${e.getAttribute("href")}|${(e.innerText||"").trim()}`))]);
console.log("CATS:", JSON.stringify(links.filter(l=>l.split("|")[1]).slice(0,10)));
await b.close();
