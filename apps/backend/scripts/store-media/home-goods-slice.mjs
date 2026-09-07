// Slice the two home-goods 3x3 sheets into 4:5 product frames, the hero and four
// category tiles, convert to WebP, write the manifest.
//
// Borders are the ones grid-measure.py FOUND, never thirds:
//   sheet A  x 1352 / 2723   y 1352 / 2743   (exact thirds are 1365 / 2731)
//   sheet B  x 1354 / 2742   y 1376 / 2742
// Both sheets also offered candidates at SNR 3-10 (A: y 3253/3345/3428/3516;
// B: x 226/594/2567/2892, y 1647/3478/3560/3642) against the real borders' SNR
// 20-66. Those are gaps between subjects. Content valleys are not panel edges.
//
// The programme's frame for this profile is 4:5, and the sheets are square, so
// every packshot cell is centre-cropped to 4:5. The style board asked the model
// for a subject at 60 % of panel width precisely so that crop has somewhere to go.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { repoRoot } from './frames.mjs'

const ROOT = repoRoot()
const PROFILE = path.join(ROOT, 'apps/backend/src/migration-scripts/data/profiles/home-goods')
const RAW = path.join(ROOT, 'artifacts/media/home-goods/raw')
const MEDIA = path.join(PROFILE, 'media')
const CELLS = path.join(RAW, 'cells')

const SHEETS = {
  a: { borders: { x: [1352, 2723], y: [1352, 2743] } },
  b: { borders: { x: [1354, 2742], y: [1376, 2742] } },
}
// The model drew a white gutter it was explicitly told not to draw — the same
// violation the measurement recorded for the cheap model. Measured on both sheets:
// a band of 22-24 px reaching luma 254 against a backdrop base of 108-199. The
// detector reports sometimes the LEADING edge of that band (sheet A x=1352 -> the
// band runs 1352..1373) and sometimes the TRAILING one (sheet B x=2742 -> 2702..2741),
// so the inset is symmetric and larger than the widest band rather than clever.
const INSET = 28     // px cut back from every found seam
const EDGE = 6       // px cut back from the outer frame
const W = 4096, H = 4096
const OUT_W = 1080, OUT_H = 1350          // 4:5 product frame
const HERO_W = 1920, HERO_H = 900         // full-bleed home hero
const TILE_W = 1080, TILE_H = 1350        // tiles use the same 4:5 as the cards

const box = (sheet, col, row) => {
  const ex = [0, ...SHEETS[sheet].borders.x, W]
  const ey = [0, ...SHEETS[sheet].borders.y, H]
  return [
    ex[col] + (col === 0 ? EDGE : INSET),
    ey[row] + (row === 0 ? EDGE : INSET),
    ex[col + 1] - (col === 2 ? EDGE : INSET),
    ey[row + 1] - (row === 2 ? EDGE : INSET),
  ]
}

const sidecarA = JSON.parse(fs.readFileSync(path.join(RAW, 'home-goods-grid-a.json'), 'utf8'))
const sidecarB = JSON.parse(fs.readFileSync(path.join(RAW, 'home-goods-grid-b.json'), 'utf8'))

// Every output frame, with the sheet cell it is cut from and the shape it is cut to.
const jobs = [
  ...sidecarA.cells.map((c) => ({
    sheet: 'a', cell: c, name: c.handle, role: 'hero', productHandle: c.handle,
    out: path.join(MEDIA, `${c.handle}-hero.webp`), shape: '4:5', w: OUT_W, h: OUT_H,
  })),
  ...sidecarB.cells.filter((c) => c.role === 'hero').map((c) => ({
    sheet: 'b', cell: c, name: c.handle, role: 'hero', productHandle: c.handle,
    out: path.join(MEDIA, `${c.handle}-hero.webp`), shape: '4:5', w: OUT_W, h: OUT_H,
  })),
]
// The home hero and the four category tiles are cut from sheet B's interior panels.
// They are crops of frames already paid for, not separate predictions.
const DERIVED = [
  { cellName: 'scene-hero',     out: path.join(MEDIA, 'home-hero.webp'), role: 'banner', w: HERO_W, h: HERO_H, shape: '64:30' },
  { cellName: 'scene-cookware', out: path.join(MEDIA, 'tile-cookware.webp'), role: 'category-tile', categoryHandle: 'cookware', w: TILE_W, h: TILE_H, shape: '4:5' },
  { cellName: 'scene-tableware', out: path.join(MEDIA, 'tile-tableware.webp'), role: 'category-tile', categoryHandle: 'tableware', w: TILE_W, h: TILE_H, shape: '4:5' },
  { cellName: 'scene-textiles', out: path.join(MEDIA, 'tile-kitchen-textiles.webp'), role: 'category-tile', categoryHandle: 'kitchen-textiles', w: TILE_W, h: TILE_H, shape: '4:5' },
  { cellName: 'scene-storage',  out: path.join(MEDIA, 'tile-storage-and-light.webp'), role: 'category-tile', categoryHandle: 'storage-and-light', w: TILE_W, h: TILE_H, shape: '4:5' },
]
for (const d of DERIVED) {
  const cell = sidecarB.cells.find((c) => c.name === d.cellName)
  if (!cell) throw new Error(`sheet B has no cell named ${d.cellName}`)
  jobs.push({ sheet: 'b', cell, name: d.cellName, role: d.role, categoryHandle: d.categoryHandle,
              out: d.out, shape: d.shape, w: d.w, h: d.h })
}

fs.mkdirSync(CELLS, { recursive: true })
fs.mkdirSync(MEDIA, { recursive: true })

const payload = jobs.map((j) => ({
  name: j.name, sheet: j.sheet, box: box(j.sheet, j.cell.col, j.cell.row),
  png: path.join(CELLS, `${j.sheet}-${j.name}.png`), webp: j.out, w: j.w, h: j.h,
}))

const py = `
import json, sys
from PIL import Image
raw = ${JSON.stringify(RAW)}
ims = {s: Image.open(raw + "/home-goods-grid-" + s + ".png") for s in ("a", "b")}
out = []
for j in json.loads(sys.argv[1]):
    l, t, r, b = j["box"]
    cell = ims[j["sheet"]].crop((l, t, r, b))
    cw, ch = cell.size
    # centre-crop to the requested aspect, then resize; never squash
    want = j["w"] / j["h"]
    have = cw / ch
    if have > want:
        nw = int(round(ch * want)); off = (cw - nw) // 2
        cell = cell.crop((off, 0, off + nw, ch))
    elif have < want:
        nh = int(round(cw / want)); off = (ch - nh) // 2
        cell = cell.crop((0, off, cw, off + nh))
    cell = cell.resize((j["w"], j["h"]), Image.LANCZOS)
    cell.save(j["png"])
    cell.save(j["webp"], "WEBP", quality=88, method=6)
    corners = [cell.getpixel(p) for p in
               ((20, 20), (j["w"] - 20, 20), (20, j["h"] - 20), (j["w"] - 20, j["h"] - 20))]
    lum = [0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] for c in corners]
    out.append({"name": j["name"], "sheet": j["sheet"], "cropBox": j["box"],
                "cellPx": [cw, ch], "outPx": [j["w"], j["h"]],
                "backdropLuma": round(sum(lum) / len(lum), 1),
                "backdropRgb": [round(sum(c[i] for c in corners) / 4) for i in range(3)]})
print(json.dumps(out))
`
const measured = JSON.parse(execFileSync('python3', ['-c', py, JSON.stringify(payload)],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
const byName = Object.fromEntries(measured.map((m) => [`${m.sheet}-${m.name}`, m]))

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
const NOW = new Date().toISOString()
const PRICE_PER_SHEET = 0.30           // the ledger's figure for r-9e8d90f3 and r-92215e05
const PAID_CELLS = 12                  // the twelve product frames the two sheets were bought for
const CELL_COST = +((PRICE_PER_SHEET * 2) / PAID_CELLS).toFixed(4)

const entries = jobs.map((j) => {
  const sc = j.sheet === 'a' ? sidecarA : sidecarB
  const m = byName[`${j.sheet}-${j.name}`]
  const derived = j.role !== 'hero'
  return {
    file: `media/${path.basename(j.out)}`,
    role: j.role,
    ...(j.productHandle ? { productHandle: j.productHandle } : {}),
    ...(j.categoryHandle ? { categoryHandle: j.categoryHandle } : {}),
    sha256: sha(j.out),
    width: j.w, height: j.h,
    bytes: fs.statSync(j.out).size,
    model: sc.model,
    predictionId: sc.predictionId,
    // Reconstructable: the shared half plus THIS cell's clause, so a larger single
    // re-render of one panel needs no re-reading of the grid prompt.
    prompt: `${sc.gridFrame}\n\n${sc.sharedPreamble}\n\n${j.cell.subjectClause}`,
    negativePrompt: sc.negative,
    params: {
      aspect_ratio: sc.aspect, resolution: sc.resolution, output_format: 'png', num_images: 1,
      gridId: sc.id, gridKind: sc.kind, cellIndex: j.cell.index,
      cellRowCol: [j.cell.row + 1, j.cell.col + 1],
      cropBox: m.cropBox, cropShape: j.shape,
      backdropLuma: m.backdropLuma, backdropRgb: m.backdropRgb,
      ledgerRow: sc.ledgerId, fullGridPromptSha256: sc.fullPromptSha256,
      ...(derived ? { note: 'crop of a panel already paid for; no separate prediction, no separate dollar' } : {}),
    },
    referenceFiles: [],
    sourceFile: `artifacts/media/home-goods/raw/home-goods-grid-${j.sheet}.png`,
    costUsd: derived ? 0 : CELL_COST,
    status: 'accepted',
    createdAt: NOW,
  }
})

const manifest = {
  schema: 'upready.store-media-manifest/v0',
  profileId: 'home-goods',
  provider: 'fal.ai',
  generatedAt: NOW,
  entries,
  totals: {
    renders: 2,
    accepted: entries.length,
    rejected: 0,
    flagged: 0,
    costUsd: +(PRICE_PER_SHEET * 2).toFixed(3),
  },
}
fs.writeFileSync(path.join(MEDIA, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

const packA = measured.filter((m) => m.sheet === 'a').map((m) => m.backdropLuma)
const packB = measured.filter((m) => m.sheet === 'b' && !m.name.startsWith('scene-')).map((m) => m.backdropLuma)
const spread = (a) => (a.length ? (Math.max(...a) - Math.min(...a)).toFixed(1) : 'n/a')
console.log(`frames written: ${jobs.length} (product ${jobs.filter((j) => j.role === 'hero').length}, tiles ${jobs.filter((j) => j.role === 'category-tile').length}, hero ${jobs.filter((j) => j.role === 'banner').length})`)
console.log(`manifest entries: ${entries.length}, predictions: 2, cost $${(PRICE_PER_SHEET * 2).toFixed(2)}, per paid product frame $${CELL_COST}`)
console.log(`sheet A packshot backdrop luma spread ${spread(packA)} across ${packA.length} cells`)
console.log(`sheet B packshot backdrop luma spread ${spread(packB)} across ${packB.length} cells`)
