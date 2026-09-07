// One-off measurement ordered by Ivan (2026-09-08 directives §2, §3.1, §4):
//   G1 — a 3x3 grid of NINE DIFFERENT products in one prediction (wave economics)
//   G2 — a 3x3 grid of NINE VIEWS of one product (PDP gallery thumbnails)
//   T1 — one packshot asked for on a transparent background, PNG (does alpha survive)
// Three predictions. Nothing here touches the pilot ledger: these are not catalog frames.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { loadReplicateKey, runPrediction } from './replicate.mjs'
import { repoRoot } from './frames.mjs'
import { PACKSHOT_NEGATIVE_V2 } from './prompts.mjs'

const ROOT = repoRoot()
const OUT = path.join(ROOT, 'artifacts/media/_experiments/2026-09-08-grid-3x3')
const VERSION = 'd1be8b5fc0931a253d417e12a484ac01ee9ccbc6daffd4792151377d5e5ff55f'
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

const products = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'apps/backend/src/migration-scripts/data/profiles/sneakers/catalog/products.json'), 'utf8'),
)
const list = Array.isArray(products) ? products : products.products || products.items
const shoes = list.filter((p) => (p.categoryHandle || p.category) !== 'care-and-spares')

// The room, the light, the lens — identical to the pilot's §5.4 template, said once.
const SHARED_PREAMBLE =
  'Studio product photography contact sheet. Every panel shares one identical setup: ' +
  'seamless matte concrete-grey cyclorama background, flat mid-grey, one stop lighter at the top, no seam between floor and wall, no horizon. ' +
  'One large softbox key at 45 degrees camera-left and 30 degrees above, one narrow strip reflector camera-right at quarter power for edge separation on the dark upper, neutral 5600K daylight, no coloured light. ' +
  '85mm lens at f/8, camera at midsole height so each shoe is seen very slightly from below. ' +
  'In every panel the shoe is centred, fills 80 percent of that panel width, with clear space beneath the outsole, and carries exactly one soft feathered contact shadow directly under the outsole, no cast side shadow, no reflection, matte floor. ' +
  'Sharp focus front to back, material texture clearly visible.'

const GRID_FRAME =
  'The image is a 3 by 3 grid of nine separate square photographs, three rows and three columns, of equal size, edge to edge with no gutter, no border, no frame line, no caption, no numbering. ' +
  'The nine panels are identical in exposure, white balance, background tone, camera height and subject scale, as if shot in one session on one set and laid out afterwards.'

const cellsG1 = shoes.slice(0, 9).map((p, i) => ({
  index: i,
  row: Math.floor(i / 3),
  col: i % 3,
  handle: p.handle,
  subjectClause:
    `${p.imageBrief.subject.charAt(0).toLowerCase() + p.imageBrief.subject.slice(1)} ` +
    'A single right shoe alone in the panel, three-quarter front view seen from its outer side, toe at the left of the panel, heel at the right.',
}))

const VIEWS = [
  'three-quarter front view from the outer side, toe to the left',
  'straight profile view of the outer side, toe to the left',
  'straight profile view of the inner side, toe to the right',
  'direct front view, toe towards the camera',
  'direct rear view, heel towards the camera',
  'top-down view of the whole shoe from directly above',
  'view of the outsole, the shoe tipped so the tread pattern faces the camera',
  'close detail of the heel counter and the heel tab',
  'close detail of the eyelet row, laces and tongue',
]
const g2Product = shoes[0]
const cellsG2 = VIEWS.map((v, i) => ({
  index: i,
  row: Math.floor(i / 3),
  col: i % 3,
  handle: g2Product.handle,
  subjectClause: `the same one shoe, ${v}.`,
}))

const gridPrompt = (cells, subjectLine) =>
  `${GRID_FRAME}\n\n${SHARED_PREAMBLE}\n\n${subjectLine}\n\n` +
  cells.map((c) => `Row ${c.row + 1}, column ${c.col + 1}: ${c.subjectClause}`).join('\n') +
  `\n\nDo not include: ${PACKSHOT_NEGATIVE_V2}, caption, label, number, grid line, border, drop shadow between panels, collage frame`

const TRANSPARENT_PROMPT =
  `Studio product photograph of ${shoes[0].imageBrief.subject.charAt(0).toLowerCase() + shoes[0].imageBrief.subject.slice(1)} ` +
  'A single right shoe, alone in frame, in three-quarter front view seen from its outer side, toe at the left of the frame. ' +
  'The background is fully transparent — an empty alpha channel, no backdrop, no floor, no cyclorama, nothing behind or under the shoe except transparency. ' +
  'Keep the soft contact shadow beneath the outsole as a semi-transparent shadow on the transparent background. ' +
  'One large softbox key at 45 degrees camera-left and 30 degrees above, neutral 5600K daylight. ' +
  '85mm lens at f/8, camera at midsole height, shoe centred, filling 80 percent of the frame width. ' +
  'Sharp focus front to back. Cut-out product image with an alpha channel, PNG with transparency.' +
  `\n\nDo not include: ${PACKSHOT_NEGATIVE_V2}, background, backdrop, floor, wall, white background, grey background, checkerboard pattern`

const JOBS = [
  { id: 'g1-nine-products', kind: 'grid-3x3', prompt: gridPrompt(cellsG1, 'The nine panels show nine different shoes, one per panel, listed row by row:'), cells: cellsG1, aspect: '1:1', resolution: '4K' },
  { id: 'g2-nine-views', kind: 'grid-3x3', prompt: gridPrompt(cellsG2, `All nine panels show the SAME single shoe — ${g2Product.imageBrief.subject} — photographed from nine different angles, listed row by row:`), cells: cellsG2, aspect: '1:1', resolution: '4K' },
  { id: 't1-transparent', kind: 'single', prompt: TRANSPARENT_PROMPT, cells: [{ index: 0, row: 0, col: 0, handle: shoes[0].handle, subjectClause: 'transparency test' }], aspect: '1:1', resolution: '2K' },
]

// Spend gate: this file costs money, so the default is a dry run. `--spend` is the only
// way to reach the provider, and it exists so the prompt assembly can be exercised for free.
if (!process.argv.includes('--spend')) {
  console.log(`DRY RUN — nothing sent, no money spent. Pass --spend to run the ${JOBS.length} predictions.`)
  for (const job of JOBS) {
    console.log(`\n=== ${job.id} · ${job.kind} · ${job.aspect} · ${job.resolution} · ${job.prompt.length} chars · sha256 ${sha256(job.prompt).slice(0, 16)}`)
    console.log(`cells: ${job.cells.map((c) => `${c.row}${c.col}:${c.handle}`).join(' ')}`)
    console.log(`${job.prompt.slice(0, 300)}…`)
  }
  process.exit(0)
}

fs.mkdirSync(OUT, { recursive: true })
const key = loadReplicateKey()
const ledger = []
for (const job of JOBS) {
  console.log(`[${new Date().toISOString()}] START ${job.id} ${job.resolution} ${job.aspect} promptChars=${job.prompt.length}`)
  const t0 = Date.now()
  try {
    const { prediction, outputs } = await runPrediction({
      key,
      version: VERSION,
      input: { prompt: job.prompt, resolution: job.resolution, aspect_ratio: job.aspect, output_format: 'png' },
      timeoutMs: 600_000,
    })
    const file = path.join(OUT, `${job.id}.png`)
    fs.writeFileSync(file, outputs[0].buffer)
    const rec = {
      id: job.id,
      kind: job.kind,
      aspect: job.aspect,
      resolution: job.resolution,
      model: 'google/nano-banana-2',
      predictionId: prediction.id,
      status: prediction.status,
      metrics: prediction.metrics || null,
      seconds: +((Date.now() - t0) / 1000).toFixed(1),
      bytes: outputs[0].buffer.length,
      contentType: outputs[0].contentType,
      file: path.relative(ROOT, file),
      sharedPreamble: SHARED_PREAMBLE,
      gridFrame: job.kind === 'grid-3x3' ? GRID_FRAME : null,
      cells: job.cells,
      fullPrompt: job.prompt,
      fullPromptSha256: sha256(job.prompt),
    }
    fs.writeFileSync(path.join(OUT, `${job.id}.json`), `${JSON.stringify(rec, null, 2)}\n`)
    ledger.push({ id: job.id, predictionId: prediction.id, status: prediction.status, seconds: rec.seconds, bytes: rec.bytes })
    console.log(`[${new Date().toISOString()}] DONE ${job.id} ${prediction.id} ${rec.seconds}s ${rec.bytes} bytes -> ${rec.file}`)
  } catch (e) {
    ledger.push({ id: job.id, error: String(e.message || e) })
    console.log(`[${new Date().toISOString()}] FAILED ${job.id}: ${e.message || e}`)
  }
}
fs.writeFileSync(path.join(OUT, 'ledger.json'), `${JSON.stringify({ ranAt: new Date().toISOString(), jobs: ledger }, null, 2)}\n`)
console.log('LEDGER', JSON.stringify(ledger))
