#!/usr/bin/env node
// Slices the abstract set's 4x4 grid into the sixteen frames the catalog references, runs the
// series gate on every cell, writes media/*.webp and media/manifest.json.
//
//   node scripts/abstract-datasets/slice.mjs [--mode light] [--borders-x a,b,c --borders-y a,b,c]
//
// Borders are FOUND by store-media/grid-measure.py, never assumed at quarters: the profile wave
// measured that the model draws its seams a few pixels off. `--borders-*` overrides the finder
// when a human read the sheet and disagrees; the values used are written into every entry.
//
// The gate (design/style-board.md §5): backdrop luma of every cell within ±10 of the median,
// foreground covering at least 8 percent of the cell, no residue line along any cut edge. A cell
// that fails is written to the manifest as `flagged` with the reason — it ships, it is not hidden,
// and the second pass knows where to look.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { DATASET_ID, MODES, leavesOf } from "./definitions.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, "..", "..");
const REPO = path.resolve(BACKEND, "..", "..");
const RAW = path.join(REPO, "artifacts", "media", DATASET_ID, "raw");
const PROFILE = path.join(BACKEND, "src", "migration-scripts", "data", "profiles", DATASET_ID);
const MEDIA = path.join(PROFILE, "media");
const GRID_MEASURE = path.join(HERE, "..", "store-media", "grid-measure.py");
const REGISTRY = path.join(HERE, "..", "store-media", "wave-registry.mjs");

const argv = process.argv.slice(2);
const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const mode = arg("--mode") ?? "light";
if (!MODES[mode]) throw new Error(`--mode must be one of ${Object.keys(MODES).join(", ")}`);

const jobId = `${DATASET_ID}-${mode}-grid-4x4`;
const gridPng = path.join(RAW, `${jobId}.png`);
const sidecar = JSON.parse(fs.readFileSync(path.join(RAW, `${jobId}.json`), "utf8"));
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

// --- 1. borders, found ---------------------------------------------------------------------

const measureJson = path.join(RAW, `${jobId}.measure.json`);
const measureArgs = [GRID_MEASURE, gridPng, "--rows", "4", "--cols", "4", "--json", measureJson];
if (arg("--borders-x")) measureArgs.push("--borders-x", arg("--borders-x"));
if (arg("--borders-y")) measureArgs.push("--borders-y", arg("--borders-y"));
execFileSync("python3", measureArgs, { stdio: ["ignore", "ignore", "inherit"] });
const measured = JSON.parse(fs.readFileSync(measureJson, "utf8"));
const BORDERS_X = measured.borders.chosenX.map(Math.round);
const BORDERS_Y = measured.borders.chosenY.map(Math.round);
if (BORDERS_X.length !== 3 || BORDERS_Y.length !== 3) {
  throw new Error(`grid-measure found ${BORDERS_X.length} vertical and ${BORDERS_Y.length} horizontal borders, a 4x4 needs 3+3. Read ${path.relative(REPO, measureJson)} and pass --borders-x/--borders-y.`);
}
console.log(`borders x=${BORDERS_X} (${measured.borders.chosenXfrom}) y=${BORDERS_Y} (${measured.borders.chosenYfrom})`);

const W = measured.width ?? sidecar.reportedWidth ?? 4096;
const H = measured.height ?? sidecar.reportedHeight ?? 4096;
// The model draws a white gutter about 14 px wide at 4K and grid-measure lands on one EDGE of
// it, not its centre (measured 2026-09-12: runs of 13-14 near-white px on one side of every
// border), so the cut steps 22 px back from every found seam. `--seam-inset` overrides.
const SEAM_INSET = Number(arg("--seam-inset") ?? 22);
const EDGE_INSET = 6;
const edgesX = [0, ...BORDERS_X, W];
const edgesY = [0, ...BORDERS_Y, H];
const box = (col, row) => [
  edgesX[col] + (col === 0 ? EDGE_INSET : SEAM_INSET),
  edgesY[row] + (row === 0 ? EDGE_INSET : SEAM_INSET),
  edgesX[col + 1] - (col === 3 ? EDGE_INSET : SEAM_INSET),
  edgesY[row + 1] - (row === 3 ? EDGE_INSET : SEAM_INSET),
];

// --- 2. crop, measure, write --------------------------------------------------------------

const SIDE = 1000;
const HERO_W = 2400;
const HERO_H = 1350;
const cellsDir = path.join(RAW, `${jobId}-cells`);
fs.mkdirSync(cellsDir, { recursive: true });
fs.mkdirSync(MEDIA, { recursive: true });

const leaves = leavesOf();
const jobs = sidecar.cells.map((c) => {
  const out =
    c.role === "product" ? `${c.handle}-hero.webp` : c.role === "tile" ? `tile-${c.handle}.webp` : "home-hero.webp";
  return { ...c, box: box(c.col, c.row), png: path.join(cellsDir, `${c.handle}.png`), webp: path.join(MEDIA, out) };
});

const py = `
import json, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB")
jobs = json.loads(sys.argv[2])
SIDE, HERO_W, HERO_H = int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
out = []
def luma(c): return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
for j in jobs:
    l, t, r, b = j["box"]
    cell = im.crop((l, t, r, b))
    w, h = cell.size
    s = min(w, h)
    cell = cell.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    if s != SIDE:
        cell = cell.resize((SIDE, SIDE), Image.LANCZOS)
    cell.save(j["png"])
    px = cell.load()
    # backdrop tone: mean of a 40 px patch in each top corner (the cyclorama, above any object)
    patches = [cell.crop((6, 6, 46, 46)), cell.crop((SIDE - 46, 6, SIDE - 6, 46))]
    tones = [p.resize((1, 1), Image.LANCZOS).getpixel((0, 0)) for p in patches]
    bg = tuple(round(sum(t[i] for t in tones) / len(tones)) for i in range(3))
    bg_luma = luma(bg)
    # foreground coverage: pixels that differ from the backdrop tone by more than 28 luma levels
    small = cell.resize((200, 200), Image.BILINEAR)
    sp = list(small.getdata())
    fg = sum(1 for c in sp if abs(luma(c) - bg_luma) > 28) / len(sp)
    # residue along each cut edge: the outermost 3 px band vs a band 24 px inside. Both bands
    # are cyclorama when the cut is clean; a gutter left on the edge shows as a jump. (A band
    # 10 percent inside was tried first and read the OBJECT in a cell whose subject sat near
    # the edge — a false positive, measured on the pairs tile 2026-09-12.)
    IN = 24
    def band_luma(xs, ys):
        vals = [luma(px[x, y]) for x in xs for y in ys]
        return sum(vals) / len(vals)
    step = max(1, SIDE // 50)
    edges = {
        "top": (band_luma(range(0, SIDE, step), range(0, 3)), band_luma(range(0, SIDE, step), range(IN, IN + 3))),
        "bottom": (band_luma(range(0, SIDE, step), range(SIDE - 3, SIDE)), band_luma(range(0, SIDE, step), range(SIDE - IN - 3, SIDE - IN))),
        "left": (band_luma(range(0, 3), range(0, SIDE, step)), band_luma(range(IN, IN + 3), range(0, SIDE, step))),
        "right": (band_luma(range(SIDE - 3, SIDE), range(0, SIDE, step)), band_luma(range(SIDE - IN - 3, SIDE - IN), range(0, SIDE, step))),
    }
    residue = {k: round(v[0] - v[1], 1) for k, v in edges.items() if abs(v[0] - v[1]) > 30}
    if j["role"] == "hero":
        # the hero is the cell on the RIGHT of a 16:9 canvas filled with the cell's OWN backdrop
        # tone and feathered at the seam, so the storefront's scrim has one continuous surface
        # The cyclorama falls off top to bottom, so the fill is ROW-WISE: each canvas row takes
        # the tone of the cell's own left edge on that row (a flat single tone left a visible
        # vertical band at the seam, seen on the first hero 2026-09-12), then a 160 px feather.
        cell_h = cell.resize((HERO_H, HERO_H), Image.LANCZOS)
        hp = cell_h.load()
        canvas = Image.new("RGB", (HERO_W, HERO_H), bg)
        cpx = canvas.load()
        seam_x, feather = HERO_W - HERO_H, 160
        for y in range(HERO_H):
            edge = [hp[x, y] for x in range(0, 12)]
            tone = tuple(round(sum(c[i] for c in edge) / len(edge)) for i in range(3))
            for x in range(seam_x):
                cpx[x, y] = tone
            for i in range(HERO_H):
                x = seam_x + i
                if i < feather:
                    tt = i / feather
                    bb = hp[i, y]
                    cpx[x, y] = tuple(int(tone[c] * (1 - tt) + bb[c] * tt) for c in range(3))
                else:
                    cpx[x, y] = hp[i, y]
        canvas.save(j["webp"], "WEBP", quality=88, method=6)
        outw, outh = HERO_W, HERO_H
    else:
        cell.save(j["webp"], "WEBP", quality=88, method=6)
        outw, outh = SIDE, SIDE
    out.append({"handle": j["handle"], "cropBox": j["box"], "cellPx": [w, h], "outPx": [outw, outh],
                "backdropLuma": round(bg_luma, 1), "backdropRgb": list(bg), "foreground": round(fg, 3), "residue": residue})
print(json.dumps(out))
`;
const measuredCells = JSON.parse(
  execFileSync("python3", ["-c", py, gridPng, JSON.stringify(jobs.map((j) => ({ handle: j.handle, role: j.role, box: j.box, png: j.png, webp: j.webp }))), String(SIDE), String(HERO_W), String(HERO_H)], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }),
);
const byHandle = Object.fromEntries(measuredCells.map((m) => [m.handle, m]));

// --- 3. the series gate ---------------------------------------------------------------------

const lumas = measuredCells.map((m) => m.backdropLuma).sort((a, b) => a - b);
const median = lumas[Math.floor(lumas.length / 2)];
const LUMA_TOLERANCE = 10;
const MIN_FOREGROUND = 0.08;
const verdicts = {};
for (const m of measuredCells) {
  const reasons = [];
  if (Math.abs(m.backdropLuma - median) > LUMA_TOLERANCE) reasons.push(`backdrop luma ${m.backdropLuma} is ${(m.backdropLuma - median).toFixed(1)} from the series median ${median} (tolerance ±${LUMA_TOLERANCE})`);
  if (m.foreground < MIN_FOREGROUND) reasons.push(`foreground covers ${(m.foreground * 100).toFixed(1)}% of the cell (minimum ${MIN_FOREGROUND * 100}%)`);
  for (const [edge, delta] of Object.entries(m.residue)) reasons.push(`residue line on the ${edge} edge (${delta} luma levels against the interior)`);
  verdicts[m.handle] = reasons;
}
const flagged = Object.entries(verdicts).filter(([, r]) => r.length);
console.log(`gate: median backdrop luma ${median} (target ${MODES[mode].backdropHex}), spread ${lumas[0]}..${lumas[lumas.length - 1]}, ${flagged.length} of ${measuredCells.length} cells flagged`);
for (const [handle, reasons] of flagged) console.log(`  FLAGGED ${handle}: ${reasons.join("; ")}`);

// --- 4. manifest ---------------------------------------------------------------------------

const price = (() => {
  try {
    const out = execFileSync(process.execPath, [REGISTRY, "spend", "show"], { encoding: "utf8" });
    const row = out.split("\n").find((l) => l.trim().startsWith(DATASET_ID));
    const m = row && /\$([0-9.]+)/.exec(row);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
})();
if (price === null) console.warn("ledger price for this set could not be read; costUsd stays absent, never guessed");
const CELL_COST = price === null ? undefined : +(price / jobs.length).toFixed(4);
const NOW = new Date().toISOString();
const RAW_REL = path.relative(REPO, gridPng);

const entry = (j) => {
  const m = byHandle[j.handle];
  const reasons = verdicts[j.handle];
  const role = j.role === "product" ? "hero" : j.role === "tile" ? "category-tile" : "banner";
  return {
    file: `media/${path.basename(j.webp)}`,
    role,
    ...(j.role === "product" ? { productHandle: j.handle } : {}),
    ...(j.role === "tile" ? { categoryHandle: j.handle } : {}),
    sha256: sha(j.webp),
    width: m.outPx[0],
    height: m.outPx[1],
    bytes: fs.statSync(j.webp).size,
    model: sidecar.model,
    predictionId: sidecar.predictionId,
    // Reconstructable (directive §3.2): grid frame + the shared preamble + THIS cell's clause.
    prompt: `${sidecar.gridFrame}\n\n${sidecar.sharedPreamble}\n\n${j.subjectClause}`,
    negativePrompt: sidecar.negative,
    params: {
      aspect_ratio: sidecar.aspect,
      resolution: sidecar.resolution,
      output_format: "png",
      num_images: 1,
      mode,
      gridId: sidecar.id,
      gridKind: sidecar.kind,
      cellIndex: j.index,
      cellRowCol: [j.row + 1, j.col + 1],
      bordersX: BORDERS_X,
      bordersY: BORDERS_Y,
      seamInset: SEAM_INSET,
      edgeInset: EDGE_INSET,
      cropBox: m.cropBox,
      backdropLuma: m.backdropLuma,
      backdropRgb: m.backdropRgb,
      foreground: m.foreground,
      ...(j.role === "hero" ? { derived: "cell extended to 16:9 on its own backdrop tone, no separate prediction" } : {}),
      ledgerRow: sidecar.ledgerId,
      fullGridPromptSha256: sidecar.fullPromptSha256,
    },
    referenceFiles: [],
    sourceFile: RAW_REL,
    ...(CELL_COST === undefined ? {} : { costUsd: CELL_COST }),
    status: reasons.length ? "flagged" : "accepted",
    ...(reasons.length ? { rejectReason: reasons.join("; ") } : {}),
    createdAt: NOW,
  };
};

const entries = jobs.map(entry);
const manifest = {
  schema: "upready.store-media-manifest/v0",
  profileId: DATASET_ID,
  provider: "fal.ai",
  generatedAt: NOW,
  entries,
  totals: {
    renders: 1,
    accepted: entries.filter((e) => e.status === "accepted").length,
    flagged: entries.filter((e) => e.status === "flagged").length,
    rejected: 0,
    costUsd: price ?? 0,
  },
};
fs.writeFileSync(path.join(MEDIA, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${entries.length} entries to ${path.relative(REPO, path.join(MEDIA, "manifest.json"))}; accepted ${manifest.totals.accepted}, flagged ${manifest.totals.flagged}, cost $${manifest.totals.costUsd}`);
