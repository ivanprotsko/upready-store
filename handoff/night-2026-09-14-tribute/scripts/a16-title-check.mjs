import { open, SHOP } from "./lib.mjs";
const { b, p } = await open();
await p.goto(`${SHOP}/ru/products/cube-1-accept-commerce-1106`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1500);
const t = await p.innerText("body");
console.log("title (v2) visible:", t.includes("(v2)"));
await b.close();
