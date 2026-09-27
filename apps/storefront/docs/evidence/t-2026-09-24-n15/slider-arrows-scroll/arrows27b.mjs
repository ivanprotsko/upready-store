// Hero arrows addition: offsets at rest and scrolled = menu / cart; black disc + white icon in light and dark;
// hover, focus; box/icon/radius/shadow shape = burger; one click per arrow.
// Usage: node arrows27b.mjs <port> <outdir> <engines> <widths> <modes>
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
const [port = "8233", D = ".", engines = "chromium", widthsArg = "1024,1440,1920", modesArg = "light,dark"] = process.argv.slice(2);
const FF = "/Users/ivanprotsko/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox";
const out = {};
const launch = async (eng) => { for (let i = 0; ; i++) { try { return eng === "firefox" ? await pw.firefox.launch({ executablePath: FF }) : await pw.chromium.launch(); } catch (e) { if (i >= 2) throw e; console.log("   launch retry", eng); } } };
for (const eng of engines.split(",")) {
  const b = await launch(eng);
  for (const mode of modesArg.split(",")) for (const w of widthsArg.split(",").map(Number)) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`http://olavka-com.localhost:${port}/ru`, { waitUntil: "networkidle" });
    await p.waitForTimeout(800);
    const menuSel = "[data-testid=nav-h7-desktop] [data-testid=nav-menu-button]";
    const cur = await p.evaluate(() => document.documentElement.dataset.mode);
    if (cur !== mode && (await p.$(menuSel))) {
      await p.click(menuSel); await p.click("[data-testid=nav-h7-desktop] [data-testid=side-menu-mode-toggle]");
      await p.keyboard.press("Escape"); await p.waitForTimeout(500);
      await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(800);
    }
    const measure = () => p.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const vis = (s) => [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden");
      const menu = vis("[data-testid=nav-menu-button]"); const header = menu?.closest("header");
      const cart = header?.querySelector("[data-testid=nav-cart-link]")?.closest("a,button");
      const prev = vis("[data-testid=olavka-hero-slider-prev]"), next = vis("[data-testid=olavka-hero-slider-next]");
      const box = (e) => { if (!e) return null; const s = e.getBoundingClientRect(); return { l: Math.round(s.left), r: Math.round(vw - s.right), t: Math.round(s.top), w: Math.round(s.width), h: Math.round(s.height) }; };
      const look = (e) => { if (!e) return null; const c = getComputedStyle(e); const svg = e.querySelector("svg"); const path = svg?.querySelector("path"); return { bg: c.backgroundColor, color: c.color, iconFill: path ? `${getComputedStyle(path).fill}|${getComputedStyle(path).stroke}` : null, icon: svg ? `${Math.round(svg.getBoundingClientRect().width)}x${Math.round(svg.getBoundingClientRect().height)}` : null, radius: c.borderRadius, shadow: c.boxShadow, transition: c.transition }; };
      const track = document.querySelector("[data-testid=olavka-hero-slider] ul")?.getBoundingClientRect();
      const slot = prev?.parentElement; const sc = slot ? getComputedStyle(slot) : null;
      return { mode: document.documentElement.dataset.mode, scrolled: document.getElementById("nav-h7")?.dataset.scrolled, scrollY: Math.round(scrollY), menu: box(menu), cart: box(cart), prev: box(prev), next: box(next), menuLook: look(menu), arrowLook: look(prev), slotTransition: sc?.transition, trackMid: track ? Math.round(track.top + track.height / 2) : null };
    });
    const row = {};
    for (const y of [0, 120, 0]) {
      await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(800);
      const m = await measure();
      const key = y === 0 ? (row.rest ? "restAgain" : "rest") : "scrolled";
      row[key] = { scrolled: m.scrolled, menuL: m.menu?.l, prevL: m.prev?.l, cartR: m.cart?.r, nextR: m.next?.r, box: m.prev && `${m.menu.w}x${m.menu.h}/${m.prev.w}x${m.prev.h}`, prevMidY: m.prev && m.prev.t + m.prev.h / 2, trackMid: m.trackMid };
      if (key === "rest") { row.mode = m.mode; row.arrowLook = m.arrowLook; row.menuLook = m.menuLook; row.slotTransition = m.slotTransition; }
      if (w === 1440 && key !== "restAgain") await p.screenshot({ path: `${D}/${eng}-1440-${mode}-${key}.png`, clip: { x: 0, y: 0, width: w, height: 700 } });
    }
    // mid-transition sample: arrow offset 100ms after crossing the threshold (motion shared with the header)
    if (row.rest.prevL != null) {
      await p.evaluate(() => window.scrollTo(0, 120)); await p.waitForTimeout(100);
      row.at100ms = await p.evaluate(() => { const vw = document.documentElement.clientWidth; const m = [...document.querySelectorAll("[data-testid=nav-menu-button]")].find((e) => e.getBoundingClientRect().width > 0); const a = document.querySelector("[data-testid=olavka-hero-slider-prev]"); return { menuL: +m.getBoundingClientRect().left.toFixed(1), prevL: +a.getBoundingClientRect().left.toFixed(1) }; });
      await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(800);
      // hover
      await p.hover("[data-testid=olavka-hero-slider-prev]"); await p.waitForTimeout(300);
      row.hoverBg = await p.evaluate(() => getComputedStyle(document.querySelector("[data-testid=olavka-hero-slider-prev]")).backgroundColor);
      await p.mouse.move(w / 2, 880); await p.waitForTimeout(300);
      // keyboard focus
      await p.evaluate(() => document.activeElement?.blur());
      for (let i = 0; i < 40; i++) { await p.keyboard.press("Tab"); if ((await p.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "olavka-hero-slider-prev") break; }
      row.focus = await p.evaluate(() => { const el = document.activeElement; const c = getComputedStyle(el); return { id: el.getAttribute("data-testid"), outline: `${c.outlineStyle} ${c.outlineWidth} ${c.outlineColor}`, offset: c.outlineOffset, shadow: c.boxShadow, radius: c.borderRadius }; });
      if (w === 1440) { const bb = await p.$eval("[data-testid=olavka-hero-slider-prev]", (e) => { const s = e.getBoundingClientRect(); return { x: s.x, y: s.y }; }); await p.screenshot({ path: `${D}/${eng}-1440-${mode}-focus-prev.png`, clip: { x: Math.max(0, bb.x - 30), y: bb.y - 30, width: 100, height: 100 } }); }
      await p.evaluate(() => document.activeElement?.blur()); await p.waitForTimeout(300);
      // one click each way
      const centred = () => p.evaluate(() => { const ul = document.querySelector("[data-testid=olavka-hero-slider] ul"); const mid = ul.scrollLeft + ul.clientWidth / 2; let best = null, bd = 1e9; [...ul.children].forEach((li) => { const c = li.offsetLeft + li.offsetWidth / 2; const d = Math.abs(c - mid); if (d < bd) { bd = d; best = li.querySelector("a")?.getAttribute("href"); } }); return best; });
      const c0 = await centred(); await p.click("[data-testid=olavka-hero-slider-next]"); await p.waitForTimeout(1500);
      const c1 = await centred(); await p.click("[data-testid=olavka-hero-slider-prev]"); await p.waitForTimeout(1500);
      const c2 = await centred();
      row.click = { nextMoved: c1 !== c0, prevBack: c2 === c0 };
    }
    out[`${eng}-${w}-${mode}`] = row;
    const r = row, a = r.arrowLook;
    console.log(`== ${eng} ${w} ${mode}(${r.mode})`, "rest", JSON.stringify(r.rest), "| scrolled", JSON.stringify(r.scrolled), "| back", JSON.stringify(r.restAgain));
    if (a) console.log(`   arrow bg ${a.bg} icon ${a.iconFill} ${a.icon} radius ${a.radius} | menu bg ${r.menuLook.bg} icon ${r.menuLook.iconFill} ${r.menuLook.icon} | shadow arrow=menu ${a.shadow === r.menuLook.shadow} | hover ${r.hoverBg} | focus ${JSON.stringify(r.focus)} | slot ${r.slotTransition} | t100 ${JSON.stringify(r.at100ms)} | click ${JSON.stringify(r.click)}`);
    await ctx.close();
  }
  await b.close();
}
(await import("node:fs")).writeFileSync(`${D}/measure-${engines.replace(/,/g, "-")}-${widthsArg.replace(/,/g, "-")}.json`, JSON.stringify(out, null, 1));
