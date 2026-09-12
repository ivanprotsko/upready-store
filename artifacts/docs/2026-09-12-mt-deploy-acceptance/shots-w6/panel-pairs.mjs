// node panel-pairs.mjs <phase light|dark> <imgdir> <outdir> — tenant panel (acme): upload the phase's image into Home page hero, category edit, product media; save; reload; read the previews back
import { chromium } from "playwright";
const [phase = "light", imgdir = ".", out = "."] = process.argv.slice(2);
const panel = "http://localhost:5183";
const CAT = "pcat_01M29JZ42J33HVD3YJGQW1NNZJ", PROD = "prod_01M25V5ADHY2EMGMREHM67VVCC";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
const p = await ctx.newPage();
const errors = []; p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120)));
const srcOf = (tid) => p.evaluate((t) => { const el = document.querySelector(`[data-testid="${t}"]`); if (!el) return "(absent)"; const img = el.tagName === "IMG" ? el : el.querySelector("img"); return img ? (img.getAttribute("src") || "").slice(0, 90) : `(no img in ${el.tagName})`; }, tid);
const saveBtn = async () => { const b = p.getByRole("button", { name: /^(save|сохранить)$/i }).last(); await b.waitFor({ state: "visible", timeout: 20000 }); await b.evaluate((el) => el.click()); await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => null); await p.waitForTimeout(1500); };
const waitUploaded = async (tid) => { await p.waitForFunction((t) => { const el = document.querySelector(`[data-testid="${t}"]`); const img = el && (el.tagName === "IMG" ? el : el.querySelector("img")); return !!img && /^(http|blob:)/.test(img.getAttribute("src") || ""); }, tid, { timeout: 60000 }).catch(() => null); };
await p.goto(`${panel}/login`, { waitUntil: "load", timeout: 120000 });
await p.fill('input[name="email"]', "admin@acme.test"); await p.fill('input[name="password"]', "supersecret");
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), p.click('button[type="submit"]')]);
const result = { phase, errors };
// 1. home hero
await p.goto(`${panel}/home-settings`, { waitUntil: "load", timeout: 120000 });
const heroTid = phase === "dark" ? "hero-image-dark" : "hero-image";
await p.waitForSelector(`[data-testid="${heroTid}-upload"]`, { state: "attached", timeout: 30000 });
await p.setInputFiles(`[data-testid="${heroTid}-upload"]`, `${imgdir}/${phase}-hero.png`);
await waitUploaded(`${heroTid}-preview`);
await p.click("[data-testid=home-settings-save]"); await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => null); await p.waitForTimeout(1500);
await p.reload({ waitUntil: "load", timeout: 120000 }); await p.waitForSelector("[data-testid=hero-image-upload]", { state: "attached", timeout: 30000 });
result.home = { light: await srcOf("hero-image-preview"), dark: await srcOf("hero-image-dark-preview") };
await p.screenshot({ path: `${out}/panel-home-${phase}.png`, fullPage: true });
// 2. category edit
await p.goto(`${panel}/categories/${CAT}/edit`, { waitUntil: "load", timeout: 120000 });
const catTid = phase === "dark" ? "category-image-dark" : "category-image";
await p.waitForSelector(`[data-testid="${catTid}-upload"]`, { state: "attached", timeout: 30000 });
await p.setInputFiles(`[data-testid="${catTid}-upload"]`, `${imgdir}/${phase}-tile.png`);
await waitUploaded(`${catTid}-preview`);
await saveBtn();
await p.goto(`${panel}/categories/${CAT}/edit`, { waitUntil: "load", timeout: 120000 }); await p.waitForSelector("[data-testid=category-image-upload]", { state: "attached", timeout: 30000 });
result.category = { light: await srcOf("category-image-preview"), dark: await srcOf("category-image-dark-preview") };
await p.screenshot({ path: `${out}/panel-category-${phase}.png`, fullPage: true });
// 3. product media
await p.goto(`${panel}/products/${PROD}/media?view=edit`, { waitUntil: "load", timeout: 120000 });
if (phase === "light") {
  await p.waitForSelector('input[type="file"]:not([data-testid])', { state: "attached", timeout: 30000 });
  await p.setInputFiles('input[type="file"]:not([data-testid])', `${imgdir}/light-product.png`);
  await p.waitForTimeout(2500);
} else {
  await p.waitForSelector('[data-testid="product-image-dark-upload"]', { state: "attached", timeout: 30000 });
  await p.setInputFiles('[data-testid="product-image-dark-upload"]', `${imgdir}/dark-product.png`);
  await waitUploaded("product-image-dark-preview");
}
await saveBtn();
await p.goto(`${panel}/products/${PROD}/media?view=edit`, { waitUntil: "load", timeout: 120000 }); await p.waitForSelector('[data-testid="product-image-dark-upload"]', { state: "attached", timeout: 30000 });
result.product = { light: await srcOf("product-image-light-preview"), dark: await srcOf("product-image-dark-preview"), galleryImgs: await p.evaluate(() => [...document.images].filter((i) => /uploads|static|blob:/.test(i.src)).length) };
await p.screenshot({ path: `${out}/panel-product-${phase}.png`, fullPage: true });
console.log(JSON.stringify(result));
await browser.close();
