// b18-blog-full, этап 0: смотрю то же, что видит Иван, на ЖИВОЙ панели.
// Только чтение: ничего не создаём и не сохраняем (приказ в брифе).
import { chromium } from "/Users/ivanprotsko/upready/projects/upready-store/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://panel-store.upready.dev";
const OUT = process.argv[2];
const EMAIL = process.env.PANEL_EMAIL;
const PASSWORD = process.env.PANEL_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error("PANEL_EMAIL/PANEL_PASSWORD не заданы"); process.exit(2); }
mkdirSync(OUT, { recursive: true });

const rec = { steps: [], console: [], failed: [], api: {} };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") rec.console.push(m.text().slice(0, 300)); });
page.on("requestfailed", (r) => rec.failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`));
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("/tenants/articles")) {
    let body = null;
    try { body = (await r.text()).slice(0, 4000); } catch {}
    rec.api[`${r.request().method()} ${u.replace(BASE, "")}`] = { status: r.status(), body };
  }
});

const shot = async (name) => { const f = `${OUT}/${name}.png`; await page.screenshot({ path: f, fullPage: false }); rec.steps.push(`shot ${name} → ${f}`); console.log("shot", name); };

await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 90000 });
await shot("00-login");
await page.fill('input[name="email"], input[type="email"]', EMAIL);
await page.fill('input[name="password"], input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
rec.steps.push("after login url=" + page.url());
await shot("01-after-login");

await page.goto(BASE + "/journal", { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(2500);
rec.journal = {
  url: page.url(),
  h2: await page.locator("h2").allTextContents(),
  headers: await page.locator("thead th").allTextContents(),
  rows: await page.locator("tbody tr").count(),
  rowTexts: (await page.locator("tbody tr").allTextContents()).slice(0, 10),
  labels: await page.locator("form p, form span, form label").allTextContents(),
  buttons: await page.locator("button").allTextContents(),
  navItems: await page.locator("nav a").allTextContents(),
};
await shot("02-journal-list");
await page.screenshot({ path: `${OUT}/02-journal-list-full.png`, fullPage: true });

// Открыть первую статью (только чтение)
const firstLink = page.locator("tbody tr td a").first();
if (await firstLink.count()) {
  const slug = await firstLink.getAttribute("href");
  rec.steps.push("open article href=" + slug);
  await firstLink.click();
  await page.waitForTimeout(3500);
  rec.editor = {
    url: page.url(),
    labels: await page.locator("label").allTextContents(),
    textareas: await page.locator("textarea").count(),
    inputs: await page.locator("input").count(),
    buttons: await page.locator("button").allTextContents(),
  };
  await shot("03-article-edit");
  await page.screenshot({ path: `${OUT}/03-article-edit-full.png`, fullPage: true });
} else {
  rec.editor = null;
  rec.steps.push("в списке нет ни одной статьи — редактор не открыть");
}

// Раздел «Страницы» — для сравнения, что Иван видит рядом
await page.goto(BASE + "/pages", { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
await page.waitForTimeout(2000);
await shot("04-pages-for-comparison");

writeFileSync(`${OUT}/diagnosis-dom.json`, JSON.stringify(rec, null, 2));
console.log(JSON.stringify({ journal: rec.journal, editor: rec.editor, api: Object.keys(rec.api), console: rec.console.slice(0, 5) }, null, 2));
await browser.close();
