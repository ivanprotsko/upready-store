#!/usr/bin/env node
// Packshot CLI (t-2026-09-25-n17): the same pipeline as POST /tenants/products/:id/packshot,
// over one file or every picture of a directory.
//
//   node scripts/packshot/packshot-cli.mjs <input-file-or-dir> --out <dir>
//        [--engine auto|local|bria] [--no-shadow] [--mode exact|rerender] [--dry-run]
//
// --dry-run prints the decision per file (engine, border ring, canvas, baseline) and
// writes nothing, so it is free and needs no --out. Without it, each source gives
// <out>/<name>.<mode>.png and <out>/<name>.<mode>.json (the meta). An unknown flag or a
// bad value exits 2. FAL_KEY is read from the backend env (apps/backend/.env) and never
// printed; bria and rerender need it.

import fs from 'node:fs';
import path from 'node:path';
import { loadBackendEnv, loadPackshot } from './load-pipeline.mjs';

const PICTURE = /\.(jpe?g|png|webp|avif)$/i;

const usage = () =>
  'usage: packshot-cli.mjs <input-file-or-dir> --out <dir> [--engine auto|local|bria] [--no-shadow] [--mode exact|rerender] [--dry-run]';

function parseArgs(argv) {
  const args = { input: null, out: null, engine: 'auto', shadow: true, mode: 'exact', dryRun: false };
  const value = (flag, i) => {
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) throw new Error(`${flag} needs a value`);
    return next;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--out') args.out = value(arg, i++);
    else if (arg === '--engine') args.engine = value(arg, i++);
    else if (arg === '--mode') args.mode = value(arg, i++);
    else if (arg === '--no-shadow') args.shadow = false;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg.startsWith('-')) throw new Error(`unknown flag ${arg}`);
    else if (args.input === null) args.input = arg;
    else throw new Error(`unexpected argument ${arg}`);
  }

  if (!args.input) throw new Error('missing <input-file-or-dir>');
  if (!['auto', 'local', 'bria'].includes(args.engine)) throw new Error(`--engine must be auto, local or bria, got ${args.engine}`);
  if (!['exact', 'rerender'].includes(args.mode)) throw new Error(`--mode must be exact or rerender, got ${args.mode}`);
  if (!args.dryRun && !args.out) throw new Error('--out <dir> is required unless --dry-run');

  return args;
}

let args;

try {
  args = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(`packshot-cli: ${err.message}\n${usage()}`);
  process.exit(2);
}

const stat = fs.statSync(args.input, { throwIfNoEntry: false });

if (!stat) {
  console.error(`packshot-cli: ${args.input} does not exist`);
  process.exit(2);
}

const files = stat.isDirectory()
  ? fs.readdirSync(args.input).filter((f) => PICTURE.test(f)).sort().map((f) => path.join(args.input, f))
  : [args.input];

if (files.length === 0) {
  console.error(`packshot-cli: no pictures in ${args.input}`);
  process.exit(2);
}

loadBackendEnv();

const { planPackshot, prepareSource, runPackshot } = loadPackshot('pipeline.ts');
const { falKey } = loadPackshot('config.ts');
const options = { engine: args.engine, shadow: args.shadow, mode: args.mode };
const key = falKey();

console.log(
  `packshot-cli: ${files.length} file(s), mode=${args.mode} engine=${args.engine} shadow=${args.shadow} ` +
    `fal_key=${key ? 'present' : 'absent'}${args.dryRun ? ' (dry run, nothing is written)' : ''}`,
);

if (!args.dryRun) fs.mkdirSync(args.out, { recursive: true });

let failures = 0;
let spend = 0;

for (const file of files) {
  const name = path.parse(file).name;
  const source = fs.readFileSync(file);

  if (args.dryRun) {
    const plan = await planPackshot(await prepareSource(source), options);
    console.log(
      `${path.basename(file)}\tengine=${plan.engine}\tneeds_fal=${plan.needs_fal}\tring_min=${plan.ring.ring_min}` +
        `\tring_white_pct=${plan.ring.ring_white_pct}\tsource=${plan.source.width}x${plan.source.height}` +
        `\tcanvas=${plan.canvas.join('x')}\tbaseline_row=${plan.baseline_row}\tbaseline_pct=${plan.baseline_pct}`,
    );
    continue;
  }

  try {
    const { png, meta } = await runPackshot({ source, options, falKey: key });
    const stem = path.join(args.out, `${name}.${args.mode}`);

    fs.writeFileSync(`${stem}.png`, png);
    fs.writeFileSync(`${stem}.json`, `${JSON.stringify({ source: path.basename(file), options, ...meta }, null, 2)}\n`);
    spend += meta.cost_usd_estimate;
    console.log(
      `${path.basename(file)}\tengine=${meta.engine_used}\tbase_pct=${meta.base_pct}\tcut=${meta.shadow_cut ? `${meta.shadow_cut.method}@${meta.shadow_cut.row}` : '-'}` +
        `\tspecks=${meta.specks_removed}\treflection_in_source=${meta.reflection_detected_in_source}` +
        `\tcost=$${meta.cost_usd_estimate}\twall_ms=${meta.timings_ms.total}\t-> ${stem}.png`,
    );
  } catch (err) {
    failures++;
    console.error(`${path.basename(file)}\tFAILED (${err.code ?? 'error'}): ${err.message}`);
  }
}

if (!args.dryRun) console.log(`packshot-cli: done, ${files.length - failures} ok, ${failures} failed, fal estimate $${spend.toFixed(3)}`);
process.exit(failures ? 1 : 0);
