#!/usr/bin/env node
// Contact sheet of a packshot run (t-2026-09-25-n17): one row per source,
// columns source | exact | rerender, the meta of each result under it and a thin
// red guide at the baseline of every result, so a reader sees at once whether the
// bases sit on one line.
//
//   node scripts/packshot/contact-sheet.mjs --results <dir> --out <png> [--cell 300] <source…>
//
// <dir> holds what packshot-cli.mjs wrote (<name>.<mode>.png and .json). Read-only
// apart from --out.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { BACKEND_DIR } from './load-pipeline.mjs';

const require = createRequire(path.join(BACKEND_DIR, 'package.json'));
const sharp = require('sharp');

const argv = process.argv.slice(2);
const sources = [];
let results = null;
let out = null;
let cell = 300;

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--results') results = argv[++i];
  else if (argv[i] === '--out') out = argv[++i];
  else if (argv[i] === '--cell') cell = Number(argv[++i]);
  else if (argv[i].startsWith('-')) {
    console.error(`contact-sheet: unknown flag ${argv[i]}`);
    process.exit(2);
  } else sources.push(argv[i]);
}

if (!results || !out || sources.length === 0 || !Number.isFinite(cell)) {
  console.error('usage: contact-sheet.mjs --results <dir> --out <png> [--cell 300] <source…>');
  process.exit(2);
}

const W = cell;
const H = Math.round((cell * 4) / 3);
const LABEL = 58;
const HEAD = 34;
const COLS = ['source', 'exact', 'rerender'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const text = (lines, width, height, fill = '#f3f4f6') =>
  Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${fill}"/>` +
      lines.map((l, i) => `<text x="6" y="${16 + i * 15}" font-size="12" font-family="Helvetica, Arial" fill="#111">${esc(l)}</text>`).join('') +
      '</svg>',
  );

const layers = [];

COLS.forEach((c, i) => layers.push({ input: text([c.toUpperCase()], W, HEAD, '#e5e7eb'), left: i * W, top: 0 }));

for (let r = 0; r < sources.length; r++) {
  const src = sources[r];
  const name = path.parse(src).name;
  const top = HEAD + r * (H + LABEL);

  for (let c = 0; c < COLS.length; c++) {
    const left = c * W;
    const file = c === 0 ? src : path.join(results, `${name}.${COLS[c]}.png`);
    const metaFile = c === 0 ? null : path.join(results, `${name}.${COLS[c]}.json`);
    let lines;

    if (fs.existsSync(file)) {
      const img = await sharp(file).flatten({ background: '#ffffff' }).resize(W, H, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
      layers.push({ input: img, left, top });

      if (c > 0 && metaFile && fs.existsSync(metaFile)) {
        const m = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        const guide = Math.round(((m.base_row + 1) / m.canvas[1]) * H);
        layers.push({ input: Buffer.from(`<svg width="${W}" height="1" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="1" fill="#ef4444"/></svg>`), left, top: top + guide });
        lines = [
          `${m.mode === "rerender" ? "render + " : "engine "}${m.engine_used}${m.auto_fallback ? ' (auto fallback)' : ''} · base ${m.base_pct} %`,
          `cut ${m.shadow_cut ? `${m.shadow_cut.method}` : '-'} · specks ${m.specks_removed}`,
          `$${m.cost_usd_estimate} · ${(m.timings_ms.total / 1000).toFixed(1)} s`,
        ];
      } else lines = [path.basename(src).slice(0, 40)];
    } else {
      layers.push({ input: text(['—'], W, H, '#fafafa'), left, top });
      lines = c === 2 ? ['not run (white source)'] : ['missing'];
    }

    layers.push({ input: text(lines, W, LABEL), left, top: top + H });
  }
}

fs.mkdirSync(path.dirname(out), { recursive: true });
await sharp({ create: { width: COLS.length * W, height: HEAD + sources.length * (H + LABEL), channels: 3, background: '#ffffff' } })
  .composite(layers)
  .png({ compressionLevel: 9 })
  .toFile(out);
console.log(`contact-sheet: ${sources.length} rows -> ${out} (${fs.statSync(out).size} bytes)`);
