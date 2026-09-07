# Style board — Kerbstone · profile `sneakers`

Design stage S2 of the store-profiles pilot. Written by the creative director, 2026-09-07.
Program row that fixes this profile: `docs/store-profiles/00-program-2026-09-07.md` §F6/F8 (Ivan's decision —
not re-derived here). Canon this board obeys: `~/upready/packages/geist-kit/AGENTS.md` (rule 27).
Token dictionary: `geist-kit/theme.css`, shape `specs/design-system/theme-preset.schema.json`.
Field limits: `specs/store-profiles/store-profile.schema.json`.

Everything downstream is derived from this file: `profile.json`, `theme.json`, the catalog copy (S3),
the image prompts (S4), the storefront blocks (S6). **Nothing here is a menu of options — every line is a
decision.** Where a decision departs from the Geist canon it is marked `DIVERGENCE` and carries its reason
(canon rule: an intentional divergence is recorded, never silent).

What this board does NOT decide: the assortment. Product names, prices and colour counts that appear in the
mock-ups are illustrative placeholders so the frames can show real behaviour; S3 owns the catalog.

---

## 1. Brand

| Field | Value | Length | Limit |
|---|---|---|---|
| `brand.name` | Kerbstone | 9 | 2–32 |
| `brand.tagline` | Street-built sneakers for the long way home | 43 | 8–90 |
| `brand.wordmark.text` | KERBSTONE | 9 | 1–32 |
| `brand.wordmark.style` | `wordmark` | — | `wordmark` \| `monogram` |
| `brand.legalName` | Kerbstone Footwear Ltd. | 23 | ≤80 |
| `vertical` | streetwear sneakers | 19 | 3–80 |

**Why the name.** A kerbstone is the cut stone that edges a pavement — the literal boundary between the road
and the walk. It is the exact object the brand story sits on ("made for the kerb, not the catwalk"), it is one
plain English word, and it sets well: nine capitals in a display grotesque, no ascender/descender clash, no
awkward letter pair. Trademark check in §9(b).

**Wordmark.** `wordmark`, not a monogram — a nine-letter word is short enough to carry the header at 15px and
a monogram would throw away the only thing the name does (it means something).

Set as: **Space Grotesk 500, all caps, letter-spacing +0.14em, no italic, `--foreground`.**
Sizes: 15px in the header, 13px in the footer, 44px on the 404 and order-confirmation pages. No logotype
image file, no icon, no lockup — the wordmark is live text, so it re-flows, is selectable, and needs no asset
from S4.

> `DIVERGENCE` (canon: "sentence case everywhere; uppercase only for tiny mono eyebrows").
> The wordmark is set in caps. Reason: a logotype is an identity mark, not UI copy, and the canon's rule
> governs interface text. The scope is exactly one string — **KERBSTONE is the only uppercase text anywhere in
> this storefront.** There are no uppercase eyebrows, no uppercase buttons, no uppercase table headers. Anyone
> who finds a second uppercase string has found a bug.

**Brand voice — three sentences.**
Kerbstone writes like someone who actually walks the city: short sentences, plain nouns, no exclamation marks.
It names the thing — the leather, the drop, the outsole compound — and lets the reader decide, because the
buyer already knows more about sneakers than the copy does. It never reaches for "iconic", "legendary",
"game-changing" or "curated", and it never shouts.

**Product naming convention** (a gift to S3, not a constraint on the assortment): models take the name of a
piece of street infrastructure — Gutter, Bollard, Verge, Culvert, Cattle grid, Sett — followed by the shape:
`low`, `high`, `runner`, `trail`. So "Gutter low", "Bollard high", "Verge runner". Lowercase shape word, per
the sentence-case rule.

**Colourway vocabulary** (the `Colourway` option carries a hex, per the program row):
Tar black `#0A0A0A` · Sulphur `#D6FF3B` · Concrete `#8A8A8A` · Oxblood `#4A1418` · Chalk `#E8E4DC` ·
Diesel `#1F2A2E`. Sulphur is the brand acid: it is the same hex as `--primary` in dark mode, so a Sulphur
colourway and the CTA are literally the same colour — the accent is a material the brand uses, not a UI
decoration bolted on.

---

## 2. Audience persona

`audience.region`: **EU and US cities** (storefront prices shown in USD, EUR and JPY per the pilot's
three-currency check).

`audience.persona` (goes verbatim into `profile.json`, 188 characters, limit 200):

> Alex, 24, lives car-free in Berlin or Chicago, walks or rides everywhere, buys two pairs a year and wears
> them until the midsole gives out; judges a shoe by its outsole, not its marketing.

**The reading behind it.** This is a person who arrives at the product page already knowing the vocabulary —
cupsole vs vulcanised, drop, stack height — and who is annoyed by a store that hides the specification behind
a mood. They shop at night, on a phone, in a dark room; that is why `defaultMode` is `dark` and why the sticky
add-to-bag bar on mobile repeats the price, size and colourway (a choice made three screens ago must never be
off-screen). They are price-aware but not price-led: $140–$210 is the band, and the store never discounts on
the front page, because a permanent sale strip reads as a brand that does not believe its own prices. The
promo strip therefore carries service facts (shipping, returns, dispatch time), not a discount.

---

## 3. Palette — canon tokens, both modes

`defaultMode: dark`. Character: **ink black plus exactly one acid accent** (program row F6).

The acid is **Sulphur `#D6FF3B`** — a green-yellow at the top of the visible-luminance band, the colour of a
hi-vis vest and a sodium-lit road marking. It is the only chromatic colour in the interface. Everything else
is ink and grey.

**Key set.** The dictionary is `geist-kit/theme.css` and the schema requires the key set to be identical
across both modes and across every preset, so this preset carries **the full canon key set**, not just the
nineteen colour keys: the three status/accent keys (`--link`, `--success`, `--warning`) and the three shadow
keys are included with values, because dropping a key that other presets carry would break the build script's
identical-key-set check.

### 3.1 Tokens

| Token | dark (default) | light | Role |
|---|---|---|---|
| `--radius` | `0.25rem` | `0.25rem` | 4px base → sm 2 / md 4 / lg 8 / xl 12. Hard edges; a street brand is not rounded. |
| `--background` | `#0A0A0A` | `#FFFFFF` | page |
| `--foreground` | `#EDEDED` | `#0A0A0A` | primary text |
| `--card` | `#101010` | `#FFFFFF` | product card, panel |
| `--card-foreground` | `#EDEDED` | `#0A0A0A` | text on a card |
| `--popover` | `#161616` | `#FFFFFF` | menus, mobile sticky bar, size guide |
| `--popover-foreground` | `#EDEDED` | `#0A0A0A` | text on a popover |
| `--primary` | `#D6FF3B` | `#0A0A0A` | the CTA block |
| `--primary-foreground` | `#0A0A0A` | `#D6FF3B` | the CTA label |
| `--secondary` | `#1A1A1A` | `#F5F5F5` | promo strip, soft fill, filter bar |
| `--secondary-foreground` | `#EDEDED` | `#0A0A0A` | text on a soft fill |
| `--muted` | `#1A1A1A` | `#F5F5F5` | inert surface, disabled cell |
| `--muted-foreground` | `#A1A1A1` | `#5C5C5C` | secondary text, counts, "out of stock" |
| `--accent` | `#1F1F1F` | `#F0F0F0` | hover fill on rows and menu items |
| `--accent-foreground` | `#EDEDED` | `#0A0A0A` | text on a hover fill |
| `--destructive` | `#FF6166` | `#D40000` | remove from bag, payment error |
| `--destructive-foreground` | `#0A0A0A` | `#FFFFFF` | text on destructive |
| `--border` | `#262626` | `#E4E4E4` | 1px hairline, dividers, card edge at rest |
| `--input` | `#262626` | `#E4E4E4` | input hairline |
| `--ring` | `#D6FF3B` | `#4C6600` | focus ring, selected swatch/size, hovered card edge |
| `--link` | `#D6FF3B` | `#4C6600` | links and success — the canon's single accent slot |
| `--success` | `#D6FF3B` | `#4C6600` | "in stock", "order placed" |
| `--warning` | `#FF990A` | `#B25E00` | low stock, delayed dispatch |
| `--shadow-card` | `inset 0 0 0 1px #ffffff14` | `inset 0 0 0 1px #00000014, 0 2px 2px #0000000a, 0 8px 8px -8px #0000000a` | canon values, carried verbatim |
| `--shadow-float` | `inset 0 0 0 1px #ffffff14` | `inset 0 0 0 1px #00000014, 0 2px 2px #0000000a, 0 8px 16px -4px #0000000a` | canon values, carried verbatim |
| `--shadow-modal` | `inset 0 0 0 1px #ffffff1f` | `inset 0 0 0 1px #00000014, 0 1px 1px #00000005, 0 8px 16px -4px #0000000a, 0 24px 32px -8px #0000000f` | canon values, carried verbatim |

**Three decisions inside that table that an implementer will otherwise get wrong.**

1. **`--accent` is NOT the brand accent.** In the shadcn/Geist dictionary `--accent` is the subtle hover
   surface. The brand acid lives in `--primary`, `--ring`, `--link` and `--success`. Do not paint `--accent`
   Sulphur; a hovered menu row must not flash hi-vis green.
2. **`--primary` flips between modes; the brand does not.** Dark: an acid block with an ink label. Light: an
   ink block with an acid label. Both read as "ink and acid". The reason is measured, not aesthetic —
   Sulphur on white scores **1.15:1** (§3.2, row `primary on background`, light), so an acid block on a white
   page has no readable edge and stops looking like a button. Flipping the polarity in light mode keeps the
   accent on screen and puts the contrast back at 19.80:1.
3. **`--link` is darker in light mode** (`#4C6600`, same hue family, 6.55:1 on white) because acid text on
   white is unreadable. This is one accent at two luminances, not two accents.

### 3.2 Contrast table — WCAG 2.1, computed

Every ratio below is produced by the script in §9(a) and copied from its output, not estimated.
Floor **4.5:1** for anything carrying text; **3.0:1** for the non-text pairs (a control's edge against the
page); rows marked `info` are hairlines, which WCAG does not floor, and are listed so nobody has to guess
whether the number was checked or forgotten.

**dark** (default mode)

| Pair | Colours | Ratio | Floor | Verdict |
|---|---|---:|---:|---|
| foreground on background | `#EDEDED` / `#0A0A0A` | 16.91 | 4.5 | pass |
| muted-foreground on background | `#A1A1A1` / `#0A0A0A` | 7.66 | 4.5 | pass |
| primary-foreground on primary | `#0A0A0A` / `#D6FF3B` | 17.18 | 4.5 | pass |
| card-foreground on card | `#EDEDED` / `#101010` | 16.25 | 4.5 | pass |
| accent-foreground on accent | `#EDEDED` / `#1F1F1F` | 14.08 | 4.5 | pass |
| destructive-foreground on destructive | `#0A0A0A` / `#FF6166` | 6.74 | 4.5 | pass |
| popover-foreground on popover | `#EDEDED` / `#161616` | 15.46 | 4.5 | pass |
| secondary-foreground on secondary | `#EDEDED` / `#1A1A1A` | 14.87 | 4.5 | pass |
| muted-foreground on muted | `#A1A1A1` / `#1A1A1A` | 6.74 | 4.5 | pass |
| muted-foreground on card | `#A1A1A1` / `#101010` | 7.36 | 4.5 | pass |
| link on background | `#D6FF3B` / `#0A0A0A` | 17.18 | 4.5 | pass |
| link on card | `#D6FF3B` / `#101010` | 16.51 | 4.5 | pass |
| warning on background | `#FF990A` / `#0A0A0A` | 9.25 | 4.5 | pass |
| primary on background | `#D6FF3B` / `#0A0A0A` | 17.18 | 3.0 | pass |
| ring on background | `#D6FF3B` / `#0A0A0A` | 17.18 | 3.0 | pass |
| border on background | `#262626` / `#0A0A0A` | 1.31 | — | info (hairline) |

**light**

| Pair | Colours | Ratio | Floor | Verdict |
|---|---|---:|---:|---|
| foreground on background | `#0A0A0A` / `#FFFFFF` | 19.80 | 4.5 | pass |
| muted-foreground on background | `#5C5C5C` / `#FFFFFF` | 6.69 | 4.5 | pass |
| primary-foreground on primary | `#D6FF3B` / `#0A0A0A` | 17.18 | 4.5 | pass |
| card-foreground on card | `#0A0A0A` / `#FFFFFF` | 19.80 | 4.5 | pass |
| accent-foreground on accent | `#0A0A0A` / `#F0F0F0` | 17.37 | 4.5 | pass |
| destructive-foreground on destructive | `#FFFFFF` / `#D40000` | 5.53 | 4.5 | pass |
| popover-foreground on popover | `#0A0A0A` / `#FFFFFF` | 19.80 | 4.5 | pass |
| secondary-foreground on secondary | `#0A0A0A` / `#F5F5F5` | 18.16 | 4.5 | pass |
| muted-foreground on muted | `#5C5C5C` / `#F5F5F5` | 6.13 | 4.5 | pass |
| muted-foreground on card | `#5C5C5C` / `#FFFFFF` | 6.69 | 4.5 | pass |
| link on background | `#4C6600` / `#FFFFFF` | 6.55 | 4.5 | pass |
| link on card | `#4C6600` / `#FFFFFF` | 6.55 | 4.5 | pass |
| warning on background | `#B25E00` / `#FFFFFF` | 4.67 | 4.5 | pass |
| primary on background | `#0A0A0A` / `#FFFFFF` | 19.80 | 3.0 | pass |
| ring on background | `#4C6600` / `#FFFFFF` | 6.55 | 3.0 | pass |
| border on background | `#E4E4E4` / `#FFFFFF` | 1.27 | — | info (hairline) |

**26 pairs checked at the 4.5 floor across both modes · minimum ratio 4.67 · 0 failures.**
The tightest pair is `warning on background` in light mode (`#B25E00` on white, 4.67:1). It has 0.17 of
headroom, so anyone darkening the page background in light mode must re-run §9(a) — this is the row that will
break first.

Two hexes in this table are the result of a failed run, not a first guess: light `--destructive` moved from
the canon `#EE0000` (4.24:1 against white, below the floor) to `#D40000` (5.53:1), and light `--primary`
flipped from Sulphur to ink after `primary on background` scored 1.15:1 against a 3.0 floor.

---

## 4. Typography

`theme.typography.display`: **Space Grotesk** · `theme.typography.body`: **Inter**. Both are on the schema's
allow-list (`#/definitions/font`); no reason to differ from the program row, and every weight below is ≤ 600
per the canon.

Space Grotesk is the right display face here for a reason beyond taste: its numerals are wide, flat-sided and
tabular by default, so a price and a EU size read as machined parts rather than as prose — which is exactly
the register a spec-literate buyer wants.

### 4.1 Type scale

| Role | Face | Weight | Size / line-height | Tracking | Where |
|---|---|---:|---|---|---|
| h1 hero (desktop) | Space Grotesk | 600 | 56 / 58 px | −0.04em | home hero headline |
| h1 hero (≤ 640px) | Space Grotesk | 600 | 34 / 36 px | −0.03em | home hero headline |
| h1 pdp (desktop) | Space Grotesk | 600 | 40 / 44 px | −0.03em | product title |
| h1 pdp (≤ 640px) | Space Grotesk | 600 | 28 / 32 px | −0.02em | product title |
| h2 (desktop) | Space Grotesk | 600 | 32 / 36 px | −0.03em | section headings, category title |
| h2 (≤ 640px) | Space Grotesk | 600 | 24 / 28 px | −0.02em | section headings |
| h3 | Space Grotesk | 500 | 20 / 26 px | −0.02em | card product name, accordion header |
| body | Inter | 400 | 16 / 24 px | 0 | paragraphs, descriptions |
| body-ui | Inter | 400 | 14 / 20 px | 0 | nav, filters, form labels, buttons |
| small | Inter | 400 | 13 / 19 px | +0.005em | counts, tax line, breadcrumb, footnotes |
| price (card) | Space Grotesk | 500 | 15 / 20 px | 0 | product card |
| price (pdp, desktop) | Space Grotesk | 600 | 28 / 32 px | −0.02em | product page |
| price (pdp, ≤ 640px) | Space Grotesk | 600 | 24 / 28 px | −0.02em | product page |
| size / SKU / qty | Inter | 500 | 14 / 20 px | 0 | size cells, order lines |

**Weights actually loaded: 400 and 500 Inter; 500 and 600 Space Grotesk. Four faces, nothing above 600.**
Voice comes from negative tracking on the display sizes, per the canon, never from weight.

`font-variant-numeric: tabular-nums` is set on **every** number that a reader compares or that changes in
place: prices in all three currencies, EU sizes, quantities, order totals, the bag counter, the product count
on a listing, dispatch times. A price that shifts by a pixel when the currency switches is a bug.

> `DIVERGENCE` (canon: "Geist Mono + `tabular-nums` for ALL data").
> There is no mono face in this storefront. Reason: `theme.typography` in the profile schema has exactly two
> slots (`display`, `body`) and no mono slot, so a third family has no way to reach the build. The canon's
> intent — numbers that align in a column and never jitter — is met by `tabular-nums` on both families
> (Inter and Space Grotesk both ship tabular figures). Scope of the divergence: the *face* of numeric data,
> not its alignment behaviour. If a mono slot is added in wave 2, prices and sizes move to IBM Plex Mono.

---

## 5. Photography direction

One physical setup, described tightly enough that a text-to-image prompt can be assembled from it
mechanically. The whole catalog is shot as if on one day, in one room, with one light.

### 5.1 The setup

- **Background.** Seamless matte concrete-grey cyclorama, flat mid-grey `#616161`, with a gentle
  top-to-bottom falloff of about one stop (lighter at the top). No horizon line, no visible seam between wall
  and floor, no vignette, no gradient into another hue. **Why mid-grey and not black:** the house colourway is
  Tar black `#0A0A0A` and the default UI mode is dark — a black shoe on a black ground on a `#101010` card is
  an invisible product. Mid-gray separates every colourway in both UI modes, which is the whole job of the
  background.
- **Lighting.** One large softbox key at 45° camera-left and roughly 30° above the shoe, 1.2 m from the
  subject; one narrow strip reflector camera-right at about a quarter of the key's power, purely for edge
  separation along the dark upper. Neutral 5600 K. **No coloured gels ever** — the acid in this brand is a
  material, not a light.
- **Camera.** Height = the midsole line, about 12 cm above the floor plane, so the shoe is seen very slightly
  from below and reads as an object rather than as merchandise on a table. 85 mm equivalent, f/8, subject at
  1.4 m. The long lens keeps the silhouette geometrically honest; a wide lens bends the toe box and every
  shoe in the grid stops matching.
- **Floor and shadow.** Same matte concrete surface, continuous with the sweep. Exactly one soft contact
  shadow directly beneath the outsole, feathered over about 40 mm, roughly 30% density. No cast side shadow,
  no mirror reflection, no wet or glossy floor. The shadow's job is to stop the shoe floating; anything more
  is a second subject.
- **Props.** None. No boxes, no laces arranged artfully, no plinths, no gravel, no foliage, no second shoe.
  One right shoe, alone.
- **Framing.** Single **right** shoe, centred, filling 78–84% of the frame width, with about 8% clear below
  the outsole. Square 1:1, matching `imageTreatment.aspect`.
- **Hero packshot angle.** **3/4 front**: toe rotated 30° to the left of the lens axis, the lateral (outer)
  side of the shoe facing camera, heel visible at the right of the frame. This is the angle that shows
  silhouette, toe shape, midsole stack and heel counter in one frame — which matters because in this pilot it
  is the only frame there is.

### 5.2 What is rendered in this pilot

**The hero packshot is the ONLY frame rendered per product.** Ivan's decision, 2026-09-07: one angle per
product, no regenerations; frames flagged at review go to a separate second pass. So per product: exactly one
image, the 3/4 front packshot described above. The storefront must therefore never assume a second image —
see §7 on `hover: none` and §8 frames 3 and 5 on the gallery dots.

### 5.3 WAVE 2 — NOT RENDERED NOW

Described so the direction is complete and so wave 2 does not have to re-invent it. **None of these are
produced in the pilot; no prompt below is to be run in S4.**

| Role | Angle / lens | Purpose | How it is produced in wave 2 |
|---|---|---|---|
| `angle` | Lateral profile, 90° to the lens axis, same height, same 85 mm | Silhouette and stack height, the shot a spec-literate buyer looks for | Fresh render from the same setup paragraph, angle clause swapped |
| `detail` | 100 mm macro, 20 cm, on the acid element (heel tab or midsole stripe) | Proves the material and the finish | Fresh render, framing clause swapped, same light |
| `lifestyle` | 35 mm, eye height of a standing person, on-foot on a street | Scale and context; the hero banner is this role | Separate editorial template, §5.5 |
| `colorway` | Identical to the hero packshot in every respect | One frame per colourway so the swatch row shows the real shoe | **Reference edit of the hero frame**, never a fresh render |

**How colourway variants are derived (wave 2).** The hero frame of the base colourway is passed back as an
image reference with an instruction that changes *only* the material colours — upper, midsole, outsole,
laces, heel tab — and changes nothing about geometry, angle, framing, lighting or shadow. The requirement is
that the two frames differ only in pixels that belong to the shoe's materials: if the toe moves by 5 px
between Tar black and Sulphur, the swatch row becomes a slideshow and the grid stops looking like one
catalog. That is why the colourway role is an edit and not a render — a fresh render will never land on the
same geometry twice.

### 5.4 Prompt template — packshot (this is the prompt S4 runs)

One placeholder, `{subject}`. The image producer substitutes the merchandiser's product brief line — model
name, shape, colourway, materials — and pastes the rest verbatim, unchanged, for every product in the
catalog. The consistency of the catalog depends on nothing after `{subject}` ever varying.

```text
Studio product photograph of {subject}. A single right shoe, alone in frame, three-quarter front view: toe rotated 30 degrees to the left of the lens axis, the outer lateral side facing the camera, heel visible. Seamless matte concrete-grey cyclorama background, flat mid-grey, one stop lighter at the top, no seam between floor and wall, no horizon. One large softbox key at 45 degrees camera-left and 30 degrees above, one narrow strip reflector camera-right at quarter power for edge separation on the dark upper, neutral 5600K daylight, no coloured light. 85mm lens at f/8, camera positioned at midsole height so the shoe is seen very slightly from below, shoe centred and filling 80 percent of the frame width with clear space beneath the outsole. Exactly one soft feathered contact shadow directly under the outsole, no cast side shadow, no reflection, matte floor. Sharp focus across the entire shoe, front to back, material texture clearly visible. Square 1:1 composition. Clean commercial e-commerce packshot, unbranded, no markings.
```

Negative prompt string (pasted verbatim alongside every packshot render):

```text
logo, logotype, brand name, brand mark, text, letters, numbers, typography, watermark, signature, swoosh, three stripes, trefoil, star, chevron, hangtag, price tag, label, sticker, shoe box, packaging, tissue paper, human, person, face, hands, arms, legs, feet, ankle, sock, mannequin, foot form, prop, plant, leaves, rock, gravel, sand, confetti, podium, plinth, pedestal, stool, table, mirror, reflection, water, wet floor, glossy floor, puddle, gradient background, coloured background, coloured gel, neon light, lens flare, bokeh, shallow depth of field, out of focus, motion blur, tilted horizon, dutch angle, top-down view, flat lay, overhead shot, pair of shoes, two shoes, left shoe, cartoon, illustration, sketch, 3d render, cgi, plastic look, low resolution, jpeg artifacts, noise, oversaturated, hdr, heavy vignette
```

### 5.5 Prompt template — editorial (hero banner 16:9 and category tiles 4:5)

A second, clearly separate template. It is the only place a person may appear, and it appears cropped.

```text
Editorial street photograph, {subject}. Shot at 35mm, f/2.8, from standing eye height, on a city street at dusk under sodium and LED street lighting; damp asphalt, painted road markings, kerbstones and pavement edges in frame. Cool ambient light with one warm practical source. The frame is cropped below the shoulders — no face is visible and no person is identifiable. Natural grain, no HDR, restrained contrast, deep shadows retained. Composition leaves the left third quiet and low in detail so display type can sit over it.
```

Editorial negative prompt:

```text
face, portrait, eyes, identifiable person, crowd, logo, brand name, shop sign, street sign, number plate, licence plate, poster, graffiti text, readable text, letters, numbers, watermark, signature, model release, studio background, white background, flat lay, product on white, hdr, oversaturated, teal and orange grade, heavy bloom, lens flare, motion blur, cartoon, illustration, 3d render, cgi, low resolution, jpeg artifacts
```

### 5.6 Negative list — what this direction forbids, everywhere

1. **No real logos or brand marks** of any kind, and no outsole tread pattern, heel-tab shape or side-panel
   device recognisably copied from an existing model. Kerbstone is fictional and must stay unmistakably so.
2. **No legible text in any frame** — not on the shoe, not on a box, not on a sign, not on a road marking.
   Text in a render is the fastest way to produce a fake trademark by accident.
3. **No human faces in packshots**, and no identifiable person in the editorial frames: those are cropped
   below the shoulders. No hands, no mannequins, no foot forms in packshots at all.
4. **No pairs.** One right shoe per packshot. Two shoes destroy the grid's rhythm and double the surface on
   which the model can invent an asymmetry.
5. **No props, plinths, gravel, foliage, confetti, boxes or tissue paper.**
6. **No coloured or gradient background**, no coloured gels, no neon, no rim-light flare. The background is
   one mid-grey.
7. **No wet, glossy or mirrored floor**, no reflection, no second shadow, no floating shoe.
8. **No top-down flat lay, no dutch angle, no tilted horizon.**
9. **No shallow depth of field in packshots** — the whole shoe is sharp; bokeh is an editorial device only.
10. **No HDR, no oversaturation, no heavy vignette, no visible upscaling artefacts.**
11. **Nothing that names a real place** — no shopfront names, no street signs, no number plates.

---

## 6. Home page concepts

Every string below is sentence case (the wordmark in §1 is the sole exception) and inside the schema limit.

### 6.1 Hero — `layout: full-bleed`

| Field | Value | Length | Limit |
|---|---|---|---|
| `headline` | Made for the kerb, not the catwalk | 34 | 8–70 |
| `subheadline` | Ink-black silhouettes with one acid detail. Cut for city miles, built to be worn out. | 85 | ≤160 |
| `cta.label` | Shop the drop | 13 | 2–30 |
| `cta.href` | `/store` | — | pattern-matched |
| `image` | `media/home-hero.webp` | — | 16:9 |

**Hero image (16:9, editorial template §5.5).** A single walker's lower body crossing a wet city street at
dusk, caught mid-stride with the leading foot just landing on the painted line of a crossing; the frame is
cut at the hips, so no face and no identifiable person is present. Sodium and LED street lighting throws a
cool ground with one warm source behind; the asphalt is damp and holds a low, broken reflection of the
lights. The shoes are Tar black with the Sulphur heel tab catching the light — the only saturated colour in
the picture, which is the whole point of the frame. Kerbstones and the pavement edge run through the lower
right. The left third is deliberately quiet and low in detail so the headline, subheadline and CTA sit over
it without a scrim doing all the work; a bottom-up ink overlay from 0 to 70% carries the rest.

### 6.2 Category tiles (4, rendered at 4:5)

| # | `label` | Len | `categoryHandle` | `image` |
|---|---|---:|---|---|
| 1 | Low tops | 8 | `low-tops` | `media/tile-low-tops.webp` |
| 2 | High tops | 9 | `high-tops` | `media/tile-high-tops.webp` |
| 3 | Runners | 7 | `runners` | `media/tile-runners.webp` |
| 4 | Trail | 5 | `trail` | `media/tile-trail.webp` |

S3 must create categories on exactly these four handles; the tiles link to `/categories/<handle>`.

**Tile images (4:5, editorial template §5.5).**

1. **Low tops** — a seated figure on a kerb, cropped at the chest, feet flat on the asphalt and knees up;
   low tops in Concrete grey with a Sulphur eyelet row. Portrait crop puts the shoes in the lower two-thirds
   and the empty road above them.
2. **High tops** — a figure stepping down off a kerbstone, cropped at the waist, one high top mid-air with
   the collar and ankle clearly readable against a dark shopfront shutter. Tar black upper, Sulphur heel tab.
3. **Runners** — a walker's legs cutting across a painted road marking at speed, cropped at the thigh, slight
   natural motion in the trailing foot only; runners in Chalk with a Sulphur midsole line, the brightest tile
   of the four.
4. **Trail** — boots on broken kerbstone and gravel at the edge of the road where the pavement gives out,
   cropped at the knee; Diesel upper, Oxblood collar, the toughest and darkest tile.

The four tiles read as one walk through the same evening: same city, same light, four surfaces — asphalt,
shutter, road marking, broken stone. They are not four separate photo shoots.

### 6.3 Promo strip

| Field | Value | Length | Limit |
|---|---|---|---|
| `enabled` | `true` | — | — |
| `text` | Free shipping over $120 · 30-day returns · every pair ships in 48 hours | 71 | ≤90 |

Service facts, never a discount — see §2. Numbers set in `tabular-nums`; the `·` separators are middots with
a hair space each side, not hyphens.

---

## 7. Layout

| Field | Value |
|---|---|
| `cardVariant` | `classic` |
| `imageTreatment.aspect` | `1:1` |
| `imageTreatment.fit` | `cover` |
| `imageTreatment.radius` | `md` (4px, from `--radius: 0.25rem`) |
| `imageTreatment.hover` | `none` |

**Why `hover: none`.** In this pilot exactly one frame is rendered per product (§5.2), so there is no second
image to reveal and no crop worth zooming into — a `second-image` hover would swap the packshot for itself
and a `zoom` would enlarge a frame that is already the whole product. The hover affordance is therefore moved
off the image and onto the card's edge: `--border` → `--ring` (Sulphur) plus an underline on the title, 120 ms
ease-out, no lift, no shadow, no movement. Nothing in the card changes size, so a pointer travelling across a
40-card grid never makes the page twitch. When wave 2 renders the `angle` role, `hover` becomes
`second-image` and this note is the thing to delete.

`cover` on a 1:1 frame is safe here because the packshot is *composed* at 1:1 (§5.1 framing) — cover and
contain resolve to the same pixels, and `cover` protects the grid if a render comes back off-ratio.

---

## 8. Mock-ups — behaviour, not boxes

Five frames. Each names the state it is in on its own first row, inside the box, so a frame can never be
read without its state. Drawn at the discipline of
`~/upready/projects/design-docs/docs/theme-configurator/06-ui-panel.md`: monospace boxes, annotations inside
the frame, every state named. Scale: the 1280 frames are 98 columns wide, the 390 frames 46 columns — the
ratio is the viewport ratio, so relative proportions in the drawings are honest.

Notation used throughout:

| Glyph | Meaning |
|---|---|
| `▓` | a rendered image occupies this area |
| `┌─┐ │ └─┘` | element at rest — 1px hairline `--border` |
| `╔═╗ ║ ╚═╝` | element **selected** or **hovered** — `--ring` (Sulphur), 2px when selected, 1px when hovered |
| `┌╌┐ ╎ └╌┘` | element **hovered** (swatches) or **out of stock** (size cells) — see the frame's own legend |
| `● ○` | filled / empty indicator dot |
| `‾‾‾` | the underline that appears on a hovered card title |
| `▾ ▸` | disclosure, open / closed |

Product names, prices and colour counts in the frames are illustrative — S3 owns the assortment.

```text
┌ FRAME 1 · Home · 1280×800 · dark ────────────────────────────────────────────────────────────────┐
│ state: loaded, pointer idle, nothing hovered                                                     │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ KERBSTONE       Low tops   High tops   Runners   Trail              Search    Account    Bag · 2 │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│▓ hero · full-bleed · 1280×720 (16:9) · media/home-hero.webp · overlay: ink 0 → 70% bottom-up    ▓│
│▓                                                                                                ▓│
│▓                                                                                                ▓│
│▓                                                                                                ▓│
│▓   Made for the kerb, not the catwalk                       h1 · Space Grotesk 600 · 56/58      ▓│
│▓                                                                                                ▓│
│▓   Ink-black silhouettes with one acid detail. Cut for       body · Inter 400 · 16/24 · muted   ▓│
│▓   city miles, built to be worn out.                                                            ▓│
│▓                                                                                                ▓│
│▓   ┌─────────────────────┐                                                                      ▓│
│▓   │    Shop the drop    │  --primary block #D6FF3B, ink label, radius md (4px) → /store        ▓│
│▓   └─────────────────────┘                                                                      ▓│
│▓                                                                                                ▓│
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Free shipping over $120 · 30-day returns · every pair ships in 48 hours                         │
│  promo strip · 44px tall · --secondary bg · hairline top+bottom · numbers tabular                │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Shop by shape                                              h2 · Space Grotesk 600 · 32/36       │
│                                                                                                  │
│  ┌ 4:5 ──────────┐  ┌ 4:5 ──────────┐  ┌ 4:5 ──────────┐  ┌ 4:5 ──────────┐                      │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│                      │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│                      │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│                      │
│  │ Low tops      │  │ High tops     │  │ Runners       │  │ Trail         │  label bottom-left   │
│  └───────────────┘  └───────────────┘  └───────────────┘  └───────────────┘  over ink scrim      │
│  → /categories/low-tops   /high-tops        /runners           /trail                            │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  New this week                                                        h2 · 32/36                 │
│                                                                                                  │
│  ┌ 1:1 ─────────┐  ┌ 1:1 ─────────┐  ┌ 1:1 ─────────┐  ┌ 1:1 ─────────┐   product rail, 4-up     │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│   cardVariant classic    │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│   fit cover              │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘                          │
│   Gutter low        Bollard high      Verge runner      Culvert trail     h3 · 20/26 · 500       │
│   $140              $165              $180              $210              price · tnum · 500     │
│   ●●●● 4 colours    ●●● 3 colours     ●●●● 4 colours    ●● 2 colours      swatch dots 8px        │
│                                                                                                  │
│   (names and prices above are illustrative — the assortment is S3's, not the style board's)      │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Kerbstone · Made for the kerb, not the catwalk        Help  Shipping  Returns  Terms            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘

┌ FRAME 2 · Home · 390×844 · dark ─────────────┐
│ state: loaded · tiles in 2 columns           │
├──────────────────────────────────────────────┤
│ ≡   KERBSTONE            Search   Bag · 2    │
├──────────────────────────────────────────────┤
│▓ hero 390×220 (16:9 crop, focal point kept) ▓│
│▓                                            ▓│
│▓  Made for the kerb, not                    ▓│
│▓  the catwalk          h1 mobile · 34/36    ▓│
│▓                                            ▓│
│▓  Ink-black silhouettes with one acid       ▓│
│▓  detail. Cut for city miles, built to      ▓│
│▓  be worn out.               body 15/22     ▓│
│▓                                            ▓│
│▓  ┌────────────────────────────────────┐    ▓│
│▓  │           Shop the drop            │    ▓│
│▓  └────────────────────────────────────┘    ▓│
│▓     full-width primary, 48px tall           │
├──────────────────────────────────────────────┤
│ Free shipping over $120 · 30-day returns     │
│ every pair ships in 48 hours                 │
│ promo strip wraps to 2 lines, never scrolls  │
├──────────────────────────────────────────────┤
│ Shop by shape                h2 · 24/28      │
│                                              │
│ ┌ 4:5 ─────────┐  ┌ 4:5 ─────────┐           │
│ │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│           │
│ │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│           │
│ │ Low tops     │  │ High tops    │           │
│ └──────────────┘  └──────────────┘           │
│ ┌ 4:5 ─────────┐  ┌ 4:5 ─────────┐           │
│ │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│           │
│ │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│           │
│ │ Runners      │  │ Trail        │           │
│ └──────────────┘  └──────────────┘           │
│  2 columns · 16px gutter · 16px page margin  │
├──────────────────────────────────────────────┤
│ New this week                h2 · 24/28      │
│                                              │
│ ┌ 1:1 ────────┐ ┌ 1:1 ────────┐ ┌ 1:1 ──     │
│ │▓▓▓▓▓▓▓▓▓▓▓▓▓│ │▓▓▓▓▓▓▓▓▓▓▓▓▓│ │▓▓▓▓▓▓      │
│ │▓▓▓▓▓▓▓▓▓▓▓▓▓│ │▓▓▓▓▓▓▓▓▓▓▓▓▓│ │▓▓▓▓▓▓      │
│ └─────────────┘ └─────────────┘ └──────      │
│  Gutter low      Bollard high    Verge       │
│  $140            $165            $180        │
│  rail scrolls horizontally, snap per card,   │
│  third card peeks 40px to signal the scroll  │
└──────────────────────────────────────────────┘

┌ FRAME 3 · Category listing · 1280 · dark ────────────────────────────────────────────────────────┐
│ state: /categories/low-tops · grid at rest, card 3 hovered                                       │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ KERBSTONE       Low tops   High tops   Runners   Trail              Search    Account    Bag · 2 │
│  underline on the active nav item: 2px --primary, sits on the hairline                           │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Low tops                                                    h2 · 32/36                          │
│  24 pairs                                                    small · muted · tnum                │
│                                                                                                  │
│  Size ▾   Colourway ▾   Price ▾            Sort: newest ▾    filter bar · hairline · 40px tall   │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌ 1:1 ─────────┐  ┌ 1:1 ─────────┐  ╔ 1:1 ═════════╗  ┌ 1:1 ─────────┐                          │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓║  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│                          │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓║  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│                          │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  ║▓▓▓▓▓▓▓▓▓▓▓▓▓▓║  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│                          │
│  └──────────────┘  └──────────────┘  ╚══════════════╝  └──────────────┘                          │
│   Gutter low        Bollard high      Verge runner      Culvert trail                            │
│                                       ‾‾‾‾‾‾‾‾‾‾‾‾                                               │
│   $140              $165              $180              $210                                     │
│   ●●●● 4 colours    ●●● 3 colours     ●●●● 4 colours    ●● 2 colours                             │
│                                                                                                  │
│   state: AT REST    state: AT REST    state: HOVERED     state: AT REST                          │
│   border --border   border --border   border --ring      border --border                         │
│   #262626 hairline  #262626 hairline  #D6FF3B, 1px       #262626 hairline                        │
│   title plain       title plain       title underlined   title plain                             │
│                                       image UNCHANGED                                            │
│                                       (hover: none —     transition 120ms ease-out on            │
│                                        one frame exists) border-color and text-decoration        │
│                                       no lift, no zoom,  only; the card never moves, so a        │
│                                       no shadow          40-card grid stays still under a        │
│                                                          travelling pointer                      │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌ 1:1 ─────────┐  ┌ 1:1 ─────────┐  ┌ 1:1 ─────────┐  ┌ 1:1 ─────────┐   rows continue …        │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓│   4 per row at 1280      │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   2 per row at 390       │
│                                                                                                  │
│  keyboard: Tab focuses the card link · focus-visible = 2px --ring offset 2px, NOT the hover      │
│  border, so a keyboard user and a mouse user never see the same affordance by accident           │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘

┌ FRAME 4 · PDP · 1280 · dark ─────────────────────────────────────────────────────────────────────┐
│ state: /products/gutter-low · colourway 2 selected · swatch 3 hovered                            │
│ state: size 43 selected · size 39 out of stock                                                   │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ KERBSTONE       Low tops   High tops   Runners   Trail              Search    Account    Bag · 2 │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Home · Low tops · Gutter low                              breadcrumb · small · muted            │
│                                                                                                  │
│  ┌ 1:1 ─────────────────────────────┐   Gutter low                        h1 pdp · 40/44         │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│   Low top · full-grain, acid heel    body · muted           │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│                                                             │
│  │▓▓▓▓ hero packshot, the ONE ▓▓▓▓▓│   $140                               price · 28/32 · tnum   │
│  │▓▓▓▓ frame rendered in this ▓▓▓▓▓│   Tax included. Free over $120.      small · muted          │
│  │▓▓▓▓ pilot (3/4 front)      ▓▓▓▓▓│                                                             │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│   Colourway · Sulphur                label + chosen value   │
│  │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│    ┌────┐  ╔════╗  ┌╌╌╌╌┐  ┌────┐                           │
│  └──────────────────────────────────┘    │████│  ║████║  ╎████╎  │████│                          │
│   ┌────┐ ┌────┐ ┌────┐                   └────┘  ╚════╝  └╌╌╌╌┘  └────┘                          │
│   │▓▓▓▓│ │ ·· │ │ ·· │  thumb rail:       Tar     Sulphur Concrete Oxblood                       │
│   └════┘ └────┘ └────┘  1 real thumb,     black                                                  │
│    hero   wave2  wave2  2 dimmed slots    #0A0A0A #D6FF3B #8A8A8A #4A1418                        │
│                         reserved for      REST    SELECTED HOVERED  REST                         │
│                         wave-2 angles     hairline 2px ring border→ hairline                     │
│                         (hidden in prod)          --ring   --ring                                │
│                                                   + label  120ms    a swatch is a colour, so     │
│                                                   in bold           its NAME is always shown     │
│                                                                     next to the row (18e)        │
│                                                                                                  │
│                                       Size (EU)                        Size guide                │
│                                        ┌────┐┌╌╌╌╌┐┌────┐┌────┐┌────┐╔════╗┌────┐┌────┐┌────┐    │
│                                        │ 38 ││ 39 ││ 40 ││ 41 ││ 42 ║ 43 ║│ 44 ││ 45 ││ 46 │     │
│                                        └────┘└╌╌╌╌┘└────┘└────┘└────┘╚════╝└────┘└────┘└────┘    │
│                                          ok    OUT   ok    ok    ok   SEL   ok    ok    ok       │
│                                                                                                  │
│                                        available  = hairline --border, text --foreground         │
│                                        out of stock = text --muted-foreground + 1px diagonal     │
│                                          rule through the cell; still focusable, click shows     │
│                                          "Sold out in 39 — tell me when it is back"              │
│                                        selected   = 2px --ring box, text --foreground, and the   │
│                                          chosen value repeated in the label above (Size · 43)    │
│                                                                                                  │
│                                        ┌────────────────────────────────────────────┐            │
│                                        │              Add to bag · $140              │           │
│                                        └────────────────────────────────────────────┘            │
│                                         --primary acid block, ink label, 48px, full column       │
│                                         disabled until BOTH size and colourway are chosen;       │
│                                         disabled label reads "Pick a size" — never a greyed      │
│                                         button with no reason given                              │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Details        Materials        Shipping and returns          accordion, one open at a time     │
│  ▾ Cupsole, 12 mm drop. Acid heel tab. Made in Portugal.                                         │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘

┌ FRAME 5 · PDP · 390×844 · dark ──────────────┐
│ state: size 43 selected · sticky bar shown   │
├──────────────────────────────────────────────┤
│ ‹   KERBSTONE            Search   Bag · 2    │
├──────────────────────────────────────────────┤
│┌ 1:1 ───────────────────────────────────────┐│
││▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓││
││▓▓▓▓▓▓▓▓ hero packshot, edge to edge ▓▓▓▓▓▓▓││
││▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓││
││▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓││
│└─────────────────── ● ○ ○ ──────────────────┘│
│  dots: 1 real frame + 2 wave-2 slots, and    │
│  the empty slots are HIDDEN in the pilot,    │
│  so a single frame shows no dots at all      │
│                                              │
│ Gutter low                    h1 · 28/32     │
│ Low top · full-grain, acid heel              │
│ $140                     price · 24/28 tnum  │
│                                              │
│ Colourway · Sulphur                          │
│  ┌────┐ ╔════╗ ┌────┐ ┌────┐                 │
│  │████│ ║████║ │████│ │████│                 │
│  └────┘ ╚════╝ └────┘ └────┘                 │
│   rest   SEL    rest   rest                  │
│  (no hover state on touch — a tap selects;   │
│   the name updates in the label above)       │
│                                              │
│ Size (EU)                     Size guide     │
│  ┌────┐┌╌╌╌╌┐┌────┐┌────┐┌────┐              │
│  │ 38 ││ 39 ││ 40 ││ 41 ││ 42 │              │
│  └────┘└╌╌╌╌┘└────┘└────┘└────┘              │
│  ╔════╗┌────┐┌────┐┌────┐                    │
│  ║ 43 ║│ 44 ││ 45 ││ 46 │  5 per row, wraps  │
│  ╚════╝└────┘└────┘└────┘                    │
│   SEL          39 = OUT (diagonal rule)      │
│                                              │
│ ▾ Details    ▸ Materials   ▸ Shipping        │
│                                              │
├──────────────────────────────────────────────┤
│ $140  ·  43  ┌───────────────────────────┐   │
│  Sulphur     │        Add to bag         │   │
│              └───────────────────────────┘   │
│ STICKY BAR · appears once the inline button  │
│ scrolls out of view · --popover bg #161616   │
│ + hairline top · repeats price, size and     │
│ colourway so the choice is never off-screen  │
└──────────────────────────────────────────────┘
```

### 8.1 What the frames commit the build to

- The hero CTA is a block of `--primary` with an ink label in dark mode, and the reverse in light — never an
  outline button, never a link.
- A card at rest and a card hovered differ **only** in border colour and title underline. No lift, no zoom,
  no shadow, no image swap (`hover: none`, §7).
- Keyboard focus is visually distinct from mouse hover: focus-visible is a 2px `--ring` at 2px offset
  *outside* the card, hover is the card's own border turning Sulphur. A keyboard user must never wonder
  whether the pointer moved.
- The colourway row always shows the chosen colour's **name** next to the swatches (`Colourway · Sulphur`).
  A swatch alone is a raw value; a person cannot say "the green-yellow one" to support.
- An out-of-stock size stays focusable and clickable, and clicking it says what is happening
  ("Sold out in 39 — tell me when it is back"). A greyed cell with no explanation is the failure mode this
  frame exists to prevent.
- Add to bag is disabled until both size and colourway are chosen, and while disabled its label states the
  reason ("Pick a size") rather than sitting grey and mute.
- On mobile the sticky bar repeats price, size and colourway, because a choice made three screens up must
  never be off-screen when the decision is made.
- The gallery dots on a PDP are **hidden entirely** when there is one frame. In this pilot there is always
  one frame, so in the pilot there are never any dots — the wave-2 slots drawn in frames 4 and 5 are marked
  as such and are not rendered.

---

## 9. Appendix

### 9(a) Contrast script and its raw output

Saved as-run. Re-run with `node contrast.mjs`; it exits non-zero if any pair drops below its floor, so it
works as a gate and not only as a report. The floors follow WCAG 2.1: 4.5:1 for text, 3.0:1 for the
non-text pairs; `null` marks the hairline rows, which WCAG does not floor and which are printed as `info`.

```js
// WCAG 2.1 contrast checker for the kerbstone theme preset.
// Formula: WCAG 2.1 §1.4.3 relative luminance + contrast ratio.
//   c_lin = c/255 <= 0.04045 ? c/255/12.92 : ((c/255 + 0.055)/1.055) ** 2.4
//   L = 0.2126 R + 0.7152 G + 0.0722 B
//   ratio = (L_light + 0.05) / (L_dark + 0.05)
const chan = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const T = {
  dark: {
    background: '#0A0A0A', foreground: '#EDEDED',
    card: '#101010', 'card-foreground': '#EDEDED',
    popover: '#161616', 'popover-foreground': '#EDEDED',
    primary: '#D6FF3B', 'primary-foreground': '#0A0A0A',
    secondary: '#1A1A1A', 'secondary-foreground': '#EDEDED',
    muted: '#1A1A1A', 'muted-foreground': '#A1A1A1',
    accent: '#1F1F1F', 'accent-foreground': '#EDEDED',
    destructive: '#FF6166', 'destructive-foreground': '#0A0A0A',
    border: '#262626', input: '#262626', ring: '#D6FF3B',
    link: '#D6FF3B', success: '#D6FF3B', warning: '#FF990A',
  },
  light: {
    background: '#FFFFFF', foreground: '#0A0A0A',
    card: '#FFFFFF', 'card-foreground': '#0A0A0A',
    popover: '#FFFFFF', 'popover-foreground': '#0A0A0A',
    primary: '#0A0A0A', 'primary-foreground': '#D6FF3B',
    secondary: '#F5F5F5', 'secondary-foreground': '#0A0A0A',
    muted: '#F5F5F5', 'muted-foreground': '#5C5C5C',
    accent: '#F0F0F0', 'accent-foreground': '#0A0A0A',
    destructive: '#D40000', 'destructive-foreground': '#FFFFFF',
    border: '#E4E4E4', input: '#E4E4E4', ring: '#4C6600',
    link: '#4C6600', success: '#4C6600', warning: '#B25E00',
  },
};

// [fg, bg, floor] — floor 4.5 = WCAG AA body text, 3.0 = AA non-text (borders, rings).
const PAIRS = [
  ['foreground', 'background', 4.5],
  ['muted-foreground', 'background', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['card-foreground', 'card', 4.5],
  ['accent-foreground', 'accent', 4.5],
  ['destructive-foreground', 'destructive', 4.5],
  ['popover-foreground', 'popover', 4.5],
  ['secondary-foreground', 'secondary', 4.5],
  ['muted-foreground', 'muted', 4.5],
  ['muted-foreground', 'card', 4.5],
  ['link', 'background', 4.5],
  ['link', 'card', 4.5],
  ['warning', 'background', 4.5],
  ['primary', 'background', 3.0],
  ['ring', 'background', 3.0],
  ['border', 'background', null],
];

let worst = Infinity, fails = 0, n = 0;
for (const mode of ['dark', 'light']) {
  console.log(`\n== ${mode} ==`);
  console.log('pair'.padEnd(46) + 'ratio   floor  verdict');
  for (const [fg, bg, floor] of PAIRS) {
    const t = T[mode], r = ratio(t[fg], t[bg]);
    const ok = floor === null ? true : r >= floor;
    if (floor === 4.5) { worst = Math.min(worst, r); n++; }
    if (!ok) fails++;
    console.log(
      `${fg} on ${bg}`.padEnd(30) +
      `${t[fg]}/${t[bg]}`.padEnd(16) +
      r.toFixed(2).padStart(6) + '  ' + (floor === null ? ' -- ' : floor.toFixed(1).padStart(4)) +
      '   ' + (floor === null ? 'info' : ok ? 'pass' : 'FAIL')
    );
  }
}
console.log(`\nAA(4.5) pairs checked: ${n} · min ratio among them: ${worst.toFixed(2)} · failures (all floors): ${fails}`);
process.exit(fails ? 1 : 0);
```

Raw output of the run that produced every number in §3.2 (exit code 0):

```text

== dark ==
pair                                          ratio   floor  verdict
foreground on background      #EDEDED/#0A0A0A  16.91   4.5   pass
muted-foreground on background#A1A1A1/#0A0A0A   7.66   4.5   pass
primary-foreground on primary #0A0A0A/#D6FF3B  17.18   4.5   pass
card-foreground on card       #EDEDED/#101010  16.25   4.5   pass
accent-foreground on accent   #EDEDED/#1F1F1F  14.08   4.5   pass
destructive-foreground on destructive#0A0A0A/#FF6166   6.74   4.5   pass
popover-foreground on popover #EDEDED/#161616  15.46   4.5   pass
secondary-foreground on secondary#EDEDED/#1A1A1A  14.87   4.5   pass
muted-foreground on muted     #A1A1A1/#1A1A1A   6.74   4.5   pass
muted-foreground on card      #A1A1A1/#101010   7.36   4.5   pass
link on background            #D6FF3B/#0A0A0A  17.18   4.5   pass
link on card                  #D6FF3B/#101010  16.51   4.5   pass
warning on background         #FF990A/#0A0A0A   9.25   4.5   pass
primary on background         #D6FF3B/#0A0A0A  17.18   3.0   pass
ring on background            #D6FF3B/#0A0A0A  17.18   3.0   pass
border on background          #262626/#0A0A0A   1.31   --    info

== light ==
pair                                          ratio   floor  verdict
foreground on background      #0A0A0A/#FFFFFF  19.80   4.5   pass
muted-foreground on background#5C5C5C/#FFFFFF   6.69   4.5   pass
primary-foreground on primary #D6FF3B/#0A0A0A  17.18   4.5   pass
card-foreground on card       #0A0A0A/#FFFFFF  19.80   4.5   pass
accent-foreground on accent   #0A0A0A/#F0F0F0  17.37   4.5   pass
destructive-foreground on destructive#FFFFFF/#D40000   5.53   4.5   pass
popover-foreground on popover #0A0A0A/#FFFFFF  19.80   4.5   pass
secondary-foreground on secondary#0A0A0A/#F5F5F5  18.16   4.5   pass
muted-foreground on muted     #5C5C5C/#F5F5F5   6.13   4.5   pass
muted-foreground on card      #5C5C5C/#FFFFFF   6.69   4.5   pass
link on background            #4C6600/#FFFFFF   6.55   4.5   pass
link on card                  #4C6600/#FFFFFF   6.55   4.5   pass
warning on background         #B25E00/#FFFFFF   4.67   4.5   pass
primary on background         #0A0A0A/#FFFFFF  19.80   3.0   pass
ring on background            #4C6600/#FFFFFF   6.55   3.0   pass
border on background          #E4E4E4/#FFFFFF   1.27   --    info

AA(4.5) pairs checked: 26 · min ratio among them: 4.67 · failures (all floors): 0
```

### 9(b) Brand-name web search

| # | Search string | Result | Verdict |
|---|---|---|---|
| 1 | `"Kerbline" sneakers brand` | No exact match for *Kerbline*. The engine dropped the `b` and returned **Kerline** — an existing Polish footwear brand (keeshoes.com) and a Tommy Hilfiger sneaker model (zappos.com, amazon.com). | **Rejected.** One letter from a live footwear mark in the same category is a collision, not a coincidence. |
| 2 | `"Kerbstone" sneakers brand` | No footwear brand named *Kerbstone* in the results. The engine returned unrelated general sneaker articles (Keds, Reebok Classic, Nike Blazer, British Knights) and the nearest name-shaped hit was **Blackstone Footwear**, a different word. | **Accepted.** |

2 searches run of the 3 allowed. Scope of the check: it is a public-search sanity check, not a trademark
clearance — this is a fictional portfolio store, and no registry (USPTO/EUIPO) was queried.

### 9(c) For the merchandiser

Assortment rationale (filled in at S3): two roots — `footwear`, holding the four home-tile leaves `low-tops`, `high-tops`, `runners` and `trail`, and `accessories`, holding the single leaf `care-and-spares` — because the care kit and the two lace cuts are not shoes and must not sit in a footwear leaf that a home tile links to; 14 products across five leaves, 11 footwear and 3 accessories.

### 9(d) Copy-length script and its raw output

Every length quoted in §1, §2 and §6 comes from this run, not from counting by eye. It exits non-zero if any
field breaks its schema limit, so S3 and S6 can re-run it after a copy edit.

```js
// Every copy string this board hands to profile.json, measured against the limit in
// specs/store-profiles/store-profile.schema.json. Lengths in the document are copied from this output.
const FIELDS = [
  ['vertical', 'streetwear sneakers', 3, 80],
  ['brand.name', 'Kerbstone', 2, 32],
  ['brand.tagline', 'Street-built sneakers for the long way home', 8, 90],
  ['brand.wordmark.text', 'KERBSTONE', 1, 32],
  ['brand.legalName', 'Kerbstone Footwear Ltd.', 0, 80],
  ['audience.persona', 'Alex, 24, lives car-free in Berlin or Chicago, walks or rides everywhere, buys two pairs a year and wears them until the midsole gives out; judges a shoe by its outsole, not its marketing.', 0, 200],
  ['home.hero.headline', 'Made for the kerb, not the catwalk', 8, 70],
  ['home.hero.subheadline', 'Ink-black silhouettes with one acid detail. Cut for city miles, built to be worn out.', 0, 160],
  ['home.hero.cta.label', 'Shop the drop', 2, 30],
  ['categoryTiles[0].label', 'Low tops', 2, 30],
  ['categoryTiles[1].label', 'High tops', 2, 30],
  ['categoryTiles[2].label', 'Runners', 2, 30],
  ['categoryTiles[3].label', 'Trail', 2, 30],
  ['home.promoStrip.text', 'Free shipping over $120 · 30-day returns · every pair ships in 48 hours', 0, 90],
];
let fails = 0;
console.log('field'.padEnd(24) + 'len'.padStart(4) + '  min  max  verdict');
for (const [name, value, min, max] of FIELDS) {
  const n = [...value].length; // code points, the unit JSON Schema counts
  const ok = n >= min && n <= max;
  if (!ok) fails++;
  console.log(name.padEnd(24) + String(n).padStart(4) + String(min).padStart(5) + String(max).padStart(5) + '  ' + (ok ? 'pass' : 'FAIL'));
}
console.log(`\n${FIELDS.length} fields checked · ${fails} failures`);
process.exit(fails ? 1 : 0);
```

Raw output (exit code 0):

```text
field                    len  min  max  verdict
vertical                  19    3   80  pass
brand.name                 9    2   32  pass
brand.tagline             43    8   90  pass
brand.wordmark.text        9    1   32  pass
brand.legalName           23    0   80  pass
audience.persona         188    0  200  pass
home.hero.headline        34    8   70  pass
home.hero.subheadline     85    0  160  pass
home.hero.cta.label       13    2   30  pass
categoryTiles[0].label     8    2   30  pass
categoryTiles[1].label     9    2   30  pass
categoryTiles[2].label     7    2   30  pass
categoryTiles[3].label     5    2   30  pass
home.promoStrip.text      71    0   90  pass

14 fields checked · 0 failures
```

---

*End of style board. Derived artefacts: `theme.json` (§3), `profile.json` brand/audience/layout/home (§1, §2,
§6, §7), catalog copy (§1 naming conventions), S4 image prompts (§5).*
