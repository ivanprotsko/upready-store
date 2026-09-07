#!/usr/bin/env node
/**
 * wave-registry.mjs — the night wave's two registries, and the $6.00 ceiling as CODE.
 *
 * Why it exists. The pilot recorded `costUsd: 0` for every theme, which meant "not
 * measured" and read as "free". Ivan's rule for wave 2: every render is written down
 * WITH ITS PRICE at the moment it is requested, and the ceiling is enforced by a tool
 * that can refuse — not by an agent remembering a number (rule 41: guardrails are code).
 *
 * The ledger is ONE file, in the MAIN checkout, addressed absolutely. Eight theme
 * worktrees each holding their own `spend.json` would make the ceiling a fiction: nobody
 * would ever see the total until the money was gone. Writers take a lock; a render is
 * appended before the image comes back, so a crash loses the picture, never the dollar.
 *
 * Prices are a TABLE here, not an argument. An agent cannot mistype $0.039 as $0.0039;
 * it names the model and the resolution and the tool prices the call.
 * Measured 2026-09-08 02:20 WITA on the fal.ai model pages.
 *
 *   node wave-registry.mjs validate
 *   node wave-registry.mjs spend show
 *   node wave-registry.mjs spend add --theme supplements --model fal-ai/nano-banana \
 *        --kind grid-3x3 --purpose product-grid [--resolution 2K] [--prompt-sha <64hex>]
 *        [--reshoot-of <id>] [--dry-run]
 *   node wave-registry.mjs spend judge --id <id> --accepted true|false
 *   node wave-registry.mjs queue show
 *   node wave-registry.mjs queue next
 *   node wave-registry.mjs queue set --theme supplements --state running [--agent a] [--stage W3]
 *        [--handover artifacts/docs/…md] [--reason "…"]
 *
 * Registry dir: $WAVE_REGISTRY_DIR, else <main checkout>/artifacts/wave.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAIN_CHECKOUT = '/Users/ivanprotsko/upready/projects/upready-store';
const DIR = process.env.WAVE_REGISTRY_DIR || path.join(MAIN_CHECKOUT, 'artifacts/wave');
const QUEUE = path.join(DIR, 'queue.json');
const SPEND = path.join(DIR, 'spend.json');
const LOCK = path.join(DIR, '.registry.lock');

/** fal.ai price list, measured 2026-09-08 02:20 WITA. resolution only bites on -pro. */
const PRICES = {
  'fal-ai/nano-banana': { '2K': 0.039, '4K': 0.039, null: 0.039 },
  'fal-ai/nano-banana-pro': { '2K': 0.15, '4K': 0.30, null: 0.15 },
};
const PURPOSES = ['grid-measurement', 'product-grid', 'category-tiles', 'hero', 'showcase', 'reshoot'];
const STATES = ['queued', 'running', 'done', 'skipped', 'blocked'];

/** Refusal carried as a THROW, never process.exit(): exit() skips `finally`, so the first
 *  refusal used to leave .registry.lock behind and the NEXT writer failed on the lock instead
 *  of on the ceiling — a guard that jams is indistinguishable from a guard that fires. */
class Refusal extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const die = (msg) => { throw new Refusal(1, msg); };
const refuse = (code, msg) => { throw new Refusal(code, msg); };
const nowWita = () =>
  new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Makassar' }).replace(' ', 'T') + '+08:00';

/** argv -> {_: [...], flag: value}. A bare flag is `true`; `--no-x` is false. */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > -1) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

const readJson = (p) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { die(`cannot read ${p}: ${e.message}`); }
};

/** Atomic-ish exclusive lock. Two theme agents append at once; last-write-wins would
 *  silently drop a render, and a dropped render is money nobody can account for. */
function withLock(fn) {
  let fd = null;
  for (let attempt = 0; attempt < 200; attempt++) {
    try { fd = fs.openSync(LOCK, 'wx'); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // a lock older than 30 s belonged to a process that died holding it
      try {
        if (Date.now() - fs.statSync(LOCK).mtimeMs > 30_000) { fs.unlinkSync(LOCK); continue; }
      } catch { /* it vanished between stat and unlink — just retry */ }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  if (fd === null) die('could not take the registry lock after 200 tries — a writer is stuck; check ' + LOCK);
  try { return fn(); }
  finally { fs.closeSync(fd); try { fs.unlinkSync(LOCK); } catch { /* already gone */ } }
}

const writeJson = (p, obj) => {
  obj.updatedAt = nowWita();
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, p);   // rename is atomic: a reader never sees half a ledger
};

// ---------------------------------------------------------------- validate

async function cmdValidate() {
  const { createRequire } = await import('node:module');
  const req = createRequire('/Users/ivanprotsko/upready/.ai/scripts/x.js');
  let AjvC;
  try { const m = req('ajv/dist/2020'); AjvC = m.default || m; }
  catch (e) { die('ajv/dist/2020 not resolvable: ' + e.message); }
  const ajv = new AjvC({ allErrors: true, strict: false, logger: false });
  let bad = 0;
  for (const [name, file] of [['queue', QUEUE], ['spend', SPEND]]) {
    const schema = readJson(path.join(DIR, `schema/${name}.schema.json`));
    const check = ajv.compile(schema);
    const ok = check(readJson(file));
    // ajv.errors belongs to the INSTANCE and a compiled validator never sets it, so this
    // printed "INVALID: null" and named nothing. A report that cannot name the fault is
    // not a report (rule 18e). Errors live on the compiled function.
    if (!ok) { bad++; for (const e of check.errors || []) console.log(`  ${name}.json ${e.instancePath || "/"} ${e.message}`); }
    else console.log(`${name}.json valid`);
  }
  // the sums are part of the contract too, and no schema can check them
  const s = readJson(SPEND);
  const sum = Number(s.renders.reduce((a, r) => a + r.priceUsd, 0).toFixed(4));
  if (s.renders.length !== s.totals.renderCount) { bad++; console.log(`totals.renderCount ${s.totals.renderCount} != ${s.renders.length} rows`); }
  if (Math.abs(sum - s.totals.spentUsd) > 1e-6) { bad++; console.log(`totals.spentUsd ${s.totals.spentUsd} != ${sum} summed from rows`); }
  if (bad) refuse(1, `${bad} problem(s) above`);
}

// ---------------------------------------------------------------- spend

function cmdSpendAdd(a) {
  const theme = a.theme, model = a.model, kind = a.kind, purpose = a.purpose;
  const resolution = a.resolution ?? null;
  if (!theme || typeof theme !== 'string') die('--theme is required');
  if (!PRICES[model]) die(`--model must be one of ${Object.keys(PRICES).join(', ')} (got ${model})`);
  // A grid's price is set by the model and the resolution, never by how many panels the
  // prompt asks for, so the panel count is DESCRIPTIVE metadata and the shape is what is
  // validated. electronics has 14 products and buys them as one 4x4 at 4K; a fixed
  // `grid-3x3` enum would have forced either a second $0.30 prediction or a false entry
  // in the ledger, and a ledger that lies is the defect this tool exists to prevent.
  // `kind` is stored and never branched on by `spend show` / `validate`, so widening it
  // cannot change any figure already written.
  if (!(kind === 'single' || /^grid-\d{1,2}x\d{1,2}$/.test(kind)))
    die('--kind must be single or grid-<cols>x<rows>, e.g. grid-3x3 or grid-4x4');
  if (!PURPOSES.includes(purpose)) die(`--purpose must be one of ${PURPOSES.join(', ')}`);
  if (resolution !== null && !['2K', '4K'].includes(resolution)) die('--resolution must be 2K or 4K');
  if (a['prompt-sha'] && !/^[0-9a-f]{64}$/.test(a['prompt-sha'])) die('--prompt-sha must be 64 hex chars');
  const priceUsd = PRICES[model][resolution ?? 'null'] ?? PRICES[model][String(resolution)];
  if (typeof priceUsd !== 'number') die('no price for that model/resolution pair');

  return withLock(() => {
    const s = readJson(SPEND);
    const spent = Number(s.renders.reduce((x, r) => x + r.priceUsd, 0).toFixed(4));
    const after = Number((spent + priceUsd).toFixed(4));
    if (after > s.ceilingUsd) {
      refuse(2, `REFUSED: $${spent.toFixed(3)} spent + $${priceUsd.toFixed(3)} = $${after.toFixed(3)} > ceiling $${s.ceilingUsd.toFixed(2)}.\n` +
        "Ivan's ceiling is hard. Stop generating, finish what costs nothing, and write a HANDOFF question.");
    }
    if (spent >= s.softStopUsd && purpose !== 'reshoot') {
      refuse(3, `REFUSED: $${spent.toFixed(3)} spent is past the soft stop $${s.softStopUsd.toFixed(2)}; only --purpose reshoot is allowed from here.`);
    }
    const row = {
      id: 'r-' + crypto.randomBytes(4).toString('hex'),
      at: nowWita(), theme, model, kind, resolution, priceUsd, purpose,
      promptSha256: a['prompt-sha'] || null,
      reshootOf: a['reshoot-of'] || null,
      accepted: null,
    };
    if (a['dry-run']) { console.log('DRY RUN, nothing written: ' + JSON.stringify(row)); return; }
    s.renders.push(row);
    s.totals.spentUsd = after;
    s.totals.renderCount = s.renders.length;
    writeJson(SPEND, s);
    console.log(`${row.id}  $${priceUsd.toFixed(3)}  ${theme}/${purpose}  ->  $${after.toFixed(3)} of $${s.ceilingUsd.toFixed(2)}, $${(s.ceilingUsd - after).toFixed(3)} left`);
  });
}

function cmdSpendJudge(a) {
  if (!a.id) die('--id is required');
  if (a.accepted !== 'true' && a.accepted !== 'false') die('--accepted must be true or false');
  return withLock(() => {
    const s = readJson(SPEND);
    const row = s.renders.find((r) => r.id === a.id);
    if (!row) die(`no render ${a.id} in the ledger`);
    row.accepted = a.accepted === 'true';
    writeJson(SPEND, s);
    console.log(`${row.id}: accepted=${row.accepted}`);
  });
}

function cmdSpendShow() {
  const s = readJson(SPEND);
  const spent = s.totals.spentUsd;
  console.log(`fal.ai  spent $${spent.toFixed(3)} of ceiling $${s.ceilingUsd.toFixed(2)} (balance at start $${s.balanceAtStartUsd.toFixed(2)}), ${s.totals.renderCount} renders`);
  console.log(`soft stop $${s.softStopUsd.toFixed(2)}: ${spent >= s.softStopUsd ? 'REACHED — reshoots only' : 'not reached'}`);
  console.log(`dashboard figure: ${s.totals.dashboardUsd === null ? 'NOT READ YET (never guess it)' : '$' + s.totals.dashboardUsd}`);
  const byTheme = {};
  for (const r of s.renders) byTheme[r.theme] = Number(((byTheme[r.theme] || 0) + r.priceUsd).toFixed(4));
  for (const [t, v] of Object.entries(byTheme)) console.log(`  ${t.padEnd(16)} $${v.toFixed(3)}`);
  const rejected = s.renders.filter((r) => r.accepted === false).length;
  if (rejected) console.log(`  ${rejected} render(s) rejected by the visual gate — their dollars are spent, not recoverable`);
}

// ---------------------------------------------------------------- queue

function cmdQueueShow() {
  const q = readJson(QUEUE);
  console.log(`concurrency ${q.concurrency}, ${q.themes.filter((t) => t.state === 'running').length} running`);
  for (const t of q.themes) {
    const cost = t.costUsd === null ? '   —  ' : '$' + t.costUsd.toFixed(3);
    console.log(`  ${String(t.order).padStart(2)}. ${t.theme.padEnd(16)} ${t.state.padEnd(8)} ${(t.stage || '—').padEnd(4)} ${cost}  ${t.reason || ''}`);
  }
}

function cmdQueueNext() {
  const q = readJson(QUEUE);
  const running = q.themes.filter((t) => t.state === 'running');
  if (running.length >= q.concurrency) refuse(4, `WAIT: ${running.length} running (${running.map((t) => t.theme).join(', ')}), cap is ${q.concurrency}`);
  const next = q.themes.find((t) => t.state === 'queued');
  if (!next) refuse(5, 'DONE: nothing queued');
  console.log(`${next.theme}\t${next.mode || 'mode-undecided'}\t${next.why}`);
}

function cmdQueueSet(a) {
  if (!a.theme) die('--theme is required');
  if (a.state && !STATES.includes(a.state)) die(`--state must be one of ${STATES.join(', ')}`);
  if (['skipped', 'blocked'].includes(a.state) && !a.reason) die(`--state ${a.state} needs --reason: a theme that stalls is written down, never silent`);
  return withLock(() => {
    const q = readJson(QUEUE);
    const t = q.themes.find((x) => x.theme === a.theme);
    if (!t) die(`no theme ${a.theme} in the queue`);
    if (a.state) {
      t.state = a.state;
      if (a.state === 'running' && !t.startedAt) t.startedAt = nowWita();
      if (['done', 'skipped', 'blocked'].includes(a.state)) t.finishedAt = nowWita();
    }
    for (const [flag, field] of [['agent', 'agent'], ['stage', 'stage'], ['handover', 'handoverPath'], ['reason', 'reason']]) {
      if (a[flag] !== undefined) t[field] = a[flag] === '' ? null : String(a[flag]);
    }
    // cost is never typed by hand — it is summed from the ledger this theme actually wrote
    const s = readJson(SPEND);
    const mine = s.renders.filter((r) => r.theme === a.theme);
    t.costUsd = mine.length ? Number(mine.reduce((x, r) => x + r.priceUsd, 0).toFixed(4)) : null;
    if (a.tokens !== undefined) t.tokens = Number.isFinite(Number(a.tokens)) ? Number(a.tokens) : null;
    writeJson(QUEUE, q);
    console.log(`${t.theme}: state=${t.state} stage=${t.stage || '—'} cost=${t.costUsd === null ? 'not measured' : '$' + t.costUsd.toFixed(3)}`);
  });
}

// ---------------------------------------------------------------- main

const a = parseArgs(process.argv.slice(2));
const [group, sub] = a._;
const route = {
  'validate': () => cmdValidate(),
  'spend add': () => cmdSpendAdd(a),
  'spend judge': () => cmdSpendJudge(a),
  'spend show': () => cmdSpendShow(),
  'queue show': () => cmdQueueShow(),
  'queue next': () => cmdQueueNext(),
  'queue set': () => cmdQueueSet(a),
};
const key = group === 'validate' ? 'validate' : `${group} ${sub}`;
try {
  if (!route[key]) die(`unknown command "${[group, sub].filter(Boolean).join(' ')}". Known: ${Object.keys(route).join(', ')}`);
  await route[key]();
} catch (e) {
  if (e instanceof Refusal) { console.error(e.message.startsWith('REFUSED') || e.message.startsWith('WAIT') || e.message.startsWith('DONE') ? e.message : 'wave-registry: ' + e.message); process.exit(e.code); }
  throw e;
}
