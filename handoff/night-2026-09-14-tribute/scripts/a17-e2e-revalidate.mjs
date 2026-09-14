import { open, login, PANEL, SHOP, ART } from "./lib.mjs";
const ID = "prod_01M2EY6NV1RDYSW4KPAXGNWQ1A";
const MARK = "v3-auto";
const { b, p } = await open();
await login(p);
await p.goto(`${PANEL}/products/${ID}/edit`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForSelector("input[name=title]", { timeout: 30000 });
await p.fill("input[name=title]", `Куб №1 · Меловой белый (${MARK})`);
await p.click('button[type=submit]:has-text("Сохранить")');
await p.waitForTimeout(5000);
await b.close();
const { b: b2, p: p2 } = await open();
for (let i = 1; i <= 6; i++) {
  await p2.goto(`${SHOP}/ru/products/cube-1-accept-commerce-1106`, { waitUntil: "networkidle", timeout: 60000 });
  const t = await p2.innerText("body");
  console.log(`try ${i} (~${i*8}s): storefront shows ${MARK}:`, t.includes(MARK));
  if (t.includes(MARK)) { await p2.screenshot({ path: `${ART}/a17-storefront-auto-revalidated.png`, fullPage: true }); break; }
  await p2.waitForTimeout(8000);
}
await b2.close();
