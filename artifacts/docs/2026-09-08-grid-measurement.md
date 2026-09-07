# 3x3 grid measurement — does one prediction buy nine product images?

Measured 2026-09-08 03:32–04:15 WITA, night wave, agent working from the main checkout on
`dev` at `6a95b98`. Three renders on fal.ai, $0.378 spent of the $6.00 ceiling. Every render
was written to `artifacts/wave/spend.json` through `wave-registry.mjs spend add` **before**
the request was sent, so the ledger cannot read "free" the way the pilot's did.

## Verdict

**Grid. Buy product images as grids, not as single frames.**

The one measurement that decides it: **nine of nine requested products came back, each in the
cell it was asked for, at 1365 x 1024 px per cell, for a single $0.30 prediction** — $0.033 per
usable product image, against $0.039 for one 1024x1024 frame from the cheap model and $0.15 for
one 2048x2048 frame from the same model that produced the grid. The grid is simultaneously the
cheapest per image and the largest per image.

One condition rides with it, and it is not optional:

> **The panel count must be read from the returned image, never assumed.** A 3x3 grid was
> ordered; a 3x4 grid came back. Twelve panels, of which rows 1–3 are exactly the nine products
> that were asked for, in reading order, and row 4 is three invented near-duplicates of row 3.
> The surplus row cost nothing (the price is per prediction, not per panel), but a slicer that
> assumes nine cells will cut the catalog wrong.

## 1. Do the cell borders land where arithmetic says?

Yes — to a fraction of a pixel, once you know how many rows there are.

Borders were located as full-length discontinuities in the mean absolute luminance derivative
(`apps/backend/scripts/store-media/grid-measure.py`, `auto_peaks`), and the cells were then cut
**on the borders found**, never on thirds.

**G1 — `fal-ai/nano-banana-pro`, 4K, 4096 x 4096 px**

| border | found (px) | exact (px) | delta | signal / noise floor |
|---|---|---|---|---|
| column 1 \| 2 | 1365 | 1365.3 (W/3) | **−0.3** | 4.65 (measured in a clean background band) |
| column 2 \| 3 | 2731 | 2730.7 (2W/3) | **+0.3** | 7.63 (measured on the top 5% background strip) |
| row 1 \| 2 | 1024 | 1024.0 (H/4) | **0.0** | 10.37 |
| row 2 \| 3 | 2048 | 2048.0 (H/2) | **0.0** | 11.48 |
| row 3 \| 4 | 3072 | 3072.0 (3H/4) | **0.0** | 12.56 |

The column borders are nearly invisible: across the whole 4096-px-wide image the strongest
vertical discontinuity scores only 2.58x the median edge energy, and the two real borders had to
be measured in strips of pure backdrop to separate them from shoe edges. That faintness is not a
defect — it is the consistency result restated: adjacent panels share a background tone so
closely that the seam between them barely exists.

A caution for whoever automates this. The first pass of the detector reported the grid as 3x3
and put the column borders at 1312 and 2688 — both wrong. Two bugs, both worth knowing:
a non-maximum-suppression window of 5% of the side swallowed the true border at y=1024 because a
shadow line 181 px away scored fractionally higher, and with no vertical seam to find the code
fell back to gaps between subjects, which are not borders. **Content valleys are not panel
edges.** The window is now 2% and the script takes `--borders-x/--borders-y` overrides.

**G2 — `fal-ai/nano-banana`, 1024 x 1024 px**

| border | found (px) | exact (px) | delta | SNR |
|---|---|---|---|---|
| column 1 \| 2 | 345 | 341.3 | +3.7 | 44.0 |
| column 2 \| 3 | 688 | 682.7 | +5.3 | 39.2 |
| row 1 \| 2 | 335 | 341.3 | −6.3 | 51.2 |
| row 2 \| 3 | 689 | 682.7 | +6.3 | 57.3 |

Here the seams are unmistakable because the model drew what it was explicitly told not to draw:
a white gutter, 9 px wide between columns (x = 336…344) and 9 px between rows (y = 335…343),
plus a border around the outside. The prompt's "edge to edge with no gutter, no border, no frame
line" was ignored. Exact thirds do fall inside those gutters, so thirds happen to work for this
image — but each cell then carries a ~5 px white edge that has to be trimmed.

## 2. Does the model hold one setup across the panels?

**G1: yes, tightly.** Twelve cells, cut on the found borders, each 1365 x 1024 px (one column
1366 wide — a rounding pixel, not a drift).

| what | measured across the 12 cells | reading |
|---|---|---|
| background RGB | spread 7 / 8 / 7 per channel | one backdrop |
| background luminance | 161.6 … 169.4, spread **7.8** (4.7% of level), σ 2.24 | one exposure, one white balance |
| subject width in its panel | 86.7% … 100.0%, spread **13.3 pp** | scale drifts; the prompt asked for 80% and the model overshot every panel |
| subject vertical centre | 48.4% … 60.9%, spread **12.5 pp** | shoes sit at noticeably different heights in their panels |
| backdrop falloff, vertical (dL/dy) | +8.8 … +32.4, **never reversed** | the backdrop brightens downward in every panel, but 3.7x more steeply in some than others |
| backdrop falloff, horizontal (dL/dx) | −6.9 … −0.3 in ten panels, **+26.2 and +29.7 in r2c1 and r2c3** | two panels of twelve light the backdrop from the opposite side |

By eye — and this one is by eye, as instructed — the key light reads as camera-left in all twelve
panels: highlights along the toe and the upper's left face, one soft contact shadow directly
under the outsole, no cast side shadow, no reflection. Camera height reads as consistent
(midsole level, very slightly from below) in all twelve. The two panels with the flipped
horizontal backdrop gradient (the black high-top and the burgundy boot) do not read as
differently lit *subjects*; it is the backdrop behind them that falls off the other way.

The material match to the briefs is good enough to assign cells to SKUs by position without
looking them up: r1 = the three low-tops (black leather with the acid heel tab, off-white canvas,
grey nubuck), r2 = the three high-tops (black leather, waxed canvas, red-brown leather), r3 = the
three runners (off-white mesh, acid knit, grey mesh). Row 4 repeats the three runners as new
designs — a striped off-white, a slightly different knit, a different grey sole.

**G2: markedly worse, on the cheap model.** Background luminance spread **13.1** (10.1% of
level, σ 4.34) against G1's 7.8 / 4.7% — the panels visibly differ in backdrop brightness and
vignetting, and the vertical falloff ranges from +14.8 to +86.6, a 5.8x swing. The nine
requested views are all present and correct (three-quarter, both profiles, front, rear, top-down,
outsole, heel detail, eyelet detail). Per-panel subject scale could not be measured here: once
the white gutter is inside the crop it dominates the texture mask, so the reported 98.8–100%
is a fact about the detector, not the picture.

## 3. Does alpha survive?

**No, and the failure is a trap.**

`t1-transparent.png` is 1024 x 1024, PIL mode **RGB — no alpha channel at all**. The background
is not transparent: the model *painted a transparency checkerboard as opaque pixels*, alternating
255,255,255 and 240,240,240 squares. It renders as a cut-out in any preview and is fully opaque
in every compositing context. The prompt asked for an empty alpha channel and listed
"checkerboard pattern" among the negatives; both were ignored.

Practical consequence for the wave: **do not ask this model for transparent PNGs.** If the
storefront needs cut-outs, key them from the flat grey backdrop afterwards — G1's backdrop is
flat enough for that (per-channel spread ≤ 8 across twelve panels) — or simply keep the grey
backdrop as the store's product background.

## 4. What a usable cell is at full size

| | model | frame | cells | cell size | price | per usable image |
|---|---|---|---|---|---|---|
| G1 | nano-banana-pro 4K | 4096² | 12 (9 asked for) | **1365 x 1024** | $0.300 | **$0.033** (9) / $0.025 (12) |
| G2 | nano-banana | 1024² | 9 | 341 x 341 | $0.039 | $0.004 |
| single frame, cheap | nano-banana | 1024² | 1 | 1024 x 1024 | $0.039 | $0.039 |
| single frame, pro 2K | nano-banana-pro 2K | 2048² | 1 | 2048 x 2048 | $0.150 | $0.150 |

1365 x 1024 is a product image — larger than a full frame from the cheap model, and it costs a
fifth of what a single 2K frame costs. 341 x 341 from the cheap grid is a thumbnail; it is fine
for category tiles and PDP gallery strips and nothing else.

**Wave arithmetic:** eight themes, one 4K grid each = **$2.40 of the $6.00 ceiling**, leaving
$3.60 for heroes, tiles and reshoots. That is what makes eight themes fit.

## 5. How the wave should use this

1. Buy the product set as **one `fal-ai/nano-banana-pro` prediction at `resolution: "4K"`,
   `aspect_ratio: "1:1"`** — $0.30, ledgered before the call.
2. Run `grid-measure.py <png> --cells-dir …` on what comes back and **read the row and column
   count off the borders it reports**. Do not assume 3x3.
3. Cut on those borders, take the first nine cells in reading order, discard the surplus.
4. Look at the sheet once. The nine landed in order this time; that is evidence, not a guarantee.
5. Never ask for transparency.

## Provenance

| render | ledger row | fal request id | model | seconds | bytes | accepted |
|---|---|---|---|---|---|---|
| g1-nine-products | `r-06cb8818` | `01a07d5b-626a-7e63-a9a6-1de54d0cece3` | nano-banana-pro 4K | 63.5 | 21 072 087 | yes |
| g2-nine-views | `r-72cf825a` | `01a07d5c-5a60-7183-9985-c5219efeca73` | nano-banana | 12.0 | 1 262 918 | yes |
| t1-transparent | `r-1d9e686c` | `01a07d5c-8754-7a20-acab-057e02bbfeb9` | nano-banana | 9.2 | 1 054 123 | no — alpha failed |

Ledger after the run: **$0.378 spent of $6.00**, 3 renders, soft stop not reached, dashboard
figure not read (never guessed). Images, per-render sidecars with the full prompts and their
sha256, the measurement JSON and the sliced cells are all under
`artifacts/media/_experiments/2026-09-08-grid-3x3/`.

Prices are the fal.ai model-page figures measured 2026-09-08 02:20 WITA and encoded in
`wave-registry.mjs`; the provider's own dashboard total has not been read and must not be
guessed from this document.
