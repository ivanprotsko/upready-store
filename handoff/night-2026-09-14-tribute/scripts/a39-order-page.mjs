import { open, SHOP, ART } from "./lib.mjs";
const { b, p, errs, bad } = await open();
await p.goto(`${SHOP}/ru/order/order_01M2F4R874XB2NBCA2SN77XNHY/confirmed`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(2500);
console.log("TITLE:", await p.title());
console.log("TEXT:", (await p.innerText("body")).replace(/\n+/g," | ").slice(0, 700));
console.log("ERRS:", JSON.stringify(errs.slice(0,3)), "BAD:", JSON.stringify(bad.slice(0,3)));
await p.screenshot({ path: `${ART}/a39-order-confirmed.png`, fullPage: true });
await b.close();
