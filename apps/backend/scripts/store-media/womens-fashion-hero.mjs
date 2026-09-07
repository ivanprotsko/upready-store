// Rebuild the womens-fashion home hero so the headline has a surface to sit on.
//
// MEASURED, not assumed. The coverage gate on the live stand read the hero headline at
// **2.20:1** — rgb(246,244,241) on rgb(183,164,141) — against a 3.0 floor for large text.
// The storefront lays the headline out bottom-LEFT (`flex-col justify-end`, `max-w-[620px]`),
// while the rendered frame puts its window light on the left and its shadow on the right.
// Style board section 6 says the headline sits over the shadow side; the photograph and the
// layout disagreed, and the layout is not mine to change.
//
// Two operations, both in the PHOTOGRAPH, neither a scrim laid over it in CSS:
//   1. mirror horizontally, so the shadow half and the empty wall are on the left where the
//      copy goes and the figure moves to the right third;
//   2. ramp the bottom-left into the theme's own --background dark value, feathered, so the
//      darkening reads as the room falling away rather than as a black box.
//
// No render is bought here. This is the frame already paid for (ledger r-e5490056).
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import { repoRoot } from './frames.mjs'

const ROOT = repoRoot()
const PROFILE = path.join(ROOT, 'apps/backend/src/migration-scripts/data/profiles/womens-fashion')
const RAW = path.join(ROOT, 'artifacts/media/womens-fashion/raw')
const OUT = path.join(PROFILE, 'media', 'home-hero.webp')
const W = 1920, H = 900
const DARK = [0x14, 0x11, 0x0d] // --background, dark mode: the room falls away into the theme

const py = `
import json, sys
from PIL import Image

src = Image.open(sys.argv[1]).convert("RGB")
w, h = src.size
# same 16:9 window the slice took, then mirrored
tw = w; th = int(round(w * ${H} / ${W}))
if th > h:
    th = h; tw = int(round(h * ${W} / ${H}))
l = (w - tw) // 2; t = (h - th) // 2
im = src.crop((l, t, l + tw, t + th)).resize((${W}, ${H}), Image.LANCZOS)
im = im.transpose(Image.FLIP_LEFT_RIGHT)

# Ramp: saturated across the bottom-left quadrant where the headline is laid out,
# feathered from 25% to 60% of the height and from 55% to 97% of the width — the 390
# viewport centre-crops the frame, so a ramp that dies at mid-width dies inside the crop.
px = im.load()
dark = (${DARK[0]}, ${DARK[1]}, ${DARK[2]})
for y in range(${H}):
    fy = max(0.0, min(1.0, (y - ${H} * 0.25) / (${H} * 0.35)))   # 0 at 25% height, full by 60%
    for x in range(${W}):
        fx = max(0.0, min(1.0, 1.0 - (x - ${W} * 0.55) / (${W} * 0.42)))
        a = (fx ** 1.15) * (fy ** 0.80) * 0.95
        if a <= 0.002:
            continue
        r, g, b = px[x, y]
        px[x, y] = (int(r + (dark[0] - r) * a),
                    int(g + (dark[1] - g) * a),
                    int(b + (dark[2] - b) * a))

im.save(sys.argv[2], "WEBP", quality=90, method=6)

# What the headline actually sits on: the gate reads a box at the bottom-left,
# max-w 620 of a 1440-wide viewport scaled onto this 1920-wide frame.
bw = int(${W} * 620 / 1440); bh = int(${H} * 0.22)
box = im.crop((int(${W} * 0.04), ${H} - bh - int(${H} * 0.06), int(${W} * 0.04) + bw, ${H} - int(${H} * 0.06)))
data = list(box.getdata())
def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
lums = [0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]) for p in data]
worst = max(lums)                      # brightest pixel = worst case for cream copy
fg = 0.2126 * lin(246) + 0.7152 * lin(244) + 0.0722 * lin(241)
ratio = (fg + 0.05) / (worst + 0.05)
print(json.dumps({"headlineBoxPx": [int(${W}*0.04), ${H}-bh-int(${H}*0.06), bw, bh],
                  "worstBgLuminance": round(worst, 4),
                  "ratioAgainstBrightestPixel": round(ratio, 2)}))
`

const res = JSON.parse(
  execFileSync('python3', ['-c', py, path.join(RAW, 'womens-fashion-hero.png'), OUT], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }),
)
const sha = crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex')
const bytes = fs.statSync(OUT).size

// Keep the manifest truthful: same prediction, same dollar, new bytes and new hash.
const MAN = path.join(PROFILE, 'media', 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(MAN, 'utf8'))
const entry = manifest.entries.find((e) => e.file === 'media/home-hero.webp')
entry.sha256 = sha
entry.bytes = bytes
entry.params.note =
  'the one full-size frame kept outside the grid (Ivan directives 3.1); cropped to 1920x900, ' +
  'then mirrored and ramped into --background at the bottom-left so the headline has a surface ' +
  '(gate measured 2.20:1 before, style board section 6 requires the darkening to live in the photograph). ' +
  'No second prediction; same ledger row.'
entry.params.postProcess = {
  mirror: 'horizontal',
  ramp: { to: '#14110d', from: 'bottom-left', widthPct: 97, heightPct: 60, maxAlpha: 0.95 },
  headlineBoxPx: res.headlineBoxPx,
  worstBgLuminance: res.worstBgLuminance,
  ratioAgainstBrightestPixel: res.ratioAgainstBrightestPixel,
}
fs.writeFileSync(MAN, JSON.stringify(manifest, null, 2) + '\n')

console.log(
  `home-hero rebuilt ${W}x${H} bytes=${bytes} sha256=${sha.slice(0, 12)}… ` +
    `headline box worst-case background luminance ${res.worstBgLuminance} -> cream copy ${res.ratioAgainstBrightestPixel}:1`,
)
