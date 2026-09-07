// Image production for the `electronics` profile (Ferrite), wave 2 W3.
//
// The economics are not re-derived here: artifacts/docs/2026-09-08-grid-measurement.md
// measured them tonight and the verdict is GRID — nine of nine products came back in the
// cells asked for at 1365x1024 px for one $0.30 prediction. This profile has FOURTEEN
// products, so the grid is 4x4 at 4K: 4096/4 = 1024 px square cells, sixteen panels, the
// last two spent on colourway frames that would otherwise never be shot.
//
// Two conditions ride with that verdict and both are honoured downstream, not here:
//   1. the panel count is READ OFF the returned image (grid-measure.py), never assumed —
//      a 3x3 was ordered last time and a 3x4 came back;
//   2. no transparency is ever requested; alpha does not survive.
//
// Every prediction is written to the ledger BEFORE the request is sent.
// Default is a dry run; --spend is the only way to reach the provider.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { loadFalKey, runFalRequest } from './fal.mjs'
import { repoRoot } from './frames.mjs'

const ROOT = repoRoot()
const PROFILE = path.join(ROOT, 'apps/backend/src/migration-scripts/data/profiles/electronics')
const OUT = path.join(ROOT, 'artifacts/media/electronics/raw')
const REGISTRY = path.join(ROOT, 'apps/backend/scripts/store-media/wave-registry.mjs')
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

const products = JSON.parse(fs.readFileSync(path.join(PROFILE, 'catalog/products.json'), 'utf8'))
const byHandle = Object.fromEntries(products.map((p) => [p.handle, p]))

// style-board.md section 5, said once for all sixteen panels. Grey cyclorama, never black:
// a graphite product on black loses its own edge, which is defect class A in a photograph.
const SHARED_PREAMBLE =
  'Studio product photography contact sheet. Every panel shares one identical setup: ' +
  'seamless matte graphite-grey cyclorama background, flat mid-grey, one stop lighter at the top, no seam between floor and wall, no horizon. ' +
  'One large softbox key at 45 degrees camera-left and 30 degrees above, one narrow strip reflector camera-right at quarter power drawing a single edge highlight down the right side of each dark housing, neutral 5600K daylight, no coloured light. ' +
  '85mm lens at f/8, camera at the height of the object mid-point so each object is seen very slightly from below and reads as solid. ' +
  'In every panel the object is centred, fills 80 percent of that panel width, has clear space beneath it, and carries exactly one soft feathered contact shadow directly underneath, no cast side shadow, no reflection, matte floor. ' +
  'Sharp focus front to back, material texture clearly visible, matte surfaces stay matte.'

const GRID_FRAME =
  'The image is a 4 by 4 grid of sixteen separate square photographs, four rows and four columns, of equal size, edge to edge with no gutter, no border, no frame line, no caption, no numbering. ' +
  'The sixteen panels are identical in exposure, white balance, background tone, camera height and subject scale, as if shot in one session on one set and laid out afterwards.'

const NEGATIVE =
  'real logos, brand marks or wordmarks of any kind, legible text, letters or numbers anywhere in the frame including on screens, buttons and cable moulds, ' +
  'a housing shape, grille pattern or control layout copied from an existing product, human faces, hands, ears or bodies, earbuds shown worn, ' +
  'props, plinths, boxes, tissue paper, desks, plants or phones, coloured or gradient backgrounds, coloured gels, neon or rim-light flare, ' +
  'wet, glossy or mirrored floor, reflections, a second shadow, a floating subject, top-down flat lay, dutch angle or tilted horizon, ' +
  'shallow depth of field, bokeh or motion blur, HDR, oversaturation, heavy vignette or visible upscaling artefacts, anything that names a real place or a real shop, ' +
  'caption, label, number, grid line, border, drop shadow between panels, collage frame, transparency, checkerboard pattern'

// Reading order, row by row. Fourteen products, then two colourway frames on the panels
// the 4x4 makes free — they cost nothing extra and give the tiles a second colour to use.
const ORDER = [
  'bench-over-ear', 'bench-studio', 'pad-set', 'pin-earbuds',
  'pin-open', 'slab-portable', 'shelf-monitor', 'puck-speaker',
  'brick-pack', 'slip-pack', 'crate-station', 'stack-charger',
  'braid-cable', 'hub-dock',
]
const SPARES = [
  { handle: 'bench-over-ear', suffix: 'chalk',
    subject: 'A closed-back over-ear headphone identical in form to the one in row 1 column 1 but finished in flat chalk off-white glass-filled nylon with a pale grey woven headband wrap and light grey earpads.' },
  { handle: 'slab-portable', suffix: 'signal',
    subject: 'A rectangular portable speaker identical in form to the one in row 2 column 2 but finished in a strong mid-blue powder-coated perforated steel front grille with dark grey rubberised end caps.' },
]

const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1)
const cells = [
  ...ORDER.map((h) => ({ handle: h, subject: byHandle[h].imageBrief.subject, pair: byHandle[h].imageBrief.shots[0].description.includes('V-pair') })),
  ...SPARES.map((s) => ({ handle: s.handle, suffix: s.suffix, subject: s.subject, pair: false })),
].map((c, i) => ({
  index: i, row: Math.floor(i / 4), col: i % 4,
  handle: c.handle, colourwaySuffix: c.suffix || null,
  subjectClause:
    lower(c.subject) + ' ' +
    (c.pair
      ? 'Two identical objects in the panel, the near one three-quarter front seen from its left, the far one behind and to the left, slightly turned away.'
      : 'One object alone in the panel, three-quarter front seen from its left, its most characteristic face towards the camera.'),
}))

const PROMPT =
  `${GRID_FRAME}\n\n${SHARED_PREAMBLE}\n\n` +
  'The sixteen panels show sixteen different objects, one per panel, listed row by row:\n' +
  cells.map((c) => `Row ${c.row + 1}, column ${c.col + 1}: ${c.subjectClause}`).join('\n') +
  `\n\nDo not include: ${NEGATIVE}`

const JOB = {
  id: 'electronics-grid-4x4',
  kind: 'grid-4x4',
  model: 'fal-ai/nano-banana-pro',
  resolution: '4K',
  aspect: '1:1',
  purpose: 'product-grid',
  prompt: PROMPT,
  cells,
}

const falInput = (job) => ({
  prompt: job.prompt,
  aspect_ratio: job.aspect,
  output_format: 'png',
  num_images: 1,
  ...(job.resolution ? { resolution: job.resolution } : {}),
})

function chargeLedger(job) {
  const args = [
    REGISTRY, 'spend', 'add',
    '--theme', 'electronics',
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

if (!process.argv.includes('--spend')) {
  console.log(`DRY RUN — nothing sent, no money spent. Pass --spend to run 1 prediction.`)
  console.log(`${JOB.id} · ${JOB.kind} · ${JOB.model} · ${JOB.resolution} · ${JOB.aspect}`)
  console.log(`prompt: ${JOB.prompt.length} chars, sha256 ${sha256(JOB.prompt)}`)
  console.log(`cells: ${cells.map((c) => `r${c.row + 1}c${c.col + 1}=${c.handle}${c.colourwaySuffix ? '/' + c.colourwaySuffix : ''}`).join(' ')}`)
  process.exit(0)
}

fs.mkdirSync(OUT, { recursive: true })
const key = loadFalKey()
console.log(`[${new Date().toISOString()}] START ${JOB.id} promptChars=${JOB.prompt.length}`)
const ledgerId = chargeLedger(JOB)   // money first, picture second
const { requestId, outputs, wallMs, result } = await runFalRequest({
  key, model: JOB.model, input: falInput(JOB), timeoutMs: 600_000,
})
const file = path.join(OUT, `${JOB.id}.png`)
fs.writeFileSync(file, outputs[0].buffer)
// Prompt registry, the shape Ivan's directives 3.2 require: the shared part and the per-cell
// part stored APART, so a single larger re-render of one cell is sharedPreamble + that cell.
const sidecar = {
  id: JOB.id, ledgerId, kind: JOB.kind, model: JOB.model, resolution: JOB.resolution, aspect: JOB.aspect,
  predictionId: requestId, requestedAt: new Date().toISOString(), wallMs,
  file: path.relative(ROOT, file), bytes: outputs[0].buffer.length,
  reportedWidth: outputs[0].width, reportedHeight: outputs[0].height,
  gridFrame: GRID_FRAME, sharedPreamble: SHARED_PREAMBLE, negative: NEGATIVE,
  cells: JOB.cells,
  fullPromptSha256: sha256(JOB.prompt),
  fullPrompt: JOB.prompt,
  providerResult: result,
}
fs.writeFileSync(path.join(OUT, `${JOB.id}.json`), JSON.stringify(sidecar, null, 2) + '\n')
console.log(`[${new Date().toISOString()}] DONE ${JOB.id} request=${requestId} wall=${(wallMs / 1000).toFixed(1)}s bytes=${outputs[0].buffer.length} -> ${file}`)
