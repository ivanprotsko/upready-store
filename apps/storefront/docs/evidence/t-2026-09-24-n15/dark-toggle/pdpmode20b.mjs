import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
const [base, path] = process.argv.slice(2);
const b = await pw.chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  localStorage.setItem("upready-store.mode", "dark");
  window.__modes = [];
  new MutationObserver(() => window.__modes.push(`${Math.round(performance.now())} ${document.documentElement.getAttribute("data-mode")}`)).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-mode"] });
});
const p = await ctx.newPage();
const logs = [];
p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
p.on("pageerror", (e) => logs.push(`pageerror: ${e.message.slice(0, 300)}`));
await p.goto(`${base}${path}`, { waitUntil: "networkidle" });
console.log(path, "final", await p.evaluate(() => document.documentElement.dataset.mode), "changes", JSON.stringify(await p.evaluate(() => window.__modes)));
logs.slice(0, 8).forEach((l) => console.log("  ", l));
await b.close();
