import { open, SHOP, ART } from "./lib.mjs";
const ORDER = "order_01M2F65AN56HDVFMRF7HYP77SD";
// 1. clean browser, direct navigation
const { b, p } = await open();
await p.goto(`${SHOP}/ru/order/${ORDER}/confirmed`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1500);
const t1 = await p.innerText("body");
console.log("clean browser, direct nav:", t1.includes("Application error") ? "ERROR" : "OK", "|", t1.replace(/\n+/g," | ").slice(0,90));
await b.close();
// 2. browser that first browsed the shop (gets cookies), then navigates in-app
const { b: b2, p: p2 } = await open();
await p2.goto(`${SHOP}/ru`, { waitUntil: "networkidle", timeout: 60000 });
await p2.waitForTimeout(1500);
await p2.goto(`${SHOP}/ru/order/${ORDER}/confirmed`, { waitUntil: "networkidle", timeout: 60000 });
await p2.waitForTimeout(1500);
const t2 = await p2.innerText("body");
console.log("warm browser with cookies:", t2.includes("Application error") ? "ERROR" : "OK", "|", t2.replace(/\n+/g," | ").slice(0,90));
await p2.screenshot({ path: `${ART}/a42-order-warm.png`, fullPage: true });
await b2.close();
