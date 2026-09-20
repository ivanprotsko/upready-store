import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const BASE = "https://cherkashino.shipshift.dev";
const OUT = process.argv[2];
const b = await chromium.launch();
const out = {};
for (const [name, path_, w, h] of [["home", "/ru", 390, 844], ["catalog", "/ru/store", 390, 844], ["category-dobavki", "/ru/categories/dobavki-cherkashino", 390, 844], ["product", "/products/zubnaya-pasta-tayskaya-otbelivayuschaya-cherkashino", 1280, 900]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: "ru-RU" });
  const p = await ctx.newPage();
  await p.goto(BASE + path_, { waitUntil: "networkidle", timeout: 90000 });
  // scroll so lazy images below the fold actually start loading, then settle
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(4000);
  const r = await p.evaluate(() => {
    const imgs = [...document.images];
    return { total: imgs.length, loaded: imgs.filter((i) => i.naturalWidth > 0).length, broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src) };
  });
  out[`${name}-${w}x${h}`] = r;
  console.log(`${name} ${w}x${h}: total=${r.total} loaded=${r.loaded} broken=${r.broken.length}`);
  await p.screenshot({ path: `${OUT}/${name}-${w}x${h}.png` });
  await ctx.close();
}
await b.close();
writeFileSync(`${OUT}/checks-recheck.json`, JSON.stringify(out, null, 1) + "\n");
