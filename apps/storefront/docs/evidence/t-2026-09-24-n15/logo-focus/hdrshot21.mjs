// Remark 21: crop of the whole header bar with each control focused in turn (Tab). Args: out tag base eng width state
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
import fs from "fs";
const [out, tag, base, eng = "chromium", w = "1440", state = "top"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await pw[eng].launch(eng === "firefox" ? { executablePath: "/Users/ivanprotsko/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox" } : {});
const p = await b.newPage({ viewport: { width: +w, height: 900 } });
const name = new URL(base).hostname.split(".")[0];
await p.goto(`${base}/ru`, { waitUntil: "networkidle", timeout: 180000 });
await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
if (state === "scrolled") { await p.evaluate(() => scrollTo(0, 600)); await p.waitForTimeout(600); }
for (let i = 0; i < 14; i++) {
  await p.keyboard.press("Tab");
  const id = await p.evaluate(() => { const a = document.activeElement; return a && a.closest("#nav-h7") ? a.dataset.testid : null; });
  if (!id) break;
  await p.waitForTimeout(300);
  const box = await p.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  await p.screenshot({ path: `${out}/${eng}-${name}-${w}-${state}-${id}-${tag}.png`, clip: { x: Math.max(0, box[0] - 10), y: Math.max(0, box[1] - 10), width: box[2] + 20, height: box[3] + 20 } });
}
await b.close();
