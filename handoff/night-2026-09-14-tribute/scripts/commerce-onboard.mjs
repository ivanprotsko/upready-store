import { chromium } from "/opt/homebrew/lib/node_modules/playwright/index.mjs";
const ART = "/Users/ivanprotsko/upready/projects/upready-store/handoff/night-2026-09-14-tribute/artifacts";
const HH = process.argv[2];
const handle = `accept-commerce-${HH}`;
const email = `commerce-${HH}@upready.dev`;
const pass = "NightAccept2026!";
const errs = [], bad = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" });
const p = await ctx.newPage();
p.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0,200)); });
p.on("response", r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(0,150)}`); });
const t0 = Date.now();
await p.goto("https://start.upready.dev/start/onboarding", { waitUntil: "networkidle", timeout: 60000 });
await p.screenshot({ path: `${ART}/commerce-01-onboarding.png`, fullPage: true });
console.log("TITLE:", await p.title());
// dump form controls
const fields = await p.$$eval("input,select,textarea,button", els => els.map(e => ({
  tag: e.tagName, type: e.type||"", name: e.name||"", id: e.id||"", ph: e.placeholder||"", txt: (e.innerText||"").trim().slice(0,60)
})));
console.log("FIELDS:", JSON.stringify(fields, null, 1));
console.log("BODY:", (await p.innerText("body")).slice(0, 2000));
console.log("HANDLE:", handle, "EMAIL:", email);
console.log("ERRS:", JSON.stringify(errs)); console.log("BAD:", JSON.stringify(bad));
console.log("ELAPSED:", ((Date.now()-t0)/1000).toFixed(1)+"s");
await b.close();
