import { open, SHOP, ART } from "./lib.mjs";
import fs from "fs";
const { b, p } = await open({ w: 1440, h: 1100 });
// reuse the cart that is already complete in the DB by setting its cookie
const CART = process.argv[2];
await p.goto(`${SHOP}/ru`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.context().addCookies([{ name: "_medusa_cart_id", value: CART, domain: new URL(SHOP).hostname, path: "/" }]);
await p.goto(`${SHOP}/ru/checkout`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(7000);
const state = async (tag) => {
  const btn = await p.$('[data-testid="submit-order-button"]');
  if (!btn) return console.log(`[${tag}] no button`);
  console.log(`[${tag}]`, JSON.stringify(await btn.evaluate(e => ({ dis: e.disabled, busy: e.getAttribute("aria-busy"), txt: (e.innerText||"").replace(/\n+/g," ").trim().slice(0,30) }))));
};
await state("fresh-load");
// select payment + fill card
const tiles = await p.$$('button, [role=radio], label');
for (const el of tiles) { const t = (await el.innerText().catch(()=>"")).trim(); if (t.includes("Оплата вручную")) { await el.click(); break; } }
await p.waitForTimeout(5000);
await state("after-tile");
for (const [tid,val] of [["demo-card-number-input","4242424242424242"],["demo-card-expiry-input","1230"],["demo-card-cvc-input","123"]]) {
  const el = await p.$(`[data-testid="${tid}"]`); if (el) { await el.click(); await el.type(val,{delay:35}); }
}
await p.waitForTimeout(3000);
await state("after-card");
await p.screenshot({ path: `${ART}/a33-reload-pay.png`, fullPage: true });
const btn = await p.$('[data-testid="submit-order-button"]');
if (btn && !(await btn.evaluate(e => e.disabled))) {
  await btn.click();
  await p.waitForTimeout(12000);
  console.log("URL after pay:", p.url());
  const t = (await p.innerText("body")).replace(/\n+/g," | ");
  console.log("RESULT:", t.slice(0, 400));
  await p.screenshot({ path: `${ART}/a33-order-placed.png`, fullPage: true });
}
await b.close();
