import { open, SHOP, ART } from "./lib.mjs";
const { b, p, bad } = await open();
await p.goto(`${SHOP}/ru/products/cube-1-accept-commerce-1106`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1500);
for (const label of ["Малый", "Средний", "Большой"]) {
  await p.click(`button:has-text("${label}")`).catch(()=>{});
  await p.waitForTimeout(1200);
  const t = (await p.innerText("body")).replace(/\n+/g," | ");
  const m = t.match(/([\d\s ]+,\d\d)\s?₽/);
  console.log(label, "->", m ? m[1] : "нет цены");
}
await p.screenshot({ path: `${ART}/a7-variant-price.png`, fullPage: true });
console.log("BAD:", JSON.stringify(bad.slice(0,4)));
await b.close();
