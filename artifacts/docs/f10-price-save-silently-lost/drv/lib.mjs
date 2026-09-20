import fs from 'node:fs';
import path from 'node:path';
import * as pw from '/Users/ivanprotsko/upready/projects/upready-store/node_modules/playwright/index.mjs';

export const ROOT = '/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-price-save-silently-lost/artifacts/docs/f10-price-save-silently-lost';
export const SHOTS = path.join(ROOT, 'shots');
export const RAW = path.join(ROOT, 'raw');
export const PANEL = process.env.PANEL_URL || 'https://panel-store.upready.dev';
export const SHOP = 'https://cherkashino.shipshift.dev';
export const PRODUCT = process.env.PRODUCT_ID || 'prod_01M2GRC5XMX78M72NZSXTM8B6X';
export const VARIANT = process.env.VARIANT_ID || 'variant_01M2GRC6CJB0VZGW034SG084G0';
export const PRODUCT_HANDLE = process.env.PRODUCT_HANDLE || 'svechi-asd-s-chesnokom-10-sht-cherkashino';
export const PRICE_FIELD = process.env.PRICE_FIELD || 'variants.0.prices.rub';

const slug = s => s.replace(/[^a-z0-9]+/gi, '-');
export const stateFile = engine => path.join(ROOT, `.state-${slug(PANEL)}-${engine}.json`);

export function creds() {
  const txt = fs.readFileSync('/Users/ivanprotsko/upready/.private/upready-store-day-2026-09-16/cherkashino-owner.md', 'utf8');
  const email = (txt.match(/E-mail владельца[^:]*:\s*(\S+)/) || [])[1];
  const pass = (txt.match(/^-\s*Пароль:\s*(.+)$/m) || [])[1];
  if (!email || !pass) throw new Error('creds not parsed');
  return { email, pass: pass.trim() };
}

export async function launch({ engine = 'chromium', storage = true } = {}) {
  const browser = await pw[engine].launch({ headless: true });
  const STATE = stateFile(engine);
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'ru-RU',
    storageState: storage && fs.existsSync(STATE) ? STATE : undefined,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 300)));
  return { browser, ctx, page, errors, engine, STATE };
}

export async function login(page, ctx, engine) {
  const { email, pass } = creds();
  await page.goto(PANEL + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('input[name=email]', { timeout: 60000, state: 'visible' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', pass);
  await page.click('button:has-text("Продолжить с Email")');
  await page.waitForURL(u => !String(u).includes('/login'), { timeout: 60000 });
  await page.waitForSelector('nav, aside, [role=navigation]', { timeout: 60000 });
  await page.waitForTimeout(1500);
  await ctx.storageState({ path: stateFile(engine) });
  return page.url();
}

/** Opens a panel route as a logged-in owner, logging in first when the state is missing or stale. */
export async function open(page, ctx, engine, route, { settle = 4000 } = {}) {
  if (!fs.existsSync(stateFile(engine))) {
    await login(page, ctx, engine);
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(PANEL + route, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(settle);
    if (!/\/login/.test(page.url())) {
      return page.url();
    }
    await login(page, ctx, engine);
  }
  throw new Error('login did not stick, still at ' + page.url());
}

export async function shot(page, name) {
  const p = path.join(SHOTS, `${name}-1280x900.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

export function save(name, obj) {
  fs.writeFileSync(path.join(RAW, name), JSON.stringify(obj, null, 2));
  return path.join(RAW, name);
}

/** The variant's prices straight from the engine, the way the acceptor reads them. */
export async function apiPrices(ctx) {
  const r = await ctx.request.get(`${PANEL}/tenants/products/${PRODUCT}?fields=*variants.prices`);
  if (!r.ok()) return { status: r.status(), body: (await r.text()).slice(0, 200) };
  const body = await r.json();
  const v = (body.product?.variants || []).find(x => x.id === VARIANT);
  const out = { status: r.status() };
  for (const p of v?.prices || []) out[p.currency_code] = p.amount;
  return out;
}

/**
 * Walks the grid anchor to the price cell named by PRICE_FIELD with Tab and
 * verifies by the cell id, not by a visible header: the header of a virtualized
 * column shows up several columns before the anchor gets there.
 */
export async function anchorOnPriceCell(page, field = PRICE_FIELD) {
  for (let tabs = 0; tabs <= 200; tabs++) {
    const state = await page.evaluate((f) => {
      const input = document.querySelector(`input[data-field="${f}"]`);
      const active = document.activeElement;
      return {
        cellId: input?.getAttribute('data-cell-id') || null,
        activeId: active?.getAttribute?.('data-container-id') || null,
      };
    }, field);
    if (state.cellId && state.activeId && state.cellId === state.activeId) {
      return { tabs, cellId: state.cellId };
    }
    await page.keyboard.press('Tab');
    await page.waitForTimeout(40);
  }
  throw new Error('price cell never became the anchor: ' + field);
}

/** The RUB price as the owner reads it on the variant screen, after a reload. */
export async function panelVariantPrice(page, ctx, engine, openFn) {
  await openFn(page, ctx, engine, `/products/${PRODUCT}/variants/${VARIANT}`, { settle: 5000 });
  const txt = await page.evaluate(() => document.body.innerText);
  const m = txt.match(/RUB\n([^\n]+)/);
  return m ? m[1].trim() : null;
}

/** Reads the price the storefront shows, after asking it to revalidate its cache. */
export async function storefrontPrice(ctx, page) {
  await ctx.request.post(`${SHOP}/api/revalidate`).catch(() => {});
  const r = await page.goto(`${SHOP}/ru/products/${PRODUCT_HANDLE}`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(2500);
  const txt = await page.evaluate(() => document.body.innerText);
  const m = txt.match(/\d[\d   ]*,\d\d\s?₽/);
  return { status: r?.status() ?? null, price: m ? m[0] : null };
}
