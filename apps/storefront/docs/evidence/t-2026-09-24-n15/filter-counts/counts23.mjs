// Remark 23: each sidebar option checkbox's count must equal the list's total once it is clicked — from no filter and
// from one checkbox already on (a combination). Args: base path engine width [shot]
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
const [base, path = "/ru/store", eng = "chromium", w = "1440", shot] = process.argv.slice(2);
const FF = "/Users/ivanprotsko/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox";
const b = await pw[eng].launch(eng === "firefox" ? { executablePath: FF } : {});
const p = await b.newPage({ viewport: { width: +w, height: 1000 } });
const SEL = '[data-testid="filter-sidebar"] [data-testid^="filter-group-option-"] label';
const total = () => p.evaluate(() => document.querySelector('[data-testid="products-list"]')?.dataset.totalCount);
const rows = () => p.evaluate((SEL) => [...document.querySelectorAll(SEL)].map((l) => ({ label: l.querySelector("span").innerText, count: l.querySelector('[data-testid="filter-option-count"]')?.innerText ?? null, checked: l.querySelector("input").checked })), SEL);
const click = async (i) => { const before = p.url(); await p.locator(SEL).nth(i).click(); await p.waitForFunction((b) => location.href !== b, before, { timeout: 60000 }); await p.goto(p.url(), { waitUntil: "networkidle" }); return total(); };
let bad = 0, n = 0;
const sweep = async (url, tag) => {
  await p.goto(url, { waitUntil: "networkidle" });
  const rs = await rows(); const t0 = await total(); const res = [];
  for (let i = 0; i < rs.length; i++) {
    n++;
    if (rs[i].checked) { if (rs[i].count !== t0) bad++; res.push(`${rs[i].label}=${rs[i].count} (on; list ${t0})${rs[i].count === t0 ? "" : " ✗"}`); continue; }
    await p.goto(url, { waitUntil: "networkidle" });
    const t = await click(i); if (t !== rs[i].count) bad++;
    res.push(`${rs[i].label}: ${rs[i].count} → ${t}${t === rs[i].count ? "" : " ✗"}`);
  }
  console.log(`${eng} ${w} ${path} ${tag} (list ${t0}): ${res.join(" | ")}`);
};
await sweep(`${base}${path}`, "no filter");
await p.goto(`${base}${path}`, { waitUntil: "networkidle" });
const k = (await rows()).findIndex((r) => +r.count > 0);
if (k >= 0) { const lab = (await rows())[k].label; await click(k); await sweep(p.url(), `with «${lab}» on`); }
if (shot) { await p.goto(`${base}${path}`, { waitUntil: "networkidle" }); const sb = await p.locator('[data-testid="filter-sidebar"]').boundingBox(); if (sb) await p.screenshot({ path: shot, clip: { x: Math.max(0, sb.x - 8), y: Math.max(0, sb.y - 8), width: sb.width + 16, height: Math.min(sb.height + 16, 980) } }); }
console.log(`${eng} ${w} ${path}: ${n - bad}/${n} counts equal the list's total`);
await b.close();
