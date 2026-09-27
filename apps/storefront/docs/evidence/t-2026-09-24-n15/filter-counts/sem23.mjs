// Remark 23: how the catalog combines option filters — totals for single buckets, two of one group, two of two groups.
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
const [base, path = "/ru/store"] = process.argv.slice(2);
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const total = async () => { await p.waitForLoadState("networkidle"); await p.waitForTimeout(500); return p.evaluate(() => document.querySelector('[data-testid="products-list"]')?.dataset.totalCount); };
await p.goto(`${base}${path}`, { waitUntil: "networkidle" });
const groups = await p.evaluate(() => [...document.querySelectorAll('[data-testid^="filter-group-option-"]')].map((g) => ({ id: g.dataset.testid, title: g.querySelector("summary span").innerText, labels: [...g.querySelectorAll("label span")].map((s) => s.innerText) })));
console.log("groups", JSON.stringify(groups));
console.log("total none", await total());
const click = async (gi, li) => { await p.locator(`[data-testid="${groups[gi].id}"] label`).nth(li).locator("input").click(); return total(); };
const reset = async () => { await p.goto(`${base}${path}`, { waitUntil: "networkidle" }); };
const [g0, g1] = [0, 1];
const r = {};
await reset(); r.a = await click(g0, 0);
await reset(); r.b = await click(g0, 1);
await reset(); await click(g0, 0); r.ab = await click(g0, 1);
if (groups[g1]) { await reset(); r.c = await click(g1, 0); await reset(); await click(g0, 0); r.ac = await click(g1, 0); r.url = decodeURIComponent(p.url()).slice(0, 200); }
console.log(`A=${groups[g0].labels[0]} B=${groups[g0].labels[1]} C=${groups[g1]?.labels[0]}`, JSON.stringify(r));
await b.close();
