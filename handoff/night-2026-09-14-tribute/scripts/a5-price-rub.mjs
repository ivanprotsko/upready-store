import { open, login, PANEL, ART } from "./lib.mjs";
const ID = "prod_01M2EY6NV1RDYSW4KPAXGNWQ1A";
const { b, p, errs, bad } = await open({ w: 1600, h: 950 });
await login(p);
await p.goto(`${PANEL}/products/${ID}/prices`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForTimeout(2500);
// find the horizontally scrollable container
const found = await p.evaluate(async () => {
  const scrollers = [...document.querySelectorAll("div")].filter(d => d.scrollWidth > d.clientWidth + 200);
  if (!scrollers.length) return { ok: false, why: "no horizontal scroller" };
  const el = scrollers.sort((a,b)=>b.scrollWidth-a.scrollWidth)[0];
  const info = { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  for (let x = 0; x <= el.scrollWidth; x += Math.floor(el.clientWidth * 0.6)) {
    el.scrollLeft = x;
    await new Promise(r => setTimeout(r, 260));
    if (document.querySelector('input[name="variants.0.prices.rub"]')) return { ok: true, x, ...info };
  }
  return { ok: false, why: "rub never rendered", ...info };
});
console.log("SCROLL RESULT:", JSON.stringify(found));
if (found.ok) {
  const before = await p.$eval('input[name="variants.0.prices.rub"]', e => e.value);
  console.log("RUB before:", JSON.stringify(before));
  await p.fill('input[name="variants.0.prices.rub"]', "7777");
  await p.keyboard.press("Tab");
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${ART}/a5-price-rub-filled.png` });
  await p.click('button[type=submit]:has-text("Сохранить"), button[type=submit]:has-text("Save")');
  await p.waitForTimeout(4000);
  console.log("URL after save:", p.url());
  await p.screenshot({ path: `${ART}/a5-price-saved.png`, fullPage: true });
}
console.log("ERRS:", JSON.stringify(errs.slice(0,4)), "BAD:", JSON.stringify(bad.slice(0,4)));
await b.close();
