// Build the full-bleed home hero from a frame that is ALREADY PAID FOR (grid cell r1c1,
// bench-over-ear). No new prediction, no new dollar.
//
// style-board.md section 6 specifies the hero as: the product on the right of the frame,
// the backdrop darkening to the LEFT into --background, so the headline sits on a
// continuous surface "rather than in a box. No scrim, no gradient overlay with an opacity
// — the darkening is IN the photograph, because a scrim over an image is the pilot's cause
// A wearing a costume."
//
// The delivered square crop did not do that, and the coverage gate caught it: the storefront
// paints the hero h1 with `text-ui-contrast-fg-primary`, which the theme bridge lists among
// its OPEN rows (no canon counterpart), so it resolves to the vendor's white in BOTH modes.
// White copy on a flat mid-grey cyclorama measured 1.00:1 over media in light mode. The fix
// belongs to the image, not to a text colour: the board already said the photograph darkens.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { repoRoot } from './frames.mjs'

const ROOT = repoRoot()
const MEDIA = path.join(ROOT, 'apps/backend/src/migration-scripts/data/profiles/electronics/media')

const py = `
from PIL import Image
import json
src = Image.open(${JSON.stringify(path.join(MEDIA, 'bench-over-ear-hero.webp'))}).convert("RGB")
W, H = 1920, 900
cell = src.resize((H, H), Image.LANCZOS)                 # 900 x 900, the product

# The backdrop of this frame is flat by measurement (per-channel corner spread <= 4), so the
# canvas is filled with the cell's OWN backdrop tone rather than an invented grey.
patch = cell.crop((6, 6, 46, 46)).resize((1, 1), Image.LANCZOS).getpixel((0, 0))
canvas = Image.new("RGB", (W, H), patch)
canvas.paste(cell, (W - H, 0))                            # product occupies the right 900 px

# Feather the seam where the pasted cell meets the filled backdrop: a 120 px linear blend,
# so there is no vertical edge in a photograph that is meant to read as one cyclorama.
seam_x, feather = W - H, 120
px = canvas.load()
left_col = [canvas.getpixel((seam_x - 1, y)) for y in range(H)]
for y in range(H):
    for i in range(feather):
        x = seam_x + i
        t = i / feather
        a, b = left_col[y], cell.getpixel((i, y))
        px[x, y] = tuple(int(a[c] * (1 - t) + b[c] * t) for c in range(3))

# The darkening, in the photograph: a left-to-right ramp into --background #0d1013, full at
# the left edge, gone by 62 percent across, which keeps the product itself untouched.
BG = (0x0d, 0x10, 0x13)
end = int(W * 0.62)
for x in range(end):
    t = (1 - x / end) ** 1.35          # strongest at the very left, eased out
    for y in range(H):
        c = px[x, y]
        px[x, y] = tuple(int(c[i] * (1 - t) + BG[i] * t) for i in range(3))

canvas.save(${JSON.stringify(path.join(MEDIA, 'home-hero.webp'))}, "WEBP", quality=90, method=6)

# Measure what the headline will actually sit on: the copy block is inside content-container,
# left half, vertically centred-to-low. Sample that region and report its luminance.
def luma(c): return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
region = canvas.crop((int(W * 0.06), int(H * 0.45), int(W * 0.45), int(H * 0.92)))
sm = region.resize((1, 1), Image.LANCZOS).getpixel((0, 0))
mx = max((region.getpixel((x, y)) for x in range(0, region.width, 7) for y in range(0, region.height, 7)), key=luma)
def ratio(a, b):
    def f(v):
        v = v / 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    L = lambda c: 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
    la, lb = L(a), L(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
print(json.dumps({"size": [W, H], "backdropFill": patch,
                  "copyRegionMeanRgb": sm, "copyRegionBrightestRgb": mx,
                  "whiteOnMean": round(ratio((255, 255, 255), sm), 2),
                  "whiteOnBrightest": round(ratio((255, 255, 255), mx), 2)}))
`
const out = execFileSync('python3', ['-c', py], { encoding: 'utf8' })
console.log(out.trim())

// The manifest row for the hero was written by the slicer as a straight copy of the square
// cell. It is no longer that file, so the row is re-measured rather than left to describe a
// file that has been replaced — a manifest that disagrees with the bytes on disk is the
// defect class this whole wave is trying to retire.
import crypto from 'node:crypto'
import fs from 'node:fs'
const manifestPath = path.join(MEDIA, 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const heroFile = path.join(MEDIA, 'home-hero.webp')
const row = manifest.entries.find((e) => e.file === 'media/home-hero.webp')
const measured = JSON.parse(out)
row.sha256 = crypto.createHash('sha256').update(fs.readFileSync(heroFile)).digest('hex')
row.width = measured.size[0]
row.height = measured.size[1]
row.bytes = fs.statSync(heroFile).size
row.params = {
  ...row.params,
  postProcess: 'scripts/store-media/electronics-hero.mjs',
  postProcessNote:
    'grid cell r1c1 scaled to 900px, laid on a 1920x900 canvas filled with the frame own sampled backdrop rgb(' +
    measured.backdropFill.join(',') + '), seam feathered 120px, then a left-to-right ramp into --background #0d1013 out to 62% width, as style-board section 6 specifies',
  copyRegionBrightestRgb: measured.copyRegionBrightestRgb,
  whiteOnBrightestCopyRegion: measured.whiteOnBrightest,
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`manifest row updated: ${row.width}x${row.height}, ${row.bytes} bytes, sha256 ${row.sha256.slice(0, 12)}…`)
