import { open, SHOP, ART } from "./lib.mjs";
const { b, p } = await open({ w: 1440, h: 1100 });
await p.goto(`${SHOP}/ru/products/cube-1-accept-commerce-1106`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1200);
await p.click('button:has-text("Малый")').catch(()=>{});
await p.waitForTimeout(600);
await p.click('button:has-text("В корзину"), button:has-text("Добавить")');
await p.waitForTimeout(3000);
await p.goto(`${SHOP}/ru/checkout`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(6000);
let radios = [];
for (let i = 0; i < 10; i++) { radios = await p.$$('button[role=radio], input[type=radio]'); if (radios.length >= 2) break; await p.waitForTimeout(2000); }
await radios[radios.length-1].click();
await p.waitForTimeout(3000);
await p.click('button:has-text("Адрес доставки")');
await p.waitForTimeout(2000);
await p.click('[role=dialog] button[role=checkbox]');
await p.waitForTimeout(1200);
for (const [n,v] of [["address_1","ул. Ленина, д. 1"],["postal_code","101000"],["city","Москва"],["province","Москва"]]) { const el = await p.$(`[role=dialog] [name="${n}"]`); if (el) await el.fill(v); }
await p.click('[role=dialog] button:has-text("Сохранить")');
await p.waitForTimeout(3000);
await p.click('button:has-text("Контакты")');
await p.waitForTimeout(2000);
for (const [n,v] of [["first_name","Иван"],["last_name","Тестовый"],["email","night-accept@upready.dev"],["phone","+79990000000"]]) { const el = await p.$(`[role=dialog] [name="${n}"]`); if (el) await el.fill(v); }
await p.click('[role=dialog] button:has-text("Сохранить")');
await p.waitForTimeout(3000);
const tiles = await p.$$('button, [role=radio], label');
for (const el of tiles) { const t = (await el.innerText().catch(()=>"")).trim(); if (t.includes("Оплата вручную")) { await el.click(); break; } }
await p.waitForTimeout(6000);
for (const [tid,val] of [["demo-card-number-input","4242424242424242"],["demo-card-expiry-input","1230"],["demo-card-cvc-input","123"]]) {
  const el = await p.$(`[data-testid="${tid}"]`); if (el) { await el.click(); await el.type(val,{delay:35}); }
}
await p.waitForTimeout(2500);
const btns = await p.$$eval("button", els => els.map(e => ({ txt: (e.innerText||"").replace(/\n+/g," ").trim().slice(0,32), dis: e.disabled, tid: e.getAttribute("data-testid")||"" })).filter(x=>/Оплатить|способ оплаты/i.test(x.txt)));
console.log("PAY BUTTONS:", JSON.stringify(btns, null, 0));
await p.screenshot({ path: `${ART}/a32-pay-buttons.png`, fullPage: true });
await b.close();
