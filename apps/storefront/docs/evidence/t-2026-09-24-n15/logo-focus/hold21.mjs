// Remark 21: the logo's long press still opens the studio dialog; a short click and Enter still go home.
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
const [base, eng = "chromium"] = process.argv.slice(2);
const b = await pw[eng].launch(eng === "firefox" ? { executablePath: "/Users/ivanprotsko/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox" } : {});
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto(`${base}/ru/store`, { waitUntil: "networkidle", timeout: 180000 });
  const logo = p.locator(w > 1000 ? '[data-testid="nav-store-link"]' : '[data-testid="nav-store-link-compact"]');
  const bx = await logo.boundingBox();
  await p.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2);
  await p.mouse.down(); await p.waitForTimeout(2300); await p.mouse.up();
  await p.waitForTimeout(400);
  const dlg = await p.evaluate(() => !!document.querySelector("dialog[open]"));
  const url1 = new URL(p.url()).pathname;
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const closed = await p.evaluate(() => !document.querySelector("dialog[open]"));
  await logo.click(); await p.waitForURL((u) => !u.pathname.includes("/store"), { timeout: 60000 }).catch(() => {});
  const url2 = new URL(p.url()).pathname;
  await p.goto(`${base}/ru/store`, { waitUntil: "networkidle", timeout: 180000 });
  await logo.focus(); await p.keyboard.press("Enter"); await p.waitForURL((u) => !u.pathname.includes("/store"), { timeout: 60000 }).catch(() => {});
  console.log(eng, w, `hold 2.3s → dialog open ${dlg}, still on ${url1}; Esc closes ${closed}; click → ${url2}; Enter → ${new URL(p.url()).pathname}`);
  await p.close();
}
await b.close();
