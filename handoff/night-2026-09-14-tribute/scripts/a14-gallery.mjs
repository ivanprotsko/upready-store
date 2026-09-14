import { open, SHOP, ART } from "./lib.mjs";
const { b, p } = await open();
await p.goto(`${SHOP}/ru/products/cube-1-accept-commerce-1106`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(2500);
const srcs = await p.$$eval("img", els => els.map(e => decodeURIComponent(e.getAttribute("src")||"")));
console.log("ALL IMG SRC:", JSON.stringify([...new Set(srcs.map(s=>s.replace(/.*url=/,"").replace(/&w=\d+&q=\d+/,"")))], null, 0));
await p.screenshot({ path: `${ART}/a14-gallery.png`, fullPage: true });
await b.close();
