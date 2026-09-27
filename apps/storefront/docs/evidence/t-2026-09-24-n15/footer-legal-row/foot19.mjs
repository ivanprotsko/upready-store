// Remark 15: footer of a tenant at given widths — shot (header + bottom bar hidden), column x vs product x, horizontal lines.
import { chromium } from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs";
import fs from "fs";
const [out, tag, base, ws = "1440,1280,390"] = process.argv.slice(2); // base like http://olavka-com.localhost:8233
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const name = new URL(base).hostname.split(".")[0];
for (const w of ws.split(",").map(Number)) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto(`${base}/ru`, { waitUntil: "networkidle", timeout: 180000 });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important} #nav-h7,header,nav.fixed{visibility:hidden!important}" });
  const info = await p.evaluate(() => {
    const grid = document.querySelector('[data-product-grid="home"]') || document.querySelector('ul[data-testid="products-list"]');
    const cards = grid ? [...grid.children].slice(0, 4).map((c) => Math.round(c.getBoundingClientRect().x * 10) / 10) : [];
    const foot = document.querySelector("footer");
    const cols = foot ? [...foot.querySelectorAll("span.txt-medium-plus, a.txt-compact-medium-plus")].map((h) => [h.textContent.trim().slice(0, 22), Math.round(h.getBoundingClientRect().x * 10) / 10, Math.round((h.getBoundingClientRect().top + scrollY))]) : [];
    const gridBottom = grid ? grid.getBoundingClientRect().bottom + scrollY : 0;
    // every element below the product grid with a visible horizontal border, or an <hr>
    const lines = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect(); if (r.top + scrollY < gridBottom || r.width < 50) continue;
      const cs = getComputedStyle(el);
      for (const side of ["Top", "Bottom"]) if (parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== "none" && cs.visibility !== "hidden") lines.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} border-${side.toLowerCase()} ${cs[`border${side}Color`]}`);
      if (el.tagName === "HR") lines.push("hr");
    }
    return { cards, cols, lines, text: foot ? foot.innerText.replace(/\n+/g, " | ").slice(0, 400) : null, legal: document.querySelector('[data-testid="footer-legal-links"]')?.innerText.replace(/\n+/g, " | ") || null, olavka: !!document.querySelector('[data-testid="footer-olavka"]'), gridBottom: Math.round(gridBottom) };
  });
  console.log(name, w, tag, JSON.stringify(info));
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  const y0 = Math.max(0, info.gridBottom - 260);
  await p.screenshot({ path: `${out}/${name}-${w}-${tag}.png`, fullPage: true, clip: { x: 0, y: y0, width: w, height: H - y0 } });
  await p.close();
}
await b.close();
