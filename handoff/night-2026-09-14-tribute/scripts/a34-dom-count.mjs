import { open, SHOP } from "./lib.mjs";
const CART = process.argv[2];
const { b, p } = await open({ w: 1440, h: 1100 });
await p.goto(`${SHOP}/ru`, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.context().addCookies([{ name: "_medusa_cart_id", value: CART, domain: new URL(SHOP).hostname, path: "/" }]);
await p.goto(`${SHOP}/ru/checkout`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(7000);
const tiles = await p.$$('button, [role=radio], label');
for (const el of tiles) { const t = (await el.innerText().catch(()=>"")).trim(); if (t.includes("Оплата вручную")) { await el.click(); break; } }
await p.waitForTimeout(5000);
const counts = await p.evaluate(() => ({
  cardBlocks: document.querySelectorAll('[data-testid="demo-card-fields"]').length,
  numberInputs: document.querySelectorAll('[data-testid="demo-card-number-input"]').length,
  payButtons: document.querySelectorAll('[data-testid="submit-order-button"]').length,
  visibleNumberInputs: [...document.querySelectorAll('[data-testid="demo-card-number-input"]')].map(e => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; }),
}));
console.log("DOM COUNTS:", JSON.stringify(counts));
await b.close();
