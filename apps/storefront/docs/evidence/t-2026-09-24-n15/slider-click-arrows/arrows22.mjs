// Remark 22: arrows — quick bursts, keyboard, Tab order, visibility per width, geometry, shots. Args: out tag base engines widths
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
import fs from "fs";
const [out, tag, base, engines = "chromium,firefox", ws = "1440,1920,2240,1023,390"] = process.argv.slice(2);
const FF = "/Users/ivanprotsko/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox";
fs.mkdirSync(out, { recursive: true });
const centred = (el) => { const items = [...el.children]; const mid = el.scrollLeft + el.clientWidth / 2; let i = 0, best = 1e9; items.forEach((c, k) => { if (!c.offsetWidth) return; const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < best) { best = d; i = k; } }); const li = items[i]; return `${li.dataset.copy}:${li.querySelector("a").getAttribute("aria-label").replace(/\n/g, " ")}`; };
for (const eng of engines.split(",")) {
  const b = await pw[eng].launch(eng === "firefox" ? { executablePath: FF } : {});
  for (const w of ws.split(",").map(Number)) {
    const p = await b.newPage({ viewport: { width: w, height: 1000 } });
    await p.goto(`${base}/ru`, { waitUntil: "networkidle", timeout: 180000 });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await p.waitForSelector('[data-testid="olavka-hero-slider"] ul[data-loop-ready]', { timeout: 30000 });
    const ul = p.locator('[data-testid="olavka-hero-slider"] ul');
    const geo = await p.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return cs.display === "none" || cs.visibility === "hidden" ? "hidden" : [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10); };
      const lis = [...document.querySelectorAll('[data-testid="olavka-hero-slider"] ul > li')].map((li) => li.getBoundingClientRect()).filter((b) => b.right > 0 && b.left < innerWidth);
      const card = lis.find((b) => b.left > 0 && b.right < innerWidth) || lis[1];
      return { prev: r('[data-testid="olavka-hero-slider-prev"]'), next: r('[data-testid="olavka-hero-slider-next"]'), card: card ? [card.x, card.y, card.width, card.height].map((v) => Math.round(v * 10) / 10) : null };
    });
    const start = await ul.evaluate(centred);
    let line = `${eng} ${w} rest ${start} | prev ${JSON.stringify(geo.prev)} next ${JSON.stringify(geo.next)} card ${JSON.stringify(geo.card)}`;
    if (geo.next !== "hidden") {
      await p.screenshot({ path: `${out}/${eng}-${w}-arrows-${tag}.png`, clip: { x: 0, y: Math.max(0, geo.card[1] - 60), width: w, height: geo.card[3] + 120 } });
      // a burst of 5 quick clicks on next, then 7 on previous
      for (let i = 0; i < 5; i++) { await p.locator('[data-testid="olavka-hero-slider-next"]').click(); await p.waitForTimeout(90); }
      await p.waitForTimeout(1500);
      const afterNext5 = await ul.evaluate(centred);
      for (let i = 0; i < 7; i++) { await p.locator('[data-testid="olavka-hero-slider-prev"]').click(); await p.waitForTimeout(90); }
      await p.waitForTimeout(1500);
      const afterPrev7 = await ul.evaluate(centred);
      // keyboard: focus next, Enter, Space
      await p.locator('[data-testid="olavka-hero-slider-next"]').focus();
      await p.keyboard.press("Enter"); await p.waitForTimeout(1200);
      const afterEnter = await ul.evaluate(centred);
      await p.keyboard.press("Space"); await p.waitForTimeout(1200);
      const afterSpace = await ul.evaluate(centred);
      const ring = await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return `${a.dataset.testid} fv=${a.matches(":focus-visible")} ${cs.outlineWidth} ${cs.outlineStyle} r=${cs.borderTopLeftRadius}`; });
      const fb = await p.locator('[data-testid="olavka-hero-slider-next"]').boundingBox();
      await p.screenshot({ path: `${out}/${eng}-${w}-next-focus-${tag}.png`, clip: { x: fb.x - 12, y: fb.y - 12, width: fb.width + 24, height: fb.height + 24 } });
      line += `\n   5×next → ${afterNext5}; then 7×prev → ${afterPrev7}; Enter → ${afterEnter}; Space → ${afterSpace}; focus ${ring}`;
    }
    // Tab order through the slider from the page top: which slider elements get focus
    await p.goto(`${base}/ru`, { waitUntil: "networkidle", timeout: 180000 });
    await p.waitForSelector('[data-testid="olavka-hero-slider"] ul[data-loop-ready]', { timeout: 30000 });
    const seq = [];
    for (let i = 0; i < 30; i++) {
      await p.keyboard.press("Tab");
      const f = await p.evaluate(() => { const a = document.activeElement; if (!a.closest('[data-testid="olavka-hero-slider"]')) return null; const li = a.closest("li"); return li ? `${li.dataset.copy}:${(a.getAttribute("aria-label") || "").replace(/\n/g, " ").slice(0, 12)}` : a.dataset.testid ? a.dataset.testid.replace("olavka-hero-slider-", "") : `${a.tagName.toLowerCase()}(scroller)`; });
      if (f) seq.push(f); else if (seq.length) break;
    }
    line += `\n   Tab: ${seq.join(" → ")}`;
    const a11y = await p.evaluate(() => [...document.querySelectorAll('[data-testid="olavka-hero-slide-clone"]')].every((li) => li.getAttribute("aria-hidden") === "true" && li.querySelector("a").tabIndex === -1));
    line += ` | clones aria-hidden + tabIndex -1: ${a11y}`;
    console.log(line);
    await p.close();
  }
  await b.close();
}
