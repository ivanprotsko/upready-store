#!/usr/bin/env node
// Read-only measurement of packshot PNGs, the acceptance instrument of t-2026-09-25-n17.
//
//   node scripts/packshot/measure.mjs <png…> [--shadow-opacity 0.35] [--json]
//
// Per image: width height ring_min base_row base_pct bbox sha256, plus the method the
// base was found by (shadow-midline | last-row) and below_base_foreign, the pixels under
// the base that a neutral contact shadow cannot explain (0 = no reflection). The logic
// is src/packshot/measure.ts, which reads the picture alone and never the meta.
// Accepts local paths and http(s) URLs (read with a GET, nothing is written).

import fs from 'node:fs';
import { loadPackshot } from './load-pipeline.mjs';

const argv = process.argv.slice(2);
const inputs = [];
let opacity = 0.35;
let json = false;

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];

  if (arg === '--json') json = true;
  else if (arg === '--shadow-opacity') {
    opacity = Number(argv[++i]);
    if (!Number.isFinite(opacity)) {
      console.error('measure: --shadow-opacity needs a number');
      process.exit(2);
    }
  } else if (arg.startsWith('-')) {
    console.error(`measure: unknown flag ${arg}\nusage: measure.mjs <png…> [--shadow-opacity 0.35] [--json]`);
    process.exit(2);
  } else inputs.push(arg);
}

if (inputs.length === 0) {
  console.error('usage: measure.mjs <png…> [--shadow-opacity 0.35] [--json]');
  process.exit(2);
}

const { measurePackshot } = loadPackshot('measure.ts');
const rows = [];

if (!json) console.log(['file', 'width', 'height', 'ring_min', 'base_row', 'base_pct', 'bbox', 'sha256', 'method', 'below_base_foreign'].join('\t'));

for (const input of inputs) {
  const bytes = /^https?:\/\//.test(input)
    ? Buffer.from(await (await fetch(input)).arrayBuffer())
    : fs.readFileSync(input);
  const m = await measurePackshot(bytes, { shadowOpacity: opacity });

  rows.push({ file: input, ...m });
  if (!json) {
    console.log([input, m.width, m.height, m.ring_min, m.base_row, m.base_pct, m.bbox ? m.bbox.join(',') : '-', m.sha256, m.method, m.below_base_foreign].join('\t'));
  }
}

if (json) console.log(JSON.stringify(rows, null, 2));
else if (rows.length > 1) {
  const pcts = rows.map((r) => r.base_pct);
  console.log(`# base_pct spread: min ${Math.min(...pcts)} max ${Math.max(...pcts)} delta ${(Math.max(...pcts) - Math.min(...pcts)).toFixed(3)} % of height`);
}
