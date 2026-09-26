// Remark 22 debug: log scroll / scrollend around a burst of arrow clicks. Args: base eng n dir gapMs
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
const [base, eng = "chromium", n = "7", dir = "prev", gap = "90", pre = "5"] = process.argv.slice(2);
const FF = "/Users/ivanprotsko/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox";
const b = await pw[eng].launch(eng === "firefox" ? { executablePath: FF } : {});
const p = await b.newPage({ viewport: { width: +(process.env.W || 1440), height: 1000 } });
await p.goto(`${base}/ru`, { waitUntil: "networkidle", timeout: 180000 });
await p.waitForSelector('[data-testid="olavka-hero-slider"] ul[data-loop-ready]');
const centred = (el) => { const items = [...el.children]; const mid = el.scrollLeft + el.clientWidth / 2; let i = 0, best = 1e9; items.forEach((c, k) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < best) { best = d; i = k; } }); return i; };
const ul = p.locator('[data-testid="olavka-hero-slider"] ul');
for (let i = 0; i < +pre; i++) { await p.locator('[data-testid="olavka-hero-slider-next"]').click(); await p.waitForTimeout(+gap); }
await p.waitForTimeout(1500);
console.log("start idx", await ul.evaluate(centred));
await ul.evaluate((el) => { window.__ev = []; const t0 = performance.now(); el.addEventListener("scrollend", () => window.__ev.push(`${Math.round(performance.now() - t0)} end ${Math.round(el.scrollLeft)}`)); window.__t0 = t0; });
for (let i = 0; i < +n; i++) { await p.locator(`[data-testid="olavka-hero-slider-${dir}"]`).click(); await ul.evaluate((el) => window.__ev.push(`${Math.round(performance.now() - window.__t0)} click ${Math.round(el.scrollLeft)}`)); await p.waitForTimeout(+gap); }
await p.waitForTimeout(+(process.env.WAIT || 1800));
console.log((await p.evaluate(() => window.__ev)).join(" | "));
console.log("end idx", await ul.evaluate(centred));
await b.close();
