# womens-fashion (Larchant) — wave 2 theme record

Worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store/womens-fashion`, branch
`feat/store/womens-fashion`, base `8c00f9e`. Nothing committed by this agent. Stand: backend
`http://localhost:9061`, storefront `http://localhost:8081`, database `upready_store_womens_fashion`,
publishable key `pk_259cf2e8accae5194d06383872c2afb79de6ebca5645025801a53384145fe544`.

This is the wave's **first light-mode theme with a photographic full-bleed hero**, and that combination
found a defect the two dark themes could not have found — §4.

---

## 1. Stages

| stage | done | evidence |
|---|---|---|
| W1 style board | yes | `…/profiles/womens-fashion/design/style-board.md`, 9 sections, contrast appendix pasted from the script |
| W2 catalog + briefs | yes | 4 catalog files + `i18n/en.json`; template-conflict list in §2 |
| W4 theme preset | yes | `theme.json` + `specs/design-system/themes/womens-fashion.theme.json`, 31 keys, 0 missing |
| W3 images | yes | 2 predictions, 12 panels + 1 campaign frame, §3 |
| W5 copy reconcile | yes | 3 contradictions fixed, 4 colourway hexes resampled from the renders, §5 |
| W6 assembly + stand | yes | validator exit 0, stand live, DB counts read with the up-script's own `psql` query |
| W7 coverage gate | **RED, 4 nodes, 1 kind** | §4 |
| W8 visual verdict | partial | contact sheet and hero read by eye (§3, §6); the 24-screenshot sweep was not run |
| i18n de/es/fr/ru | **not done** | §7 — the honest gap |
| W9 adversarial verify | not started | out of time; no DROP-and-reseed |

## 2. Catalog

12 products · 87 variants · 2 parent + 5 leaf categories · 2 collections · 2 option definitions
(Size 5 values, Colour 4 values) · 2 single-variant products (`orne-wool-scarf`, `carre-silk-square`) ·
24 image refs (12 hero + 12 detail).

Counts read back **from the database**: `12 products, 87 variants, 7 categories, 241 regions`. They
equal the catalog JSON, which the validator also recomputed independently (`products 12, variants 87,
image refs 24, unique files 24`).

**Template-conflict list W2 owes the producer** (empty is also an answer, but it must be written): the
board declares three packshot variants. **V-form** (garment on a full invisible mannequin) covers eight
handles. **V-lower** (waist-down form) is needed by `tille-wide-trouser` and `noyer-bias-skirt`.
**V-drape** (no form at all) is needed by `orne-wool-scarf` and `carre-silk-square`, which are not worn.
All four were named in the prompt **before** the render was paid for; no render was spent on a template
mismatch. This is the pilot defect that cost three of nineteen frames; it did not recur.

## 3. Images — two predictions, twelve panels and one campaign frame

| | value |
|---|---|
| predictions | **2** |
| grid model | `fal-ai/nano-banana-pro`, `resolution: "4K"`, `aspect_ratio: "3:4"` |
| grid fal request id | `01a07d9f-25ea-75c3-b372-65146a64c607`, ledger row `r-e7254dd4`, **$0.300** |
| grid returned | 3584 × 4800 px, PNG, RGB, 17 131 068 bytes, 40.0 s |
| panels asked for | 3 columns × 4 rows = 12 |
| panels returned | **3 × 4 = 12, read off the image, not assumed** |
| order | all 12 landed in the reading order requested — verified by eye on the contact sheet |
| hero model | same model, `2K`, `16:9`; request `01a07da0-4c71-7bc0-a3a8-2d4f97b96863`, row `r-e5490056`, **$0.150** |
| hero returned | 2752 × 1536 px, 6 866 456 bytes, 28.8 s |
| cost per usable product image | $0.300 / 12 = **$0.025** |

**Geometry was not a free choice.** The brief said buy a 3×3, never a 4×4. The measurement's own
good case was 3 columns × 4 rows — twelve panels at background luminance spread 7.8 — while electronics'
4×4 measured 59.2 on the same script. So this theme was designed to twelve products and bought as
3 × 4. It held:

| | 3 × 4 (measurement G1) | 4 × 4 (electronics) | **3 × 4 (this theme)** |
|---|---|---|---|
| background luminance spread | 7.8 | 59.2 | **2.9** (full background mask, 12 cells, `grid-measure.py`) |
| background RGB per-channel spread | 7 / 8 / 7 | 60 / 59 / 60 | **3 / 6 / 7** (corner patches) |

**Borders were found, not calculated.** `grid-measure.py --rows 4 --cols 3` reported vertical seams at
**1184** (SNR 28.1) and **2388** (29.3) against exact thirds 1195 / 2389, and horizontal at **1190**
(25.1), **2392** (24.0), **3597** (24.6) against exact quarters 1200 / 2400 / 3600 — so the true seams
sit up to 11 px off arithmetic. The detector also offered ten candidates at SNR 3.2–10.4 (605, 1686,
1827, 1902, 2845, 2964, 3069, 3149 vertical; 610, 1071, 1473, 2134, 2541, 3810, 4518 horizontal). Those
are gaps between garments; content valleys are not panel edges, and they were ignored.

`subjectWidthPct` came back **0 for all twelve cells** — that is a fact about the detector (an ivory
garment on a cream backdrop under a block-std mask), not about the picture, and it is reported as such
rather than as a measurement of scale.

**Outputs:** 12 product frames at 900 × 1125 (4:5), 12 **detail** frames at 800 × 1000 cut at native
pixels from the same paid cells, 5 category tiles and 1 home hero — 30 manifest rows, 30 files hashed,
**30 of 30 URLs answering 200**. The detail frames are what makes the programme's `hover: second-image`
real: with one image per product the storefront's `Boolean(secondSrc)` guard makes that hover a silent
no-op, and a silent nothing is the defect class this wave exists to clear. No detail, tile or hero cost
a second prediction.

**Style-gate verdict on the twelve frames (by eye, on the contact sheet):** background, lighting, camera
height and the invisible-form staging are consistent across all twelve; no faces, no hands, no legible
text, no logos. **Three subject deviations**, none worth a re-render under the no-regeneration rule, all
reconciled in copy instead (§5). The model again drew faint panel seams it was told not to draw; the
8 px seam inset cuts inside them, and no frame carries a neighbour's edge.

## 4. The gate, and the defect a light photographic hero was always going to find

Command, on my own stand: `cd apps/storefront && pnpm themes:coverage -- --url http://localhost:8081`.

| run | failing nodes | groups | what changed |
|---|---|---|---|
| 1 | 6 | 4 | first run on the stand |
| 2 | 5 | 3 | hero mirrored + ramped; desktop resolved, 390 still failing |
| 3 (final) | **4** | **1** | ramp widened to survive the 390 centre-crop |

**Final gate state: RED, 4 failing nodes, 1 distinct group, 20 cells, 0 unreached routes.**
`body-background assertion PASS on all 20 cells`; over-media probes `measured 2, resolved 2`;
allow-list entries **0** (no threshold was touched and nothing was suppressed — `p-02` did not recur).

All four are the foundation's `text-rose-500` class: **3.29:1**, `rgb(244,63,94)` on `rgb(247,242,233)`,
the required-field asterisk on `/account`, light mode, both viewports. Against the foundation's 8 the
count is **4**, and the difference is occurrences, not kinds: **the disabled-button class did not appear
on this theme at all** — this PDP renders no disabled button in either mode or viewport, where
electronics rendered six. **No new class survives.**

**The defect this theme found, and fixed.** Runs 1 and 2 carried a *second* group that neither dark theme
could produce: the home hero headline measured **2.20:1** — `rgb(246,244,241)` on `rgb(183,164,141)` —
against a 3.0 large-text floor. Cause: the storefront lays the hero headline out **bottom-left**
(`flex-col justify-end`, `max-w-[620px]`), while the rendered campaign frame put its window light on the
left and its shadow on the right. Style board §6 requires the darkening to live *in the photograph*, not
in a CSS scrim, so `scripts/store-media/womens-fashion-hero.mjs` mirrors the frame and ramps the
bottom-left into `--background` dark. Worst-case background luminance inside the headline box is now
**0.0107**, i.e. **15.76:1** for the cream copy, and the gate resolves both over-media probes.

Run 2 is worth recording on its own: the desktop hero passed and the **390** hero still failed at
1.87:1, because `object-cover` at 390 × 440 centre-crops the 1920 × 900 frame to roughly x 560–1358, and
a ramp that dies at mid-width dies *inside* that crop. A hero fixed at 1440 is not a hero fixed.

## 5. W5 — what the renders contradicted, and what the copy now says

Three briefs did not survive contact with the frame. Copy was changed to name what is visible; no frame
was re-rendered.

| handle | field | was | is |
|---|---|---|---|
| `vaux-longline-cardigan` | Length spec | Just above the knee, 96 cm size M | Top of the thigh, 82 cm size M |
| | Buttons spec | Seven, matte horn-look resin | Five, matte horn-look resin |
| | subtitle + description | "knee length", "Seven buttons" | "longline", "top of the thigh", "Five buttons" |
| `tille-wide-trouser` | title | Tille wide-leg trouser | **Tille pleated straight trouser** |
| | Leg spec | 26 cm hem width, 108 cm inside leg unfinished | 21 cm hem width, cropped just above the ankle |
| | subtitle + description | "wide-leg", "full length" | "straight-leg", "cropped at the ankle" |
| `mazan-silk-shirt` | Collar spec | Soft camp collar | Soft point collar |
| | subtitle + description | "camp collar… sit open" | "point collar… buttoned to the neck or left open" |

**Colourway hex, sampled from the renders rather than from the colour names:**

| value | was (from the name) | is (sampled) | how |
|---|---|---|---|
| Ivory | `#EFE7D8` | **`#EADCCD`** | lit face of `ondine-slip-dress`, 55th–75th luminance percentile of a 16 362 px centre crop — the modal pick returned `#CAB59E`, which is the fold shadow, and was rejected |
| Ink | `#17140F` | **`#1B1920`** | modal cluster of `perrin-knit-dress`, 73 660 px |
| Clay | `#9C5B4A` | **`#A78272`** | modal cluster of `sevre-wrap-dress`, 27 937 px |
| Sage | `#7E8A72` | **`#726B59`** | modal cluster of `noyer-bias-skirt`, 27 851 px |

## 6. Visual, by eye

- **Frames match each other.** One backdrop, one key direction, one camera height across twelve panels;
  measured spread 2.9 luminance, and it reads that way on the sheet.
- **The store reads as one brand.** Cream page, ink type, one clay accent, Playfair only on the wordmark
  and headline — nothing shouts.
- **Does not meet, and it is mine:** the ramped hero shows a faintly visible soft-edged boundary where
  the ramp feathers out on the upper right of the darkened area. It reads as light falling off, but a
  photographer would see the edge. It is a candidate for the second pass, not a re-render.
- **Not read:** the 24-screenshot sweep at 1280 × 800 and 390 × 844 in both modes. Four surfaces were
  read (contact sheet, hero twice, mobile crop). The rest is W8 unfinished.

## 7. Open, for whoever takes this next

1. **`i18n/de|es|fr|ru` were never written.** Only `en.json` exists (7 categories, 2 collections,
   12 products, re-synced after the W5 rewrite). `profile.json` declares five `catalogLocales`, so the
   profile currently promises four locales it does not carry. Either write them or narrow the field —
   do not leave the promise standing. This is the largest single gap in the theme.
2. W9 never ran: no DROP-and-reseed, no idempotence proof, no reverse-run for any check.
3. `second-pass.json` was not written; the two flagged image issues (drawn panel seams, the visible ramp
   edge) are recorded here instead.
4. The **accent-reach** question (`q-accent-never-reaches-the-screen`): not measured on this theme.
   The gate examined `pdp` and `category` cells with zero failures, so nothing forced the question, but
   nobody read the price colour off a computed style. Unanswered, not answered negatively.
5. `manifest-totals` warns `renders = 2, entries = 30`, the same grid-era arithmetic electronics
   reported. The check assumes one prediction yields one file.
6. **The W5 copy rewrite is on disk but NOT in the database.** The reseed was run and the seed
   short-circuited with `Store already seeded — skipping initial data seed`, so `store-profile:up`
   reported `12 products, 87 variants` from the *previous* seed. Measured on the stand:
   `GET /en/products/tille-wide-trouser` still renders **"Tille wide-leg trouser"**, the title W5
   replaced with "Tille pleated straight trouser". Three products (`tille-wide-trouser`,
   `vaux-longline-cardigan`, `mazan-silk-shirt`) show pre-reconcile titles and specs on screen. The
   fix is a DROP and reseed, which is also W9's idempotence test; it was not run because it would have
   left the stand with an empty database if it failed past the deadline. **This is the first thing the
   next agent should do**, and it costs no money.

## 8. Infrastructure changed outside my own profile — the parent must review

1. `apps/backend/scripts/store-profile-up.mjs` — **the empty-seed guard W6 asks for did not exist.** The
   script printed its counts and exited 0 whatever they were. It now reads products and variants back
   from the database and throws when either is zero, naming the profile and the catalog file. This is
   the pilot failure where a stand came up empty behind a green command.
2. `apps/storefront/src/styles/themes.css` and `src/lib/theme/presets.generated.ts` — regenerated by
   `pnpm themes:build`, now carrying 6 presets × 2 modes, 31 keys, 0 missing.
