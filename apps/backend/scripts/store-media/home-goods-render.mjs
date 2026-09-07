// Image production for the `home-goods` profile (Long Morning), wave 2 W3.
//
// Two predictions, both 3x3 at 4K, both ledgered BEFORE the request is sent.
//
// Why 3x3 and not 4x4: measured tonight. artifacts/docs/2026-09-08-grid-measurement.md put a
// 3x3's background luminance spread at 7.8; the electronics theme's 4x4 came back at 59.2 with
// the same estimator and the same model, and the model drew seams it was told not to draw. A
// 3x3 is nine cells, this catalog has twelve products, so it takes two sheets rather than one
// wider one.
//
// Why the second sheet is mixed: its row 1 carries the three remaining packshots on the SAME
// seamless putty backdrop as sheet one, and rows 2-3 carry six interiors for the hero and the
// four category tiles. The differing backgrounds between its halves are the ORDER, not drift.
// The packshots go in row 1 because reading order is where adherence was measured strongest.
//
// Two conditions ride with the grid verdict and both are honoured downstream, in the slicer:
//   1. the panel count is READ OFF the returned image, never assumed;
//   2. transparency is never requested — alpha does not survive, the model paints a
//      checkerboard as opaque pixels.
//
// Default is a dry run; --spend is the only way to reach the provider.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { loadFalKey, runFalRequest } from './fal.mjs'
import { repoRoot } from './frames.mjs'

const ROOT = repoRoot()
const PROFILE = path.join(ROOT, 'apps/backend/src/migration-scripts/data/profiles/home-goods')
const OUT = path.join(ROOT, 'artifacts/media/home-goods/raw')
const REGISTRY = path.join(ROOT, 'apps/backend/scripts/store-media/wave-registry.mjs')
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

const products = JSON.parse(fs.readFileSync(path.join(PROFILE, 'catalog/products.json'), 'utf8'))
const byHandle = Object.fromEntries(products.map((p) => [p.handle, p]))

// style-board.md section 5, said once for all nine panels. Putty plaster, never white:
// a white studio backdrop makes every card a blinding rectangle on a near-black page, which
// is the open question q-white-backdrop-in-dark-mode. Putty at luma ~216 answers it for free.
const SHARED_PREAMBLE =
  'Studio product photography contact sheet. Every panel shares one identical setup: ' +
  'a seamless warm putty plaster background, flat matte oatmeal beige, very slightly brighter towards the top left, no seam between floor and wall, no horizon line, no visible corner. ' +
  'One large diffused source at 60 degrees camera-left and 25 degrees above standing in for a kitchen window in morning light, one white bounce card camera-right at quarter power, warm daylight at 4800 kelvin, no coloured light. ' +
  '85mm lens at f/8, camera on a tripod at two thirds of the object height so each object is seen very slightly from above and its top face is legible. ' +
  'In every panel the object is centred, fills 60 percent of that panel width, has clear empty space above it and below it, and carries exactly one soft feathered contact shadow directly beneath it falling to camera-right, no cast side shadow, no second shadow, no reflection, matte floor. ' +
  'Sharp focus front to back, glaze speckle and linen slub and wood grain and cast-iron texture clearly visible, matte surfaces stay matte.'

const GRID_FRAME =
  'The image is a 3 by 3 grid of nine separate square photographs, three rows and three columns, of equal size, edge to edge with no gutter, no border, no frame line, no caption, no numbering. ' +
  'The nine panels are identical in exposure, white balance, background tone, camera height and subject scale, as if shot in one session on one set and laid out afterwards.'

const GRID_FRAME_B =
  'The image is a 3 by 3 grid of nine separate square photographs, three rows and three columns, of equal size, edge to edge with no gutter, no border, no frame line, no caption, no numbering. ' +
  'This sheet has two halves and they are deliberately different. Row 1 holds three studio packshots on a seamless putty background. Rows 2 and 3 hold six wide photographs of the inside of a real kitchen in morning light. ' +
  'Within row 1 the three panels are identical in exposure, white balance, background tone, camera height and subject scale. Within rows 2 and 3 the six panels are one continuous morning in one kitchen, the same light and the same room seen from different places.'

const INTERIOR_PREAMBLE =
  'Interior photography, one domestic kitchen on one morning. Low warm sunlight rakes in from a tall window out of frame to the camera-left, throwing long soft-edged light across the surfaces and leaving the right of every frame in gentle shade. ' +
  'The room is plaster in warm putty and oatmeal, with terracotta and clay accents, pale oak, blackened steel and unglazed stoneware. 35mm lens at f/4, camera at standing eye level, level horizon, no tilt. ' +
  'Warm 4200 kelvin light, gentle contrast, deep enough shadow on the right of the frame to hold white text over it. Quiet, unstyled, lived in but tidy.'

const NEGATIVE =
  'real logos, brand marks or wordmarks of any kind, legible text, letters or numbers anywhere in the frame, ' +
  'human faces, hands, ears or bodies, people in the room, ' +
  'food, drink, steam, smoke or flame, ' +
  'props, plinths, boxes, tissue paper, plants, phones or books in the packshot panels, ' +
  'coloured or gradient backgrounds, coloured gels, neon or rim-light flare, ' +
  'wet, glossy or mirrored floor, reflections, a second shadow, a floating subject, top-down flat lay, dutch angle or tilted horizon, ' +
  'shallow depth of field, bokeh or motion blur, HDR, oversaturation, heavy vignette or visible upscaling artefacts, ' +
  'caption, label, number, grid line, border, drawn seam between panels, drop shadow between panels, collage frame, ' +
  'transparency, checkerboard pattern'

const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1)
const templateOf = (h) => (byHandle[h].imageBrief.shots[0].description.startsWith('V-stack') ? 'V-stack' : 'V-single')
const framing = (h) => byHandle[h].imageBrief.shots[0].description.replace(/^V-(single|stack) — /, '')

const packCell = (h, i, cols) => ({
  index: i, row: Math.floor(i / cols), col: i % cols, handle: h, role: 'hero',
  subjectClause: lower(byHandle[h].imageBrief.subject) + ' ' +
    (templateOf(h) === 'V-stack'
      ? 'Several identical objects in the panel arranged as one group, '
      : 'One object alone in the panel, ') + framing(h) + '.',
})

// ---- sheet A: nine packshots, cookware / tableware / textiles, one row each
const A_ORDER = [
  'braiser', 'bean-pot', 'skillet',
  'dinner-plates', 'mug', 'serving-board',
  'waffle-towels', 'cross-back-apron', 'table-runner',
]
const cellsA = A_ORDER.map((h, i) => packCell(h, i, 3))

// ---- sheet B: row 1 packshots, rows 2-3 interiors for the hero and the four tiles
const B_PACK = ['canister', 'candle-holder', 'hook-rail']
const B_SCENES = [
  { name: 'scene-hero', what: 'A wide view down a kitchen worktop of warm putty plaster and pale oak, morning sun raking across it from the left, an unglazed stoneware jar and a cast-iron pan sitting far down the counter, the right third of the frame falling into soft even shade with nothing in it.' },
  { name: 'scene-cookware', what: 'A close view of a blackened steel rail on a putty plaster wall with two pieces of dark cast-iron cookware hanging from it, morning light across the wall from the left, the pans filling the middle of the frame.' },
  { name: 'scene-tableware', what: 'A corner of a pale oak table laid with speckled oat stoneware plates and one terracotta mug, seen from standing height, morning light falling across the table from the left.' },
  { name: 'scene-textiles', what: 'A washed linen apron and a folded stack of terracotta waffle-weave cotton towels resting on the edge of a pale oak worktop, morning light across them from the left, plaster wall behind.' },
  { name: 'scene-storage', what: 'An open pale oak shelf against a putty plaster wall holding three speckled stoneware canisters with cork lids and a turned oak candle holder, morning light from the left, deep quiet shade to the right.' },
  { name: 'scene-spare', what: 'A wide view of the same kitchen from the doorway, pale oak cabinets, putty plaster walls, a terracotta braising pan on the hob, the window out of frame at the left throwing a long band of morning light across the floor.' },
]
const cellsB = [
  ...B_PACK.map((h, i) => packCell(h, i, 3)),
  ...B_SCENES.map((s, i) => ({
    index: 3 + i, row: Math.floor((3 + i) / 3), col: (3 + i) % 3,
    handle: null, name: s.name, role: 'scene', subjectClause: s.what,
  })),
]

const promptA =
  `${GRID_FRAME}\n\n${SHARED_PREAMBLE}\n\n` +
  'The nine panels show nine different objects, one per panel, listed row by row:\n' +
  cellsA.map((c) => `Row ${c.row + 1}, column ${c.col + 1}: ${c.subjectClause}`).join('\n') +
  `\n\nDo not include: ${NEGATIVE}`

const promptB =
  `${GRID_FRAME_B}\n\n` +
  `ROW 1 — three studio packshots. ${SHARED_PREAMBLE}\n` +
  cellsB.slice(0, 3).map((c) => `Row 1, column ${c.col + 1}: ${c.subjectClause}`).join('\n') +
  `\n\nROWS 2 AND 3 — six interiors. ${INTERIOR_PREAMBLE}\n` +
  cellsB.slice(3).map((c) => `Row ${c.row + 1}, column ${c.col + 1}: ${c.subjectClause}`).join('\n') +
  `\n\nDo not include: ${NEGATIVE}`

const JOBS = [
  { id: 'home-goods-grid-a', kind: 'grid-3x3', model: 'fal-ai/nano-banana-pro', resolution: '4K',
    aspect: '1:1', purpose: 'product-grid', prompt: promptA, cells: cellsA,
    gridFrame: GRID_FRAME, sharedPreamble: SHARED_PREAMBLE },
  { id: 'home-goods-grid-b', kind: 'grid-3x3', model: 'fal-ai/nano-banana-pro', resolution: '4K',
    aspect: '1:1', purpose: 'product-grid', prompt: promptB, cells: cellsB,
    gridFrame: GRID_FRAME_B, sharedPreamble: `${SHARED_PREAMBLE}\n\n${INTERIOR_PREAMBLE}` },
]

const falInput = (job) => ({
  prompt: job.prompt, aspect_ratio: job.aspect, output_format: 'png', num_images: 1,
  ...(job.resolution ? { resolution: job.resolution } : {}),
})

function chargeLedger(job) {
  const args = [REGISTRY, 'spend', 'add', '--theme', 'home-goods', '--model', job.model,
    '--kind', job.kind, '--purpose', job.purpose, '--prompt-sha', sha256(job.prompt)]
  if (job.resolution) args.push('--resolution', job.resolution)
  const out = execFileSync(process.execPath, args, { encoding: 'utf8' })
  process.stdout.write(`LEDGER ${out}`)
  return out.trim().split(/\s+/)[0]
}

const only = process.argv.find((a) => a.startsWith('--only='))
const jobs = only ? JOBS.filter((j) => j.id.endsWith(only.slice('--only='.length))) : JOBS

if (!process.argv.includes('--spend')) {
  console.log(`DRY RUN — nothing sent, no money spent. Pass --spend to run ${jobs.length} prediction(s).`)
  for (const j of jobs) {
    console.log(`\n${j.id} · ${j.kind} · ${j.model} · ${j.resolution} · ${j.aspect}`)
    console.log(`prompt: ${j.prompt.length} chars, sha256 ${sha256(j.prompt)}`)
    console.log(`cells: ${j.cells.map((c) => `r${c.row + 1}c${c.col + 1}=${c.handle || c.name}`).join(' ')}`)
  }
  process.exit(0)
}

fs.mkdirSync(OUT, { recursive: true })
const key = loadFalKey()
for (const job of jobs) {
  console.log(`[${new Date().toISOString()}] START ${job.id} promptChars=${job.prompt.length}`)
  const ledgerId = chargeLedger(job)   // money first, picture second
  const { requestId, outputs, wallMs, result } = await runFalRequest({
    key, model: job.model, input: falInput(job), timeoutMs: 600_000,
  })
  const file = path.join(OUT, `${job.id}.png`)
  fs.writeFileSync(file, outputs[0].buffer)
  const sidecar = {
    id: job.id, ledgerId, kind: job.kind, model: job.model, resolution: job.resolution,
    aspect: job.aspect, predictionId: requestId, requestedAt: new Date().toISOString(), wallMs,
    file: path.relative(ROOT, file), bytes: outputs[0].buffer.length,
    reportedWidth: outputs[0].width, reportedHeight: outputs[0].height,
    gridFrame: job.gridFrame, sharedPreamble: job.sharedPreamble, negative: NEGATIVE,
    cells: job.cells, fullPromptSha256: sha256(job.prompt), fullPrompt: job.prompt,
    providerResult: result,
  }
  fs.writeFileSync(path.join(OUT, `${job.id}.json`), JSON.stringify(sidecar, null, 2) + '\n')
  console.log(`[${new Date().toISOString()}] DONE ${job.id} request=${requestId} wall=${(wallMs / 1000).toFixed(1)}s bytes=${outputs[0].buffer.length} -> ${file}`)
}
