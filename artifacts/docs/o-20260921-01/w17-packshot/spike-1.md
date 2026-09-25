# W17 spike 1: `exact` vs `rerender` on real WB cards (t-2026-09-25-n17)

Date 2026-09-25, branch `feat-image-gen-extension`, worker W17. Contact sheet:
`/Users/ivanprotsko/upready/worktrees/upready-store/feat-image-gen-extension/artifacts/docs/o-20260921-01/w17-packshot/spike-1.png`
(rows = sources, columns = source | exact | rerender, red line = the measured base of each result).

Pipeline: `apps/backend/src/packshot/` run by
`node apps/backend/scripts/packshot/packshot-cli.mjs <dir> --out <dir> --mode exact|rerender` (engine `auto`,
shadow on). Sources: copies from `/Users/ivanprotsko/upready/projects/nextjs-utils/data/input/` in
`apps/backend/scripts/packshot/samples/` (not committed). Results measured with
`node apps/backend/scripts/packshot/measure.mjs` (reads the PNG only, never the meta).

## What is the same for every result (measured)

All 16 results: 1620×2160, border ring min channel 255, base row 1900, base 88.009 % of the height
(the contact line sits on the pixel edge `round(2160 × 0.88) = 1901`), spread between results
**0.000 %**, `below_base_foreign = 0` (nothing under the base that a neutral contact shadow cannot
explain, so no reflection). The shadow is always the synthetic ellipse, never generated.

## Per file

| source | kind | mode | engine | base % | shadow/reflection cut | fal $ | wall s | what went wrong |
|---|---|---|---|---|---|---|---|---|
| 1023462391__1.webp | busy (shampoo box + bottle, ginseng, beach) | exact | bria | 88.009 | width-bulge @1036 | 0.018 | 20.9 | bria kept the «100 % натуральных ингредиентов» badge and the ginseng root |
| 1023462391__1.webp | | rerender | render + local | 88.009 | - | 0.150 | 42.7 | clean: box + bottle only; label redrawn by the model |
| 1123407549__1.webp | busy (white jar + suppositories, grey) | exact | bria | 88.009 | width-bulge @950 | 0.018 | 12.3 | bria kept the «10 штук» badge; the suppositories in front of the jar were cut as if they were a shadow bulge |
| 1123407549__1.webp | | rerender | render + local | 88.009 | - | 0.150 | 35.6 | clean jar; the suppositories are gone (the model dropped the second object) |
| 1199650252__1.webp | busy (toothpaste tin + box, model's face, herbs) | exact | bria | 88.009 | - | 0.018 | 16.1 | **unusable**: bria kept the model's face, the leaves, the flag and the «25 гр» badge |
| 1199650252__1.webp | | rerender | render + local | 88.009 | - | 0.150 | 43.6 | clean tin + box; the tin is drawn from a higher angle than the source (shape changed) |
| 147949507__1.webp | busy (bottle, water splash, badges) | exact | bria | 88.009 | - | 0.018 | 18.6 | good; the bottom of the bottle follows the splash outline, slightly pointed |
| 147949507__1.webp | | rerender | render + local | 88.009 | - | 0.150 | 43.4 | clean, straight bottom |
| 291137297__1.webp | busy (castor-oil bottle on wood, forest) | exact | bria | 88.009 | - | 0.018 | 13.0 | bria kept the «Сделано в Индии / Премиум продукт» badge next to the bottle |
| 291137297__1.webp | | rerender | render + local | 88.009 | - | 0.150 | 38.3 | clean |
| 310610865__1.webp | busy (jar «Свечи Мумиё», grey, badges) | exact | bria | 88.009 | - | 0.018 | 14.0 | **good**: jar only, badges and flag gone |
| 310610865__1.webp | | rerender | render + local | 88.009 | - | 0.150 | 39.2 | clean |
| 219762882__24.webp | white (2 tubes + box) | exact | local | 88.009 | - | 0 | 0.7 | good |
| 7272439422.jpg | white, but an infographic (organ figures, drops, text) | exact | auto: local → bria | 88.009 | width-bulge @1048 | 0.018 | 19.0 | the flood fill kept the whole layout (43 % of the area in figures and letters), so auto switched to bria; bria still kept the organ figures and the drops |
| 228059336__1_studio.png | Ivan's studio render, dark bottle with a mirror reflection | exact | local | 88.009 | dark-base @2233 | 0 | 4.2 | good: the reflection was cut at the bottom ring (the lead's dark-base rule) |
| 9021416536_studio.png | Ivan's studio render, white jar with shadow | exact | local | 88.009 | dark-base @1971 | 0 | 3.7 | good |

Wall time per image: local 0.7–4 s, bria 12–21 s, rerender (nano-banana-pro/edit 2K) 36–44 s.

## Determinism (acceptance line 3)

- Local path, same source and options twice: **byte-identical** (sha256 equal) on 219762882__24,
  228059336__1_studio and 9021416536_studio.
- Bria: 310610865__1 twice gave identical bytes, but 7272439422 did not (41 521 of 10 497 600 bytes
  apart, up to 60 levels). Bria RMBG is not byte-deterministic on every picture, so the pipeline now
  caches the Bria cutout by the sha256 of the picture for the life of the backend process: a repeat is
  byte-identical and costs nothing. After a restart a new call can differ by those few pixels.
- Rerender is not deterministic by nature (a fixed seed from the source hash is sent, the model does not
  promise to honour it). Its base line and shadow are.

## fal.ai spend of the spike

$1.116 in total (cap $1.50): 6 bria for exact $0.108, 6 re-renders $0.900, and $0.108 on bria for the
determinism check and the auto fallback. One of those ($0.036) was a mistake of mine: the first version
of the local→bria fallback also fired on 219762882__24 (three separate large objects), fixed by counting
only small islands (`clutter_share`). Prices from the model pages on 2026-09-25: bria $0.018 per call,
nano-banana-pro/edit $0.15 per image at 1K/2K, $0.30 at 4K.

## What Ivan decides on this sheet

- `exact` (bria) is enough for 2 of 6 busy cards as they are (310610865, 147949507), almost for 2 more
  (a badge next to the product survives: 291137297, 1023462391), and fails where a person or props touch
  the product (1199650252) or a second object lies in front of it (1123407549).
- `rerender` cleaned all 6, at $0.15 and ~40 s each, but the model redraws the product: the angle of the
  tin changed on 1199650252 and the second object disappeared on 1123407549. The label text has to be
  checked by eye on every render (it is labelled «форма может измениться» in the panel).
- Proposal: keep `exact` as the default (free on white, $0.018 elsewhere) and show `rerender` as the
  explicit second button for WB cards with people, props or badges. Ivan's call.
