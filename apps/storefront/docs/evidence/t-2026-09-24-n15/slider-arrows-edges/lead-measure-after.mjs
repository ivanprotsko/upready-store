import { chromium } from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs";
const D = "/Users/ivanprotsko/upready/worktrees/upready-store/redesign-olavka/apps/storefront/docs/evidence/t-2026-09-24-n15/slider-arrows-edges";
const b = await chromium.launch();
for (const w of [1024, 1440, 1920]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto("http://olavka-com.localhost:8233/ru", { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const rect = (el) => { if (!el) return null; const s = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { l: Math.round(s.left), r: Math.round(vw - s.right), t: Math.round(s.top), w: Math.round(s.width), h: Math.round(s.height), bg: cs.backgroundColor, radius: cs.borderRadius, shadow: cs.boxShadow.slice(0, 80), label: el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20) }; };
    const vis = (els) => [...els].filter((e) => { const s = e.getBoundingClientRect(); return s.width > 0 && getComputedStyle(e).visibility !== "hidden"; });
    const menu = vis(document.querySelectorAll("[data-testid=nav-menu-button]"))[0];
    const header = menu?.closest("header");
    const hdrCtl = header ? vis(header.querySelectorAll("a,button")).map(rect) : [];
    const slider = document.querySelector("[data-testid=olavka-hero-slider]");
    const arrows = slider ? vis(slider.querySelectorAll("button")).map(rect) : [];
    return { vw, menu: rect(menu), hdrCtl, arrows, menuSvg: menu?.querySelector("svg") ? rect(menu.querySelector("svg")) : null, arrowSvg: slider?.querySelector("button svg") ? rect(slider.querySelector("button svg")) : null };
  });
  console.log(`== ${w}`, JSON.stringify(r, null, 1));
  await p.screenshot({ path: `${D}/lead-measure-after-${w}.png` });
  await p.close();
}
await b.close();
