# S4 — image production report, profile `sneakers`

Stage S4 of the store-profiles pilot. Written by the image producer, 2026-09-07.
Worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/store-profiles`.

**19 predictions ordered, 19 created, 19 succeeded, 0 wasted, 0 regenerations.** The budget is closed
and the ledger will refuse a twentieth.

| | |
|---|---|
| Renders attempted | 19 |
| Renders succeeded | 19 (no failed or cancelled prediction) |
| Accepted | 15 |
| Flagged (shipped, queued for the second pass) | 4 |
| Rejected | 0 |
| Products / banner / tiles | 14 / 1 / 4 |
| Model used | `google/nano-banana-2` for all 19 — the fallback was never needed |
| Provider wall time, all 19 | 311.5 s (5 min 12 s), mean 16.4 s per frame |
| Provider `predict_time`, all 19 | 276.7 s, range 10.4–16.8 s |
| Raw bytes kept on disk | 86 MB, 19 PNGs, none deleted |

---

## 1. Cost — what I could and could not measure

**I could not measure the cost of these renders, and I am not going to invent one.**

Replicate exposes no price for a prediction. Three places were checked directly, today, with the
account's own key:

| Source | Result |
|---|---|
| The prediction object (`GET /v1/predictions/{id}`) | Keys are `id, model, version, input, logs, output, data_removed, error, source, status, created_at, started_at, completed_at, urls, metrics`. **No cost, price or billing field.** `metrics` carries only `image_output_count`, `predict_time`, `resolution_target`, `total_time`. |
| The model object (`GET /v1/models/google/nano-banana-2`) | No `pricing` field. |
| The account (`GET /v1/account`) | Returns `type, username, name, avatar_url, github_url` only. No billing endpoint, no balance, so **no billing delta is obtainable through the API either.** |

A regex sweep for any key matching `cost|price|billing` across the full prediction JSON returned zero hits
on all 19 predictions. `costUsd` is therefore **absent from all 19 manifest entries**, and
`totals.costUsd` is `0`.

> **`totals.costUsd: 0` means "nothing measurable", not "free".** The schema makes the field required, so
> a number had to be written; 0 is the sum of the measured values, of which there are none. These renders
> cost real money. Do not read that zero as a price.

**Measured price per image per model: not available.** What is measured is the billable *unit*:
`image_output_count = 1` on every one of the 19 predictions, so **19 billable images, 1 per prediction,
0 retries**. The $0.06 figure Ivan was told was an upper guess is neither confirmed nor refuted here —
it was never sent to the provider and never came back from it.

If the real number is wanted, it is on the Replicate billing dashboard for 2026-09-07, where these 19
predictions are the only activity. Nineteen prediction ids are recorded in
`artifacts/media/sneakers/ledger.json` for reconciliation.

---

## 2. What was rendered, and the one thing the style board got wrong

### 2.1 The defect in §5.4, and the still-life variant

§5.4's packshot template hard-codes **"A single right shoe, alone in frame"** immediately after
`{subject}`. That is correct for the eleven footwear products and wrong for the three `care-and-spares`
items — `care-kit`, `flat-waxed-laces`, `round-waxed-laces` — which are not shoes. Rendering those three
through the footwear template would have burned 3 of 19 paid frames with no retake.

A still-life variant (Template B below) was built instead: **the same background, the same lighting, the
same lens, the same negative string.** Exactly four spans differ, and all four exist because they name a
*shoe*:

| # | Template A (footwear) | Template B (still life) |
|---|---|---|
| 1 | `A single right shoe, alone in frame, …` | `{arrangement}` — written per product from its own `imageBrief.shots[0].description` |
| 2 | `edge separation on the dark upper` | `edge separation along the dark edges of the subject` |
| 3 | `camera positioned at midsole height so the shoe … clear space beneath the outsole` | `camera positioned low just above the ground plane so the objects … clear space beneath it` |
| 4 | `one soft feathered contact shadow directly under the outsole` / `entire shoe` | `… under each object` / `entire group` |

The negative string is carried into Template B **unchanged**, as ordered. Two of its terms read oddly
against these subjects and were kept anyway: `prop` (the kit's items are the subject, not props) and
`pair of shoes, two shoes, left shoe` (the laces are sold in pairs). Neither caused a problem — the
positive subject clause dominated in all three frames, and all three came back as proper still lifes.

**Result: the still-life variant worked.** All three accessory frames sit in the same room as the shoes.
The one accessory defect (`care-kit`) is a count error inside the subject, not a failure of the variant.

### 2.2 The template revision the smoke render forced

The smoke render (`hero-gutter-low`, product 1) came back with **correct background, correct lighting,
correct materials — and the camera mirrored.** The shoe is shown from its **medial (inner)** side, toe at
frame-right, where §5.1 requires the outer lateral side with the heel at frame-right. The tell is the
arch cut-away in the midsole waist, confirmed by cropping the sole at full resolution. It *is* a right
shoe, so §5.6(4) was never breached — the camera clause was.

That is a template failure, not a subject failure, so the standing rule applied: **rewrite the template,
continue with the next product, do not re-render product 1.** The model was not switched; the subject was
excellent.

The rewrite replaced §5.4's abstract instruction with frame coordinates, because an image model has no
lens axis to reason about:

| | |
|---|---|
| v1 (§5.4) | `toe rotated 30 degrees to the left of the lens axis, the outer lateral side facing the camera, heel visible` |
| v2 | `The shoe points to the left: the toe is at the left of the frame and the heel is at the right of the frame. The camera sees the outer side wall of the shoe, the side away from the arch; the instep and its cut-away arch curve are on the far side, hidden from the camera.` |

Six terms were appended to the packshot negative for footwear only: `medial side, inner side of the shoe,
visible arch cut-out, instep hollow, toe pointing to the right, heel on the left`.

**v2 was verified on product 2 before the remaining twelve were committed** — one frame of risk, not
twelve. It held: **all ten footwear frames rendered after the fix have the correct direction.**
`hero-gutter-low` is the only product frame in the catalog that faces right, which is exactly what the
contact sheet shows, and it is item 1 in the second-pass order.

### 2.3 The negative prompt is a clause, not a field

**None of the three approved models accepts a `negative_prompt` input** — checked against each version's
own `openapi_schema` before spending anything. `nano-banana-2` takes `prompt, resolution, image_input,
aspect_ratio, image_search, google_search, output_format`, and neither flux model has a negative field
either.

The style board says the negative string is "pasted verbatim alongside every render". With no negative
field, *alongside* became a trailing clause in the same prompt string:

```text
<prompt body>

Do not include: <negative string>
```

The board's text is carried through character for character. It is also stored separately in each
manifest entry's `negativePrompt`, so the two halves stay distinguishable.

---

## 3. Per-frame results

`finding` is the checklist result. All four flagged frames **shipped into the catalog** under the exact
filenames `products.json` and the style board reference; none was re-rendered.

| frame | template | model | status | wall | finding |
|---|---|---|---|---|---|
| `hero-gutter-low` | packshot v1 | nano-banana-2 | **flagged** | 19.5s | Mirrored: medial side, toe frame-right. §5.1 camera clause. The v1 smoke render. |
| `hero-sett-low` | packshot v2 | nano-banana-2 | accepted | 16.2s | On spec. Seven eyelets, foxing tape, diamond tread, suede toe and heel all present. |
| `hero-flagstone-low` | packshot v2 | nano-banana-2 | accepted | 17.3s | On spec. Laces read flat where the brief says round — too small to spend a render on. |
| `hero-bollard-high` | packshot v2 | nano-banana-2 | accepted | 17.2s | On spec. Acid heel tab clean and prominent. |
| `hero-gantry-high` | packshot v2 | nano-banana-2 | accepted | 16.7s | On spec. Wax creasing at the flex line and the stitched toe bumper both visible. |
| `hero-stanchion-high` | packshot v2 | nano-banana-2 | accepted | 15.3s | On spec. Feather-edge stitching and the stacked midsole both readable. |
| `hero-verge-runner` | packshot v2 | nano-banana-2 | accepted | 17.5s | On spec. Foam stack, heel clip and both rubber pads present. |
| `hero-camber-runner` | packshot v2 | nano-banana-2 | accepted | 19.2s | On spec. Knit acid green matches Sulphur; seamless collar reads. |
| `hero-towpath-runner` | packshot v2 | nano-banana-2 | accepted | 16.9s | On spec. Suede overlays and the dual-density midsole both separated from the mesh. |
| `hero-culvert-trail` | packshot v2 | nano-banana-2 | accepted | 17.2s | On spec. Rand unbroken around the toe; lugs read shallower than the briefed 5 mm. |
| `hero-cattle-grid-trail` | packshot v2 | nano-banana-2 | **flagged** | 17.1s | Background warm-tinted, not neutral mid-grey. Measured R−B = 10.6 against a fleet median of 0.1. §5.1 / §5.6(6). |
| `hero-care-kit` | still life | nano-banana-2 | **flagged** | 17.2s | Two separate brushes rendered where the brief specifies one double-ended brush — four objects for a "three piece" kit. |
| `hero-flat-waxed-laces` | still life | nano-banana-2 | accepted | 16.9s | On spec. Flat weave, four brass aglets, low sheen. |
| `hero-round-waxed-laces` | still life | nano-banana-2 | accepted | 16.8s | On spec. Black / acid / chalk coils, cord twist readable in each. |
| `banner-home-hero` | editorial | nano-banana-2 | accepted | 19.1s | Meets every §6.1 requirement including the quiet left third. Camera sits near ground level, not §5.5's standing eye height — documented, deliberately not queued. |
| `tile-low-tops` | editorial | nano-banana-2 | **flagged** | 12.9s | Head, hood and shoulders in frame; §5.5 requires a crop below the shoulders. No face visible, so the identifiability rule holds. |
| `tile-high-tops` | editorial | nano-banana-2 | accepted | 12.1s | On spec. Waist crop, mid-air high top against a shutter, acid pull loop. |
| `tile-runners` | editorial | nano-banana-2 | accepted | 14.3s | On spec. Trailing foot lifting off and the frame stays sharp. |
| `tile-trail` | editorial | nano-banana-2 | accepted | 12.0s | On spec. Knee crop, broken kerbstone and gravel, darkest of the four. |

### One conflict inside the style board, and how it was resolved

§6.2 tile 3 asks for "slight natural motion in the trailing foot"; the §5.5 editorial negative forbids
`motion blur`. The negative string is pasted verbatim by order, so the subject was written to describe the
**pose** rather than the blur — "the trailing foot just lifting off the asphalt while the whole frame
stays sharp". The frame came back sharp and still reads as movement.

---

## 4. Delivery

All 19 delivered files carry the **exact filenames** `products.json` and style-board §6 already
reference — verified by reading those files and checking each path on disk, not by assuming.

- 14 product heroes → `media/<handle>-hero.webp`, 1600×1600
- 1 banner → `media/home-hero.webp`, 2400×1340
- 4 tiles → `media/tile-<handle>.webp`, 825×1024

WebP quality 82 throughout. `withoutEnlargement` is set on the resize, so **`longestSide` is a cap, not a
target**: §5.6(10) forbids visible upscaling artefacts, and the banner's native render is 2752×1536, the
tiles' 928×1152. Nothing was enlarged. Every delivered file clears the schema's 768 px floor on both axes
(the tightest is the tiles' 825 px width).

`media/manifest.json` **validates against `specs/store-profiles/media-manifest.schema.json`** (ajv, 19
entries, `VALID: true`).

**No provider URL appears in any JSON, TS or MD** except each sidecar's `outputUrl` field, which is
provenance for a URL that Replicate will purge within about a day. Bytes were downloaded inside the same
run that created each prediction, written to disk before any other work, and **all 19 raw PNGs are kept —
accepted, flagged, all of them** (86 MB). Nothing paid for was deleted.

### The delivered images are gitignored — the orchestrator should know before committing

`apps/backend/.gitignore:32` ignores `src/migration-scripts/data/profiles/*/media/*.webp`, so **a commit
will carry `manifest.json` but none of the 19 images.** The raws are ignored too
(`.gitignore:69` → `artifacts/media/`). This looks deliberate — it is what keeps binaries out of history —
and I did not change either file, since neither is in my zone.

The consequence is worth stating: **on a fresh clone of this branch there are no images on disk**, so any
S6 storefront acceptance run somewhere other than this worktree will render empty frames. The manifest
carries a `sha256` and a `sourceFile` for every frame, so what shipped is identifiable, but the bytes
themselves live only here and in nobody's git history. Whether that is fine or needs an asset path is a
call above my zone.

## 5. Files

- Driver — `apps/backend/scripts/store-media/generate.mjs` (`plan` / `run` / `convert` / `sheet`)
- Prompts — `apps/backend/scripts/store-media/prompts.mjs`
- Frame registry — `apps/backend/scripts/store-media/frames.mjs`
- Replicate client — `apps/backend/scripts/store-media/replicate.mjs`
- Raw renders + sidecars — `artifacts/media/sneakers/raw/` (19 PNG + 19 JSON)
- Spend ledger — `artifacts/media/sneakers/ledger.json` (19/19, refuses a twentieth)
- Review verdicts — `artifacts/media/sneakers/review.json`
- Second-pass order — `artifacts/media/sneakers/second-pass.json`
- Contact sheet — `artifacts/media/sneakers/contact-sheets/2026-09-07-products.webp`
- Manifest — `apps/backend/src/migration-scripts/data/profiles/sneakers/media/manifest.json`

### How the 19-render cap is actually enforced

Not by care. `artifacts/media/sneakers/ledger.json` is appended **the moment a prediction exists**, before
anything downstream can throw, and the gate refuses two things by exception: a twentieth prediction, and a
second prediction for a key that already has one. A re-run of `generate.mjs run` cannot quietly re-render
a frame that disappointed — it aborts.

---

## 6. Stated plainly: what I could not measure

1. **The cost of any render.** Not exposed by the provider on the prediction, the model or the account.
   `totals.costUsd: 0` is "nothing measured", not "free". §1 has the evidence.
2. **The measured price per image per model.** Same reason. The billable unit is measured — 19 images,
   one per prediction — the price attached to it is not.
3. **Whether `hero-gutter-low` shows a right shoe seen medially or a left shoe.** The arch cut-away
   establishes the *medial* view; handedness then follows as "right", which is the reading I acted on,
   and §5.6(4) is satisfied on that reading. It is an inference from one frame, not a measurement.
4. **Speed-hook and eyelet counts on several frames.** Countable hardware is at the edge of what a
   1600 px frame resolves; where the count could not be read cleanly the frame was judged on the
   features that could be.

---

## 7. Prompt templates, verbatim

Every block below is printed from the code that produced the renders, not retyped.

### Template A — packshot, footwear (v2, used for 10 of the 11 footwear frames)

```text
Studio product photograph of {subject} A single right shoe, alone in frame, in three-quarter front view seen from its outer side. The shoe points to the left: the toe is at the left of the frame and the heel is at the right of the frame. The camera sees the outer side wall of the shoe, the side away from the arch; the instep and its cut-away arch curve are on the far side, hidden from the camera. Seamless matte concrete-grey cyclorama background, flat mid-grey, one stop lighter at the top, no seam between floor and wall, no horizon. One large softbox key at 45 degrees camera-left and 30 degrees above, one narrow strip reflector camera-right at quarter power for edge separation on the dark upper, neutral 5600K daylight, no coloured light. 85mm lens at f/8, camera positioned at midsole height so the shoe is seen very slightly from below, shoe centred and filling 80 percent of the frame width with clear space beneath the outsole. Exactly one soft feathered contact shadow directly under the outsole, no cast side shadow, no reflection, matte floor. Sharp focus across the entire shoe, front to back, material texture clearly visible. Square 1:1 composition. Clean commercial e-commerce packshot, unbranded, no markings.
```

Negative clause appended to every packshot prompt as `Do not include: …`:

```text
logo, logotype, brand name, brand mark, text, letters, numbers, typography, watermark, signature, swoosh, three stripes, trefoil, star, chevron, hangtag, price tag, label, sticker, shoe box, packaging, tissue paper, human, person, face, hands, arms, legs, feet, ankle, sock, mannequin, foot form, prop, plant, leaves, rock, gravel, sand, confetti, podium, plinth, pedestal, stool, table, mirror, reflection, water, wet floor, glossy floor, puddle, gradient background, coloured background, coloured gel, neon light, lens flare, bokeh, shallow depth of field, out of focus, motion blur, tilted horizon, dutch angle, top-down view, flat lay, overhead shot, pair of shoes, two shoes, left shoe, cartoon, illustration, sketch, 3d render, cgi, plastic look, low resolution, jpeg artifacts, noise, oversaturated, hdr, heavy vignette, medial side, inner side of the shoe, visible arch cut-out, instep hollow, toe pointing to the right, heel on the left
```

### Template A0 — packshot v1, the smoke render only (`hero-gutter-low`)

This is the exact prompt string sent to the provider for that one frame, copied from its sidecar
`artifacts/media/sneakers/raw/hero-gutter-low.json`. Its direction clause is style-board §5.4 verbatim,
and it is the clause that failed. The subject is not a placeholder here because this prompt was really sent.

```text
Studio product photograph of a low-top leather sneaker with a deep black full-grain leather upper, a black suede toe wrap, black flat waxed laces through six dark metal eyelets, a small acid yellow-green heel tab, an off-white moulded cupsole midsole and a black rubber outsole with a shallow herringbone tread. A single right shoe, alone in frame, three-quarter front view: toe rotated 30 degrees to the left of the lens axis, the outer lateral side facing the camera, heel visible. Seamless matte concrete-grey cyclorama background, flat mid-grey, one stop lighter at the top, no seam between floor and wall, no horizon. One large softbox key at 45 degrees camera-left and 30 degrees above, one narrow strip reflector camera-right at quarter power for edge separation on the dark upper, neutral 5600K daylight, no coloured light. 85mm lens at f/8, camera positioned at midsole height so the shoe is seen very slightly from below, shoe centred and filling 80 percent of the frame width with clear space beneath the outsole. Exactly one soft feathered contact shadow directly under the outsole, no cast side shadow, no reflection, matte floor. Sharp focus across the entire shoe, front to back, material texture clearly visible. Square 1:1 composition. Clean commercial e-commerce packshot, unbranded, no markings.
```

Its negative clause was the §5.4 board string WITHOUT the six v2 terms (i.e. ending at `heavy vignette`).

### Template B — packshot, still life (the 3 `care-and-spares` frames)

```text
Studio product photograph of {subject} {arrangement} Seamless matte concrete-grey cyclorama background, flat mid-grey, one stop lighter at the top, no seam between floor and wall, no horizon. One large softbox key at 45 degrees camera-left and 30 degrees above, one narrow strip reflector camera-right at quarter power for edge separation along the dark edges of the subject, neutral 5600K daylight, no coloured light. 85mm lens at f/8, camera positioned low just above the ground plane so the objects are seen very slightly from below, the group centred and filling 80 percent of the frame width with clear space beneath it. Exactly one soft feathered contact shadow directly under each object, no cast side shadow, no reflection, matte floor. Sharp focus across the entire group, front to back, material texture clearly visible. Square 1:1 composition. Clean commercial e-commerce packshot, unbranded, no markings.
```

Negative clause: the style-board §5.4 string above, verbatim and unextended (no handedness to correct).

### Template C — editorial (banner 16:9 + 4 tiles 4:5)

```text
Editorial street photograph, {subject} Shot at 35mm, f/2.8, from standing eye height, on a city street at dusk under sodium and LED street lighting; damp asphalt, painted road markings, kerbstones and pavement edges in frame. Cool ambient light with one warm practical source. The frame is cropped below the shoulders — no face is visible and no person is identifiable. Natural grain, no HDR, restrained contrast, deep shadows retained. Composition leaves the left third quiet and low in detail so display type can sit over it.
```

```text
face, portrait, eyes, identifiable person, crowd, logo, brand name, shop sign, street sign, number plate, licence plate, poster, graffiti text, readable text, letters, numbers, watermark, signature, model release, studio background, white background, flat lay, product on white, hdr, oversaturated, teal and orange grade, heavy bloom, lens flare, motion blur, cartoon, illustration, 3d render, cgi, low resolution, jpeg artifacts
```
