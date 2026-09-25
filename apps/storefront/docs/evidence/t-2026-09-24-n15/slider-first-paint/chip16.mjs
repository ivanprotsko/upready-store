// Remark 16: Chromium/Firefox (Playwright) — (1) every chip's box, inner box and text box on the real cards, (2) the
// carousel with JS OFF (= the server's first paint) vs after hydration: which cards are where. Shots per width.
import { chromium, firefox } from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs";
import fs from "fs";
const [out, tag, base, engine = "chromium", ws = "1440,2240,720,360"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = engine === "firefox" ? await firefox.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox` }) : await chromium.launch();
const STATE = () => {
  const ul = document.querySelector('[data-testid="olavka-hero-slider"] ul');
  const lis = [...ul.children].map((li, i) => { const r = li.getBoundingClientRect(); return { i, copy: li.dataset.copy || (li.inert ? "clone" : "real"), t: (li.querySelector('[data-testid="olavka-hero-slide-title"]')?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 14), l: Math.round(r.left * 10) / 10, r: Math.round(r.right * 10) / 10, shown: r.width > 0 }; });
  return { sl: Math.round(ul.scrollLeft), ready: ul.hasAttribute("data-loop-ready"), visible: lis.filter((x) => x.shown && x.r > 0 && x.l < innerWidth).map((x) => `${x.i}:${x.copy}:${x.t}@${x.l}..${x.r}`) };
};
for (const w of ws.split(",").map(Number)) {
  for (const js of [false, true]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, javaScriptEnabled: js });
    const p = await ctx.newPage();
    await p.goto(`${base}/ru`, { waitUntil: "load", timeout: 180000 });
    // JS off = the server's markup only; the page zoom above 1440 comes from an inline script
    // that runs before the first paint when JS is on, so it is put in by hand here.
    if (!js && w > 1440) await p.evaluate((k) => { const s = document.createElement("style"); s.textContent = `html{zoom:${k};--page-zoom:${k}}`; document.head.appendChild(s); }, Math.min(w, 1920) / 1440);
    await p.waitForTimeout(js ? 2500 : 800);
    const st = await p.evaluate(STATE).catch(() => null);
    let chips = null;
    if (js) chips = await p.evaluate(() => [...document.querySelectorAll('[data-testid="olavka-hero-slide"] :is([data-testid$="-kicker"],[data-testid$="-label"],[data-testid$="-title"],[data-testid$="-button"])')].map((c) => { const f = (e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 100) / 100).join(","); }; const inner = c.firstElementChild, text = inner.firstElementChild; return `${c.dataset.testid.replace("olavka-hero-slide-", "")}:${text.textContent.trim().replace(/\s+/g, " ").slice(0, 12)} chip=${f(c)} inner=${f(inner)} text=${f(text)} disp=${getComputedStyle(c).display} bf=${getComputedStyle(c).backdropFilter}`; }));
    console.log(engine, w, tag, js ? "js" : "nojs", JSON.stringify(st));
    if (chips) chips.forEach((c) => console.log("   ", c));
    const box = await p.locator('[data-testid="olavka-hero-slider"]').boundingBox();
    await p.screenshot({ path: `${out}/${engine}-${w}-${js ? "js" : "nojs"}-${tag}.png`, clip: { x: 0, y: Math.max(0, box.y), width: w, height: Math.min(box.height, 700) } });
    await ctx.close();
  }
}
await b.close();
