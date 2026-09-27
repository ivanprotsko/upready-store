// Remark 22: Tab to the next arrow (a real keyboard focus) and crop its ring. Args: out base engines widths
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
const [out, base, engines = "chromium,firefox", ws = "1440,1920"] = process.argv.slice(2);
const FF = "/Users/ivanprotsko/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox";
for (const eng of engines.split(",")) {
  const b = await pw[eng].launch(eng === "firefox" ? { executablePath: FF } : {});
  for (const w of ws.split(",").map(Number)) {
    const p = await b.newPage({ viewport: { width: w, height: 1000 } });
    await p.goto(`${base}/ru`, { waitUntil: "networkidle", timeout: 180000 });
    await p.waitForSelector('[data-testid="olavka-hero-slider"] ul[data-loop-ready]');
    for (let i = 0; i < 40; i++) { await p.keyboard.press("Tab"); if (await p.evaluate(() => document.activeElement?.dataset?.testid === "olavka-hero-slider-next")) break; }
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); const b = a.getBoundingClientRect(); return { id: a.dataset.testid, fv: a.matches(":focus-visible"), ring: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor} off ${cs.outlineOffset} r=${cs.borderTopLeftRadius}`, box: [b.x, b.y, b.width, b.height] }; });
    await p.screenshot({ path: `${out}/${eng}-${w}-next-tab-focus-after.png`, clip: { x: r.box[0] - 14, y: r.box[1] - 14, width: r.box[2] + 28, height: r.box[3] + 28 } });
    console.log(eng, w, JSON.stringify({ id: r.id, fv: r.fv, ring: r.ring }));
    await p.close();
  }
  await b.close();
}
