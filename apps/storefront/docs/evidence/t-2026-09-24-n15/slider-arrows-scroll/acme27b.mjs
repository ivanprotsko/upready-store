import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://acme.localhost:8233/ru", { waitUntil: "networkidle" });
for (const y of [0, 400]) {
  await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(800);
  console.log("acme 1440 scroll", y, JSON.stringify(await p.evaluate(() => { const vw = document.documentElement.clientWidth; const d = document.querySelector("[data-testid=nav-h7-desktop]"); const m = d.querySelector("[data-testid=nav-menu-button]"); const c = d.querySelector("[data-testid=nav-cart-link]").closest("a,button"); const cs = getComputedStyle(m); return { scrolled: document.getElementById("nav-h7").dataset.scrolled, menuL: Math.round(m.getBoundingClientRect().left), cartR: Math.round(vw - c.getBoundingClientRect().right), menuBg: cs.backgroundColor, menuShadow: cs.boxShadow, leadingTransition: getComputedStyle(m.parentElement.closest("div[class*=leading]") || m.parentElement).transition }; })));
}
await b.close();
