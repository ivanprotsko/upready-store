// Columns of every product grid (computed grid-template-columns tracks + first-row cards) and the footer's placement.
// Usage: node cols960.mjs <port> <host> <engines> <widths> [outdir]
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
const [port = "8233", host = "olavka-com", engines = "chromium", widthsArg = "390,719,720,960,961,1024,1440", D] = process.argv.slice(2);
const FF = "/Users/ivanprotsko/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox";
const launch = async (eng) => { for (let i = 0; ; i++) { try { return eng === "firefox" ? await pw.firefox.launch({ executablePath: FF }) : await pw.chromium.launch(); } catch (e) { if (i >= 2) throw e; console.log("   launch retry", eng); } } };
const base = `http://${host}.localhost:${port}`;
const out = {};
for (const eng of engines.split(",")) {
  const b = await launch(eng);
  const probe = await b.newPage();
  await probe.goto(`${base}/ru/store`, { waitUntil: "networkidle" });
  const pdp = await probe.evaluate(() => document.querySelector("[data-testid=products-list] a[href*='/products/']")?.getAttribute("href"));
  await probe.close();
  const paths = ["/ru", "/ru/store", pdp].filter(Boolean);
  for (const path of paths) for (const w of widthsArg.split(",").map(Number)) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    await p.goto(base + path, { waitUntil: "networkidle" });
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const tracks = (el) => getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean);
      const grid = (el) => { if (!el) return null; const cs = getComputedStyle(el); const t = cs.display.includes("grid") ? tracks(el) : []; const kids = [...el.children].filter((c) => c.getBoundingClientRect().width > 0); const top = kids[0] ? Math.round(kids[0].getBoundingClientRect().top) : 0; const row1 = kids.filter((c) => Math.abs(c.getBoundingClientRect().top - top) < 4).length; const lastTop = kids.length ? Math.round(kids[kids.length - 1].getBoundingClientRect().top) : 0; const lastRow = kids.filter((c) => Math.abs(c.getBoundingClientRect().top - lastTop) < 4).length; const vw = document.documentElement.clientWidth; const full = kids.filter((c) => { const b = c.getBoundingClientRect(); return b.left >= -1 && b.right <= vw + 1; }).length; return { display: cs.display, full, tracks: t.length, trackW: t.map((x) => Math.round(parseFloat(x))).join("/"), gap: cs.columnGap, cards: kids.length, row1, lastRow, lefts: kids.slice(0, row1).map((c) => Math.round(c.getBoundingClientRect().left)).join(",") }; };
      const res = {};
      document.querySelectorAll("[data-product-grid], [data-testid=products-list], [data-testid=footer-olavka] .grid, ul").forEach((el, i) => {
        const key = el.getAttribute("data-product-grid") ? `home-${el.getAttribute("data-product-grid")}` : el.getAttribute("data-testid") === "products-list" ? "store-list" : el.closest("[data-testid=footer-olavka]") && el.classList.contains("grid") ? "footer" : null;
        if (key && !res[key]) res[key] = grid(el);
      });
      // PDP rails: product-row lists (lists whose items hold product links, outside the header)
      const rails = [...document.querySelectorAll("section ul, div ul")].filter((u) => u.querySelector("a[href*='/products/']") && !u.closest("header,[data-testid=products-list],[data-product-grid],[data-testid=olavka-hero-slider]"));
      (/\/products\//.test(location.pathname) ? rails : []).slice(0, 2).forEach((u, i) => { res[`rail${i + 1}`] = grid(u); });
      const f = document.querySelector("[data-testid=footer-olavka] .grid");
      if (f) res.footerCols = [...f.children].map((c) => { const cs = getComputedStyle(c); return `${Math.round(c.getBoundingClientRect().left)}@${Math.round(c.getBoundingClientRect().top - f.getBoundingClientRect().top)}`; }).join(" ");
      return res;
    });
    const key = `${eng} ${/\/products\//.test(path) ? "PDP" : path} ${w}`;
    out[key] = r;
    const s = (g) => g ? `${g.display === "grid" ? g.tracks + "col" : "strip(" + g.full + " in view)"} row1=${g.row1} cards=${g.cards} last=${g.lastRow} gap=${g.gap}` : "-";
    console.log(key.padEnd(28), Object.entries(r).filter(([k]) => k !== "footerCols").map(([k, g]) => `${k}: ${s(g)}`).join(" | "), r.footerCols ? `| footer x@y ${r.footerCols}` : "");
    if (D && (w === 960 || w === 961) && eng === "chromium" && !/\/products\//.test(path)) await p.screenshot({ path: `${D}/${host}-${path.replace(/\//g, "_")}-${w}-${eng}.png`, fullPage: true });
    await p.close();
  }
  await b.close();
}
if (D) (await import("node:fs")).writeFileSync(`${D}/cols-${host}-${engines.replace(/,/g, "-")}.json`, JSON.stringify(out, null, 1));
