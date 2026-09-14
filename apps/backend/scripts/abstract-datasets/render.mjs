#!/usr/bin/env node
// Renders the abstract starter set as ONE 4x4 grid: ten products, five category tiles and one
// hero cell, sixteen 1024 px panels at 4K for one prediction. The economics were measured by
// the profile wave (artifacts/docs/2026-09-08-grid-measurement.md) and are not re-derived here.
//
//   node scripts/abstract-datasets/render.mjs [--mode light|dark]          # dry run: prompt + cells, no money
//   node scripts/abstract-datasets/render.mjs [--mode light] --spend       # ONE prediction, written to the ledger FIRST
//
// The mode is the ONLY axis this script knows about (GLOSSARY.md §3): `light` is what ships now,
// `dark` is the twin t-2026-09-12-mode-image-pairs orders later with the SAME cells and the other
// half of MODES. Nothing here invents a second axis in the manifest or the schema.
//
// Raw bytes go to artifacts/media/abstract/raw/ and are never deleted (rule 42c); the sidecar
// JSON next to the PNG keeps the shared preamble and the per-cell clauses APART (Ivan's
// directive §3.2), so a single larger re-render of one cell is preamble + that clause.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadFalKey, runFalRequest } from "../store-media/fal.mjs";
import { DATASET, DATASET_ID, GRID_FRAME, MODES, NEGATIVE, OBJECTS, CAMERA, leavesOf, preambleFor, productsOf } from "./definitions.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..");
const RAW = path.join(REPO, "artifacts", "media", DATASET_ID, "raw");
const REGISTRY = path.join(HERE, "..", "store-media", "wave-registry.mjs");
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

const argv = process.argv.slice(2);
const mode = argv.includes("--mode") ? argv[argv.indexOf("--mode") + 1] : "light";
if (!MODES[mode]) throw new Error(`--mode must be one of ${Object.keys(MODES).join(", ")}`);

// Reading order, row by row: products 1-10, tiles 11-15, hero 16.
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
export const cellsFor = () => {
  const products = productsOf(DATASET);
  const leaves = leavesOf(DATASET);
  const list = [
    ...products.map((p) => ({ role: "product", handle: p.handle, subjectClause: `${lower(p.subject)}. One subject alone in the panel, three-quarter view, its most characteristic face towards the camera.` })),
    ...leaves.map((l) => ({ role: "tile", handle: l.handle, subjectClause: `${lower(l.tile)}. The group is centred and fills 70 percent of the panel width.` })),
    { role: "hero", handle: "home-hero", subjectClause: `${lower(DATASET.heroSubject)}. The group is centred and fills 85 percent of the panel width.` },
  ];
  if (list.length !== 16) throw new Error(`a 4x4 grid needs 16 cells, the set yields ${list.length}`);
  return list.map((c, i) => ({ index: i, row: Math.floor(i / 4), col: i % 4, ...c }));
};

const cells = cellsFor();
const preamble = preambleFor(mode);
const PROMPT =
  `${GRID_FRAME}\n\n${preamble}\n\n` +
  "The sixteen panels show sixteen different subjects, one per panel, listed row by row:\n" +
  cells.map((c) => `Row ${c.row + 1}, column ${c.col + 1}: ${c.subjectClause}`).join("\n") +
  `\n\nDo not include: ${NEGATIVE}`;

const JOB = {
  id: `${DATASET_ID}-${mode}-grid-4x4`,
  kind: "grid-4x4",
  mode,
  model: "fal-ai/nano-banana-pro",
  resolution: "4K",
  aspect: "1:1",
  purpose: "product-grid",
  prompt: PROMPT,
  cells,
};

const falInput = (job) => ({
  prompt: job.prompt,
  aspect_ratio: job.aspect,
  output_format: "png",
  num_images: 1,
  resolution: job.resolution,
});

/** Money first, picture second: the ledger row exists before the request leaves the machine. */
function chargeLedger(job) {
  const args = [REGISTRY, "spend", "add", "--theme", DATASET_ID, "--model", job.model, "--kind", job.kind, "--purpose", job.purpose, "--prompt-sha", sha256(job.prompt), "--resolution", job.resolution];
  const out = execFileSync(process.execPath, args, { encoding: "utf8" });
  process.stdout.write(`LEDGER ${out}`);
  return out.trim().split(/\s+/)[0];
}

if (!argv.includes("--spend")) {
  console.log("DRY RUN — nothing sent, no money spent. Pass --spend to run 1 prediction.");
  console.log(`${JOB.id} · ${JOB.kind} · ${JOB.model} · ${JOB.resolution} · ${JOB.aspect}`);
  console.log(`prompt: ${JOB.prompt.length} chars, sha256 ${sha256(JOB.prompt)}`);
  console.log(`cells: ${cells.map((c) => `r${c.row + 1}c${c.col + 1}=${c.handle}`).join(" ")}`);
  if (argv.includes("--print")) console.log(`\n${JOB.prompt}`);
  process.exit(0);
}

const file = path.join(RAW, `${JOB.id}.png`);
if (fs.existsSync(file)) {
  throw new Error(`REFUSED: ${path.relative(REPO, file)} already exists. A frame is flagged, not re-rendered; move the old raw aside deliberately if a reshoot was ordered.`);
}

fs.mkdirSync(RAW, { recursive: true });
const key = loadFalKey();
console.log(`[${new Date().toISOString()}] START ${JOB.id} promptChars=${JOB.prompt.length}`);
const ledgerId = chargeLedger(JOB);
const { requestId, outputs, wallMs, result } = await runFalRequest({ key, model: JOB.model, input: falInput(JOB), timeoutMs: 600_000 });
fs.writeFileSync(file, outputs[0].buffer);

const sidecar = {
  id: JOB.id,
  datasetId: DATASET_ID,
  mode,
  ledgerId,
  kind: JOB.kind,
  model: JOB.model,
  resolution: JOB.resolution,
  aspect: JOB.aspect,
  predictionId: requestId,
  requestedAt: new Date().toISOString(),
  wallMs,
  file: path.relative(REPO, file),
  bytes: outputs[0].buffer.length,
  reportedWidth: outputs[0].width,
  reportedHeight: outputs[0].height,
  // The prompt registry, the halves stored apart: the mode half is what the dark twin swaps.
  gridFrame: GRID_FRAME,
  modeHalf: { backdrop: MODES[mode].backdrop, light: MODES[mode].light, backdropHex: MODES[mode].backdropHex },
  sharedHalf: { objects: OBJECTS, camera: CAMERA },
  sharedPreamble: preamble,
  negative: NEGATIVE,
  cells: JOB.cells,
  fullPromptSha256: sha256(JOB.prompt),
  fullPrompt: JOB.prompt,
  providerResult: result,
};
fs.writeFileSync(path.join(RAW, `${JOB.id}.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
console.log(`[${new Date().toISOString()}] DONE ${JOB.id} request=${requestId} wall=${(wallMs / 1000).toFixed(1)}s bytes=${outputs[0].buffer.length} -> ${path.relative(REPO, file)}`);
