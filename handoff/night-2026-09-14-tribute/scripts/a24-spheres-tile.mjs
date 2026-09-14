import { open, login, PANEL, SHOP, ART } from "./lib.mjs";
const CID = "pcat_01M2EY6NQQWPGK4RXG5D63YHR4"; // Spheres — a home tile
const { b, p, errs } = await open({ w: 1600, h: 950 });
await login(p);
await p.goto(`${PANEL}/categories/${CID}/edit`, { waitUntil: "domcontentloaded", timeout: 90000 });
await p.waitForSelector('[role=dialog] input[name=name]', { timeout: 60000 });
await p.waitForTimeout(1200);
await p.fill('[role=dialog] input[name=name]', "Шары и сферы");
await p.setInputFiles('[role=dialog] input[type=file]', "/tmp/night-upload-fixed.webp");
await p.waitForTimeout(2500);
await p.click('[role=dialog] button:has-text("Сохранить")');
await p.waitForTimeout(6000);
console.log("panel errs:", JSON.stringify(errs.slice(0,3)));
await b.close();
const { b: b2, p: p2, bad: bad2 } = await open();
for (let i = 1; i <= 5; i++) {
  await p2.goto(`${SHOP}/ru`, { waitUntil: "networkidle", timeout: 60000 });
  await p2.waitForTimeout(1500);
  const imgs = await p2.$$eval("img", els => els.map(e=>decodeURIComponent(e.getAttribute("src")||"").replace(/.*url=/,"").replace(/&w=\d+&q=\d+/,"")));
  const t = await p2.innerText("body");
  const tileOk = imgs.some(s=>s.includes("/tenants/") && s.includes("night-upload-fixed"));
  console.log(`try ${i}: tile image replaced:`, tileOk, "| name «Шары»:", t.includes("Шары и сферы"));
  if (tileOk) { await p2.screenshot({ path: `${ART}/a24-storefront-tile.png`, fullPage: true }); break; }
  await p2.waitForTimeout(7000);
}
console.log("BAD:", JSON.stringify(bad2.slice(0,4)));
await b2.close();
