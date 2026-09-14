import { open, SHOP, ART } from "./lib.mjs";
const { b, p, errs, bad } = await open({ w: 1440, h: 1000 });
const log = (...a) => console.log(...a);
await p.goto(`${SHOP}/ru/products/cube-1-accept-commerce-1106`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1500);
await p.click('button:has-text("Малый")').catch(()=>log("no variant button"));
await p.waitForTimeout(800);
const addBtn = await p.$('button:has-text("В корзину"), button:has-text("Добавить")');
log("add-to-cart button:", !!addBtn);
if (addBtn) { await addBtn.click(); await p.waitForTimeout(3500); }
await p.screenshot({ path: `${ART}/a26-1-added.png`, fullPage: true });
await p.goto(`${SHOP}/ru/cart`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(2000);
const cartTxt = (await p.innerText("body")).replace(/\n+/g," | ");
log("CART:", cartTxt.slice(100, 600));
await p.screenshot({ path: `${ART}/a26-2-cart.png`, fullPage: true });
const co = await p.$('a:has-text("оформ"), button:has-text("оформ"), a[href*="checkout"]');
log("checkout link:", !!co);
if (co) { await co.click(); await p.waitForTimeout(4000); }
log("URL:", p.url());
const fields = await p.$$eval("input,select", els => els.map(e=>`${e.getAttribute("name")||e.type}`));
log("CHECKOUT FIELDS:", JSON.stringify(fields.slice(0,24)));
await p.screenshot({ path: `${ART}/a26-3-checkout.png`, fullPage: true });
log("ERRS:", JSON.stringify(errs.slice(0,4)), "BAD:", JSON.stringify(bad.slice(0,4)));
await b.close();
