// Remark 20: olavka in dark (and light, for comparison) mode — shots of every key page + a scan for low-contrast text and
// light surfaces left on the dark page. The mode is the visitor's stored choice (localStorage "upready-store.mode"), which the
// pre-paint script applies before the first paint. Args: out base engine widths modes
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
import fs from "fs";
const [out, base, eng = "chromium", ws = "1440,390", modes = "dark,light"] = process.argv.slice(2);
const FF = "/Users/ivanprotsko/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox";
fs.mkdirSync(out, { recursive: true });
const b = await pw[eng].launch(eng === "firefox" ? { executablePath: FF } : {});
const scan = () => {
  const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, bb] = m.slice(0, 3).map((v) => { v = v / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bb; };
  const alpha = (c) => { const m = c.match(/[\d.]+/g); return m && m.length > 3 ? +m[3] : 1; };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== "none" && !cs.backgroundImage.startsWith("linear")) return null; if (alpha(cs.backgroundColor) > 0.5) return cs.backgroundColor; } return getComputedStyle(document.documentElement).backgroundColor; };
  const name = (el) => { const t = el.closest("[data-testid]"); return `${el.tagName.toLowerCase()}${t ? `@${t.dataset.testid}` : ""}`; };
  const low = [], light = [];
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.opacity !== "0"; };
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest('[data-testid="olavka-hero-slider"], nextjs-portal, script, style, svg, img')) continue;
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own) {
      const bg = bgOf(el); if (bg) { const l1 = lum(cs.color), l2 = lum(bg); const cr = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); if (cr < 3) low.push(`${name(el)} «${el.textContent.trim().slice(0, 24)}» ${cs.color} on ${bg} ${cr.toFixed(2)}`); }
    }
    const r = el.getBoundingClientRect();
    if (alpha(cs.backgroundColor) > 0.5 && lum(cs.backgroundColor) > 0.6 && r.width * r.height > 1500) light.push(`${name(el)}.${String(el.className).slice(0, 40)} ${Math.round(r.width)}×${Math.round(r.height)} bg ${cs.backgroundColor}`);
  }
  const uniq = (a) => [...new Map(a.map((s) => [s.replace(/«[^»]*»/, ""), s])).values()];
  return { low: uniq(low), light: uniq(light) };
};
for (const mode of modes.split(",")) for (const w of ws.split(",").map(Number)) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("upready-store.mode", m); } catch (e) {} }, mode);
  const p = await ctx.newPage();
  const go = async (path) => { if (!path.startsWith("/ru")) path = `/ru${path}`; await p.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 180000 }); await p.addStyleTag({ content: "nextjs-portal{display:none!important}" }); await p.waitForTimeout(400); };
  const report = async (tag) => { const r = await p.evaluate(scan); console.log(`== ${eng} ${w} ${mode} ${tag}: low-contrast ${r.low.length}, light surfaces ${r.light.length}`); r.low.slice(0, 25).forEach((s) => console.log("   LOW  " + s)); r.light.slice(0, 25).forEach((s) => console.log("   LIGHT " + s)); };
  const shot = async (tag, full = false) => { await p.screenshot({ path: `${out}/${w}-${mode}-${tag}.jpg`, fullPage: full, type: "jpeg", quality: 70 }); };
  await go("/ru");
  const mode0 = await p.evaluate(() => document.documentElement.dataset.mode);
  console.log(`## ${eng} ${w} ${mode}: html data-mode=${mode0}`);
  await shot("home", true); await report("home");
  await p.evaluate(() => scrollTo(0, 700)); await p.waitForTimeout(600); await shot("home-scrolled");
  const cat = await p.evaluate(() => document.querySelector('a[href*="/categories/"]')?.getAttribute("href"));
  const prod = await p.evaluate(() => [...document.querySelectorAll('a[href*="/products/"]')].find((a) => !a.closest('[data-testid="olavka-hero-slider"]'))?.getAttribute("href"));
  // burger menu
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
  const menuBtn = p.locator('[data-testid="nav-menu-button"]').filter({ visible: true }).first();
  if (await menuBtn.count()) { await menuBtn.click(); await p.waitForTimeout(700); await shot("menu"); await report("menu"); await p.keyboard.press("Escape"); await p.waitForTimeout(400); }
  // search overlay
  await p.keyboard.press(w > 1000 ? "Meta+k" : "Control+k"); await p.waitForTimeout(600);
  if (!(await p.evaluate(() => !!document.querySelector('[role="dialog"]')))) { await p.keyboard.press("Control+k"); await p.waitForTimeout(600); }
  if (await p.evaluate(() => !!document.querySelector('[role="dialog"]'))) { await p.keyboard.type("асд"); await p.waitForTimeout(1500); await shot("search"); await report("search"); await p.keyboard.press("Escape"); }
  await go("/ru/store"); await shot("store"); await report("store");
  if (cat) { await go(cat); await shot("category"); await report("category"); }
  if (prod) { await go(prod); await shot("product", true); await report("product"); }
  await go("/ru/cart"); await shot("cart"); await report("cart");
  await ctx.close();
}
await b.close();
