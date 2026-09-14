import { open, login, PANEL, ART } from "./lib.mjs";
const { b, p, errs, bad } = await open({ w: 1600, h: 950 });
await login(p);
await p.goto(`${PANEL}/orders`, { waitUntil: "networkidle", timeout: 90000 });
await p.waitForTimeout(5000);
const txt = (await p.innerText("body")).replace(/\n+/g," | ");
console.log("ORDERS:", txt.slice(120, 700));
await p.screenshot({ path: `${ART}/a40-1-panel-orders.png`, fullPage: true });
const link = await p.$('a[href^="/orders/order_"]');
if (link) {
  const href = await link.getAttribute("href");
  await p.goto(`${PANEL}${href}`, { waitUntil: "networkidle", timeout: 90000 });
  await p.waitForTimeout(5000);
  console.log("ORDER DETAIL:", (await p.innerText("body")).replace(/\n+/g," | ").slice(120, 900));
  await p.screenshot({ path: `${ART}/a40-2-panel-order-detail.png`, fullPage: true });
}
console.log("ERRS:", JSON.stringify(errs.slice(0,3)), "BAD:", JSON.stringify(bad.slice(0,3)));
await b.close();
