import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/Users/ivanprotsko/upready/projects/upready-store/node_modules/playwright/index.mjs';

export const ROOT = '/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/q02-qa-owner';
export const SHOTS = path.join(ROOT, 'shots');
export const RAW = path.join(ROOT, 'raw');
export const PANEL = 'https://panel-store.upready.dev';
export const SHOP = 'https://cherkashino.shipshift.dev';
export const ENGINE = 'https://shipshift.dev';
export const STATE = process.env.Q02_STATE || path.join(ROOT, '.owner-state.json');

export function creds() {
  const txt = fs.readFileSync('/Users/ivanprotsko/upready/.private/upready-store-day-2026-09-16/cherkashino-owner.md', 'utf8');
  const email = (txt.match(/E-mail владельца[^:]*:\s*(\S+)/) || [])[1];
  const pass = (txt.match(/^-\s*Пароль:\s*(.+)$/m) || [])[1];
  if (!email || !pass) throw new Error('creds not parsed');
  return { email, pass: pass.trim() };
}

export async function launch({ storage = true } = {}) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'ru-RU',
    storageState: storage && fs.existsSync(STATE) ? STATE : undefined,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 300)));
  return { browser, ctx, page, errors };
}

export async function shot(page, name) {
  const p = path.join(SHOTS, `${name}-1280x900.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

export async function timedGoto(page, url, opts = {}) {
  const t0 = Date.now();
  let status = null;
  try {
    const r = await page.goto(url, { waitUntil: opts.waitUntil || 'domcontentloaded', timeout: opts.timeout || 90000 });
    status = r ? r.status() : null;
  } catch (e) { return { url, status: 'ERR', ms: Date.now() - t0, error: String(e).slice(0, 200) }; }
  return { url, status, ms: Date.now() - t0 };
}

// wait until a selector appears, measuring; returns {ok, ms}
export async function waitUsable(page, selector, timeout = 90000) {
  const t0 = Date.now();
  try { await page.waitForSelector(selector, { timeout, state: 'visible' }); return { ok: true, ms: Date.now() - t0, selector }; }
  catch (e) { return { ok: false, ms: Date.now() - t0, selector, error: String(e).slice(0, 160) }; }
}

export function save(name, obj) {
  fs.writeFileSync(path.join(RAW, name), JSON.stringify(obj, null, 2));
  return path.join(RAW, name);
}
