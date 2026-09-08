// Slice the womens-fashion 3x4 grid into product frames, convert to WebP, write the manifest.
//
// Borders are the ones grid-measure.py FOUND on the returned 3584 x 4800 image:
//   vertical   1184 (SNR 28.1), 2388 (SNR 29.3)      against exact thirds  1195 / 2389
//   horizontal 1190 (25.1), 2392 (24.0), 3597 (24.6) against exact quarters 1200 / 2400 / 3600
// Ten further candidates came back at SNR 3.2-10.4 (605, 1686, 1827, 1902, 2845, 2964, 3069,
// 3149 vertical; 610, 1071, 1473, 2134, 2541, 3810, 4518 horizontal). Those are gaps between
// garments — content valleys are not panel edges — and they are ignored on purpose.
//
// Each cell is cut inside its seam, then cropped to the theme's 4:5 frame. Every product also
// gets a DETAIL frame: a tighter 4:5 window of the same paid cell, which is what the profile's
// `hover: second-image` swaps to. It is a crop, not a render — no second prediction exists.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { assertNoSeamResidue, repoRoot } from './frames.mjs'

const ROOT = repoRoot()
const PROFILE = path.join(ROOT, 'apps/backend/src/migration-scripts/data/profiles/womens-fashion')
const RAW = path.join(ROOT, 'artifacts/media/womens-fashion/raw')
const MEDIA = path.join(PROFILE, 'media')
const gridCar = JSON.parse(fs.readFileSync(path.join(RAW, 'womens-fashion-grid-3x4.json'), 'utf8'))
const heroCar = JSON.parse(fs.readFileSync(path.join(RAW, 'womens-fashion-hero.json'), 'utf8'))

// A seam is a RUN, not a line. grid-measure.py reports where the white gutter STARTS, and the
// first cut treated that number as the gutter's CENTRE: `border + 8` still landed inside it, so
// every cell below row 0 kept 4-6 px of white above its content — the hairline that shows on the
// live stand as a gap between the image and the card's top border. Both ends of every seam are
// measured here (rows/columns that are >=90% white across the full grid, 2026-09-08):
//   vertical   1185-1197, 2389-2401        (12-13 px wide)
//   horizontal 1191-1202, 2393-2405, 3598-3609
// The cell is cut OUTSIDE the run, with a margin, so no gutter pixel can survive the crop.
const SEAMS_X = [
  [1185, 1197],
  [2389, 2401],
]
const SEAMS_Y = [
  [1191, 1202],
  [2393, 2405],
  [3598, 3609],
]
const SEAM_MARGIN = 4
const EDGE_INSET = 6
const W = 3584, H = 4800
const COLS = 3, ROWS = 4

// 4:5, the theme's frame. 900 x 1125 out of a ~1180 px cell is a downscale, never an upscale.
const OUT_W = 900, OUT_H = 1125
const DET_W = 800, DET_H = 1000
const TILE_W = 800, TILE_H = 1000
const HERO_W = 1920, HERO_H = 900

const box = (col, row) => [
  col === 0 ? EDGE_INSET : SEAMS_X[col - 1][1] + 1 + SEAM_MARGIN,
  row === 0 ? EDGE_INSET : SEAMS_Y[row - 1][1] + 1 + SEAM_MARGIN,
  col === COLS - 1 ? W - EDGE_INSET : SEAMS_X[col][0] - SEAM_MARGIN,
  row === ROWS - 1 ? H - EDGE_INSET : SEAMS_Y[row][0] - SEAM_MARGIN,
]

fs.mkdirSync(MEDIA, { recursive: true })
const cellsDir = path.join(RAW, 'cells')
fs.mkdirSync(cellsDir, { recursive: true })

const jobs = gridCar.cells.map((c) => ({
  ...c,
  name: c.handle,
  box: box(c.col, c.row),
  png: path.join(cellsDir, `${c.handle}.png`),
  webp: path.join(MEDIA, `${c.handle}-hero.webp`),
  detail: path.join(MEDIA, `${c.handle}-detail.webp`),
}))

// One tile per leaf category, each a crop of a frame already paid for.
const TILES = [
  { category: 'dresses', from: 'ondine-slip-dress' },
  { category: 'knitwear', from: 'vaux-longline-cardigan' },
  { category: 'shirts-and-blouses', from: 'mazan-silk-shirt' },
  { category: 'trousers-and-skirts', from: 'tille-wide-trouser' },
  { category: 'coats-and-jackets', from: 'belair-wool-overcoat' },
]

const py = `
import json, sys
from PIL import Image

def crop_ratio(im, rw, rh, cx=0.5, cy=0.5, scale=1.0):
    """Largest rw:rh window that fits, scaled by \`scale\`, centred on (cx, cy) of the image."""
    w, h = im.size
    tw, th = w * scale, w * scale * rh / rw
    if th > h * scale:
        th, tw = h * scale, h * scale * rw / rh
    tw, th = int(round(tw)), int(round(th))
    l = int(round(cx * w - tw / 2)); t = int(round(cy * h - th / 2))
    l = max(0, min(l, w - tw)); t = max(0, min(t, h - th))
    return im.crop((l, t, l + tw, t + th)), (l, t, l + tw, t + th)

def window(im, tw, th, cx=0.5, cy=0.5):
    """Exactly tw x th NATIVE pixels, clamped inside the image. No resample, no upscale."""
    w, h = im.size
    tw, th = min(tw, w), min(th, h)
    l = int(round(cx * w - tw / 2)); t = int(round(cy * h - th / 2))
    l = max(0, min(l, w - tw)); t = max(0, min(t, h - th))
    return im.crop((l, t, l + tw, t + th)), (l, t, l + tw, t + th)

grid = Image.open(sys.argv[1])
hero_src = Image.open(sys.argv[2])
jobs = json.loads(sys.argv[3])
tiles = json.loads(sys.argv[4])
sizes = json.loads(sys.argv[5])
out = []
cells = {}
for j in jobs:
    l, t, r, b = j["box"]
    cell = grid.crop((l, t, r, b))
    cells[j["name"]] = cell
    frame, fbox = crop_ratio(cell, sizes["ow"], sizes["oh"])
    frame = frame.resize((sizes["ow"], sizes["oh"]), Image.LANCZOS)
    frame.save(j["png"]); frame.save(j["webp"], "WEBP", quality=88, method=6)
    # detail: the same paid cell, a 55%-height window over the upper body where the
    # material actually reads (weave, knit, button, seam), never an upscale of the frame
    det, dbox = window(cell, sizes["dw"], sizes["dh"], cx=0.5, cy=0.36)
    det.save(j["detail"], "WEBP", quality=88, method=6)
    corners = [cell.getpixel(p) for p in
               [(20, 20), (cell.size[0]-20, 20), (20, cell.size[1]-20), (cell.size[0]-20, cell.size[1]-20)]]
    lum = [0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2] for c in corners]
    out.append({"name": j["name"], "cropBox": j["box"], "cellPx": list(cell.size),
                "frameBoxInCell": list(fbox), "detailBoxInCell": list(dbox),
                "backdropLuma": round(sum(lum)/len(lum), 1),
                "backdropRgb": [round(sum(c[i] for c in corners)/len(corners)) for i in range(3)]})
for t in tiles:
    tile, _ = crop_ratio(cells[t["from"]], sizes["tw"], sizes["th"])
    tile.resize((sizes["tw"], sizes["th"]), Image.LANCZOS).save(t["out"], "WEBP", quality=88, method=6)
hero, hbox = crop_ratio(hero_src, sizes["hw"], sizes["hh"])
hero = hero.resize((sizes["hw"], sizes["hh"]), Image.LANCZOS)
hero.save(sys.argv[6], "WEBP", quality=90, method=6)
print(json.dumps({"cells": out, "heroSrcPx": list(hero_src.size), "heroBox": list(hbox)}))
`

const heroOut = path.join(MEDIA, 'home-hero.webp')
const tilePayload = TILES.map((t) => ({ ...t, out: path.join(MEDIA, `tile-${t.category}.webp`) }))
const measured = JSON.parse(
  execFileSync(
    'python3',
    [
      '-c', py,
      path.join(RAW, 'womens-fashion-grid-3x4.png'),
      path.join(RAW, 'womens-fashion-hero.png'),
      JSON.stringify(jobs.map((j) => ({ name: j.name, box: j.box, png: j.png, webp: j.webp, detail: j.detail }))),
      JSON.stringify(tilePayload),
      JSON.stringify({ ow: OUT_W, oh: OUT_H, dw: DET_W, dh: DET_H, tw: TILE_W, th: TILE_H, hw: HERO_W, hh: HERO_H }),
      heroOut,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  ),
)
const byName = Object.fromEntries(measured.cells.map((m) => [m.name, m]))

// The gutter check runs on what was just written, before a single manifest line is spent on
// it: a frame that opens with a white hairline is a cut that landed inside the seam, and on
// the storefront that hairline is a gap between the image and the card's border.
assertNoSeamResidue([
  ...jobs.map((j) => j.webp),
  ...jobs.map((j) => j.detail),
  ...tilePayload.map((t) => t.out),
  heroOut,
])

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
const NOW = new Date().toISOString()
const GRID_USD = 0.3 // ledger row r-e7254dd4, read from `spend show`, not guessed
const HERO_USD = 0.15 // ledger row r-e5490056
const CELL_COST = +(GRID_USD / jobs.length).toFixed(4)
const RAW_GRID = path.relative(ROOT, path.join(RAW, 'womens-fashion-grid-3x4.png'))
const RAW_HERO = path.relative(ROOT, path.join(RAW, 'womens-fashion-hero.png'))

const cellEntry = (file, role, name, width, height, extra = {}) => {
  const j = jobs.find((x) => x.name === name)
  const m = byName[name]
  return {
    file: `media/${path.basename(file)}`,
    role,
    ...(j?.handle && (role === 'hero' || role === 'detail') ? { productHandle: j.handle } : {}),
    sha256: sha(file),
    width,
    height,
    bytes: fs.statSync(file).size,
    model: gridCar.model,
    predictionId: gridCar.predictionId,
    // Reconstructable per Ivan's directives 3.2: the shared half plus THIS cell's clause,
    // so a larger single re-render of one panel needs no re-reading of the grid prompt.
    prompt: `${gridCar.gridFrame}\n\n${gridCar.sharedPreamble}\n\n${j?.subjectClause ?? ''}`,
    negativePrompt: gridCar.negative,
    params: {
      aspect_ratio: gridCar.aspect,
      resolution: gridCar.resolution,
      output_format: 'png',
      num_images: 1,
      gridId: gridCar.id,
      gridKind: gridCar.kind,
      cellIndex: j?.index ?? null,
      cellRowCol: j ? [j.row + 1, j.col + 1] : null,
      cropBox: m?.cropBox ?? null,
      windowInCell: role === 'detail' ? m?.detailBoxInCell : m?.frameBoxInCell,
      backdropLuma: m?.backdropLuma ?? null,
      ledgerRow: gridCar.ledgerId,
      fullGridPromptSha256: gridCar.fullPromptSha256,
      ...(extra.params ?? {}),
    },
    referenceFiles: [],
    sourceFile: RAW_GRID,
    costUsd: role === 'hero' ? CELL_COST : 0,
    status: 'accepted',
    createdAt: NOW,
    ...(extra.rest ?? {}),
  }
}

const entries = [
  ...jobs.map((j) => cellEntry(j.webp, 'hero', j.name, OUT_W, OUT_H)),
  ...jobs.map((j) =>
    cellEntry(j.detail, 'detail', j.name, DET_W, DET_H, {
      params: {
        derivedFrom: `media/${j.name}-hero.webp`,
        note: 'tighter window of the same paid cell; the frame `hover: second-image` swaps to. No separate prediction, no separate dollar.',
      },
    }),
  ),
  ...tilePayload.map((t) =>
    cellEntry(t.out, 'category-tile', t.from, TILE_W, TILE_H, {
      params: {
        derivedFrom: `media/${t.from}-hero.webp`,
        note: 'crop of a frame already paid for; no separate prediction, no separate dollar',
      },
      rest: { categoryHandle: t.category },
    }),
  ),
  {
    file: 'media/home-hero.webp',
    role: 'banner',
    sha256: sha(heroOut),
    width: HERO_W,
    height: HERO_H,
    bytes: fs.statSync(heroOut).size,
    model: heroCar.model,
    predictionId: heroCar.predictionId,
    prompt: heroCar.fullPrompt,
    negativePrompt: heroCar.negative,
    params: {
      aspect_ratio: heroCar.aspect,
      resolution: heroCar.resolution,
      output_format: 'png',
      num_images: 1,
      ledgerRow: heroCar.ledgerId,
      sourcePx: measured.heroSrcPx,
      cropBox: measured.heroBox,
      note: 'the one full-size frame kept outside the grid (Ivan directives 3.1); cropped to 1920x900, never upscaled',
    },
    referenceFiles: [],
    sourceFile: RAW_HERO,
    costUsd: HERO_USD,
    status: 'accepted',
    createdAt: NOW,
  },
]

const manifest = {
  schema: 'upready.store-media-manifest/v0',
  profileId: 'womens-fashion',
  provider: 'fal.ai',
  generatedAt: NOW,
  entries,
  totals: {
    renders: 2,
    accepted: entries.length,
    rejected: 0,
    flagged: 0,
    costUsd: +(GRID_USD + HERO_USD).toFixed(3),
  },
}
fs.writeFileSync(path.join(MEDIA, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

const lums = measured.cells.map((m) => m.backdropLuma)
const rgbs = measured.cells.map((m) => m.backdropRgb)
const spread = (i) => Math.max(...rgbs.map((r) => r[i])) - Math.min(...rgbs.map((r) => r[i]))
console.log(`cells ${jobs.length} · details ${jobs.length} · tiles ${tilePayload.length} · hero 1 · manifest entries ${entries.length}`)
console.log(`predictions 2 (grid ${gridCar.predictionId} $${GRID_USD}, hero ${heroCar.predictionId} $${HERO_USD})`)
console.log(
  `backdrop luma min ${Math.min(...lums)} max ${Math.max(...lums)} spread ${(Math.max(...lums) - Math.min(...lums)).toFixed(1)} · ` +
    `rgb per-channel spread ${spread(0)}/${spread(1)}/${spread(2)}`,
)
console.log(`hero source ${measured.heroSrcPx.join('x')} cropped ${measured.heroBox.join(',')} -> ${HERO_W}x${HERO_H}`)
