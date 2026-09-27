// The lead's measure.mjs (same evaluate), + Firefox, + hover/focus styles, + one click per arrow.
// Usage: node arrows27.mjs <port> <outdir> <engines comma> [widths comma] [mode]
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
const [port = "8233", D = ".", engines = "chromium", widthsArg = "1024,1440,1920", mode = "light"] = process.argv.slice(2);
const FF = "/Users/ivanprotsko/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox";
const out = {};
for (const eng of engines.split(",")) {
  const b = eng === "firefox" ? await pw.firefox.launch({ executablePath: FF }) : await pw.chromium.launch();
  for (const w of widthsArg.split(",").map(Number)) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`http://olavka-com.localhost:${port}/ru`, { waitUntil: "networkidle" });
    await p.waitForTimeout(800);
    if (mode === "dark") {
      await p.click("[data-testid=nav-h7-desktop] [data-testid=nav-menu-button]");
      await p.click("[data-testid=nav-h7-desktop] [data-testid=side-menu-mode-toggle]");
      await p.keyboard.press("Escape");
      await p.waitForTimeout(600);
      await p.reload({ waitUntil: "networkidle" });
      await p.waitForTimeout(800);
      console.log("   data-mode:", await p.evaluate(() => document.documentElement.dataset.mode));
    }
    const measure = () => p.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const rect = (el) => { if (!el) return null; const s = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        return { l: Math.round(s.left), r: Math.round(vw - s.right), t: Math.round(s.top), w: Math.round(s.width), h: Math.round(s.height), bg: cs.backgroundColor, radius: cs.borderRadius, shadow: cs.boxShadow.slice(0, 80), label: el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20) }; };
      const vis = (els) => [...els].filter((e) => { const s = e.getBoundingClientRect(); return s.width > 0 && getComputedStyle(e).visibility !== "hidden"; });
      const menu = vis(document.querySelectorAll("[data-testid=nav-menu-button]"))[0];
      const header = menu?.closest("header");
      const hdrCtl = header ? vis(header.querySelectorAll("a,button")).map(rect) : [];
      const slider = document.querySelector("[data-testid=olavka-hero-slider]");
      const arrows = slider ? vis(slider.querySelectorAll("button")).map(rect) : [];
      const cart = header?.querySelector("[data-testid=nav-cart-link]")?.closest("a,button");
      const track = slider?.querySelector("ul");
      const trackRect = track?.getBoundingClientRect();
      const arrowEl = slider?.querySelector("button");
      const style = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { color: cs.color, bg: cs.backgroundColor, shadow: cs.boxShadow, radius: cs.borderRadius, cursor: cs.cursor, transition: cs.transition }; };
      return { vw, menu: rect(menu), cart: rect(cart), hdrCtl, arrows, menuSvg: menu?.querySelector("svg") ? rect(menu.querySelector("svg")) : null, arrowSvg: slider?.querySelector("button svg") ? rect(slider.querySelector("button svg")) : null,
        trackMid: trackRect ? Math.round(trackRect.top + trackRect.height / 2) : null, menuStyle: style(menu), arrowStyle: style(arrowEl) };
    });
    const r = await measure();
    // hover + focus styles of menu vs arrow
    const hoverOf = async (sel) => { await p.hover(sel); await p.waitForTimeout(250); const v = await p.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, sel); await p.mouse.move(w / 2, 880); await p.waitForTimeout(250); return v; };
    let hov = null, foc = null, click = null;
    if (r.arrows.length) {
      hov = { menu: await hoverOf("[data-testid=nav-h7-desktop] [data-testid=nav-menu-button]"), arrow: await hoverOf("[data-testid=olavka-hero-slider-prev]") };
      const focusOf = async (sel) => p.evaluate((s) => { const el = document.querySelector(s); return null; }, sel);
      // keyboard focus: tab until the element is focused
      const tabTo = async (testid) => { await p.evaluate(() => document.activeElement?.blur()); await p.keyboard.press("Tab"); for (let i = 0; i < 40; i++) { const t = await p.evaluate(() => document.activeElement?.getAttribute("data-testid")); if (t === testid) break; await p.keyboard.press("Tab"); } return p.evaluate(() => { const el = document.activeElement; const cs = getComputedStyle(el); return { id: el.getAttribute("data-testid"), outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, offset: cs.outlineOffset, radius: cs.borderRadius }; }); };
      await p.evaluate(() => window.scrollTo(0, 0));
      foc = { menu: await tabTo("nav-menu-button"), arrow: await tabTo("olavka-hero-slider-prev") };
      if (foc.arrow.id === "olavka-hero-slider-prev") await p.screenshot({ path: `${D}/${eng}-${w}-${mode}-focus-prev.png`, clip: { x: 0, y: 0, width: w, height: 620 } });
      await p.evaluate(() => document.activeElement?.blur());
      await p.mouse.move(w / 2, 880);
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.waitForTimeout(300);
      // one click on each arrow
      const centred = () => p.evaluate(() => { const ul = document.querySelector("[data-testid=olavka-hero-slider] ul"); const mid = ul.scrollLeft + ul.clientWidth / 2; let best = null, bd = 1e9; [...ul.children].forEach((li, i) => { const c = li.offsetLeft + li.offsetWidth / 2; const d = Math.abs(c - mid); if (d < bd) { bd = d; best = { i, href: li.querySelector("a")?.getAttribute("href"), copy: li.getAttribute("data-copy") } } }); return { scrollLeft: Math.round(ul.scrollLeft), ...best }; });
      const c0 = await centred();
      await p.click("[data-testid=olavka-hero-slider-next]"); await p.waitForTimeout(1500);
      const c1 = await centred();
      await p.click("[data-testid=olavka-hero-slider-prev]"); await p.waitForTimeout(1500);
      const c2 = await centred();
      click = { start: c0, afterNext: c1, afterPrev: c2, nextMoved: c1.href !== c0.href, prevBack: c2.href === c0.href };
    }
    await p.mouse.move(w / 2, 880);
    await p.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${D}/${eng}-${w}-${mode}.png` });
    const m = r.menu, c = r.cart, [a0, a1] = r.arrows;
    const summary = a0 ? { menuL: m.l, arrowPrevL: a0.l, cartR: c?.r, arrowNextR: a1?.r, menuBox: `${m.w}x${m.h}`, arrowBox: `${a0.w}x${a0.h}`, menuIcon: r.menuSvg && `${r.menuSvg.w}x${r.menuSvg.h}`, arrowIcon: r.arrowSvg && `${r.arrowSvg.w}x${r.arrowSvg.h}`, arrowMidY: a0.t + a0.h / 2, trackMidY: r.trackMid,
      sameStyle: JSON.stringify(r.menuStyle) === JSON.stringify(r.arrowStyle), hover: hov, focus: foc, click } : { arrows: 0 };
    out[`${eng}-${w}-${mode}`] = { summary, menuStyle: r.menuStyle, arrowStyle: r.arrowStyle };
    console.log(`== ${eng} ${w} ${mode}`, JSON.stringify(summary));
    if (!summary.sameStyle && a0) console.log("   menu ", JSON.stringify(r.menuStyle), "\n   arrow", JSON.stringify(r.arrowStyle));
    await ctx.close();
  }
  await b.close();
}
import("node:fs").then((fs) => fs.writeFileSync(`${D}/measure-${engines.replace(/,/g, "-")}-${mode}.json`, JSON.stringify(out, null, 1)));
