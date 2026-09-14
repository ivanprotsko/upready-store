import { open, login, PANEL, SHOP, ART } from "./lib.mjs";
const { b, p, errs, bad } = await open({ w: 1600, h: 950 });
await login(p);
await p.goto(`${PANEL}/pages/about`, { waitUntil: "networkidle", timeout: 90000 });
await p.waitForTimeout(3000);
const fields = await p.$$eval("input,textarea,select", els => els.map(e=>`${e.tagName}:${e.getAttribute("name")||e.type}`));
console.log("FIELDS:", JSON.stringify(fields));
await p.fill('input[name=title]', "О магазине");
await p.fill('textarea[name=body]', "Мы продаём предметы простых форм. Метка приёмки: NIGHT-PAGE-ABOUT.");
const pub = await p.$('input[type=checkbox], button[role=switch]');
if (pub) { await pub.click().catch(()=>{}); }
await p.waitForTimeout(500);
await p.click('button[type=submit]');
await p.waitForTimeout(5000);
console.log("URL:", p.url(), "| ERRS:", JSON.stringify(errs.slice(0,3)), "| BAD:", JSON.stringify(bad.slice(0,3)));
await p.screenshot({ path: `${ART}/a25-1-page-saved.png`, fullPage: true });
await b.close();
const { b: b2, p: p2, bad: bad2 } = await open();
for (let i = 1; i <= 4; i++) {
  await p2.goto(`${SHOP}/ru/pages/about`, { waitUntil: "networkidle", timeout: 60000 });
  await p2.waitForTimeout(1500);
  const t = (await p2.innerText("body")).replace(/\n+/g," | ");
  const ok = t.includes("NIGHT-PAGE-ABOUT");
  console.log(`try ${i}: page on storefront:`, ok, "| status:", (await p2.title()).slice(0,40));
  if (ok) {
    const footer = t.slice(-450);
    console.log("FOOTER:", footer);
    await p2.screenshot({ path: `${ART}/a25-2-storefront-page.png`, fullPage: true });
    break;
  }
  await p2.waitForTimeout(7000);
}
console.log("BAD:", JSON.stringify(bad2.slice(0,4)));
await b2.close();
