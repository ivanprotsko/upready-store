// Remark 15: where a 4th footer cell (the seller's requisites) lands at 1440 — appended as a probe clone.
import { chromium } from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://olavka-com.localhost:8234/ru", { waitUntil: "networkidle", timeout: 180000 });
console.log(JSON.stringify(await p.evaluate(() => {
  const g = document.querySelector('[data-testid="footer-olavka"] .grid');
  const probe = g.lastElementChild.cloneNode(true); g.appendChild(probe);
  return { cols: getComputedStyle(g).gridTemplateColumns, cells: [...g.children].map((c) => [c.querySelector("span")?.textContent.slice(0, 14), Math.round(c.getBoundingClientRect().x), Math.round(c.getBoundingClientRect().top)]) };
})));
await b.close();
