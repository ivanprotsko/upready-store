import { chromium } from "/opt/homebrew/lib/node_modules/playwright/index.mjs";
export const ART = "/Users/ivanprotsko/upready/projects/upready-store/handoff/night-2026-09-14-tribute/artifacts";
export const EMAIL = "commerce-1106@upready.dev", PASS = "NightAccept2026!";
export const HANDLE = "accept-commerce-1106";
export const SHOP = `https://${HANDLE}.shipshift.dev`;
export const PANEL = "https://panel-store.upready.dev";
export async function open({ w = 1440, h = 900 } = {}) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: "ru-RU" });
  const p = await ctx.newPage();
  const errs = [], bad = [];
  p.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  p.on("pageerror", e => errs.push("PAGEERROR " + String(e).slice(0, 200)));
  p.on("response", r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}`); });
  return { b, ctx, p, errs, bad };
}
export async function login(p) {
  await p.goto(PANEL + "/login", { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForSelector("input[type=password]", { timeout: 30000 });
  await p.fill("input[type=email], input[name=email]", EMAIL);
  await p.fill("input[type=password]", PASS);
  await p.click("button[type=submit]");
  await p.waitForTimeout(4000);
  return p.url();
}
export const shot = (p, n) => p.screenshot({ path: `${ART}/commerce-${n}.png`, fullPage: true });
