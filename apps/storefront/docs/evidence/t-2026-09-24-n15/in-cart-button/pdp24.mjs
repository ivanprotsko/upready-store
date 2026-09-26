// Remark 24: the product page buy box with no cart (no cart cookie → no cart read, no write). Args: out tag base path engines
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
import fs from "fs";
const [out, tag, base, path, engines = "chromium"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const name = new URL(base).hostname.split(".")[0];
for (const eng of engines.split(",")) {
  const b = await pw[eng].launch();
  for (const w of [1440, 390]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 180000 });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    const btn = p.locator('[data-testid="add-product-button"]');
    await btn.scrollIntoViewIfNeeded();
    await p.waitForTimeout(400);
    const box = await btn.boundingBox();
    const info = await p.evaluate(() => ({ stepper: !!document.querySelector('[data-testid="in-cart-stepper"]'), add: document.querySelector('[data-testid="add-product-button"]')?.innerText, cookie: document.cookie.includes("_medusa_cart_id") }));
    await p.screenshot({ path: `${out}/${eng}-${name}-${w}-buybox-${tag}.png`, clip: { x: Math.max(0, box.x - 24), y: Math.max(0, box.y - 120), width: Math.min(w, box.width + 48), height: 220 } });
    console.log(eng, name, w, tag, JSON.stringify({ ...info, box: [box.x, box.y, box.width, box.height].map(Math.round) }));
    await p.close();
  }
  await b.close();
}
