import { open, login, PANEL, SHOP, ART } from "./lib.mjs";
const { b, p, errs, bad } = await open({ w: 1600, h: 950 });
await login(p);
await p.goto(`${PANEL}/home-settings`, { waitUntil: "networkidle", timeout: 90000 });
await p.waitForTimeout(4000);
const all = await p.$$("input, textarea");
const kinds = [];
for (const el of all) kinds.push(await el.evaluate(e => `${e.tagName}:${e.type||""}`));
console.log("ELEMENTS:", JSON.stringify(kinds));
const editable = [];
for (const el of all) {
  const k = await el.evaluate(e => `${e.tagName}:${e.type||""}`);
  if (k !== "INPUT:file") editable.push(el);
}
await editable[0].fill("Ночная приёмка · витрина Upready");
await editable[1].fill("Заголовок и подзаголовок героя изменены ночью. Метка: NIGHT-HERO-EDIT.");
await editable[2].fill("Смотреть каталог");
await p.click('button:has-text("Сохранить")');
await p.waitForTimeout(6000);
const after = (await p.innerText("body")).replace(/\n+/g," | ");
console.log("saved marker in panel:", after.includes("Last saved") || after.includes("Сохранено"));
console.log("ERRS:", JSON.stringify(errs.slice(0,3)), "BAD:", JSON.stringify(bad.slice(0,3)));
await p.screenshot({ path: `${ART}/a22-1-home-saved.png`, fullPage: true });
await b.close();
const { b: b2, p: p2, bad: bad2 } = await open();
for (let i = 1; i <= 5; i++) {
  await p2.goto(`${SHOP}/ru`, { waitUntil: "networkidle", timeout: 60000 });
  await p2.waitForTimeout(1500);
  const t = (await p2.innerText("body")).replace(/\n+/g," | ");
  const ok = t.includes("NIGHT-HERO-EDIT");
  console.log(`try ${i}: hero on storefront:`, ok, "| headline:", t.includes("Ночная приёмка · витрина Upready"), "| cta:", t.includes("Смотреть каталог"));
  if (ok) { await p2.screenshot({ path: `${ART}/a22-2-storefront-hero.png`, fullPage: true }); break; }
  await p2.waitForTimeout(7000);
}
const imgs = await p2.$$eval("img", els => els.map(e=>decodeURIComponent(e.getAttribute("src")||"").replace(/.*url=/,"").replace(/&w=\d+&q=\d+/,"")));
console.log("category tile images:", JSON.stringify(imgs.filter(s=>s.includes("/tenants/")||s.includes("store-profiles")).slice(0,8)));
console.log("BAD:", JSON.stringify(bad2.slice(0,4)));
await b2.close();
