import { open, SHOP, ART } from "./lib.mjs";
const { b, p, errs, bad } = await open({ w: 1440, h: 1000 });
await p.goto(`${SHOP}/ru/products/cube-1-accept-commerce-1106`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1200);
await p.click('button:has-text("Малый")').catch(()=>{});
await p.waitForTimeout(600);
await p.click('button:has-text("В корзину"), button:has-text("Добавить")');
await p.waitForTimeout(3000);
await p.goto(`${SHOP}/ru/checkout?step=address`, { waitUntil: "networkidle", timeout: 60000 });
for (const w of [3000, 5000, 8000]) {
  await p.waitForTimeout(w);
  const f = await p.$$eval("input,select,textarea", els => els.map(e=>e.getAttribute("name")||e.type));
  console.log(`after ${w}ms: fields=${f.length}`, JSON.stringify(f.slice(0,18)));
  if (f.length) break;
}
const t = (await p.innerText("body")).replace(/\n+/g," | ");
console.log("PAGE TEXT:", t.slice(0, 900));
console.log("ERRS:", JSON.stringify(errs.slice(0,4)));
console.log("BAD:", JSON.stringify(bad.slice(0,6)));
await p.screenshot({ path: `${ART}/a27-checkout.png`, fullPage: true });
await b.close();
