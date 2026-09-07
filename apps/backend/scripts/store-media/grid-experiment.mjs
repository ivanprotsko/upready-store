// One-off measurement ordered by Ivan (2026-09-08 directives §2, §3.1, §4):
//   G1 — a 3x3 grid of NINE DIFFERENT products in one prediction (wave economics)
//   G2 — a 3x3 grid of NINE VIEWS of one product (PDP gallery thumbnails)
//   T1 — one packshot asked for on a transparent background, PNG (does alpha survive)
// Three predictions. Nothing here touches the pilot ledger: these are not catalog frames.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { loadFalKey, runFalRequest } from './fal.mjs'
import { repoRoot } from './frames.mjs'
import { PACKSHOT_NEGATIVE_V2 } from './prompts.mjs'

const ROOT = repoRoot()
const OUT = path.join(ROOT, 'artifacts/media/_experiments/2026-09-08-grid-3x3')
// The wave moved to fal.ai (Replicate never published a price for this model; fal.ai puts
// the number on the page). Endpoint ids and input schemas fetched 2026-09-08 03:5x WITA.
const REGISTRY = path.join(ROOT, 'apps/backend/scripts/store-media/wave-registry.mjs')
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

// Which model buys which render, and why:
//   G1 is the render the wave's whole economics hangs on, so it is bought at the tier
//   that could actually replace nine separate product photographs: nano-banana-pro at
//   4K ($0.30). At 4K a third of the frame is ~1365 px — a real product image. The cheap
//   model tops out near 1024 px, where a third is ~341 px and a "grid product image" is
//   a thumbnail no matter how well the model holds the layout.
//   G2 and T1 ask questions that do not need the expensive tier: does the layout hold at
//   all, and does alpha survive. Both go to nano-banana at $0.039, which also measures
//   the cheap path's native output size for free.
const PRO = 'fal-ai/nano-banana-pro'
const CHEAP = 'fal-ai/nano-banana'

const JOBS = [
  {
    id: 'g1-nine-products',
    kind: 'grid-3x3',
    model: PRO,
    resolution: '4K',
    aspect: '1:1',
    purpose: 'grid-measurement',
    prompt: gridPrompt(cellsG1, 'The nine panels show nine different shoes, one per panel, listed row by row:'),
    cells: cellsG1,
  },
  {
    id: 'g2-nine-views',
    kind: 'grid-3x3',
    model: CHEAP,
    resolution: null,
    aspect: '1:1',
    purpose: 'grid-measurement',
    prompt: gridPrompt(cellsG2, `All nine panels show the SAME single shoe — ${g2Product.imageBrief.subject} — photographed from nine different angles, listed row by row:`),
    cells: cellsG2,
  },
  {
    id: 't1-transparent',
    kind: 'single',
    model: CHEAP,
    resolution: null,
    aspect: '1:1',
    purpose: 'grid-measurement',
    prompt: TRANSPARENT_PROMPT,
    cells: [{ index: 0, row: 0, col: 0, handle: shoes[0].handle, subjectClause: 'transparency test' }],
  },
]

/** The input the provider takes differs by model: only -pro knows `resolution`. */
const falInput = (job) => ({
  prompt: job.prompt,
  aspect_ratio: job.aspect,
  output_format: 'png',
  num_images: 1,
  ...(job.resolution ? { resolution: job.resolution } : {}),
})

/**
 * Write the render to the ledger BEFORE the money is spent. The pilot recorded
 * `costUsd: 0` — "not measured" that read as "free" — so this is not optional and it
 * is not a number typed here: the tool prices the call from the model name and can
 * refuse (exit 2 = ceiling, exit 3 = soft stop). A refusal ends the run.
 */
function chargeLedger(job) {
  const args = [
    REGISTRY, 'spend', 'add',
    '--theme', '_measurement',
    '--model', job.model,
    '--kind', job.kind,
    '--purpose', job.purpose,
    '--prompt-sha', sha256(job.prompt),
  ]
  if (job.resolution) args.push('--resolution', job.resolution)
  const out = execFileSync(process.execPath, args, { encoding: 'utf8' })
  process.stdout.write(`LEDGER ${out}`)
  return out.trim().split(/\s+/)[0]
}

// Spend gate: this file costs money, so the default is a dry run. `--spend` is the only
// way to reach the provider, and it exists so the prompt assembly can be exercised for free.
if (!process.argv.includes('--spend')) {
  console.log(`DRY RUN — nothing sent, no money spent. Pass --spend to run the ${JOBS.length} predictions.`)
  for (const job of JOBS) {
    console.log(`\n=== ${job.id} · ${job.kind} · ${job.model} · ${job.resolution || 'default'} · ${job.aspect} · ${job.prompt.length} chars · sha256 ${sha256(job.prompt).slice(0, 16)}`)
    console.log(`cells: ${job.cells.map((c) => `${c.row}${c.col}:${c.handle}`).join(' ')}`)
    console.log(`${job.prompt.slice(0, 300)}…`)
  }
  process.exit(0)
}

fs.mkdirSync(OUT, { recursive: true })
const key = loadFalKey()
const ledger = []
for (const job of JOBS) {
  console.log(`[${new Date().toISOString()}] START ${job.id} ${job.model} ${job.resolution || 'default'} ${job.aspect} promptChars=${job.prompt.length}`)
  let ledgerId = null
  try {
    ledgerId = chargeLedger(job)          // money first, picture second
  } catch (e) {
    console.log(`[${new Date().toISOString()}] LEDGER REFUSED for ${job.id}: ${e.stdout || ''}${e.stderr || ''}${e.message}`)
    ledger.push({ id: job.id, error: 'ledger refused, nothing sent to the provider' })
    break                                  // a refusal is a stop, never a workaround
  }
  const t0 = Date.now()
  try {
    const { requestId, result, outputs, wallMs } = await runFalRequest({
      key,
      model: job.model,
      input: falInput(job),
      timeoutMs: 600_000,
    })
    const file = path.join(OUT, `${job.id}.png`)
    fs.writeFileSync(file, outputs[0].buffer)
    const rec = {
      id: job.id,
      ledgerId,
      kind: job.kind,
      aspect: job.aspect,
      resolution: job.resolution,
      provider: 'fal.ai',
      model: job.model,
      requestId,
      seconds: +((Date.now() - t0) / 1000).toFixed(1),
      providerWallMs: wallMs,
      bytes: outputs[0].buffer.length,
      contentType: outputs[0].contentType,
      reportedWidth: outputs[0].width,
      reportedHeight: outputs[0].height,
      outputUrl: outputs[0].url,          // provenance only; fal purges outputs
      providerDescription: result.description ?? null,
      file: path.relative(ROOT, file),
      sharedPreamble: SHARED_PREAMBLE,
      gridFrame: job.kind === 'grid-3x3' ? GRID_FRAME : null,
      cells: job.cells,
      fullPrompt: job.prompt,
      fullPromptSha256: sha256(job.prompt),
    }
    fs.writeFileSync(path.join(OUT, `${job.id}.json`), `${JSON.stringify(rec, null, 2)}\n`)
    ledger.push({ id: job.id, ledgerId, requestId, seconds: rec.seconds, bytes: rec.bytes, px: `${rec.reportedWidth}x${rec.reportedHeight}` })
    console.log(`[${new Date().toISOString()}] DONE ${job.id} ${requestId} ${rec.seconds}s ${rec.bytes} bytes ${rec.reportedWidth}x${rec.reportedHeight} -> ${rec.file}`)
  } catch (e) {
    // The dollar is already in the ledger and is NOT recoverable — that is the point of
    // charging first. Record which ledger row bought nothing.
    ledger.push({ id: job.id, ledgerId, error: String(e.message || e) })
    console.log(`[${new Date().toISOString()}] FAILED ${job.id} (ledger row ${ledgerId} already charged): ${e.message || e}`)
  }
}
fs.writeFileSync(path.join(OUT, 'ledger.json'), `${JSON.stringify({ ranAt: new Date().toISOString(), provider: 'fal.ai', jobs: ledger }, null, 2)}\n`)
console.log('LEDGER', JSON.stringify(ledger))
