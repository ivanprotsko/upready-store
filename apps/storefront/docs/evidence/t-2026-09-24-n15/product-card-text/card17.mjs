// Remark 17: product cards (headless Chromium / Firefox) on home, /store, a category, a product's related grid —
// per card: title/price font-size + line-height, order (price above title?), title height/lines, meta line present;
// a shot of the grid's first rows per page and width.
import { chromium, firefox } from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs";
import fs from "fs";
const [out, tag, base, engine = "chromium", ws = "1440,390"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = engine === "firefox" ? await firefox.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox` }) : await chromium.launch();
const shop = new URL(base).hostname.split(".")[0];
const MEASURE = () => {
  const cards = [...document.querySelectorAll('[data-testid="product-wrapper"]')].filter((c) => c.getBoundingClientRect().width > 0);
  const rows = cards.slice(0, 4).map((c) => {
    const t = c.querySelector('[data-testid="product-title"]'), p = c.querySelector('[data-testid="price"]'), u = c.querySelector('[data-testid="product-unit"]');
    const r = (e) => e.getBoundingClientRect(), cs = (e) => getComputedStyle(e);
    const lh = parseFloat(cs(t).lineHeight);
    return { title: t.textContent.trim().slice(0, 18), tFs: cs(t).fontSize, tLh: cs(t).lineHeight, tW: cs(t).fontWeight, tH: Math.round(r(t).height * 10) / 10, tLines: Math.round(r(t).height / lh), tMinH: cs(t).minHeight, pFs: p ? cs(p).fontSize : null, pW: p ? cs(p).fontWeight : null, priceAbove: p ? r(p).top < r(t).top : null, meta: u ? u.textContent.trim() || "(empty slot)" : null, cardH: Math.round(r(c).height) };
  });
  return { n: cards.length, rows };
};
const pagesFor = async (p) => {
  await p.goto(`${base}/ru`, { waitUntil: "networkidle", timeout: 180000 });
  const cat = await p.evaluate(() => document.querySelector('a[href*="/categories/"]')?.getAttribute("href"));
  const prod = await p.evaluate(() => document.querySelector('[data-testid="product-wrapper"]')?.getAttribute("href"));
  return [["home", "/ru"], ["store", "/ru/store"], ["category", cat], ["product", prod]].filter(([, u]) => u);
};
for (const w of ws.split(",").map(Number)) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  const pages = await pagesFor(p);
  for (const [name, path] of pages) {
    await p.goto(new URL(path, base).href, { waitUntil: "networkidle", timeout: 180000 });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    const m = await p.evaluate(MEASURE);
    console.log(engine, shop, w, name, tag, path, JSON.stringify(m));
    const first = p.locator('[data-testid="product-wrapper"]').first();
    if (await first.count()) {
      const grid = first.locator("xpath=ancestor::ul[1]");
      const gb = (await grid.count()) ? await grid.boundingBox() : await first.boundingBox();
      await p.evaluate((y) => window.scrollTo(0, y - 120), gb.y + (await p.evaluate(() => scrollY)));
      await p.waitForTimeout(400);
      const box = await (await grid.count() ? grid : first).boundingBox();
      await p.screenshot({ path: `${out}/${engine}-${shop}-${w}-${name}-${tag}.png`, clip: { x: 0, y: Math.max(0, box.y - 16), width: w, height: Math.min(w > 800 ? 560 : 760, 900 - Math.max(0, box.y - 16)) } });
    }
  }
  await ctx.close();
}
await b.close();
