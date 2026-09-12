#!/usr/bin/env node
/**
 * shot.mjs — element screenshot via puppeteer-core + the local Chrome.
 *
 * Usage:
 *   node scripts/shot.mjs --url <url> --selector <css> --out <path> [--width 1440]
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function parseArgs(argv) {
  const args = { width: 1440 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") args.url = argv[++i];
    else if (a === "--selector") args.selector = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--width") args.width = Number(argv[++i]);
    else throw new Error(`unknown argument: ${a}`);
  }
  for (const req of ["url", "selector", "out"]) {
    if (!args[req]) throw new Error(`missing required --${req}`);
  }
  return args;
}

async function main() {
  const { url, selector, out, width } = parseArgs(process.argv.slice(2));

  mkdirSync(path.dirname(out), { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--hide-scrollbars"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 1080, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    const handle = await page.waitForSelector(selector, { timeout: 15000 });
    if (!handle) throw new Error(`selector not found: ${selector}`);
    await handle.screenshot({ path: out });
    console.log(JSON.stringify({ ok: true, url, selector, out }));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }));
  process.exit(1);
});
