import { open, SHOP, ART } from "./lib.mjs";
const { b, p, errs, bad } = await open();
await p.goto(`${SHOP}/ru/products/cube-1-accept-commerce-1106`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(2000);
const btns = await p.$$eval("button", els => els.map(e => ({ t: (e.innerText||"").trim().slice(0,26), d: e.disabled })).filter(x=>x.t));
console.log("BUTTONS:", JSON.stringify(btns));
await p.click('button:has-text("Малый")').catch(e=>console.log("variant click fail"));
await p.waitForTimeout(1200);
const btns2 = await p.$$eval("button", els => els.map(e => ({ t: (e.innerText||"").trim().slice(0,26), d: e.disabled })).filter(x=>x.t));
console.log("AFTER VARIANT:", JSON.stringify(btns2));
const add = await p.$('button:has-text("В корзину"), button:has-text("Добавить")');
console.log("add found:", !!add, "disabled:", add ? await add.evaluate(e=>e.disabled) : null);
if (add) { await add.click(); await p.waitForTimeout(5000); }
console.log("cookies:", JSON.stringify((await p.context().cookies()).map(c=>c.name)));
console.log("BAD:", JSON.stringify(bad.slice(0,5)));
console.log("ERRS:", JSON.stringify(errs.slice(0,3)));
await b.close();
