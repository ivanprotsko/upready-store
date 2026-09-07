// Slice the electronics 4x4 grid into product frames, convert to WebP, write the manifest.
//
// Borders are the ones grid-measure.py FOUND (x 1028/2052/3076, y 1020/2044/3068), not
// quarters (1024/2048/3072) — the model drew a seam it was told not to draw, so each cell
// is cut inside the seam. The detector also reported three horizontal candidates at SNR ~3
// (1488, 1573, 3668); those are gaps between subjects, and content valleys are not panel
// edges. They are ignored on purpose.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { repoRoot } from './frames.mjs'

const ROOT = repoRoot()
const PROFILE = path.join(ROOT, 'apps/backend/src/migration-scripts/data/profiles/electronics')
const RAW = path.join(ROOT, 'artifacts/media/electronics/raw')
const MEDIA = path.join(PROFILE, 'media')
const sidecar = JSON.parse(fs.readFileSync(path.join(RAW, 'electronics-grid-4x4.json'), 'utf8'))

const BORDERS_X = [1028, 2052, 3076]
const BORDERS_Y = [1020, 2044, 3068]
const SEAM_INSET = 10   // px cut back from every found seam, to drop the drawn line
const EDGE_INSET = 6    // px cut back from the outer frame
const W = 4096, H = 4096

const edgesX = [0, ...BORDERS_X, W]
const edgesY = [0, ...BORDERS_Y, H]
const box = (col, row) => {
  const l = edgesX[col] + (col === 0 ? EDGE_INSET : SEAM_INSET)
  const r = edgesX[col + 1] - (col === 3 ? EDGE_INSET : SEAM_INSET)
  const t = edgesY[row] + (row === 0 ? EDGE_INSET : SEAM_INSET)
  const b = edgesY[row + 1] - (row === 3 ? EDGE_INSET : SEAM_INSET)
  return [l, t, r, b]
}

// Every cell is centre-cropped to the same square so the storefront's 1:1 cards are
// literally the same frame size, not fourteen slightly different ones.
const SIDE = 1000
const cellsDir = path.join(RAW, 'cells')
fs.mkdirSync(cellsDir, { recursive: true })
fs.mkdirSync(MEDIA, { recursive: true })

const jobs = sidecar.cells.map((c) => {
  const name = c.colourwaySuffix ? `${c.handle}-${c.colourwaySuffix}` : c.handle
  return { ...c, name, png: path.join(cellsDir, `${name}.png`), webp: path.join(MEDIA, `${name}-hero.webp`) }
})
// The home hero and the five category tiles are CROPS of frames already paid for, not
// new predictions: style-board §6 says the hero is the Bench 1 on the same cyclorama.
const DERIVED = [
  { from: 'bench-over-ear', out: path.join(MEDIA, 'home-hero.webp') },
  { from: 'bench-over-ear', out: path.join(MEDIA, 'tile-headphones.webp') },
  { from: 'pin-earbuds', out: path.join(MEDIA, 'tile-earbuds.webp') },
  { from: 'slab-portable-signal', out: path.join(MEDIA, 'tile-speakers.webp') },
  { from: 'brick-pack', out: path.join(MEDIA, 'tile-power-banks.webp') },
  { from: 'braid-cable', out: path.join(MEDIA, 'tile-cables-and-chargers.webp') },
]

const py = `
import json, sys
from PIL import Image
im = Image.open(${JSON.stringify(path.join(RAW, 'electronics-grid-4x4.png'))})
jobs = json.loads(sys.argv[1])
out = []
for j in jobs:
    l, t, r, b = j["box"]
    cell = im.crop((l, t, r, b))
    w, h = cell.size
    s = min(w, h)
    cell = cell.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    if s != ${SIDE}:
        cell = cell.resize((${SIDE}, ${SIDE}), Image.LANCZOS)
    cell.save(j["png"])
    cell.save(j["webp"], "WEBP", quality=88, method=6)
    px = list(cell.getdata())
    # backdrop tone = the mean of the four corner patches, which are always cyclorama
    corners = []
    for (cx, cy) in [(20, 20), (${SIDE} - 20, 20), (20, ${SIDE} - 20), (${SIDE} - 20, ${SIDE} - 20)]:
        corners.append(cell.getpixel((cx, cy)))
    lum = [0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] for c in corners]
    out.append({"name": j["name"], "cropBox": j["box"], "cellPx": [w, h], "outPx": [${SIDE}, ${SIDE}],
                "backdropLuma": round(sum(lum) / len(lum), 1),
                "backdropRgb": [round(sum(c[i] for c in corners) / len(corners)) for i in range(3)]})
for d in jobs:
    pass
print(json.dumps(out))
`
const payload = jobs.map((j, i) => ({ name: j.name, box: box(j.col, j.row), png: j.png, webp: j.webp }))
const measured = JSON.parse(execFileSync('python3', ['-c', py, JSON.stringify(payload)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
const byName = Object.fromEntries(measured.map((m) => [m.name, m]))

// Derived files: copy the already-converted WebP, one paid frame serving two slots.
for (const d of DERIVED) {
  fs.copyFileSync(path.join(MEDIA, `${d.from}-hero.webp`), d.out)
}

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
const RAW_REL = 'artifacts/media/electronics/raw/electronics-grid-4x4.png'
const NOW = new Date().toISOString()
const PRICE_USD = 0.30            // the ledger's figure for r-98092622, not a guess
const CELL_COST = +(PRICE_USD / jobs.length).toFixed(4)

const entry = (file, role, name, extra = {}) => {
  const j = jobs.find((x) => x.name === name)
  return {
    file: `media/${path.basename(file)}`,
    role,
    ...(j?.handle ? { productHandle: j.handle } : {}),
    ...(j?.colourwaySuffix ? { colorway: j.colourwaySuffix } : {}),
    sha256: sha(file),
    width: SIDE, height: SIDE,
    bytes: fs.statSync(file).size,
    model: sidecar.model,
    predictionId: sidecar.predictionId,
    // Reconstructable per Ivan's directives 3.2: the shared half plus THIS cell's clause,
    // so a larger single re-render of one panel needs no re-reading of the grid prompt.
    prompt: `${sidecar.gridFrame}\n\n${sidecar.sharedPreamble}\n\n${j?.subjectClause ?? ''}`,
    negativePrompt: sidecar.negative,
    params: {
      aspect_ratio: sidecar.aspect, resolution: sidecar.resolution, output_format: 'png', num_images: 1,
      gridId: sidecar.id, gridKind: sidecar.kind, cellIndex: j?.index ?? null,
      cellRowCol: j ? [j.row + 1, j.col + 1] : null,
      cropBox: byName[name]?.cropBox ?? null,
      backdropLuma: byName[name]?.backdropLuma ?? null,
      ledgerRow: sidecar.ledgerId,
      fullGridPromptSha256: sidecar.fullPromptSha256,
    },
    referenceFiles: [],
    sourceFile: RAW_REL,
    costUsd: CELL_COST,
    status: 'accepted',
    createdAt: NOW,
    ...extra,
  }
}

const entries = [
  ...jobs.map((j) => entry(j.webp, j.colourwaySuffix ? 'colorway' : 'hero', j.name)),
  ...DERIVED.map((d) => {
    const isTile = path.basename(d.out).startsWith('tile-')
    return entry(d.out, isTile ? 'category-tile' : 'banner', d.from, {
      ...(isTile ? { categoryHandle: path.basename(d.out).replace(/^tile-|\.webp$/g, '') } : {}),
      params: {
        ...entry(d.out, 'hero', d.from).params,
        derivedFrom: `media/${d.from}-hero.webp`,
        note: 'crop of a frame already paid for; no separate prediction, no separate dollar',
      },
      costUsd: 0,
    })
  }),
]

const manifest = {
  schema: 'upready.store-media-manifest/v0',
  profileId: 'electronics',
  provider: 'fal.ai',
  generatedAt: NOW,
  entries,
  totals: {
    renders: 1,
    accepted: entries.length,
    rejected: 0,
    flagged: 0,
    costUsd: PRICE_USD,
  },
}
fs.writeFileSync(path.join(MEDIA, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

const lums = measured.map((m) => m.backdropLuma)
console.log(`cells written: ${jobs.length}, derived: ${DERIVED.length}, manifest entries: ${entries.length}`)
console.log(`predictions: 1, ledger row ${sidecar.ledgerId}, costUsd ${PRICE_USD}`)
console.log(`backdrop luma (corner patches) min ${Math.min(...lums)} max ${Math.max(...lums)} spread ${(Math.max(...lums) - Math.min(...lums)).toFixed(1)}`)
