# home-goods (Long Morning) — wave 2 theme record

Worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store/home-goods`, branch
`feat/store/home-goods`, base `aeb21b7`. **Nothing committed by this agent.** Stand: storefront
`http://localhost:8110`, backend `http://localhost:9110`, database `upready_store_home_goods`,
publishable key `pk_f50b3a6212bbbade54dbd65307a440fc17a058fd1e00e6c4ac71b152b42e5654`. Both
processes were left RUNNING.

This is the wave's **warm-neutral light theme**, and the first one shot on a deliberately
mid-luminance backdrop rather than a white one. §3 is the result of that decision; §5 is a
defect it did not cause and cannot fix.

---

## 1. Stages

| stage | done | evidence |
|---|---|---|
| W1 style board | yes | `…/profiles/home-goods/design/style-board.md`, 8 sections + 2 appendices, 393 lines |
| W2 catalog + briefs | yes | 4 catalog files, 5 locales, §2 |
| W3 images | yes | 2 predictions, 18 panels, §3 |
| W4 theme preset | yes | `theme.json` + `specs/design-system/themes/home-goods.theme.json`, byte-identical |
| W5 copy reconcile | **partial** | one contradiction found and recorded, no copy rewritten — §6 |
| W6 assembly + stand | yes | validator OK, stand live, counts read with `psql` |
| W7 coverage gate | yes | RED, §4 |
| W8 visual verdict | **partial** | 16 screenshots, 3 read by eye, 3 defects found — §5 |
| W9 adversarial verify | **not started** | out of time; no DROP-and-reseed, no idempotence proof |

Stopped inside W8. W9 and the rest of W8 are the next agent's first two actions.

## 2. Catalog

**12 products · 38 variants · 6 categories (2 parent + 4 leaf) · 2 collections · 5 locales ·
2 option definitions** (Colour 4 values, Size 3 values) · **2 single-variant products**
(`candle-holder`, `hook-rail`).

Counts read back **from the database with `psql`**, not from the seed log:
`products 12 · variants 38 · categories 6 · collections 2 · images 12 · regions 241`. They equal
the catalog JSON exactly.

Category sizes are 3/3/3/3 and the two collections carry **7 and 9 products**. That is deliberate:
the previous theme's W8 found a collection rendering one product in a four-column grid, which on a
near-black page is a black band mid-page. Style board §7 forbids a home-page row under four
products, and no row on this stand has fewer.

**Template-conflict list W2 owes the producer** (an empty list is also an answer, but it must be
written): the board declares two packshot templates, **V-single** and **V-stack**. Two handles
need V-stack — `dinner-plates` and `waffle-towels` — and they are marked in each
`imageBrief.shots[0].description`. **No brief needed a third template**, so no render was spent on
a template mismatch. This is the pilot defect that cost three of nineteen frames; it did not recur.

Locales: de/es/fr/ru each carry 12 products, **0 keys missing, 0 extra** against `en.json`, **0
descriptions identical to English**, description lengths 530–708 characters. `en.json` is
*generated from the catalog* by a script rather than typed, so the English side cannot drift from
`products.json`. The four translations are condensed against the English — they carry the same
substance (material, dimension, care, and the honest drawback) in fewer words — and that is stated
here rather than presented as a like-for-like translation.

## 3. Images — two predictions, eighteen panels, $0.60

| | sheet A | sheet B |
|---|---|---|
| model | `fal-ai/nano-banana-pro`, `resolution: "4K"`, `aspect_ratio: "1:1"` | same |
| fal request id | `01a07dc0-c4b4-7911-ad62-c4f4c1b77cdc` | `01a07dc1-81bc-7180-9326-06d45701a73d` |
| ledger row | `r-9e8d90f3`, **$0.300**, written before the request | `r-92215e05`, **$0.300**, ditto |
| returned | 4096×4096 PNG RGB, 19 621 426 B, 39.8 s | 4096×4096 PNG RGB, 19 122 272 B, 48.9 s |
| panels asked / returned | 3×3 / **3×3, read off the image** | 3×3 / **3×3, read off the image** |
| contents | nine packshots, products 1–9 | row 1 three packshots, rows 2–3 six interiors |

**Deviation from the brief, stated plainly: the brief budgeted $0.30–0.45 and this theme spent
$0.60.** One 3×3 gives nine product frames and this catalog has twelve, so a second sheet was
unavoidable; its spare six panels were spent on the interiors that became the hero and all four
category tiles, which would otherwise have needed a third prediction. Ledger after the run:
**$2.667 of the $6.00 ceiling, $3.333 left, soft stop $5.00 not reached.** The provider's own
dashboard total has not been read and is not guessed here.

**The 3×3 held, and this is the wave's second data point for that.** Same estimator, same script:

| | 3×3 measurement (G1) | 4×4 (electronics) | **3×3 sheet A (this theme)** |
|---|---|---|---|
| backdrop luma spread | 7.8 | 59.2 | **12.6 across 9 cells** (6.5 % of a ~195 level) |

Sheet B's overall spread is 126.0 and that number means nothing on its own: its two halves were
*ordered* different (packshots on putty at luma ≈191, interiors in shade at ≈65). Its three
packshots alone spread **4.8**.

**Borders were found, not calculated.** `grid-measure.py` reported sheet A at x 1352/2723,
y 1352/2743 (exact thirds are 1365/2731) and sheet B at x 1354/2742, y 1376/2742, all at SNR 20–66.
Both sheets also offered candidates at SNR 3–10 — sheet A y 3253/3345/3428/3516, sheet B
x 226/594/2567/2892. Those are gaps between subjects. Content valleys are not panel edges; they
were ignored on purpose.

**The model drew a gutter it was explicitly told not to draw**, on both sheets, at 4K, on the *pro*
model — the measurement had only recorded this for the cheap one. Measured: a band **22–24 px** wide
reaching luma 254 against a backdrop base of 108–199, on all four seams of both sheets. The detector
reports the band's **leading** edge on some seams and its **trailing** edge on others, so the slicer
insets a symmetric 28 px rather than something clever. Verified after cutting: the brightest 3 px
edge pixel of any packshot frame is 227 against a frame median of 199–201 — backdrop, not gutter.

Outputs: **12 product frames at 1080×1350 (4:5, the programme's frame for this row), 4 category
tiles and 1 home hero**, the last five being crops of panels already paid for. 17 manifest entries,
17 URLs answering 200. Per paid product frame: **$0.05**.

`manifest-totals` warns `renders = 2, entries = 17`. That is correct arithmetic and the wrong
question in the grid era, exactly as the previous theme reported; the parent should decide whether
the check becomes `predictions ≤ entries`.

## 4. The coverage gate

Command, on this stand: `cd apps/storefront && pnpm themes:coverage -- --url http://localhost:8110`.
Full log: `artifacts/docs/home-goods-shots/coverage-gate.log`.

**Verdict RED**, and the three numbers the brief asked to be reported separately, against the
honest baseline of 4 / 0 / 18:

| | baseline | this stand |
|---|---|---|
| contrast failing nodes | 4 | **4** |
| mobile-drawer failing nodes | 0 | **0** (drawer opened on 20/20 cells) |
| focus failures | 18 of 242 controls | **8 of 254 controls** |

20 cells, 6 failing, `body-background assertion PASS on all 20 cells` (painted by `<body>`),
over-media probes 0 nodes, allow-list entries **0**.

All 4 contrast nodes are **one class**: `span.text-rose-500`, the required-field asterisk on
`/account`, at **3.55:1** — `rgb(244,63,94)` on `rgb(253,251,247)` — in light mode, both viewports.
This is the same vendor class the previous theme measured at 3.67:1 on pure white; on this warmer,
slightly darker ground it is worse by 0.12. **No new class.** The 8 focus failures are all "no focus
ring at all" on `/account` and `/store`.

Nothing here was suppressed, no threshold was touched, and no allow-list entry was added.

## 5. W8 — what the eyes found that the gate did not

16 screenshots in `artifacts/docs/home-goods-shots/` (4 pages × 2 modes × 2 viewports), each
carrying its **asked-for and read-back** mode in `shots.log`; body background reads
`rgb(253,251,247)` in light and `rgb(26,21,18)` in dark, which are this preset's `--background`
tokens exactly. **I read 3 of the 16 by eye.** The other 13 are unread and a verdict on them is not
mine to give.

**1. The putty backdrop works, and it is the one result worth carrying to the next theme.** On
`listing-dark-1440` the product cards read as photographs on a dark page, not as the blinding white
rectangles the previous theme warned about. The backdrop sits at luma ≈195–216 — far enough below
white to stop being a flare in dark mode, far enough above `--card` `#221c18` to still read as a
photograph. It cost nothing: the frames were shot fresh. This is a cheap answer to the open question
`q-white-backdrop-in-dark-mode` and it did not need a ruling to get it.

**2. The wordmark on the live stand said `QUERNSTONE` — a brand name W1 had rejected.** Found only
by looking at a screenshot. `NEXT_PUBLIC_SITE_NAME` was set early, while the name was still being
searched, and never updated when the search rejected it. Fixed; the served HTML now carries
`Long Morning` 47 times and the rejected name zero. **No gate on this stand or any other looks at
the site name**, and every profile sets it by hand, so this is worth a check somewhere.

**3. The hero subheadline is painted `rgb(36,28,22)` — dark text on a dark hero — and this is a
foundation defect that will hit every full-bleed hero in the wave.** Read off the live page, not
inferred: the headline computes to `rgba(255,255,255,0.88)` and is legible; the subheadline, whose
only difference is Tailwind's `/80` opacity modifier
(`text-ui-contrast-fg-primary/80` in `modules/home/components/profile-hero/index.tsx`), computes to
`rgb(36,28,22)`, which is `--foreground`. The modifier cannot compose against a token that is
already `rgba(255,255,255,.88)`, and it falls back to the foreground colour. `--contrast-fg-primary`
is one of the 31 bridge rows the theme build reports as open. **Consequence: on any profile whose
hero is `full-bleed`, the sub-copy is dark-on-photograph and no amount of hero darkening fixes it —
darkening makes it worse.** Electronics is also `full-bleed`.

**What I did chase before finding that, and it is a lesson about my own measurements.** The hero was
rebuilt three times from the same paid cell, each time with a number that passed and a screenshot
that still looked wrong:

| build | measured | what the number was wrong about |
|---|---|---|
| 1 | 5.13:1 worst | modelled the copy as pure white; the storefront paints the sub at 80 % alpha |
| 2 | 4.66:1 worst | modelled the alpha, but measured a copy box narrower than the text actually runs |
| 3 | 9.97:1 worst | correct box, correct alpha — and the sub is still illegible, because it is not white at all |

Build 3 is what ships: mirrored (the delivered panel put its window exactly where the storefront
anchors the headline) plus a feathered ramp of the frame's own 3rd-percentile plaster tone
`rgb(41,17,6)`. The **headline** genuinely improved — 6.20:1 → 14.80:1 worst pixel. The
subheadline never could. Three passes of a measurement agreeing with itself and disagreeing with a
screenshot was the signal, and I took two builds too long to read it.

A fourth trap sits underneath all of that: **the first rebuild changed the file and not the screen.**
Next's `_next/image` cache is keyed on the URL, which did not change, so the screenshot was identical
while the bytes on disk were not. `.next/cache/images` had to be cleared and the storefront
restarted before the screen showed what the file said. A hero measured on disk is not a hero on the
page.

## 6. W5, honestly

**Done:** one contradiction between copy and render was found and is recorded. `dinner-plates` is
titled "set of four" and its brief asked for four; **the frame shows five** — a stack of four with a
fifth leaning against it. The copy was NOT changed to match, because "set of five" would be a worse
product than the one the SKUs and the price were built around, and the frame was NOT re-rendered,
because the no-regeneration rule holds. It is in `artifacts/media/home-goods/second-pass.json` with
the prompt change that would fix it.

**Not done, and it is the larger half:** no swatch hex was resampled from the renders, and no title
or description was rewritten against its frame. The Colour option's four hexes are still the ones
W1 chose, not ones measured off the panels.

## 7. Infrastructure touched outside this profile — the parent must review

1. `apps/storefront/scripts/home-goods-shots.mjs` — new. The W8 screenshot pass. It lives beside the
   coverage gate **because ESM resolves from the file's own location, not the cwd**: `playwright` is
   not linked into this workspace at all and `@playwright/test` is only under
   `apps/storefront/node_modules`, so the same script fails from `artifacts/` and from `/tmp`. The
   gate documents that resolution at its own line 95; this script now follows it.
2. `apps/storefront/src/styles/themes.css`, `src/lib/theme/presets.generated.ts`,
   `src/lib/theme/fonts.generated.ts` — regenerated (6 presets × 2 modes, 31 keys, 0 missing).
   **These were built in a worktree that does not contain `womens-fashion`**, so they omit that
   preset. The parent regenerates them from `dev`; do not take these three files from here.

Nothing else outside `data/profiles/home-goods/` was modified.

## 8. Open, for whoever takes this next

1. **The `/80` modifier defect (§5.3).** Highest value, wave-wide, and not a theme question.
2. W9 was never run — no DROP-and-reseed, no idempotence proof.
3. 13 of 16 screenshots unread.
4. W5's swatch and copy pass (§6).
5. The accent: the price renders in `--foreground`, not `--primary`, so style board §3.3's first
   accent slot is empty on the listing. Same symptom electronics reported; not re-diagnosed here.
6. Two filter dropdowns on `/store` are both labelled "Default option" — visible on
   `listing-dark-1440`, not investigated.
7. The seed's first run failed at `Seeding regions...` with all 241 countries already assigned, on a
   database created minutes earlier. The database was dropped and re-seeded once, cleanly, rc 0.
   **The cause was not established** and is not guessed here; if it recurs, that is the thread.
