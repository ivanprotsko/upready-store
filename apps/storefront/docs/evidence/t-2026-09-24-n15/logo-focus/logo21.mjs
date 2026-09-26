// Remark 21: Tab to the header logo, read its focus ring (outline, radius) and shoot a crop. Args: out tag base engines widths [scrolled]
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
import fs from "fs";
const [out, tag, base, engines = "chromium,firefox", ws = "1440,390"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const name = new URL(base).hostname.split(".")[0];
for (const eng of engines.split(",")) {
  const b = await pw[eng].launch(eng === "firefox" ? { executablePath: "/Users/ivanprotsko/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox" } : {});
  for (const w of ws.split(",").map(Number)) for (const state of ["top", "scrolled"]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.goto(`${base}/ru`, { waitUntil: "networkidle", timeout: 180000 });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    if (state === "scrolled") { await p.evaluate(() => scrollTo(0, 600)); await p.waitForTimeout(600); }
    const sel = '[data-testid^="nav-store-link"]';
    let found = null;
    for (let i = 0; i < 25; i++) {
      await p.keyboard.press("Tab");
      found = await p.evaluate((sel) => { const a = document.activeElement; return a && a.matches(sel) ? a.dataset.testid : null; }, sel);
      if (found) break;
    }
    await p.waitForTimeout(350);
    const info = await p.evaluate(() => {
      const a = document.activeElement, cs = getComputedStyle(a), r = a.getBoundingClientRect(), pcs = getComputedStyle(a.parentElement);
      return { el: a.dataset.testid, fv: a.matches(":focus-visible"), outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, offset: cs.outlineOffset, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, parent: `${a.parentElement.tagName} ${pcs.display} r=${pcs.borderTopLeftRadius}`, box: [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10) };
    });
    console.log(eng, name, w, state, tag, JSON.stringify(info));
    const [x, y, bw, bh] = info.box;
    await p.screenshot({ path: `${out}/${eng}-${name}-${w}-${state}-${tag}.png`, clip: { x: Math.max(0, x - 16), y: Math.max(0, y - 16), width: Math.min(bw + 32, w), height: bh + 32 } });
    await p.close();
  }
  await b.close();
}
