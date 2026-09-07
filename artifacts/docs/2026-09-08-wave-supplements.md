# `supplements` (Scruple) — wave 2 handover

Written 2026-09-08 ~06:15 WITA at the deadline, by the supplements theme agent.
Stages **W1, W2, W4 complete; W3 complete except the second pass; W5, W6, W7, W8 NOT started.**
The next agent resumes at **W6** (assembly and stand) and then W7/W5/W8.

---

## 1. What is on disk and proved

| Stage | State | Proof |
|---|---|---|
| W1 style board | **done** | `data/profiles/supplements/design/style-board.md`, 455 lines, 8 numbered sections + appendix |
| W2 catalog | **done** | 15 products / 53 variants / 5 locales, validator green with `--skip-media` |
| W4 theme preset | **file half done**, live half NOT done | 31 keys per mode, 0 missing / 0 extra vs the canon `sneakers` preset |
| W3 images | **done except second pass** | 19 WebP, 3 paid predictions, manifest sha-verified |
| W5 copy reconcile | **NOT started** | — |
| W6 assembly / stand | **NOT started** | no stand was ever up |
| W7 coverage gate | **NOT RUN** | see §5 — this is the most important gap |
| W8 visual gate | **NOT started** | — |

## 2. The numbers, each copied from output

Catalog, recounted by the validator from the JSON (not from my own arrays):

```
products      15
variants      53
image refs    15 (unique files: 15)
declared      products 15, variants 53, images 15
media:        19 manifest entries (19 accepted, 0 flagged, 0 rejected), 19 files hashed
```

Contrast, `node palette.mjs`, exit 0: **44 pairs computed (22 per mode), 0 failures.** Worst text
pair `--muted-foreground` on `--muted` light, **6.13:1**. Raw output is the appendix of the style
board.

Theme key set, checked against `specs/design-system/themes/sneakers.theme.json`:
`light: 31 keys, 0 missing, 0 extra` / `dark: 31 keys, 0 missing, 0 extra`. The two copies of the
preset are byte-identical (`copies byte-identical: true`).

## 3. Money — read this before rendering anything else

Theme total in the ledger: **$0.939**. Wave total after me: **$1.617 of $6.00**.

| Ledger id | $ | What it bought |
|---|---|---|
| `r-63166da7` | 0.300 | **NOTHING. Wasted by my own error** — see below. Marked `accepted=false`. |
| `r-43641bf4` | 0.300 | grid A, 9 product frames, `nano-banana-pro` 4K, request `01a07d81-b906-7831-b93c-2825e43e131c` |
| `r-1112e13b` | 0.300 | grid B, 6 product frames + 3 category tiles, same model, request `01a07d82-861a-7ec2-923b-07cc8769d2b5` |
| `r-54a2fbb8` | 0.039 | home hero, `nano-banana` 16:9, request `01a07d86-7cb0-71e1-9b9d-c114b32c7be9` |

**How $0.30 was wasted, so nobody repeats it.** I tried to syntax-check the render script with
`node -e "import('…render-supplements.mjs')"`. `import()` **executes** a module — it does not
merely resolve it. The top-level code ran, wrote a ledger entry, submitted the fal request, and I
killed the process mid-poll. The request id was never printed (it is only logged after the render
returns), so the image cannot be fetched back. Useful frames were 18 of 19 possible for the money;
the honest per-usable-image cost for this theme is **$0.939 / 19 = $0.049**, not the $0.033 the
grid measurement promised.

**The lesson for every remaining theme:** to check a money-spending script, use
`node --check <file>` (parses, does not run). Never `import()`.

## 4. Images — the grid strategy worked

Both grids came back as clean, uniform 3x3 sheets at **3712x4608** (4:5), nine panels each, every
panel matching the product brief it was written for, in reading order. Cells are **1213x1512**
after a 12 px shave, 16-26 KB each as WebP q86.

**The panel count was READ, not assumed**, as the 2026-09-08 grid measurement requires. Both
previews were rendered down and looked at before a single cut. `grid-measure.py` found the column
seams at 1224 / 2467 against exact thirds 1237 / 2475 (fine) but put the **first row seam at 1258
against an exact 1536 — a 278 px error**. That is precisely the "content valleys are not panel
edges" failure the measurement warns about; the image is visibly three equal rows. Cut on equal
thirds, and the result was verified by eye per cell.

Prompt registry, with `sharedPreamble` and per-cell `subjectClause` stored **separately** so a
single larger re-render of one cell is `sharedPreamble + cells[i].subjectClause`
(directive §3.2): `artifacts/media/supplements/prompt-registry.json`.

The registry was rebuilt offline after the render script crashed before writing it, and the
rebuild is **proved identical to what was actually sent**: reconstructed
`fullPromptSha256` `85b92f61…` and `5c4461a4…` equal the `promptSha256` the ledger recorded for
`r-43641bf4` and `r-1112e13b`.

## 5. THE BIGGEST GAP — the coverage gate was never run

**No stand was ever brought up, so `themes:coverage` was never executed for this theme.** I have
no number to compare against the foundation's 8 failing nodes, and I am not going to predict one.
Everything in this theme that concerns colour is proved **on file only** — 44 computed ratios and
a complete key set — and the pilot's whole lesson (`d-01`…`d-14`) is that a preset can be
**correct as a file and wrong on screen**. Treat this theme as UNVERIFIED on screen.

What the next agent must do, in order:

```
cd apps/storefront && pnpm themes:coverage -- --url http://localhost:<port>
```

after `store-profile:up supplements`, media copied to static, and backend + storefront started on
free ports (8050+/9030+ were free at 03:45; re-check with `lsof -nP -iTCP -sTCP:LISTEN`).

**Predicted, not measured:** `d-11` (the disabled button, `--fg-disabled` on `--bg-disabled` =
**2.06:1 in light mode**) is bridge-derived, is not one of the 31 preset keys, and no value in
this board can move it. It is expected to persist as an inherited failure. That is a prediction
from `artifacts/docs/process/02-gates-and-handover.md` §4.3, **not** something I measured here.

## 6. Blockers that need an orchestrator decision

**B1 — the media-manifest schema pins the wrong provider. The validator is RED because of it.**

```
FAIL [schema:media-manifest.schema.json] manifest.json/provider must be equal to constant
     ({"allowedValue":"replicate"})
```

`specs/store-profiles/media-manifest.schema.json:24-25` has `"provider": {"const": "replicate"}`.
This wave renders on **fal.ai**. I wrote `"provider": "fal.ai"` because it is true, and I did
**not** edit the schema because `specs/store-profiles/` is outside my declared zone. Writing
`"replicate"` would make the manifest lie about where the bytes came from, which is the exact
class of failure the wave is trying to stop. **One-line fix an owner must make:** widen that
`const` to an `enum` of `["replicate", "fal.ai"]`. Every remaining theme will hit this.

**B2 — `fal.mjs` and `grid-measure.py` exist only in the main checkout, uncommitted.**
`/Users/ivanprotsko/upready/projects/upready-store/apps/backend/scripts/store-media/{fal.mjs,grid-measure.py}`
are absent from every theme worktree, so my render script imports them by absolute path from the
main checkout. That is read-only and in the same spirit as the ledger exception, but it means
**no theme worktree can render images reproducibly until those two files are committed.**

**B3 — `manifest-totals` WARN is the grid strategy meeting a pre-grid checker.**
`WARN [manifest-totals] totals.renders = 3, entries = 19.` Both numbers are correct: 3 paid
predictions produced 19 files. The check assumes one render = one file. Under the grid direction
that assumption is now wrong for every theme; the check should compare `renders` to the number of
**predictions**, not to `entries`.

## 7. Findings outside my checklist (H8)

- **`cardVariant` is a required schema field that nothing renders.** Measured:
  `grep -rn cardVariant apps/storefront/src apps/backend/src` → **0** hits in both, while
  `imageTreatment`=16, `aspect`=27, `promoStrip`=10, `categoryTiles`=8 in `apps/storefront/src`.
  It appears only in the schema, two `profile.json`s, one test fixture and the sneakers board. So
  the schema requires every profile to make a layout promise the storefront cannot keep.
- **Product options are global, not per-product.** `lib/products.ts:94-153` creates option
  entities once by title and products reference them by id, so **every value of a shared option
  reaches every product that uses it**. This is why `sneakers` carries both `Colourway` (6 values)
  and `Colour` (3). I collapsed both powders onto one 3-value `Flavour` set for that reason; a
  second flavour set would have put dead swatches on both PDPs. Any theme whose programme row
  lists an option with per-product value sets hits this.
- **Count is a quantity tier, not a fit size.** The W2 prompt says "prices are set per model, not
  per size". Here 60/120/180 is a quantity of goods, so price scales with it (×1.8, ×2.4, charm
  rounded to end in 9) while `Flavour` never changes price. Flagged because it is a deliberate
  reading of that rule, not an oversight.
- **Template conflicts (the defect W2 asks about): none.** Every one of the 15 briefs fits the
  board's §5 packshot template — one vessel, its dose form beside it, white cyclorama, label
  height. The two that deviate most (`starter-fortnight`, a flat carton with kraft sachets, and
  `vitamin-d3-drops`, an amber dropper bottle laid with its pipette) were written into the board's
  §5 prop rule *before* rendering, and both came back correct. Empty list, written down as the
  prompt requires.

## 8. Exact literal paths for `git add --`

```
apps/backend/src/migration-scripts/data/profiles/supplements/profile.json
apps/backend/src/migration-scripts/data/profiles/supplements/theme.json
apps/backend/src/migration-scripts/data/profiles/supplements/design/style-board.md
apps/backend/src/migration-scripts/data/profiles/supplements/catalog/categories.json
apps/backend/src/migration-scripts/data/profiles/supplements/catalog/product-options.json
apps/backend/src/migration-scripts/data/profiles/supplements/catalog/products.json
apps/backend/src/migration-scripts/data/profiles/supplements/catalog/collections.json
apps/backend/src/migration-scripts/data/profiles/supplements/i18n/en.json
apps/backend/src/migration-scripts/data/profiles/supplements/i18n/de.json
apps/backend/src/migration-scripts/data/profiles/supplements/i18n/es.json
apps/backend/src/migration-scripts/data/profiles/supplements/i18n/fr.json
apps/backend/src/migration-scripts/data/profiles/supplements/i18n/ru.json
apps/backend/src/migration-scripts/data/profiles/supplements/media
specs/design-system/themes/supplements.theme.json
artifacts/docs/2026-09-08-wave-supplements.md
```

**`artifacts/media/supplements` is NOT in that list, and must not be.** Measured:
`git check-ignore -v artifacts/media/supplements/prompt-registry.json` returns
`.gitignore:73:artifacts/media/*/*`, so the whole directory — the 31 MB of raw PNGs *and* the
prompt registry and generator scripts beside them — is already ignored. The registry and the
scripts therefore live only in this worktree; if they are wanted in history, that is an owner's
decision about `.gitignore:73`, not something to force with `git add -f`.

The 19 delivered WebP files are inside
`apps/backend/src/migration-scripts/data/profiles/supplements/media`, which is listed above and is
**not** ignored.

## 9. What I could NOT verify

- **Anything on screen.** No stand, no `next build`, no seed, no coverage gate, no screenshots.
- That `store-profile:up` exits non-zero on a zero-product seed (the W6 fix). Not attempted.
- That every image URL answers 200. The files exist and are hashed; they have never been served.
- That the five locales render correctly in the storefront — the translations were verified
  structurally (63 leaves each, 0 missing / 0 extra vs `en.json`) but never displayed.
- Native-speaker register of the four translations. Structural checks passed; the judgement is a
  subagent's, not a measurement.
