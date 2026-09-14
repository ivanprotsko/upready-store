import { open, login, PANEL, SHOP, ART } from "./lib.mjs";
const { b, p, errs, bad } = await open({ w: 1600, h: 950 });
await login(p);
// --- open an existing category, edit name + description, upload an image ---
await p.goto(`${PANEL}/categories`, { waitUntil: "networkidle", timeout: 90000 });
await p.waitForTimeout(3000);
const href = await p.$eval('a[href^="/categories/pcat_"]', e => e.getAttribute("href"));
const CID = href.split("/").pop();
console.log("category:", CID);
await p.goto(`${PANEL}/categories/${CID}`, { waitUntil: "networkidle", timeout: 90000 });
await p.waitForTimeout(3500);
const txt = (await p.innerText("body")).replace(/\n+/g," | ");
console.log("DETAIL:", txt.slice(130, 700));
const acts = await p.$$eval("a", (els, cid) => [...new Set(els.map(e=>e.getAttribute("href")||""))].filter(h=>h.includes(cid)), CID);
console.log("EDIT LINKS:", JSON.stringify(acts));
await p.screenshot({ path: `${ART}/a19-1-category-detail.png`, fullPage: true });
console.log("ERRS:", JSON.stringify(errs.slice(0,3)), "BAD:", JSON.stringify(bad.slice(0,3)));
await b.close();
