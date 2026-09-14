import { open, SHOP, ART } from "./lib.mjs";
const { b, p, errs, bad } = await open({ w: 1440, h: 1100 });
const fiber = async (tag) => {
  const info = await p.evaluate(() => {
    const btn = document.querySelector('[data-testid="submit-order-button"]');
    if (!btn) return "no button";
    const key = Object.keys(btn).find(k => k.startsWith("__reactFiber"));
    let f = btn[key];
    for (let i = 0; i < 40 && f; i++) {
      const pr = f.memoizedProps;
      if (pr && typeof pr === "object" && "notReady" in pr) {
        return { notReady: pr.notReady, demoCard: pr.demoCard, disabled: btn.disabled };
      }
      f = f.return;
    }
    return { disabled: btn.disabled, note: "notReady prop not found" };
  });
  console.log(`[fiber ${tag}]`, JSON.stringify(info));
};
await p.goto(`${SHOP}/ru/products/cube-1-accept-commerce-1106`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1500);
await p.click('button:has-text("Малый")').catch(()=>{});
await p.waitForTimeout(700);
await p.click('button:has-text("В корзину"), button:has-text("Добавить")');
await p.waitForTimeout(4000);
await p.goto(`${SHOP}/ru/checkout`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(7000);
let radios = [];
for (let i = 0; i < 20; i++) { radios = await p.$$('button[role=radio], input[type=radio]'); if (radios.length >= 2) break; await p.waitForTimeout(3000); }
if (radios.length < 1) {
  console.log("NO SHIPPING RADIOS. page:", (await p.innerText("body")).replace(/\n+/g," | ").slice(0,400));
  await p.screenshot({ path: `${ART}/a37-no-radios.png`, fullPage: true });
  await b.close();
  process.exit(1);
}
await radios[radios.length-1].click();
await p.waitForTimeout(3500);
await p.click('button:has-text("Адрес доставки")');
await p.waitForTimeout(2500);
await p.click('[role=dialog] button[role=checkbox]');
await p.waitForTimeout(1500);
for (const [n,v] of [["address_1","ул. Ленина, д. 1"],["postal_code","101000"],["city","Москва"],["province","Москва"]]) { const el = await p.$(`[role=dialog] [name="${n}"]`); if (el) await el.fill(v); }
await p.click('[role=dialog] button:has-text("Сохранить")');
await p.waitForTimeout(4000);
await p.click('button:has-text("Контакты")');
await p.waitForTimeout(2500);
for (const [n,v] of [["first_name","Иван"],["last_name","Тестовый"],["email","night-accept@upready.dev"],["phone","+79990000000"]]) { const el = await p.$(`[role=dialog] [name="${n}"]`); if (el) await el.fill(v); }
await p.click('[role=dialog] button:has-text("Сохранить")');
await p.waitForTimeout(4000);
const tiles = await p.$$('button, [role=radio], label');
for (const el of tiles) { const t = (await el.innerText().catch(()=>"")).trim(); if (t.includes("Оплата вручную")) { await el.click(); break; } }
await p.waitForTimeout(6000);
await fiber("before-card");
for (const [tid,val] of [["demo-card-number-input","4242424242424242"],["demo-card-expiry-input","1230"],["demo-card-cvc-input","123"]]) {
  const el = await p.$(`[data-testid="${tid}"]`); if (el) { await el.click(); await el.type(val,{delay:35}); }
}
await p.waitForTimeout(3000);
await fiber("after-card");
const btn = await p.$('[data-testid="submit-order-button"]');
const dis = await btn.evaluate(e => e.disabled);
console.log("pay disabled:", dis);
if (!dis) {
  await btn.click();
  for (let i = 1; i <= 8; i++) {
    await p.waitForTimeout(5000);
    if (!p.url().includes("/checkout")) break;
  }
  console.log("URL after pay:", p.url());
  console.log("RESULT:", (await p.innerText("body")).replace(/\n+/g," | ").slice(0, 500));
  await p.screenshot({ path: `${ART}/a37-order-placed.png`, fullPage: true });
}
console.log("BAD:", JSON.stringify(bad.slice(0,5)));
await b.close();
