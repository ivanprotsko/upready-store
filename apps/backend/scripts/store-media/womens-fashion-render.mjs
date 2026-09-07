// Image production for the `womens-fashion` profile (Larchant), wave 2 W3.
//
// GEOMETRY IS NOT A FREE CHOICE. artifacts/docs/2026-09-08-grid-measurement.md measured a
// 3-column x 4-row layout of twelve panels holding one setup tightly (background luminance
// spread 7.8, 4.7% of level); artifacts/docs/2026-09-08-wave-electronics.md measured a 4x4
// of sixteen panels on the same script and the same model at spread 59.2, with drawn seams.
// This theme therefore has exactly TWELVE products and buys them as 3 columns x 4 rows —
// the measured-good geometry, one product per panel, one $0.30 prediction.
//
// Aspect: the theme frames at 4:5. A 3x4 grid of 4:5 cells would need a 3:5 canvas, which
// the model does not offer, so the canvas is 3:4 (cells come back near-square) and each cell
// is cropped to 4:5 downstream. The crop is a crop, not a render.
//
// Two conditions ride with the grid verdict and both are honoured downstream:
//   1. the panel count and the seams are READ OFF the returned image (grid-measure.py),
//      never assumed — a 3x3 was ordered in the measurement and a 3x4 came back;
//   2. transparency is never requested; alpha does not survive.
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
const PROFILE = path.join(ROOT, 'apps/backend/src/migration-scripts/data/profiles/womens-fashion')
const OUT = path.join(ROOT, 'artifacts/media/womens-fashion/raw')
const REGISTRY = path.join(ROOT, 'apps/backend/scripts/store-media/wave-registry.mjs')
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

const products = JSON.parse(fs.readFileSync(path.join(PROFILE, 'catalog/products.json'), 'utf8'))
const byHandle = Object.fromEntries(products.map((p) => [p.handle, p]))

// style-board.md section 5, said once for all twelve panels. Warm cream cyclorama, never
// white: an ivory garment on pure white loses its own edge, which is defect class A wearing
// a photographer's hat, and half this catalog is ivory.
const SHARED_PREAMBLE =
  'Editorial studio fashion photography contact sheet. Every panel shares one identical setup: ' +
  'seamless matte warm cream cyclorama background, flat pale sand tone, half a stop lighter at the top, no seam between floor and wall, no horizon line. ' +
  'One very large softbox key at 40 degrees camera-left and 25 degrees above, one full-height white bounce camera-right lifting the shadow side, neutral 5200K daylight, soft low-contrast light, no coloured light. ' +
  '85mm lens at f/8, camera at the chest height of the garment so the piece is seen straight on and hangs true, no perspective tilt. ' +
  'In every panel the garment is worn by an invisible mannequin so it holds a human shape with nobody inside it, is centred, square to camera, shown full length within the panel, fills 78 percent of the panel height, has clear space above and below, and carries exactly one soft feathered contact shadow directly beneath the hem, no cast side shadow, no reflection, matte floor. ' +
  'Sharp focus front to back, weave and knit texture clearly visible, matte fabrics stay matte, silk reads soft and not shiny.'

const GRID_FRAME =
  'The image is a grid of twelve separate photographs in four rows and three columns, all of equal size, edge to edge with no gutter, no border, no frame line, no caption, no numbering. ' +
  'The twelve panels are identical in exposure, white balance, background tone, camera height and subject scale, as if shot in one session on one set and laid out afterwards.'

const NEGATIVE =
  'real logos, brand marks, monograms or wordmarks of any kind, legible text, letters or numbers anywhere in the frame including on labels, tags, buttons and hardware, ' +
  'a cut, print or hardware detail copied from an existing fashion house, ' +
  'human faces, heads, hands or bare skin, a person wearing the garment, ' +
  'hangers, rails, visible mannequin stands, plinths, boxes, tissue paper, furniture, plants or phones, ' +
  'coloured or gradient backgrounds, coloured gels, neon or rim-light flare, ' +
  'wet, glossy or mirrored floor, reflections, a second shadow, a floating garment, ' +
  'top-down flat lay, dutch angle or tilted horizon, shallow depth of field, bokeh or motion blur, ' +
  'HDR, oversaturation, heavy vignette or visible upscaling artefacts, anything that names a real place or a real shop, ' +
  'caption, label, number, grid line, border, drop shadow between panels, collage frame, transparency, checkerboard pattern'

// Reading order, row by row, three per row. Twelve products, twelve panels, no spares:
// a surplus row is what the measurement got for free, not something to design for.
const ORDER = [
  'ondine-slip-dress', 'perrin-knit-dress', 'sevre-wrap-dress',
  'aubin-merino-crew', 'vaux-longline-cardigan', 'orne-wool-scarf',
  'mazan-silk-shirt', 'carre-silk-square', 'tille-wide-trouser',
  'noyer-bias-skirt', 'belair-wool-overcoat', 'quessant-quilted-jacket',
]

const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1)

// Three of the twelve are not garments worn on a form — the scarf, the silk square and the
// two lower-body pieces need their own staging sentence. W2 owed this list to the producer
// BEFORE any render was paid for; it is the pilot defect that burned three of nineteen frames.
const STAGING = {
  'orne-wool-scarf':
    'Template variant V-drape: no mannequin. The scarf hangs vertically, folded once lengthwise and looped, filling the panel height, both fringed ends visible.',
  'carre-silk-square':
    'Template variant V-drape: no mannequin. The square is folded into a soft triangle and draped over an invisible support so it hangs as a cone, the rolled edge visible along the front.',
  'tille-wide-trouser':
    'Template variant V-lower: the invisible form is a lower-body form only, from the waist down, the trouser hanging full length to the floor.',
  'noyer-bias-skirt':
    'Template variant V-lower: the invisible form is a lower-body form only, from the waist down, the skirt hanging full length.',
}
const DEFAULT_STAGING =
  'Template variant V-form: the garment is worn by a full invisible mannequin, square to camera, arms slightly away from the body so the silhouette reads.'

const cells = ORDER.map((h, i) => ({
  index: i,
  row: Math.floor(i / 3),
  col: i % 3,
  handle: h,
  colourwaySuffix: null,
  subjectClause: lower(byHandle[h].imageBrief.subject) + ' ' + (STAGING[h] || DEFAULT_STAGING),
}))

const GRID_PROMPT =
  `${GRID_FRAME}\n\n${SHARED_PREAMBLE}\n\n` +
  'The twelve panels show twelve different garments, one per panel, listed row by row:\n' +
  cells.map((c) => `Row ${c.row + 1}, column ${c.col + 1}: ${c.subjectClause}`).join('\n') +
  `\n\nDo not include: ${NEGATIVE}`

// The one full-size frame Ivan's directives 3.1 keep outside the grid: the campaign hero the
// portfolio screenshot is taken from. Chosen BEFORE generation, as 3.1 requires — it is the
// home hero, not a product page, because this profile's hero is full-bleed.
const HERO_PREAMBLE =
  'Editorial fashion campaign photograph, full bleed, wide horizontal frame. ' +
  'A single figure stands in a bare plastered room with warm cream walls, photographed from behind and slightly to the side so no face and no head are visible — the frame is cropped at the shoulder line, showing the garment and the room, never the person. ' +
  'She wears a long bias-cut ivory silk slip dress that falls in soft vertical folds to the ankle, with a large brushed cream wool scarf held loosely over one forearm. ' +
  'Late afternoon daylight rakes in from a tall window at the left, throwing one long soft shadow across a bare pale floor; the right of the frame falls away into deep shadow so a headline can sit on it. ' +
  '50mm lens at f/4, camera at chest height, the figure placed on the left third, the right half of the frame empty wall and shadow. ' +
  'Muted warm palette of cream, sand and near-black, low contrast, matte film grain, no colour cast.'

const HERO_PROMPT = `${HERO_PREAMBLE}\n\nDo not include: ${NEGATIVE}`

const JOBS = {
  grid: {
    id: 'womens-fashion-grid-3x4',
    kind: 'grid-3x4',
    model: 'fal-ai/nano-banana-pro',
    resolution: '4K',
    aspect: '3:4',
    purpose: 'product-grid',
    prompt: GRID_PROMPT,
    cells,
  },
  hero: {
    id: 'womens-fashion-hero',
    kind: 'single',
    model: 'fal-ai/nano-banana-pro',
    resolution: '2K',
    aspect: '16:9',
    purpose: 'hero',
    prompt: HERO_PROMPT,
    cells: [],
  },
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
    '--theme', 'womens-fashion',
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

const which = process.argv.includes('--job') ? process.argv[process.argv.indexOf('--job') + 1] : 'grid'
const JOB = JOBS[which]
if (!JOB) {
  console.error(`unknown --job ${which}; expected one of ${Object.keys(JOBS).join('|')}`)
  process.exit(2)
}

if (!process.argv.includes('--spend')) {
  console.log('DRY RUN — nothing sent, no money spent. Pass --spend to run 1 prediction.')
  console.log(`${JOB.id} · ${JOB.kind} · ${JOB.model} · ${JOB.resolution} · ${JOB.aspect}`)
  console.log(`prompt: ${JOB.prompt.length} chars, sha256 ${sha256(JOB.prompt)}`)
  if (JOB.cells.length)
    console.log(`cells: ${JOB.cells.map((c) => `r${c.row + 1}c${c.col + 1}=${c.handle}`).join(' ')}`)
  process.exit(0)
}

fs.mkdirSync(OUT, { recursive: true })
const key = loadFalKey()
console.log(`[${new Date().toISOString()}] START ${JOB.id} promptChars=${JOB.prompt.length}`)
const ledgerId = chargeLedger(JOB) // money first, picture second
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
  gridFrame: which === 'grid' ? GRID_FRAME : null,
  sharedPreamble: which === 'grid' ? SHARED_PREAMBLE : HERO_PREAMBLE,
  negative: NEGATIVE,
  cells: JOB.cells,
  fullPromptSha256: sha256(JOB.prompt),
  fullPrompt: JOB.prompt,
  providerResult: result,
}
fs.writeFileSync(path.join(OUT, `${JOB.id}.json`), JSON.stringify(sidecar, null, 2) + '\n')
console.log(
  `[${new Date().toISOString()}] DONE ${JOB.id} request=${requestId} wall=${(wallMs / 1000).toFixed(1)}s ` +
    `bytes=${outputs[0].buffer.length} reported=${outputs[0].width}x${outputs[0].height} -> ${file}`,
)
