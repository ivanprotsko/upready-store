// Acceptance frames + DOM checks of the Cherkashina tenant storefront (rule 18f: the live product, not the log).
//   node shoot.mjs --base http://cherkashino.localhost:8043 --registry ../02-mapping-registry.json --out .
// PNG frames stay out of git (.gitignore in this folder); checks.json is the record.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const require = createRequire("/Users/ivanprotsko/upready/worktrees/upready-store/feat/cherkashina-tenant/apps/storefront/package.json");
const { chromium } = require("@playwright/test");

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : d);
const BASE = opt("--base", "http://cherkashino.localhost:8043");
const REG = opt("--registry", path.join(process.cwd(), "../02-mapping-registry.json"));
const OUT = opt("--out", process.cwd());
const registry = JSON.parse(readFileSync(REG, "utf8"));
const rows = (kind) => registry.rows.filter((r) => r.kind === kind);

// a product whose card image differs from its PDP default image proves both marks at once
const distinct = rows("image").find((i) => String(i.source_id).startsWith("thumbnail:") && i.status === "migrated");
const product = rows("product").find((p) => p.source_id === distinct?.product_source_id) ?? rows("product").find((p) => p.status_source === "published");
const cardTarget = rows("file").find((f) => f.source_id === product.card_image)?.target_url ?? null;
const pdpTarget = rows("file").find((f) => f.source_id === product.pdp_default_image)?.target_url ?? null;
const pages = rows("page").filter((p) => p.status === "migrated");

const viewports = [
  { name: "1280x900", width: 1280, height: 900 },
  { name: "390x844", width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
];
const targets = [
  { name: "home", url: `${BASE}/ru` },
  { name: "catalog", url: `${BASE}/ru/store` },
  { name: `product-${product.target_handle}`, url: `${BASE}/ru/products/${product.target_handle}` },
  ...pages.map((p) => ({ name: `page-${p.target_handle}-${p.locale}`, url: `${BASE}/${p.locale}/pages/${p.target_handle}` })),
];
const checks = { shot_at: new Date().toISOString(), base: BASE, product: { handle: product.target_handle, card_image_expected: cardTarget, pdp_default_expected: pdpTarget }, frames: [], dom: {} };

const browser = await chromium.launch();
try {
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile ?? false, deviceScaleFactor: vp.deviceScaleFactor ?? 1, locale: "ru-RU" });
    const page = await context.newPage();
    for (const t of targets) {
      const file = path.join(OUT, `${t.name}-${vp.name}.png`);
      const res = await page.goto(t.url, { waitUntil: "load", timeout: 120_000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: file, fullPage: false });
      checks.frames.push({ name: t.name, viewport: vp.name, url: t.url, status: res?.status() ?? null, file: path.basename(file) });
      if (vp.name === "1280x900" && (t.name === "catalog" || t.name === "home")) {
        // the product's list card: on the catalog page when it is on page 1, else on the home listing
        const card = await page.evaluate((handle) => {
          const link = document.querySelector(`a[href$="/products/${handle}"]`);
          const img = link?.querySelector("img");
          return { found: Boolean(link), card_img_src: img?.currentSrc || img?.getAttribute("src") || null, product_links: new Set([...document.querySelectorAll('a[href*="/products/"]')].map((a) => a.getAttribute("href"))).size, h1: document.querySelector("h1")?.textContent?.trim() ?? null };
        }, product.target_handle);
        if (t.name === "catalog") checks.dom.catalog = card;
        if (card.found && !checks.dom.card) checks.dom.card = { ...card, seen_on: t.name };
      }
      if (vp.name === "1280x900" && t.name.startsWith("product-")) {
        checks.dom.product = await page.evaluate(() => {
          // gallery images only: the flags of the locale/country switchers are <img> too
          const imgs = [...document.querySelectorAll("main img")].map((i) => i.currentSrc || i.getAttribute("src") || "").filter((src) => src && !src.includes("/flags/"));
          return { h1: document.querySelector("h1")?.textContent?.trim() ?? null, first_img_src: imgs[0] ?? null, img_count: imgs.length };
        });
      }
      if (vp.name === "1280x900" && t.name === "home") {
        checks.dom.home = await page.evaluate(() => ({ h1: document.querySelector("h1")?.textContent?.trim() ?? null, hero_text: document.querySelector("section")?.textContent?.trim().slice(0, 120) ?? null, data_theme: document.documentElement.getAttribute("data-theme"), data_mode: document.documentElement.getAttribute("data-mode"), footer_pages: [...document.querySelectorAll('footer a[href*="/pages/"]')].map((a) => a.getAttribute("href")) }));
      }
      if (vp.name === "1280x900" && t.name.startsWith("page-")) {
        checks.dom[t.name] = await page.evaluate(() => ({ h1: document.querySelector("h1")?.textContent?.trim() ?? null, paragraphs: document.querySelectorAll("main p, main li").length, html_lang: document.documentElement.lang }));
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}
// unwrap next/image URLs (/_next/image?url=<encoded>) before comparing with the expected upload URLs
const unwrap = (src) => {
  if (!src) return null;
  try {
    const u = new URL(src, BASE);
    return u.pathname === "/_next/image" ? decodeURIComponent(u.searchParams.get("url") ?? "") : u.href;
  } catch {
    return src;
  }
};
checks.verdict = {
  card_image_matches: cardTarget ? unwrap(checks.dom.card?.card_img_src) === cardTarget : null,
  card_seen_on: checks.dom.card?.seen_on ?? null,
  pdp_default_matches: pdpTarget ? unwrap(checks.dom.product?.first_img_src) === pdpTarget : null,
  card_img_seen: unwrap(checks.dom.card?.card_img_src),
  pdp_first_img_seen: unwrap(checks.dom.product?.first_img_src),
};
writeFileSync(path.join(OUT, "checks.json"), JSON.stringify(checks, null, 2) + "\n");
console.log(JSON.stringify({ frames: checks.frames.length, product: product.target_handle, verdict: checks.verdict, home: checks.dom.home, catalog: checks.dom.catalog, product_dom: checks.dom.product }, null, 1));
