#!/usr/bin/env node
// Stage S4 image driver for the `sneakers` store profile.
//
//   node generate.mjs plan                  # free: write every prompt to disk, spend nothing
//   node generate.mjs run <key> [<key>…]    # SPENDS MONEY: one prediction per key
//   node generate.mjs run --group products|banner|tiles
//   node generate.mjs convert               # free: raws -> WebP + media/manifest.json
//   node generate.mjs sheet                 # free: contact sheet of the product frames
//
// THE BUDGET IS 19 PREDICTIONS FOR THE WHOLE PILOT AND THERE ARE NO REGENERATIONS
// (Ivan, 2026-09-07). Two guards enforce that, not a good intention:
//   * the ledger refuses a 20th prediction;
//   * the ledger refuses a second prediction for a key that already has one, so a
//     re-run of this script can never quietly re-render a frame that disappointed.
// A frame that fails review keeps its place in the catalog with status "flagged"
// and goes to second-pass.json. It is never re-rendered here.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { MAX_PREDICTIONS, MODELS, PROFILE_ID, artifactsDir, buildFrames, profileDir } from './frames.mjs';
import { loadReplicateKey, readProviderCost, runPrediction } from './replicate.mjs';

const ART = artifactsDir();
const RAW = path.join(ART, 'raw');
const LEDGER = path.join(ART, 'ledger.json');
const REVIEW = path.join(ART, 'review.json');
const MEDIA = path.join(profileDir(), 'media');
const MANIFEST = path.join(MEDIA, 'manifest.json');
const DEFAULT_MODEL = 'google/nano-banana-2';

const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback);
const writeJson = (f, v) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`);
};
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Remove provider URLs from a prediction object — see the sidecar note below. */
function stripProviderUrls(prediction) {
  const { output: _output, urls: _urls, ...rest } = prediction;
  return rest;
}

function loadLedger() {
  return readJson(LEDGER, { maxPredictions: MAX_PREDICTIONS, predictions: [] });
}

/**
 * The spend gate. Throws rather than returning false — a budget guard that can be
 * ignored by a caller who forgot to check the return value is not a guard.
 */
function assertMaySpend(ledger, key) {
  if (ledger.predictions.some((p) => p.key === key)) {
    throw new Error(
      `REFUSED: frame "${key}" already has prediction ${ledger.predictions.find((p) => p.key === key).id}. ` +
        'The pilot allows no regenerations — a bad frame is flagged, not re-rendered.',
    );
  }
  if (ledger.predictions.length >= MAX_PREDICTIONS) {
    throw new Error(`REFUSED: the ${MAX_PREDICTIONS}-prediction budget is spent (${ledger.predictions.length} used).`);
  }
}

// ---------------------------------------------------------------------------
// plan — free
// ---------------------------------------------------------------------------

function cmdPlan() {
  const frames = buildFrames();
  const out = path.join(ART, 'prompts.json');
  writeJson(out, {
    profileId: PROFILE_ID,
    generatedAt: new Date().toISOString(),
    budget: MAX_PREDICTIONS,
    frames: frames.map((f) => ({
      key: f.key,
      role: f.role,
      template: f.template,
      productHandle: f.productHandle ?? null,
      categoryHandle: f.categoryHandle ?? null,
      aspectRatio: f.aspectRatio,
      resolution: f.resolution,
      outFile: f.outFile,
      longestSide: f.longestSide,
      prompt: f.prompt,
      negativePrompt: f.negativePrompt,
    })),
  });
  console.log(`plan: ${frames.length} frames -> ${out}`);
  for (const f of frames) console.log(`  ${f.key.padEnd(24)} ${f.template.padEnd(11)} ${f.aspectRatio} ${f.resolution}`);
}

// ---------------------------------------------------------------------------
// run — SPENDS MONEY
// ---------------------------------------------------------------------------

async function cmdRun(argv) {
  const frames = buildFrames();
  const byKey = new Map(frames.map((f) => [f.key, f]));

  let keys;
  const gi = argv.indexOf('--group');
  if (gi !== -1) {
    const group = argv[gi + 1];
    const pick = {
      products: (f) => f.role === 'hero',
      banner: (f) => f.role === 'banner',
      tiles: (f) => f.role === 'category-tile',
    }[group];
    if (!pick) throw new Error(`unknown --group ${group}`);
    keys = frames.filter(pick).map((f) => f.key);
  } else {
    keys = argv.filter((a) => !a.startsWith('--'));
  }
  const mi = argv.indexOf('--model');
  const modelName = mi !== -1 ? argv[mi + 1] : DEFAULT_MODEL;
  const model = MODELS[modelName];
  if (!model) throw new Error(`unknown model ${modelName}`);
  if (keys.length === 0) throw new Error('run: no frame keys given');

  const key = loadReplicateKey();
  fs.mkdirSync(RAW, { recursive: true });

  for (const k of keys) {
    const frame = byKey.get(k);
    if (!frame) throw new Error(`unknown frame key ${k}`);

    // Re-read the ledger every iteration: it is the shared record of money spent.
    const ledger = loadLedger();
    assertMaySpend(ledger, k);

    const input = model.buildInput(frame);
    process.stdout.write(`[${ledger.predictions.length + 1}/${MAX_PREDICTIONS}] ${k} via ${modelName} … `);

    const { prediction, outputs, wallMs, createdAt } = await runPrediction({
      key,
      version: model.version,
      model: modelName,
      input,
    });

    // Write the ledger the moment the prediction exists, before anything can throw.
    // A prediction that was billed but not recorded is the one failure mode that
    // would let a 20th render happen.
    ledger.predictions.push({ key: k, id: prediction.id, model: modelName, at: createdAt, status: prediction.status });
    writeJson(LEDGER, ledger);

    if (prediction.status !== 'succeeded') {
      console.log(`FAILED (${prediction.status}): ${String(prediction.error).slice(0, 300)}`);
      writeJson(path.join(RAW, `${k}.failed.json`), prediction);
      continue;
    }

    const cost = readProviderCost(prediction);
    const written = [];
    outputs.forEach((o, i) => {
      const ext = o.contentType.includes('png') ? 'png' : o.contentType.includes('webp') ? 'webp' : 'jpg';
      const file = path.join(RAW, `${k}-${i + 1}.${ext}`);
      fs.writeFileSync(file, o.buffer); // bytes to disk first, always
      written.push({ file: path.basename(file), bytes: o.buffer.length, sha256: sha256(o.buffer), outputUrl: o.url });
    });

    // Sidecar: everything needed to explain this render later without a provider call.
    const { image_input: _img, ...inputForRecord } = input;
    writeJson(path.join(RAW, `${k}.json`), {
      key: k,
      role: frame.role,
      template: frame.template,
      productHandle: frame.productHandle ?? null,
      categoryHandle: frame.categoryHandle ?? null,
      model: modelName,
      version: model.version,
      predictionId: prediction.id,
      input: inputForRecord,
      negativePrompt: frame.negativePrompt,
      outFile: frame.outFile,
      longestSide: frame.longestSide,
      files: written,
      costUsd: cost.costUsd,
      costSource: cost.source,
      costEvidence: cost.evidence,
      metrics: prediction.metrics ?? null,
      timings: {
        createdAt,
        startedAt: prediction.started_at ?? null,
        completedAt: prediction.completed_at ?? null,
        wallMs,
      },
      // The prediction object carries provider URLs in `output` and `urls.*`. They
      // are stripped here so `files[].outputUrl` stays the ONE place a provider URL
      // exists on disk. Nothing is lost: the prediction id is recorded above, and
      // every `urls.*` entry is just that id on an API path.
      predictionRaw: stripProviderUrls(prediction),
    });

    console.log(
      `ok ${written.map((w) => w.file).join(',')} ${(wallMs / 1000).toFixed(1)}s cost=${
        cost.costUsd === null ? `<${cost.source}>` : `$${cost.costUsd}`
      }`,
    );
  }
}

// ---------------------------------------------------------------------------
// convert — free. Raws -> WebP under the exact catalog filenames, + manifest.
// ---------------------------------------------------------------------------

async function cmdConvert() {
  const frames = buildFrames();
  const review = readJson(REVIEW, null);
  if (!review) throw new Error(`convert: ${REVIEW} is missing — every frame needs an explicit review verdict.`);

  fs.mkdirSync(MEDIA, { recursive: true });
  const entries = [];
  let costTotal = 0;
  let costMeasured = 0;

  for (const frame of frames) {
    const sidecarPath = path.join(RAW, `${frame.key}.json`);
    if (!fs.existsSync(sidecarPath)) {
      console.log(`skip ${frame.key}: no render on disk`);
      continue;
    }
    const sc = readJson(sidecarPath);
    const verdict = review[frame.key];
    if (!verdict || !verdict.status) throw new Error(`convert: no review verdict for ${frame.key} in ${REVIEW}`);
    if (verdict.status !== 'accepted' && !verdict.rejectReason) {
      throw new Error(`convert: ${frame.key} is "${verdict.status}" with no rejectReason`);
    }

    const rawFile = path.join(RAW, sc.files[0].file);
    const buf = fs.readFileSync(rawFile);
    // `withoutEnlargement` on purpose: §5.6(10) forbids visible upscaling artefacts,
    // so `longestSide` is a cap, not a target. Actual dimensions are recorded below.
    const webp = await sharp(buf)
      .resize({
        width: frame.longestSide,
        height: frame.longestSide,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    const meta = await sharp(webp).metadata();
    const outAbs = path.join(profileDir(), frame.outFile);
    fs.writeFileSync(outAbs, webp);

    if (typeof sc.costUsd === 'number') {
      costTotal += sc.costUsd;
      costMeasured += 1;
    }

    const entry = {
      file: frame.outFile,
      role: frame.role,
      sha256: sha256(webp),
      width: meta.width,
      height: meta.height,
      bytes: webp.length,
      model: `${sc.model}:${sc.version}`,
      predictionId: sc.predictionId,
      prompt: sc.input.prompt,
      negativePrompt: sc.negativePrompt,
      params: Object.fromEntries(Object.entries(sc.input).filter(([k]) => k !== 'prompt')),
      referenceFiles: [],
      sourceFile: `artifacts/media/${PROFILE_ID}/raw/${sc.files[0].file}`,
      status: verdict.status,
      createdAt: sc.timings.createdAt,
    };
    if (frame.productHandle) entry.productHandle = frame.productHandle;
    if (frame.role === 'category-tile') entry.categoryHandle = frame.categoryHandle;
    if (typeof sc.costUsd === 'number') entry.costUsd = sc.costUsd;
    if (verdict.rejectReason) entry.rejectReason = verdict.rejectReason;
    entries.push(entry);

    console.log(`${frame.outFile.padEnd(34)} ${meta.width}x${meta.height} ${(webp.length / 1024).toFixed(0)}KB ${verdict.status}`);
  }

  writeJson(MANIFEST, {
    schema: 'upready.store-media-manifest/v0',
    profileId: PROFILE_ID,
    provider: 'replicate',
    generatedAt: new Date().toISOString(),
    entries,
    totals: {
      renders: entries.length,
      accepted: entries.filter((e) => e.status === 'accepted').length,
      flagged: entries.filter((e) => e.status === 'flagged').length,
      rejected: entries.filter((e) => e.status === 'rejected').length,
      costUsd: costTotal,
    },
  });
  console.log(
    `manifest: ${entries.length} entries -> ${MANIFEST}; costUsd ${costTotal} measured from ${costMeasured}/${entries.length} predictions`,
  );
}

// ---------------------------------------------------------------------------
// sheet — free. One contact sheet of every product frame.
// ---------------------------------------------------------------------------

async function cmdSheet() {
  const frames = buildFrames().filter((f) => f.role === 'hero');
  const review = readJson(REVIEW, {});
  const CELL = 360;
  const LABEL = 34;
  const COLS = 5;
  const rows = Math.ceil(frames.length / COLS);
  const W = COLS * CELL;
  const H = rows * (CELL + LABEL);

  const composites = [];
  for (const [i, frame] of frames.entries()) {
    const src = path.join(profileDir(), frame.outFile);
    if (!fs.existsSync(src)) continue;
    const x = (i % COLS) * CELL;
    const y = Math.floor(i / COLS) * (CELL + LABEL);
    composites.push({
      input: await sharp(src).resize(CELL, CELL, { fit: 'cover' }).toBuffer(),
      left: x,
      top: y,
    });
    const status = review[frame.key]?.status ?? 'unreviewed';
    const colour = status === 'accepted' ? '#D6FF3B' : '#FF990A';
    const label = `<svg width="${CELL}" height="${LABEL}"><rect width="${CELL}" height="${LABEL}" fill="#101010"/>` +
      `<text x="8" y="15" font-family="Helvetica,Arial,sans-serif" font-size="12" fill="#EDEDED">${frame.productHandle}</text>` +
      `<text x="8" y="28" font-family="Helvetica,Arial,sans-serif" font-size="10" fill="${colour}">${status}</text></svg>`;
    composites.push({ input: Buffer.from(label), left: x, top: y + CELL });
  }

  const outDir = path.join(ART, 'contact-sheets');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${new Date().toISOString().slice(0, 10)}-products.webp`);
  await sharp({ create: { width: W, height: H, channels: 3, background: '#0A0A0A' } })
    .composite(composites)
    .webp({ quality: 82 })
    .toFile(out);
  console.log(`contact sheet: ${composites.length / 2} frames -> ${out}`);
}

// ---------------------------------------------------------------------------

const [cmd, ...argv] = process.argv.slice(2);
const commands = { plan: cmdPlan, run: cmdRun, convert: cmdConvert, sheet: cmdSheet };
if (!commands[cmd]) {
  console.error(`usage: generate.mjs <${Object.keys(commands).join('|')}>`);
  process.exit(2);
}
await commands[cmd](argv);
