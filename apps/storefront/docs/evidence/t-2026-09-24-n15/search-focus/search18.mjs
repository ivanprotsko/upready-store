// Remark 18 (headless): open the search overlay (Cmd/Ctrl+K at 1440, the search button at 390 and 1440), then read the
// input's focus state (activeElement, :focus-visible, box-shadow, outline), type, Tab to the clear button (its ring),
// Esc closes. Shot of the overlay per engine/width/opener.
import { chromium, firefox } from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.mjs";
import fs from "fs";
const [out, tag, base, engine = "chromium", ws = "1440,390"] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = engine === "firefox" ? await firefox.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox` }) : await chromium.launch();
const shop = new URL(base).hostname.split(".")[0];
const INPUT = () => {
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getBoundingClientRect().width > 0);
  const i = document.activeElement;
  const cs = i ? getComputedStyle(i) : null;
  return { dialogs: dialogs.length, active: i ? `${i.tagName.toLowerCase()}${i.placeholder ? `[${i.placeholder}]` : ""}` : null, focusVisible: i ? i.matches(":focus-visible") : null, boxShadow: cs?.boxShadow, outline: cs ? `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}` : null, rowBorder: i?.parentElement ? getComputedStyle(i.parentElement).borderBottomColor : null };
};
for (const w of ws.split(",").map(Number)) {
  for (const opener of w > 800 ? ["cmdk", "button"] : ["button"]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${base}/ru`, { waitUntil: "networkidle", timeout: 180000 });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    if (opener === "cmdk") await p.keyboard.press("ControlOrMeta+k");
    else {
      const btn = p.locator('button[aria-label="Поиск"]:visible');
      if (!(await btn.count())) { console.log(engine, shop, w, opener, tag, "no visible search button"); await ctx.close(); continue; }
      await btn.first().click();
    }
    await p.waitForTimeout(700);
    const s0 = await p.evaluate(INPUT);
    await p.screenshot({ path: `${out}/${engine}-${shop}-${w}-${opener}-${tag}.png` });
    await p.keyboard.type("асд");
    await p.waitForTimeout(900);
    const typed = await p.evaluate(() => document.activeElement?.value ?? null);
    await p.keyboard.press("Tab");
    const clear = await p.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return { el: `${e.tagName.toLowerCase()}[${e.getAttribute("aria-label") || e.textContent.trim().slice(0, 20)}]`, focusVisible: e.matches(":focus-visible"), outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, boxShadow: cs.boxShadow }; });
    await p.keyboard.press("Escape");
    await p.waitForTimeout(500);
    const after = await p.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getBoundingClientRect().width > 0).length);
    console.log(engine, shop, w, opener, tag, JSON.stringify({ open: s0, typed, tabTo: clear, dialogsAfterEsc: after }));
    await ctx.close();
  }
}
await b.close();
