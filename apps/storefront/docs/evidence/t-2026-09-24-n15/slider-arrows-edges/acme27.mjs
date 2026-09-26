import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
const b = await pw.chromium.launch();
for (const w of [1024, 1440]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto("http://acme.localhost:8233/ru", { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  console.log(w, JSON.stringify(await p.evaluate(() => { const vw = document.documentElement.clientWidth; const r = (el) => { const s = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { l: Math.round(s.left), r: Math.round(vw - s.right), w: Math.round(s.width), bg: cs.backgroundColor, shadow: cs.boxShadow }; }; const d = document.querySelector("[data-testid=nav-h7-desktop]"); return { menu: r(d.querySelector("[data-testid=nav-menu-button]")), cart: r(d.querySelector("[data-testid=nav-cart-link]").closest("a,button")), slider: !!document.querySelector("[data-testid=olavka-hero-slider]") }; })));
  await p.close();
}
await b.close();
