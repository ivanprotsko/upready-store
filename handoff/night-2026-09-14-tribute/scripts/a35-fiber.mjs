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
for (const [tid,val] of [["demo-card-number-input","4242424242424242"],["demo-card-expiry-input","1230"],["demo-card-cvc-input","123"]]) {
  const el = await p.$(`[data-testid="${tid}"]`); if (el) { await el.click(); await el.type(val,{delay:35}); }
}
await p.waitForTimeout(2500);
const probe = await p.evaluate(() => {
  const btn = document.querySelector('[data-testid="submit-order-button"]');
  const key = Object.keys(btn).find(k => k.startsWith("__reactFiber"));
  let f = btn[key];
  const seen = [];
  for (let i = 0; i < 40 && f; i++) {
    const pr = f.memoizedProps;
    if (pr && typeof pr === "object") {
      const keys = Object.keys(pr);
      if (keys.includes("notReady") || keys.includes("demoCard") || keys.includes("cart")) {
        seen.push({
          depth: i,
          keys: keys.slice(0, 8),
          notReady: pr.notReady,
          demoCard: pr.demoCard,
          selected: pr.selectedPaymentMethod,
          cartFlags: pr.cart ? {
            email: !!pr.cart.email, ship: !!pr.cart.shipping_address, bill: !!pr.cart.billing_address,
            methods: (pr.cart.shipping_methods||[]).length,
            sessions: ((pr.cart.payment_collection||{}).payment_sessions||[]).map(s=>s.provider_id),
          } : null,
        });
      }
    }
    f = f.return;
  }
  return seen;
});
console.log(JSON.stringify(probe, null, 1).slice(0, 1500));
await b.close();
