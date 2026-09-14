import { open, SHOP, ART } from "./lib.mjs";
const { b, p, errs, bad } = await open({ w: 1440, h: 1100 });
const state = async (tag) => {
  const btns = await p.$$eval("button,a[role=button]", els => [...new Set(els.map(e=>(e.innerText||"").trim().replace(/\n+/g," ").slice(0,30)))].filter(Boolean));
  const f = await p.$$eval("input,select", els => els.map(e=>`${e.getAttribute("name")||e.type}`));
  console.log(`[${tag}] url=${p.url().split("?")[1]||""} fields=${JSON.stringify(f.slice(0,20))}`);
  console.log(`[${tag}] buttons=${JSON.stringify(btns.slice(0,16))}`);
};
await p.goto(`${SHOP}/ru/products/cube-1-accept-commerce-1106`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(1200);
await p.click('button:has-text("Малый")').catch(()=>{});
await p.waitForTimeout(600);
await p.click('button:has-text("В корзину"), button:has-text("Добавить")');
await p.waitForTimeout(3000);
await p.goto(`${SHOP}/ru/checkout?step=delivery`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(5000);
await state("delivery");
// pick pickup (free) then continue
await p.click('text=pickup').catch(async()=>{ await p.click('input[type=radio]').catch(()=>{}); });
await p.waitForTimeout(1500);
await state("after-pick");
await p.screenshot({ path: `${ART}/a28-1-delivery.png`, fullPage: true });
await b.close();
