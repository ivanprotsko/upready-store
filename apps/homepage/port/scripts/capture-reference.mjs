#!/usr/bin/env node
/**
 * capture-reference.mjs — one-off capture of the RENDERED legacy page
 * (after support.js/dc-runtime has evaluated the template) via
 * puppeteer-core + the local Chrome, against a running reference server
 * (see §0 of the brief: `python3 -m http.server 4790` from apps/homepage).
 *
 * Measured fact (2026-09-12, this session): FIVE of the fifteen sections
 * (proof-full, proof-short, frame, included, pricing, faq) are gated behind
 * `state.blocks.*` flags that all default to `false` (reference/dc-script.js
 * line 2 / line 339-340), and proof-full vs. proof-short are mutually
 * exclusive on the `audience` flag ('cold' vs 'warm'). Un-toggled, only 9 of
 * 15 <section> elements ever render — the brief's "15 <section> elements
 * exist" wait condition describes the STATIC template (§0), not the default
 * render. The page ships a client-side admin panel (password '500p3r',
 * reference/dc-script.js line 12 — plaintext in the shipped bundle, not a
 * secret we broke) with toggle switches for exactly these blocks plus an
 * audience switcher. This script drives that panel to render every
 * registry section at least once, across two passes:
 *   pass 1 (audience=cold, all five blocks on): everything except proof-short
 *   pass 2 (audience=warm, proof block on): proof-short
 *
 * Sections are matched to registry slugs by their `data-screen-label` /
 * legacy `id` (§2 of the brief), not by DOM position, because the two
 * passes render different subsets in different positions.
 *
 * Writes:
 *   reference/rendered/<NN>-<slug>.html   outerHTML of the rendered element
 *   reference/shots/<slug>.png            element screenshot at 1440px
 *   reference/rendered/00-shell.html + shots/shell.png  nav + footer
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT_DIR = path.resolve(__dirname, "..");
const REFERENCE_DIR = path.join(PORT_DIR, "reference");
const RENDERED_DIR = path.join(REFERENCE_DIR, "rendered");
const SHOTS_DIR = path.join(REFERENCE_DIR, "shots");

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const REF_URL = "http://localhost:4790/index.html";
const WIDTH = 1440;

// §2 registry (label/id -> slug), DOM order.
const REGISTRY = [
  { nn: "01", slug: "hero", label: "Первый экран" },
  { nn: "02", slug: "launch-artifact", label: "Артефакт: запуск" },
  { nn: "03", slug: "social-proof", label: "Кто уже на этой системе" },
  { nn: "04", slug: "proof-full", label: "Почему это про вас" },
  { nn: "05", slug: "proof-short", label: "Почему это про вас — коротко" },
  { nn: "06", slug: "frame", label: "Рамка" },
  { nn: "07", slug: "included", label: "Что входит" },
  { nn: "08", slug: "operations", label: "Операции" },
  { nn: "09", slug: "pricing", label: "Цены" },
  { nn: "10", slug: "payments", label: "Оплата" },
  { nn: "11", slug: "delivery", label: "Доставка" },
  { nn: "12", slug: "showcase", label: "Примеры магазинов" },
  { nn: "13", slug: "faq", label: "Вопросы" },
  { nn: "14", slug: "tariffs", label: "Тарифы" },
  { nn: "15", slug: "final-cta", label: "Финальный призыв" },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function unlockAdminAndOpenPanel(page) {
  // Same persistence submitPw() itself uses (dc-script.js line 13) — the
  // component reads this in componentDidMount, no password entry needed.
  await page.evaluateOnNewDocument(() => {
    try {
      sessionStorage.setItem("upready_admin", "1");
    } catch (e) {
      /* ignore */
    }
  });
}

async function openPanelAndToggleBlocks(page, labels) {
  await page.waitForFunction(
    () => !document.querySelector("x-dc") && document.querySelectorAll("body section").length > 0,
    { timeout: 30000 },
  );
  await sleep(200);

  // gear button: fixed bottom-left container's own toggleMenu button
  const opened = await page.evaluate(() => {
    const gear = document.querySelector('div[style*="left: 16px"][style*="bottom: 16px"] > button');
    if (!gear) return false;
    gear.click();
    return true;
  });
  if (!opened) throw new Error("admin gear button not found (is admin unlocked?)");
  await sleep(150);

  const toggled = await page.evaluate((wanted) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const hits = [];
    for (const label of wanted) {
      const btn = buttons.find((b) => b.textContent.trim() === label);
      if (btn) {
        btn.click();
        hits.push(label);
      }
    }
    return hits;
  }, labels);
  await sleep(150);
  return toggled;
}

async function setAudience(page, label) {
  const clicked = await page.evaluate((label) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const btn = buttons.find((b) => b.textContent.trim() === label);
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }, label);
  await sleep(150);
  return clicked;
}

async function captureVisibleSections(page, remaining, captured) {
  const sections = await page.$$("body section");
  for (const handle of sections) {
    const label = await page.evaluate((el) => el.getAttribute("data-screen-label"), handle);
    const entry = remaining.find((r) => r.label === label);
    if (!entry) continue;

    const html = await page.evaluate((el) => el.outerHTML, handle);
    writeFileSync(path.join(RENDERED_DIR, `${entry.nn}-${entry.slug}.html`), html + "\n");
    await handle.screenshot({ path: path.join(SHOTS_DIR, `${entry.slug}.png`) });
    captured.add(entry.slug);
  }
}

async function main() {
  mkdirSync(RENDERED_DIR, { recursive: true });
  mkdirSync(SHOTS_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--hide-scrollbars"],
  });

  const captured = new Set();

  try {
    // ---------- shell: nav + footer (audience-independent) ----------
    {
      const page = await browser.newPage();
      await unlockAdminAndOpenPanel(page);
      await page.setViewport({ width: WIDTH, height: 1080, deviceScaleFactor: 1 });
      await page.goto(REF_URL, { waitUntil: "networkidle0", timeout: 60000 });
      await page.waitForFunction(() => !document.querySelector("x-dc"), { timeout: 30000 });
      await sleep(200);

      const navHandle = await page.$("nav");
      if (!navHandle) throw new Error("rendered page has no <nav>");
      const footerHandle = await page.$("footer");
      if (!footerHandle) throw new Error("rendered page has no <footer>");

      const navHtml = await page.evaluate((el) => el.outerHTML, navHandle);
      const footerHtml = await page.evaluate((el) => el.outerHTML, footerHandle);
      writeFileSync(
        path.join(RENDERED_DIR, "00-shell.html"),
        `<!-- nav -->\n${navHtml}\n\n<!-- footer -->\n${footerHtml}\n`,
      );
      await navHandle.screenshot({ path: path.join(SHOTS_DIR, "shell.png") });
      await page.close();
    }

    // ---------- pass 1: audience=cold (default), all five blocks on ----------
    {
      const page = await browser.newPage();
      await unlockAdminAndOpenPanel(page);
      await page.setViewport({ width: WIDTH, height: 1080, deviceScaleFactor: 1 });
      await page.goto(REF_URL, { waitUntil: "networkidle0", timeout: 60000 });

      const toggled = await openPanelAndToggleBlocks(page, ["риск", "рамка", "что входит", "цены", "вопросы"]);
      const remaining = REGISTRY.filter((r) => !captured.has(r.slug));
      await captureVisibleSections(page, remaining, captured);
      await page.close();
      console.log(JSON.stringify({ pass: 1, audience: "cold", toggled, capturedSoFar: [...captured] }));
    }

    // ---------- pass 2: audience=warm, proof block on -> proof-short ----------
    {
      const page = await browser.newPage();
      await unlockAdminAndOpenPanel(page);
      await page.setViewport({ width: WIDTH, height: 1080, deviceScaleFactor: 1 });
      await page.goto(REF_URL, { waitUntil: "networkidle0", timeout: 60000 });

      await page.waitForFunction(
        () => !document.querySelector("x-dc") && document.querySelectorAll("body section").length > 0,
        { timeout: 30000 },
      );
      await sleep(200);
      const opened = await page.evaluate(() => {
        const gear = document.querySelector('div[style*="left: 16px"][style*="bottom: 16px"] > button');
        if (!gear) return false;
        gear.click();
        return true;
      });
      if (!opened) throw new Error("admin gear button not found in pass 2");
      await sleep(150);

      const setWarm = await setAudience(page, "warm");
      if (!setWarm) throw new Error("audience 'warm' button not found");

      const toggled = await openPanelAndToggleBlocksNoWait(page, ["риск"]);
      const remaining = REGISTRY.filter((r) => !captured.has(r.slug));
      await captureVisibleSections(page, remaining, captured);
      await page.close();
      console.log(JSON.stringify({ pass: 2, audience: "warm", toggled, capturedSoFar: [...captured] }));
    }

    const missing = REGISTRY.filter((r) => !captured.has(r.slug)).map((r) => r.slug);
    console.log(JSON.stringify({ ok: missing.length === 0, captured: [...captured], missing }));
  } finally {
    await browser.close();
  }
}

// same as openPanelAndToggleBlocks but the menu is already open (pass 2
// re-opened it before switching audience, and switching audience does not
// close the panel)
async function openPanelAndToggleBlocksNoWait(page, labels) {
  const toggled = await page.evaluate((wanted) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const hits = [];
    for (const label of wanted) {
      const btn = buttons.find((b) => b.textContent.trim() === label);
      if (btn) {
        btn.click();
        hits.push(label);
      }
    }
    return hits;
  }, labels);
  await sleep(150);
  return toggled;
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }));
  process.exit(1);
});
