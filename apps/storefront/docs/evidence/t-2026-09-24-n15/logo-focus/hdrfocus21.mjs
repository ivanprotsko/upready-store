// Remark 21: every header control the keyboard reaches — radius at rest vs on :focus-visible, and the outline.
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
const [base, eng = "chromium", w = "1440", state = "top"] = process.argv.slice(2);
const b = await pw[eng].launch(eng === "firefox" ? { executablePath: "/Users/ivanprotsko/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox" } : {});
const p = await b.newPage({ viewport: { width: +w, height: 900 } });
await p.goto(`${base}/ru`, { waitUntil: "networkidle", timeout: 180000 });
if (state === "scrolled") { await p.evaluate(() => scrollTo(0, 600)); await p.waitForTimeout(600); }
for (let i = 0; i < 14; i++) {
  await p.keyboard.press("Tab");
  const r = await p.evaluate(() => {
    const a = document.activeElement; if (!a || !a.closest("#nav-h7")) return null;
    const f = getComputedStyle(a); const fr = f.borderTopLeftRadius, out = `${f.outlineWidth} ${f.outlineStyle}`, off = f.outlineOffset;
    const id = a.dataset.testid || a.getAttribute("aria-label") || a.textContent.trim().slice(0, 20);
    a.blur(); const rest = getComputedStyle(a).borderTopLeftRadius; a.focus({ focusVisible: true });
    return `${id} | rest ${rest} | focus ${fr} | outline ${out} off ${off}`;
  });
  if (r) console.log(eng, w, state, r); else break;
}
await b.close();
