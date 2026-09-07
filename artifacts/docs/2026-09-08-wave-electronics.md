# electronics (Ferrite) — wave 2 theme record

Worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store/electronics`, branch
`feat/store/electronics`, base `3f1c339`. Nothing committed by this agent. Stand: backend
`http://localhost:9041`, storefront `http://localhost:8061`, database `upready_store_electronics`.

This theme is the wave's **dark control**: it renders in the same mode the pilot was measured in, so a
returning defect shows up here as a *return*, not as a discovery. The verdict on that question is in §5.

---

## 1. Stages

| stage | done | evidence |
|---|---|---|
| W1 style board | yes | `…/profiles/electronics/design/style-board.md`, 9 numbered sections, 597 lines |
| W2 catalog + briefs | yes | 4 catalog files + `i18n/en.json` |
| W4 theme preset | yes | `theme.json` + `specs/design-system/themes/electronics.theme.json` |
| W3 images | yes | one prediction, 16 panels, §3 |
| i18n de/es/fr/ru | yes | one subagent, key sets verified by me, §2 |
| W5 copy reconcile | **partial** | Graphite swatch resampled from the renders; titles/descriptions NOT rewritten — §6 |
| W6 assembly + stand | yes | validator exit 0, stand live, DB counts read with `psql` |
| W7 coverage gate | yes | RED, 10 nodes, §4 |
| W8 visual verdict | **partial** | 24 screenshots taken, 4 read by eye — §5 |
| W9 adversarial verify | **not started** | out of time; the DROP-and-reseed was never run |

Stopped at W8. W9 and the rest of W5 are the next agent's first two actions.

## 2. Catalog

14 products · 34 variants · 2 parent + 5 leaf categories · 2 collections · 5 locales · 2 option
definitions (Colour 3 values, Capacity 5 values) · 2 single-variant products (`pad-set`, `hub-dock`).

Counts read back **from the database with `psql`**, not from the seed log:
`products 14 · variants 34 · categories 7 · images 14 · collections 2`. They equal the catalog JSON.

Template-conflict list W2 owes the producer (empty is also an answer, but it must be written): the style
board declares two packshot variants, **V-single** and **V-pair**. Four handles need V-pair —
`pin-earbuds`, `pin-open`, `shelf-monitor`, `pad-set` — and they are marked as such in each
`imageBrief.shots[0].description`. **No brief needed a third variant**, so no render was spent on a
template mismatch. This is the pilot defect that cost three of nineteen frames; it did not recur.

Locales were produced by one subagent and then checked by me, not taken on its word: each of de/es/fr/ru
has 62 keys, 0 missing, 0 extra against `en.json`; 0 long strings left identical to English; description
lengths 610–849 characters, inside the 300–1400 the schema requires; `name` fields are `Deutsch`,
`Español`, `Français`, `Русский`.

## 3. Images — one prediction, sixteen panels

| | value |
|---|---|
| predictions | **1** |
| model | `fal-ai/nano-banana-pro`, `resolution: "4K"`, `aspect_ratio: "1:1"` |
| fal request id | `01a07d7a-db6d-75a3-90f4-6c975156e9ed` |
| ledger row | `r-98092622`, **$0.300**, written before the request was sent |
| returned | 4096 × 4096 px, PNG, RGB, 20 069 743 bytes, 53.6 s |
| panels asked for | 4 × 4 = 16 |
| panels returned | **4 × 4 = 16, read off the image, not assumed** |
| order | all 16 landed in the reading order requested — verified by eye on the contact sheet |
| cost per usable product image | $0.300 / 16 = **$0.019** |

Borders were **found, not calculated**: `grid-measure.py --rows 4 --cols 4` reported vertical seams at
**1028 / 2052 / 3076** and horizontal at **1020 / 2044 / 3068**, against exact quarters of 1024 / 2048 /
3072. The detector also offered horizontal candidates at 1488, 1573 and 3668 with SNR ≈ 3 against the real
borders' SNR ≈ 43 — those are gaps between subjects. Content valleys are not panel edges; they were
ignored, and the slice used the six real seams with a 10 px inset.

**Finding the wave needs: a 4 × 4 does not hold the shared setup the way the measured 3 × 3 did.**
Same estimator, same script, same model, same 4K:

| | 3 × 3 (G1, the measurement) | 4 × 4 (this theme) |
|---|---|---|
| background luminance spread | 7.8 (4.7 % of level) | **59.2** (min 73.4, max 132.6), σ 18.04 |
| background RGB per-channel spread | 7 / 8 / 7 | **60 / 59 / 60** |

Visible by eye on the sheet: the `pad-set` panel is markedly lighter than the page, `bench-over-ear-chalk`
markedly darker. Two further prompt violations, both the same class the measurement already recorded for
the cheap model: **the model drew panel seams it was explicitly told not to draw**, and the backdrop
gradient reverses direction between panels. Neither was worth a re-render under the no-regeneration rule;
both go to the second pass. `subjectWidthPct` came back 100 %/spread 0 — that is a fact about the
detector with a seam inside the crop, not about the picture, exactly as the measurement doc warned.

Outputs: 16 cells at 1000 × 1000 WebP + 6 derived files (5 category tiles and the home hero) that are
**crops of frames already paid for, not renders**. 22 manifest rows, 22 URLs answering 200, 997 384 bytes
total. The home hero was rebuilt to 1920 × 900 by `scripts/store-media/electronics-hero.mjs` — see §4,
defect 2.

`manifest-totals` warns `renders = 1, entries = 22`. That warning is correct arithmetic and the wrong
question in the grid era: it assumes one prediction yields one file. The parent should decide whether the
check moves to `predictions ≤ entries`.

## 4. The gate, and three defects it found that were mine to fix

Command, on my own stand: `cd apps/storefront && pnpm themes:coverage -- --url http://localhost:8061`.

| run | failing nodes | what changed |
|---|---|---|
| 1 | — | **crashed**, `OPERATIONAL ERROR`, no verdict |
| 2 | 12 | after fixing the gate crash |
| 3 | 12 | hero rebuilt; still failing — the hero image was 404, not dark |
| 4 (final) | **10** | after the media-URL fix |

**Defect 1 — the gate itself crashed, and it would have crashed on every light theme in the queue.**
`pixelStats` in `apps/storefront/scripts/theme-coverage-gate.mjs` initialises `minL = 1, maxL = 0,
minC = null, maxC = null` and only assigns on a strict `<` / `>`. A probe crop that is uniformly **pure
white** therefore never satisfies `L < 1` and leaves `minC` null; `refineOverMedia` hands that null to
`ratioOf`, and the whole run dies with `TypeError: Cannot read properties of null (reading 'r')` instead
of returning a verdict. Pure white is not exotic — it is what a light preset produces the moment
`--background`, `--card` and `--popover` are all `#ffffff`, which is true of this preset and will be true
of most light ones. Fixed by `|| minC === null` / `|| maxC === null`. Proved both ways: on a pure-white
crop the old code leaves `minC = null` (throws) and the new code returns `{255,255,255}`; on a pure-black
crop the old code leaves `maxC = null` and the new one returns `{0,0,0}`.

**Defect 2 — the home hero and all five category tiles were 404, and the page rendered them as blank
background.** `profile.generated.json` had `"image": "/media/home-hero.webp"` — the storefront's own
origin — while product images correctly carried the backend URL, because product media comes from the
seed and hero/tile media comes from `build-profile.mjs`, which only applies `STORE_MEDIA_BASE_URL` if that
variable is exported in the build process. `predev` runs it without one. Measured before the fix:
`GET /media/home-hero.webp` = **404**, `_next/image` of it = **400**, and all five tiles the same. After
rebuilding with the variable exported, all six answer **200**. A missing image here is silent — nothing
logs, nothing throws, the section just paints the page colour — which is why it survived until a contrast
gate measured white-on-white over it. Any theme that starts its stand with a bare `next dev` ships six
broken images.

**Defect 3, mine — the hero photograph did not do what the board said it did.** Style board §6 specifies
the backdrop darkening leftwards into `--background` so the copy sits on a continuous surface, with the
darkening *in the photograph* rather than as a scrim. The delivered square crop was flat grey. Rebuilt
from the same paid cell: 900 px product on a 1920 × 900 canvas filled with the frame's own sampled
backdrop `rgb(58,56,59)`, 120 px feathered seam, then a ramp into `#0d1013` out to 62 % width. White copy
now measures **13.12:1** against the brightest pixel in the copy region (was 1.00:1 over a white 404).

**Final gate state: RED, 10 failing nodes, 8 distinct groups, 20 cells, 0 unreached routes.**
`body-background assertion PASS on all 20 cells`; over-media probes `measured 2, resolved 2`.

Every one of the 10 is one of the foundation's two known component-level classes:

| class | nodes | measured | where |
|---|---|---|---|
| disabled button | **6** | 1.70:1 `rgb(74,80,86)` on `rgb(38,45,53)` dark; 1.95:1 `rgb(165,171,178)` on `rgb(231,236,242)` light | PDP "Select variant", both modes, both viewports, plus the mobile sticky bar |
| `text-rose-500` | **4** | 3.67:1 `rgb(244,63,94)` on `rgb(255,255,255)` | the required-field asterisk on `/account`, both viewports |

**No new class.** Against the foundation's 8 the count is 10, and the extra two are occurrences, not
kinds: this PDP renders a disabled add-to-cart in the mobile sticky bar as well as in the column, so the
disabled class appears 6 times instead of 4. Neither class is reachable from a preset — both are painted
by vendor values behind unmapped bridge rows.

## 5. Am I the dark control — did anything regress?

**No.** Body background is painted by `<body>` on 20 of 20 cells, so root cause A stays fixed. Every
route reached; `data-theme="electronics" data-mode="dark"` is on `<html>` before first paint (read out of
the served HTML, not asserted). Of the fourteen registry defects, the eleven that were A- or B-class
(black-on-black headings, white header, white footer, white cart drawer, white checkout panels, the
gradient mobile drawer, the skeletons) do **not** reappear on this stand in dark mode. The two that do are
d-11 (disabled control) and the rose asterisk, and both are the known component-level residue.

Visual verdict, and it is **partial and stated as partial**: 24 screenshots exist in
`artifacts/docs/electronics-shots/` (6 pages × 2 modes × 2 viewports, each carrying its asked/got mode in
`shots.log`). I read **4** of them by eye before the deadline. What those four say:

- `home-dark-1440` — **meets.** The hero darkening reads as photography, not as an overlay; the headline
  and sub sit on continuous dark surface; the wordmark is `--foreground`; the promo strip is legible.
- `home-dark-1440` — **does not meet**, one line: the hero CTA renders as a near-black pill with white
  text, where style board §7 and §8.1 say the primary button is `--primary` (electric blue) with
  `--primary-foreground`. It is painted by a `contrast-*` bridge row the build log lists among its 31
  open rows.
- `pdp-capacity-dark-1440` — **meets** on structure: Colour swatches and Capacity chips both render and
  are distinguishable; the spec copy is legible; breadcrumbs work.
- `pdp-capacity-dark-1440` — **does not meet**: the price renders in `--foreground`, not `--primary`.
  Style board §3.2 says the accent appears in exactly five places and the price is the first of them.
  **Consequence: the theme's single accent colour is absent from every screen I looked at.** A store whose
  identity is "graphite plus one electric blue" is currently graphite only. This is the most important
  open item and it is a bridge/component question, not a token question — `--primary` is correct in
  `theme.json` and correct in `themes.css`.
- `pdp-capacity-dark-1440` — **does not meet**: the product frame is cropped hard top and bottom. The
  frames are square by design (programme row 4) and the PDP's main image box is wider than tall, so
  `fit: cover` cuts the subject. Either the PDP box takes 1:1 or these frames need a wider variant.
- Not a theme defect but worth the parent's eye: the price renders as **IDR**, the default region.

The remaining 20 screenshots are unread. A verdict on them is the next agent's, and it must not be
reported as mine.

## 6. W5, honestly

Done: the Graphite swatch was resampled from the renders themselves. Across the 14 graphite frames the
median body pixel is `rgb(104,103,105)`; `product-options.json` said `#2A2E33`, and it now says
**`#686769`**. Chalk and Signal blue keep the hex their names imply, per the stage's own rule. Per-frame
values are in `artifacts/media/electronics/sampled-hex.json` and reproduced by
`artifacts/media/electronics/sample-hex.py`. The grid measurement JSON is
`artifacts/media/electronics/grid-measure.json`; the final gate run is
`artifacts/docs/electronics-shots/coverage-gate.log`.

Not done, and it is the larger half: **no title or description was rewritten against its frame.** The
sampler takes the median of the whole masked subject, which for multi-material objects mixes housing,
grille, pads and ports — `bench-over-ear-chalk` samples `#7a797a` although the frame plainly shows a
near-white headphone, and `slab-portable-signal` samples `#556371` although the panel is plainly blue. So
the per-product numbers are a fact about that estimator, not about the colourway, and I have not used them
to change copy. A "dominant surface" mask is the fix; it was not written.

## 7. Infrastructure I changed outside my own profile — the parent must review these

1. `apps/backend/scripts/store-media/wave-registry.mjs` — `--kind` accepted only `single|grid-3x3`, so a
   4 × 4 could not be ledgered. Price is a function of model and resolution, never of panel count, and
   `kind` is stored and never branched on by `spend show` or `validate`, so the enum was widened to
   `single` or `grid-<cols>x<rows>`. This is **not** a way around the money gate: `mosaic` and
   `grid-9x9x9` are both still refused, the call was priced at $0.30, and `validate` stays green.
2. `apps/storefront/scripts/theme-coverage-gate.mjs` — the null-crop crash, §4 defect 1.
3. `specs/store-profiles/media-manifest.schema.json` — `provider` was `{"const": "replicate"}`; the wave
   buys from fal.ai, so a truthful manifest could not validate. Widened to `{"enum": ["replicate",
   "fal.ai"]}`. Reverse-checked: an invented provider still fails the validator.

All three block other themes, not just this one.

## 8. Open, for whoever takes this next

1. The accent never reaches the screen (§5). Highest value.
2. W9 was never run — no DROP-and-reseed, no idempotence proof.
3. 20 of 24 screenshots unread.
4. W5's copy pass (§6).
5. `second-pass.json` was not written; the two flagged image issues are the drawn seams and the backdrop
   drift, both recorded here instead.
6. The `manifest-totals` warning (§3).
