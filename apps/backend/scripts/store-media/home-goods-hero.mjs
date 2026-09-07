// Rebuild the home hero from the cell already paid for (sheet B, r2c1 "scene-hero").
// No new prediction, no new dollar.
//
// Why it needs rebuilding at all. style-board.md section 6 says the darkening the
// copy sits on is IN the photograph, not a scrim rectangle. The delivered panel puts
// its window — the brightest thing in the frame — exactly where the storefront anchors
// the headline. Measured on the delivered crop, white copy over the copy region scores
// 2.99:1 at its worst pixel WITH the storefront's own scrim already composited: under
// AA, and invisible on a bright window.
//
// Two edits, both photographic and both stated:
//   1. the frame is mirrored, which puts the window on the right and the plaster corner
//      under the copy. Nothing in the frame is lettered or handed, so a mirror is a
//      framing choice, not a claim about a different room;
//   2. a feathered ramp of the frame's OWN darkest plaster tone runs in from the left,
//      which is the darkening section 6 asked the photograph to carry.
// The number that decides whether this worked is measured after the fact, over the
// storefront's real scrim, and printed. It is not asserted.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { repoRoot } from './frames.mjs'

const ROOT = repoRoot()
const PROFILE = path.join(ROOT, 'apps/backend/src/migration-scripts/data/profiles/home-goods')
const CELL = path.join(ROOT, 'artifacts/media/home-goods/raw/cells/b-scene-hero.png')
const OUT = path.join(PROFILE, 'media/home-hero.webp')

const py = `
import json, sys
import numpy as np
from PIL import Image

W, H = 1920, 900
RAMP_TO = 0.95          # ramp reaches zero at 95% of the width
RAMP_MAX = 0.88         # opacity at the very left edge

im = Image.open(${JSON.stringify(CELL)}).convert("RGB").transpose(Image.FLIP_LEFT_RIGHT)
im = im.resize((W, H), Image.LANCZOS)
a = np.asarray(im, dtype=float)

# The ramp colour is the frame's own darkest plaster, not an invented brown: the 3rd
# percentile of the pixels in the left third, per channel.
left = a[:, : W // 3].reshape(-1, 3)
tone = np.percentile(left, 3, axis=0)

x = np.clip(1.0 - np.arange(W) / (RAMP_TO * W), 0.0, 1.0) ** 1.4
alpha = (x * RAMP_MAX)[None, :, None]
out = a * (1 - alpha) + tone[None, None, :] * alpha

def lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def ratio_of(fg, bg):
    Lf = 0.2126 * lin(fg[..., 0]) + 0.7152 * lin(fg[..., 1]) + 0.0722 * lin(fg[..., 2])
    Lb = 0.2126 * lin(bg[..., 0]) + 0.7152 * lin(bg[..., 1]) + 0.0722 * lin(bg[..., 2])
    hi, lo = np.maximum(Lf, Lb), np.minimum(Lf, Lb)
    return (hi + 0.05) / (lo + 0.05)

def copy_ratio(px, alpha):
    # The storefront paints the headline at full white and the SUBHEADLINE at
    # text-ui-contrast-fg-primary/80 — white at 80 % alpha over the image. Measuring
    # pure white flatters the weaker of the two, which is the one a reader struggles
    # with, so the alpha is modelled rather than assumed away.
    fg = px * (1 - alpha) + 255.0 * alpha
    return ratio_of(fg, px)

# The storefront's own scrim, read out of profile-hero/index.tsx: a left-to-right
# gradient from --foreground at 60% to transparent. Measure THROUGH it, because that
# is what a reader actually sees.
FG = np.array([0x24, 0x1c, 0x16], dtype=float)
s = np.linspace(0.60, 0.0, W)[None, :, None]
seen = out * (1 - s) + FG[None, None, :] * s

x0, x1 = int(W * 0.016), int(640 / 1440 * W)
y0, y1 = int(H * 0.28), int(H * 0.56)
region = seen[y0:y1, x0:x1]
r_head = copy_ratio(region, 1.0)
r_sub = copy_ratio(region, 0.8)

Image.fromarray(out.round().clip(0, 255).astype("uint8")).save(
    ${JSON.stringify(OUT)}, "WEBP", quality=88, method=6)
print(json.dumps({
    "rampToneRgb": [round(v) for v in tone],
    "copyRegionPx": [x1 - x0, y1 - y0],
    "headlineWorst": round(float(r_head.min()), 2),
    "headlineMedian": round(float(np.median(r_head)), 2),
    "subheadWorst": round(float(r_sub.min()), 2),
    "subheadMedian": round(float(np.median(r_sub)), 2),
    "outPx": [W, H],
}))
`
const measured = JSON.parse(execFileSync('python3', ['-c', py], { encoding: 'utf8' }))
console.log(JSON.stringify(measured, null, 2))
const worst = Math.min(measured.headlineWorst, measured.subheadWorst)
console.log(worst >= 4.5
  ? `PASS — worst pixel under the copy is ${worst}:1 (headline ${measured.headlineWorst}, subheadline at 80% alpha ${measured.subheadWorst}), over AA 4.5`
  : `FAIL — worst pixel under the copy is ${worst}:1 (headline ${measured.headlineWorst}, subheadline at 80% alpha ${measured.subheadWorst}), under AA 4.5`)
