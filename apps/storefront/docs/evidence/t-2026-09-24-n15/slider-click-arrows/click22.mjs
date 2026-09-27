// Remark 22: click the visible centre of every banner in view (a real mouse click; a capturing listener records the link
// that got it and cancels navigation), at rest and after scrolling the loop one card at a time both ways.
// Args: base engines widths [mode=scroll|arrows]
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
const [base, engines = "chromium,firefox", ws = "1440,1920,2240", mode = "scroll"] = process.argv.slice(2);
const FF = "/Users/ivanprotsko/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox";
let bad = 0;
for (const eng of engines.split(",")) {
  const b = await pw[eng].launch(eng === "firefox" ? { executablePath: FF } : {});
  for (const w of ws.split(",").map(Number)) {
    const p = await b.newPage({ viewport: { width: w, height: 1000 } });
    await p.goto(`${base}/ru`, { waitUntil: "networkidle", timeout: 180000 });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await p.waitForSelector('[data-testid="olavka-hero-slider"] ul[data-loop-ready]', { timeout: 30000 });
    await p.evaluate(() => {
      window.__hits = [];
      document.addEventListener("click", (e) => { const a = e.target.closest("a"); window.__hits.push(a ? a.getAttribute("href") : `none:${e.target.tagName.toLowerCase()}.${String(e.target.className).slice(0, 24)}`); e.preventDefault(); }, true);
    });
    const ul = p.locator('[data-testid="olavka-hero-slider"] ul');
    const move = async (dir) => {
      if (mode === "arrows") {
        await p.locator(`[data-testid="olavka-hero-slider-${dir > 0 ? "next" : "prev"}"]`).click();
      } else {
        await ul.evaluate((el, dir) => { const items = [...el.children]; const mid = el.scrollLeft + el.clientWidth / 2; let i = 0, best = 1e9; items.forEach((c, k) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < best) { best = d; i = k; } }); const t = items[i + dir]; el.scrollTo({ left: t.offsetLeft - (el.clientWidth - t.offsetWidth) / 2, behavior: "smooth" }); }, dir);
      }
      await p.waitForTimeout(1200);
    };
    const probe = async (state) => {
      const cards = await ul.evaluate((el) => [...el.children].map((li) => { const r = li.getBoundingClientRect(); const x0 = Math.max(r.left, 0), x1 = Math.min(r.right, innerWidth); return { copy: li.dataset.copy, title: li.querySelector("a")?.getAttribute("aria-label"), href: li.querySelector("a")?.getAttribute("href"), inert: li.inert, vis: x1 - x0, x: (x0 + x1) / 2, y: r.top + r.height / 2 }; }).filter((c) => c.vis > 60));
      const out = [];
      for (const c of cards) {
        await p.evaluate(() => (window.__hits.length = 0));
        await p.mouse.click(c.x, c.y);
        const hit = await p.evaluate(() => window.__hits[0] ?? "no click event");
        const ok = hit === c.href;
        if (!ok) bad++;
        out.push(`${c.copy}${c.inert ? "(inert)" : ""} «${(c.title || "").replace(/\n/g, " ").slice(0, 18)}» vis ${Math.round(c.vis)} → ${ok ? "OK" : "FAIL " + hit}`);
      }
      console.log(eng, w, mode, state.padEnd(7), out.join(" | "));
    };
    await probe("rest");
    for (let i = 1; i <= 4; i++) { await move(1); await probe(`next${i}`); }
    for (let i = 1; i <= 5; i++) { await move(-1); await probe(`prev${i}`); }
    await p.close();
  }
  await b.close();
}
console.log("FAILED clicks:", bad);
