// Remark 23b: the phone's filter sheet (390) — every option row's count must equal the list's total once it is clicked,
// with no filter and with one value already on. Args: base path engine groups(comma titles) [shot]
import pw from "file:///Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/@playwright+test@1.63.0/node_modules/@playwright/test/index.js";
const [base, path = "/ru/store", eng = "chromium", titles = "Количество,Фасовка", shot] = process.argv.slice(2);
const FF = "/Users/ivanprotsko/Library/Caches/ms-playwright/firefox-1538/firefox/Nightly.app/Contents/MacOS/firefox";
const b = await pw[eng].launch(eng === "firefox" ? { executablePath: FF } : {});
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const total = () => p.evaluate(() => document.querySelector('[data-testid="products-list"]')?.dataset.totalCount);
const openGroup = async (url, title) => {
  await p.goto(url, { waitUntil: "networkidle" });
  await p.locator('[data-testid="mobile-filters-button"]').click();
  await p.locator('[role="dialog"] button', { hasText: title }).first().click();
  await p.waitForSelector('[role="dialog"] label[for^="filter-"]');
};
const rows = () => p.evaluate(() => [...document.querySelectorAll('[role="dialog"] label[for^="filter-"]')].map((l) => ({ label: l.querySelector(".txt-compact-large")?.innerText, count: l.querySelector('[data-testid="filter-option-count"]')?.innerText ?? null, checked: l.querySelector('[role="checkbox"]')?.getAttribute("data-state") === "checked" || l.querySelector('button[aria-checked="true"]') !== null })));
let bad = 0, n = 0;
const sweep = async (url, tag) => {
  await p.goto(url, { waitUntil: "networkidle" }); const t0 = await total(); const out = [];
  for (const title of titles.split(",")) {
    await openGroup(url, title);
    const rs = await rows();
    if (shot && tag === "no filter" && title === titles.split(",")[0]) await p.screenshot({ path: shot });
    for (let i = 0; i < rs.length; i++) {
      n++;
      if (rs[i].checked) { if (rs[i].count !== t0) bad++; out.push(`${rs[i].label}=${rs[i].count} (on; list ${t0})`); continue; }
      await openGroup(url, title);
      const before = p.url();
      await p.locator('[role="dialog"] label[for^="filter-"]').nth(i).click();
      await p.waitForFunction((b) => location.href !== b, before, { timeout: 60000 });
      await p.goto(p.url(), { waitUntil: "networkidle" });
      const t = await total(); if (t !== rs[i].count) bad++;
      out.push(`${title}/${rs[i].label}: ${rs[i].count} → ${t}${t === rs[i].count ? "" : " ✗"}`);
    }
  }
  console.log(`${eng} 390 ${path} ${tag} (list ${t0}): ${out.join(" | ")}`);
};
await sweep(`${base}${path}`, "no filter");
// combination: the first value of the first group on
await openGroup(`${base}${path}`, titles.split(",")[0]);
const before = p.url(); await p.locator('[role="dialog"] label[for^="filter-"]').first().click();
await p.waitForFunction((b) => location.href !== b, before, { timeout: 60000 });
await sweep(p.url(), "with the first value on");
console.log(`${eng} 390 ${path}: ${n - bad}/${n} counts equal the list's total`);
await b.close();
