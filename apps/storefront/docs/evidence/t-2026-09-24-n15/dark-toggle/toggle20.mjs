// Remark 20: the light/dark switch at the bottom of the burger menu. Keyboard, aria, storage, no flash on reload, other shop.
// Args: out base engines widths [host2]
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
import fs from "fs";
const [out, base, engines = "chromium,firefox", ws = "1440,390", other = "http://acme.localhost:8233"] = process.argv.slice(2);
const FF = "/Users/ivanprotsko/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox";
fs.mkdirSync(out, { recursive: true });
const T = '[data-testid="side-menu-mode-toggle"]';
for (const eng of engines.split(",")) {
  const b = await pw[eng].launch(eng === "firefox" ? { executablePath: FF } : {});
  for (const w of ws.split(",").map(Number)) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    // At the first animation frame (before the first paint) note the mode; the SSR value is in the response.
    await ctx.addInitScript(() => { requestAnimationFrame(() => { window.__firstFrameMode = document.documentElement.getAttribute("data-mode"); }); });
    const p = await ctx.newPage();
    const L = [];
    const res = await p.goto(`${base}/ru`, { waitUntil: "networkidle", timeout: 180000 });
    const ssr = ((await res.text()).match(/<html[^>]*data-mode="(\w+)"/) || [])[1];
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    const open = async () => { await p.locator('[data-testid="nav-menu-button"]').filter({ visible: true }).first().click(); await p.waitForSelector('[data-testid="nav-menu-popup"]'); await p.waitForTimeout(500); };
    const state = async () => p.evaluate((T) => { const t = document.querySelector(T); return { html: document.documentElement.dataset.mode, stored: localStorage.getItem("upready-store.mode"), label: t?.getAttribute("aria-label"), pressed: t?.getAttribute("aria-pressed"), icon: t?.querySelector("svg path")?.getAttribute("d")?.slice(0, 12), copyright: /©/.test(document.querySelector('[data-testid="nav-menu-popup"]')?.innerText || "") }; }, T);
    await open();
    L.push(`first load: SSR data-mode=${ssr}, first frame ${await p.evaluate(() => window.__firstFrameMode)}; menu ${JSON.stringify(await state())}`);
    const tb = await p.locator(T).boundingBox();
    await p.screenshot({ path: `${out}/${eng}-${w}-menu-light.png`, clip: w > 1000 ? { x: 0, y: 0, width: 520, height: 900 } : { x: 0, y: 0, width: w, height: 900 } });
    // keyboard: Tab until the switch has focus
    let n = 0; for (; n < 12; n++) { await p.keyboard.press("Tab"); if (await p.evaluate((T) => document.activeElement?.matches(T), T)) break; }
    const ring = await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return `fv=${a.matches(":focus-visible")} shadow=${cs.boxShadow.slice(0, 60)} r=${cs.borderTopLeftRadius}`; });
    await p.screenshot({ path: `${out}/${eng}-${w}-toggle-focus-light.png`, clip: { x: Math.max(0, tb.x - 12), y: tb.y - 12, width: tb.width + 24, height: tb.height + 24 } });
    L.push(`Tab ×${n + 1} → switch focused: ${ring}`);
    await p.keyboard.press("Enter"); await p.waitForTimeout(400);
    L.push(`Enter → ${JSON.stringify(await state())}`);
    await p.screenshot({ path: `${out}/${eng}-${w}-menu-dark.png`, clip: w > 1000 ? { x: 0, y: 0, width: 520, height: 900 } : { x: 0, y: 0, width: w, height: 900 } });
    await p.screenshot({ path: `${out}/${eng}-${w}-toggle-focus-dark.png`, clip: { x: Math.max(0, tb.x - 12), y: tb.y - 12, width: tb.width + 24, height: tb.height + 24 } });
    // reload: dark before the first paint
    const res2 = await p.reload({ waitUntil: "networkidle" });
    const ssr2 = ((await res2.text()).match(/<html[^>]*data-mode="(\w+)"/) || [])[1];
    L.push(`reload: SSR data-mode=${ssr2}, first frame ${await p.evaluate(() => window.__firstFrameMode)}, now ${await p.evaluate(() => document.documentElement.dataset.mode)}`);
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await open();
    L.push(`menu after reload ${JSON.stringify(await state())}`);
    await p.locator(T).click(); await p.waitForTimeout(400);
    L.push(`click → ${JSON.stringify(await state())}`);
    await p.keyboard.press("Space"); await p.waitForTimeout(400);
    L.push(`Space → ${JSON.stringify(await state())}`);
    // another page keeps the choice
    await p.goto(`${base}/ru/store`, { waitUntil: "networkidle" });
    L.push(`/ru/store: first frame ${await p.evaluate(() => window.__firstFrameMode)}`);
    console.log(`${eng} ${w}\n   ` + L.join("\n   "));
    await ctx.close();
    // the other shop: its menu is unchanged
    const c2 = await b.newContext({ viewport: { width: w, height: 900 } }); const q = await c2.newPage();
    await q.goto(`${other}/ru`, { waitUntil: "networkidle", timeout: 180000 });
    await q.locator('[data-testid="nav-menu-button"]').filter({ visible: true }).first().click(); await q.waitForSelector('[data-testid="nav-menu-popup"]'); await q.waitForTimeout(400);
    console.log(`   ${new URL(other).hostname} menu: switch ${await q.locator(T).count()}, footer line «${await q.evaluate(() => [...document.querySelectorAll('[data-testid="nav-menu-popup"] p, [data-testid="nav-menu-popup"] span')].map((e) => e.innerText).find((t) => /©/.test(t)))}»`);
    await c2.close();
  }
  await b.close();
}
