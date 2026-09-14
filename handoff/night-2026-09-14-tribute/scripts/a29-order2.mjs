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
for (const label of ["Адрес доставки", "Контакты"]) {
  await p.click(`button:has-text("${label}")`).catch(e=>console.log("click fail", label));
  await p.waitForTimeout(2500);
  const f = await p.$$eval("input,select", els => els.map(e=>`${e.getAttribute("name")||e.type}=${(e.value||"").slice(0,14)}`));
  console.log(`after «${label}»: ${JSON.stringify(f.slice(0,20))}`);
}
await p.screenshot({ path: `${ART}/a29-expanded.png`, fullPage: true });
const rows = await p.$$eval('[role=radio], [data-testid*="shipping"], label', els => els.map(e=>`${e.tagName}|${e.getAttribute("role")||""}|${(e.innerText||"").trim().slice(0,40)}`).filter(x=>x.split("|")[2]));
console.log("SHIPPING ROWS:", JSON.stringify(rows.slice(0,12)));
console.log("ERRS:", JSON.stringify(errs.slice(0,3)));
await b.close();
