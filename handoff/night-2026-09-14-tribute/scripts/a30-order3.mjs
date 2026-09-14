import { open, SHOP, ART } from "./lib.mjs";
const { b, p, errs, bad } = await open({ w: 1440, h: 1100 });
await p.goto(`${SHOP}/ru/products/cube-1-accept-commerce-1106`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1200);
await p.click('button:has-text("Малый")').catch(()=>{});
await p.waitForTimeout(600);
await p.click('button:has-text("В корзину"), button:has-text("Добавить")');
await p.waitForTimeout(3000);
await p.goto(`${SHOP}/ru/checkout`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(6000);

// 1. shipping: pickup (free)
const radios = await p.$$('button[role=radio], input[type=radio]');
console.log("shipping radios:", radios.length);
if (radios.length > 1) { await radios[1].click(); } else if (radios.length) { await radios[0].click(); }
await p.waitForTimeout(2500);

// 2. address modal, manual entry
await p.click('button:has-text("Адрес доставки")');
await p.waitForTimeout(2000);
await p.click('[role=dialog] button[role=checkbox]');
await p.waitForTimeout(2000);
const f2 = await p.$$eval('[role=dialog] input, [role=dialog] select', els => els.map(e=>e.getAttribute("name")||e.type));
console.log("ADDRESS FIELDS:", JSON.stringify(f2));
const fill = async (name, val) => { const el = await p.$(`[role=dialog] [name="${name}"]`); if (el) { await el.fill(val).catch(async()=>{ await el.selectOption(val).catch(()=>{}); }); return true; } return false; };
console.log("first_name:", await fill("first_name", "Иван"));
console.log("last_name:", await fill("last_name", "Тестовый"));
console.log("address_1:", await fill("address_1", "ул. Ленина, д. 1, кв. 2"));
console.log("postal_code:", await fill("postal_code", "101000"));
console.log("city:", await fill("city", "Москва"));
console.log("province:", await fill("province", "Москва"));
await p.screenshot({ path: `${ART}/a30-1-address.png` });
await p.click('[role=dialog] button:has-text("Сохранить")');
await p.waitForTimeout(3500);
const t = (await p.innerText("body")).replace(/\n+/g," | ");
console.log("AFTER ADDRESS:", t.slice(0, 500));
await p.screenshot({ path: `${ART}/a30-2-after-address.png`, fullPage: true });
console.log("ERRS:", JSON.stringify(errs.slice(0,3)), "BAD:", JSON.stringify(bad.slice(0,3)));
await b.close();
