import { chromium } from "/opt/homebrew/lib/node_modules/playwright/index.mjs";
import fs from "node:fs";
const ART = "/Users/ivanprotsko/upready/projects/upready-store/handoff/night-2026-09-14-tribute/artifacts";
const HH = process.argv[2];
const handle = `accept-commerce-${HH}`;
const email = `commerce-${HH}@upready.dev`;
const pass = "NightAccept2026!";
const errs = [], bad = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
const p = await ctx.newPage();
p.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0,200)); });
p.on("response", r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(0,150)}`); });
await p.goto("https://start.upready.dev/start/onboarding", { waitUntil: "networkidle", timeout: 60000 });
await p.fill("#shop-name", `Приёмка Коммерция ${HH}`);
await p.fill("#shop-handle", handle);
await p.screenshot({ path: `${ART}/commerce-01-step1.png`, fullPage: true });
await p.click("text=Дальше · доступ");
await p.waitForTimeout(1200);
let f2 = await p.$$eval("input,button", els => els.map(e => ({t:e.tagName,ty:e.type||"",id:e.id||"",ph:e.placeholder||"",tx:(e.innerText||"").trim().slice(0,50)})));
console.log("STEP2 FIELDS:", JSON.stringify(f2));
await p.screenshot({ path: `${ART}/commerce-02-step2.png`, fullPage: true });
// fill email/password by id guess
for (const [sel, val] of [["#admin-email", email], ["#shop-email", email], ["input[type=email]", email]]) {
  if (await p.$(sel)) { await p.fill(sel, val); break; }
}
const pw = await p.$$("input[type=password]");
for (const el of pw) await el.fill(pass);
await p.screenshot({ path: `${ART}/commerce-02b-step2-filled.png`, fullPage: true });
const btns = await p.$$eval("button", els => els.map(e => e.innerText.trim()));
console.log("STEP2 BTNS:", JSON.stringify(btns));
const next2 = btns.find(x => /дальше|далее/i.test(x));
if (next2) { await p.click(`button:has-text("${next2}")`); await p.waitForTimeout(1500); }
console.log("STEP3 BODY:", (await p.innerText("body")).slice(0,1500));
await p.screenshot({ path: `${ART}/commerce-03-step3.png`, fullPage: true });
const btns3 = await p.$$eval("button", els => els.map(e => e.innerText.trim()));
console.log("STEP3 BTNS:", JSON.stringify(btns3));
const create = btns3.find(x => /созда|запуст|готово|открыт/i.test(x));
console.log("CREATE BTN:", create);
if (create) {
  const t0 = Date.now();
  await p.click(`button:has-text("${create}")`);
  await p.waitForTimeout(2000);
  for (let i=0;i<60;i++) {
    const body = await p.innerText("body");
    if (/готов|витрин|панел|перейти|магазин создан/i.test(body) && !/создаём|создаем|минут/i.test(body)) break;
    await p.waitForTimeout(1000);
  }
  console.log("CREATE ELAPSED:", ((Date.now()-t0)/1000).toFixed(1)+"s");
  console.log("DONE BODY:", (await p.innerText("body")).slice(0,2000));
  await p.screenshot({ path: `${ART}/commerce-04-created.png`, fullPage: true });
  const links = await p.$$eval("a", els => els.map(e => e.href));
  console.log("LINKS:", JSON.stringify([...new Set(links)]));
}
console.log("HANDLE:", handle); console.log("EMAIL:", email);
console.log("ERRS:", JSON.stringify(errs)); console.log("BAD:", JSON.stringify(bad));
fs.writeFileSync(`${ART}/../scripts/tenant.json`, JSON.stringify({handle,email,pass},null,1));
await b.close();
