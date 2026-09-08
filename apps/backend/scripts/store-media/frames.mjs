// The 19 frames of the pilot, derived from the catalog and the style board.
// This registry is the single place that decides what may be rendered. If a key
// is not here, the driver will not spend money on it.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BANNER_SUBJECT,
  EDITORIAL_NEGATIVE,
  PACKSHOT_NEGATIVE,
  PACKSHOT_NEGATIVE_V2,
  STILL_LIFE_ARRANGEMENT,
  TILE_SUBJECTS,
  editorialBody,
  packshotBody,
  stillLifeBody,
  withNegative,
} from './prompts.mjs';

export const PROFILE_ID = 'sneakers';
export const MAX_PREDICTIONS = 19; // Ivan, 2026-09-07. Hard cap. No regenerations.

// The three `care-and-spares` products are not shoes — §5.4's template does not fit them.
const STILL_LIFE_CATEGORY = 'care-and-spares';

/** "A low-top leather sneaker…" -> "a low-top leather sneaker…" so it reads as a clause. */
function asClause(subject) {
  return subject.charAt(0).toLowerCase() + subject.slice(1);
}

export function repoRoot() {
  return path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
}

export function profileDir() {
  return path.join(repoRoot(), 'apps/backend/src/migration-scripts/data/profiles', PROFILE_ID);
}

export function artifactsDir() {
  return path.join(repoRoot(), 'artifacts/media', PROFILE_ID);
}

export function loadProducts() {
  const raw = JSON.parse(fs.readFileSync(path.join(profileDir(), 'catalog/products.json'), 'utf8'));
  return Array.isArray(raw) ? raw : raw.products || raw.items;
}

export function buildFrames() {
  const products = loadProducts();
  const frames = [];

  for (const p of products) {
    const category = p.categoryHandle || p.category;
    const stillLife = category === STILL_LIFE_CATEGORY;
    const subject = asClause(p.imageBrief.subject);
    const body = stillLife
      ? stillLifeBody(subject, STILL_LIFE_ARRANGEMENT[p.handle])
      : packshotBody(subject);
    if (stillLife && !STILL_LIFE_ARRANGEMENT[p.handle]) {
      throw new Error(`no still-life arrangement written for ${p.handle}`);
    }
    // Handedness only exists for footwear, so only the packshot frames carry the
    // v2 negative terms; the still-life frames keep the board's string verbatim.
    const negativePrompt = stillLife ? PACKSHOT_NEGATIVE : PACKSHOT_NEGATIVE_V2;
    const out = p.images[0]; // "media/<handle>-hero.webp" — the exact filename the catalog references
    frames.push({
      key: `hero-${p.handle}`,
      role: 'hero',
      template: stillLife ? 'still-life' : 'packshot',
      productHandle: p.handle,
      categoryHandle: category,
      prompt: withNegative(body, negativePrompt),
      negativePrompt,
      aspectRatio: '1:1',
      resolution: '2K',
      outFile: out,
      longestSide: 1600,
    });
  }

  frames.push({
    key: 'banner-home-hero',
    role: 'banner',
    template: 'editorial',
    prompt: withNegative(editorialBody(BANNER_SUBJECT), EDITORIAL_NEGATIVE),
    negativePrompt: EDITORIAL_NEGATIVE,
    aspectRatio: '16:9',
    resolution: '2K',
    outFile: 'media/home-hero.webp',
    longestSide: 2400,
  });

  for (const handle of ['low-tops', 'high-tops', 'runners', 'trail']) {
    frames.push({
      key: `tile-${handle}`,
      role: 'category-tile',
      template: 'editorial',
      categoryHandle: handle,
      prompt: withNegative(editorialBody(TILE_SUBJECTS[handle]), EDITORIAL_NEGATIVE),
      negativePrompt: EDITORIAL_NEGATIVE,
      aspectRatio: '4:5',
      resolution: '1K',
      outFile: `media/tile-${handle}.webp`,
      longestSide: 1024,
    });
  }

  if (frames.length !== MAX_PREDICTIONS) {
    throw new Error(`frame registry holds ${frames.length} frames, the budget is ${MAX_PREDICTIONS}`);
  }
  return frames;
}

export const MODELS = {
  // Verified against each model's own openapi_schema on 2026-09-07.
  'google/nano-banana-2': {
    version: 'd1be8b5fc0931a253d417e12a484ac01ee9ccbc6daffd4792151377d5e5ff55f',
    buildInput: (f) => ({
      prompt: f.prompt,
      resolution: f.resolution,
      aspect_ratio: f.aspectRatio,
      output_format: 'png',
    }),
  },
  'black-forest-labs/flux-2-pro': {
    version: 'ccb5e33141097816e6fab8c895e702fe4c619e4e07500885b71214e9f6382a5c',
    buildInput: (f) => ({
      prompt: f.prompt,
      // flux-2-pro sizes by megapixels, not by "1K"/"2K".
      resolution: f.resolution === '1K' ? '1 MP' : '2 MP',
      aspect_ratio: f.aspectRatio,
      output_format: 'png',
      safety_tolerance: 2,
    }),
  },
  'black-forest-labs/flux-1.1-pro-ultra': {
    version: '551f15a1f56b90795ed34e94f11efb17196a5145bf2ae58fbf2d7e7d8bb42aaf',
    buildInput: (f) => ({
      prompt: f.prompt,
      aspect_ratio: f.aspectRatio,
      output_format: 'png',
      raw: true,
      safety_tolerance: 2,
    }),
  },
};

/**
 * A grid sheet draws a white gutter between its panels. A cut that lands INSIDE that gutter
 * leaves the leftover on the frame's edge, and on the storefront it reads as a gap between
 * the image and the card's border — Ivan saw it on 2026-09-08: womens-fashion kept 4-6 px at
 * the top of every cell below row 0, supplements up to 9 px, because both slicers treated the
 * seam's LEADING edge as its centre. The seam coordinates differ per sheet, so the only check
 * that transfers is on the OUTPUT: no frame may open or close with a run of near-white lines
 * that the picture behind them does not have.
 *
 * A packshot shot on a white sweep is NOT a finding: the band is compared against the image at
 * a tenth of its depth, so a frame that is white all the way in passes — nothing is visible
 * there to fix. Throws with every offender listed; a slicer calls it before writing a manifest.
 */
export function assertNoSeamResidue(files, { threshold = 244, minRun = 2 } = {}) {
  if (!files.length) throw new Error('assertNoSeamResidue: nothing to check');
  const py = `
import json, sys
from PIL import Image
threshold, min_run = int(sys.argv[1]), int(sys.argv[2])
bad = []
for f in json.loads(sys.argv[3]):
    im = Image.open(f).convert("RGB"); W, H = im.size; px = im.load()
    rowmin = lambda y: min(min(px[x, y]) for x in range(0, W, max(1, W // 40)))
    colmin = lambda x: min(min(px[x, y]) for y in range(0, H, max(1, H // 40)))
    inside = {"top": rowmin(H // 10), "bottom": rowmin(H - 1 - H // 10),
              "left": colmin(W // 10), "right": colmin(W - 1 - W // 10)}
    seqs = {"top": [rowmin(y) for y in range(20)], "bottom": [rowmin(H - 1 - y) for y in range(20)],
            "left": [colmin(x) for x in range(20)], "right": [colmin(W - 1 - x) for x in range(20)]}
    for edge, seq in seqs.items():
        run = 0
        for v in seq:
            if v >= threshold: run += 1
            else: break
        if run >= min_run and inside[edge] < threshold:
            bad.append({"file": f, "edge": edge, "lines": run})
print(json.dumps(bad))
`;
  const out = execFileSync('python3', ['-c', py, String(threshold), String(minRun), JSON.stringify(files)], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const bad = JSON.parse(out);
  if (bad.length) {
    const lines = bad.map((b) => `  ${path.basename(b.file)}: ${b.lines} near-white line(s) on the ${b.edge}`);
    throw new Error(`seam residue on ${bad.length} of ${files.length} frames — the cut is inside the gutter:\n${lines.join('\n')}`);
  }
  console.log(`seam check: ${files.length} frames, no gutter left on any edge`);
}
