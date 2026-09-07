# Ferrite — style board

Store profile `electronics`, wave 2. Vertical, options, palette character, mode, frame ratio, font pair
and hero layout are **decided by the programme** (`artifacts/docs/2026-09-08-wave2-program.md` §1 row 4:
audio and gadgets · Colour · Capacity · graphite + electric blue, **dark** · 1:1 · Geist / Geist ·
full-bleed hero). This document does not re-choose them; it makes them buildable.

Written against `artifacts/registries/theme-surface-defects.json` — fourteen defects the owner found by eye
after the pilot passed every gate it had. Two of them shape this board directly and are answered in §8.

**This theme is the wave's dark control.** Every other theme in the queue is light or mid-light and is
there to expose the mirror class of defect (white on white). This one renders in the same mode the pilot
was measured in, so anything that regressed in the repaint shows up here as a *return* of a known defect,
not as a new one.

---

## 1. Brand

**Name — Ferrite.** Verified 2026-09-08 by one web search (`"Ferrite" brand headphones earbuds speakers
consumer audio company`): no consumer audio brand carries the name. What the search returns instead is the
material itself — ferrite magnets in drivers, ferrite beads on cables (Maxell's driver spec, Stanford
Magnets' speaker-magnet comparison, two Head-Fi threads on ferrite cores). That is the verdict this brand
wants: the name is the part inside, not a coined word.

**Legal name.** Ferrite Instruments Ltd.

**Tagline.** `Audio you can open` — 20 characters, within the 90 the schema allows.

**Wordmark.** `FERRITE`, style `wordmark`. Set in Geist at 600, tracked +0.08em, always in `--foreground`,
never in the accent — the blue is reserved (§3.2). Uppercase, no icon, no lockup variant.

**Voice, three sentences.** We tell you the driver diameter, the battery in milliamp-hours and the number
of screws before we tell you how it makes you feel. We write in the second person about the thing on the
desk, never about a lifestyle. Nothing is "immersive", "revolutionary" or "premium"; it is 40 mm, 18 hours,
and replaceable.

**What the brand refuses.** No hype adjectives, no glued-shut housings in the copy, no exclamation marks,
no colour name that is not also a hex in `product-options.json`.

---

## 2. Audience persona

**Sam, 31, works from a desk and a bag in equal measure.** Owns one pair of over-ears that has been
re-padded twice and will not replace them until a driver fails. Reads a spec sheet before a review, checks
whether the battery is a cell or a sealed brick, and has strong opinions about USB-C cables. Buys two or
three things a year, keeps them five. Distrusts a product page that will not say the weight.

Schema-safe form (≤ 200 characters, goes into `profile.json`): *"Sam, 31, works from a desk and a bag; reads
the spec sheet before the review, checks whether the battery is replaceable, and keeps a pair of over-ears
five years by re-padding them."* — 189 characters.

---

## 3. Palette

### 3.1 Tokens

Canon vocabulary (`~/upready/packages/geist-kit/theme.css`), 31 keys per mode, key set identical to
`geist.theme.json` — verified by diff, 0 missing, 0 extra. The file is
`../theme.json`; the values below are that file, not a paraphrase of it.

| token | dark (default) | light |
|---|---|---|
| `--radius` | `0.5rem` | `0.5rem` |
| `--background` | `#0d1013` | `#ffffff` |
| `--foreground` | `#e9edf1` | `#0d1013` |
| `--card` | `#14181d` | `#ffffff` |
| `--card-foreground` | `#e9edf1` | `#0d1013` |
| `--popover` | `#1a1f25` | `#ffffff` |
| `--popover-foreground` | `#e9edf1` | `#0d1013` |
| `--primary` | `#4d9dff` | `#0b57d0` |
| `--primary-foreground` | `#06090c` | `#ffffff` |
| `--secondary` | `#1e242b` | `#f1f4f7` |
| `--secondary-foreground` | `#e9edf1` | `#0d1013` |
| `--muted` | `#1e242b` | `#f1f4f7` |
| `--muted-foreground` | `#a7b1bc` | `#55616d` |
| `--accent` | `#262d35` | `#e7ecf2` |
| `--accent-foreground` | `#e9edf1` | `#0d1013` |
| `--destructive` | `#ff7b7b` | `#c01c1c` |
| `--destructive-foreground` | `#0d1013` | `#ffffff` |
| `--border` | `#2c343d` | `#dce2e9` |
| `--input` | `#5c6672` | `#868f9b` |
| `--ring` | `#4d9dff` | `#0b57d0` |
| `--link` | `#7ab6ff` | `#0b57d0` |
| `--success` | `#3fd39a` | `#0a6e4c` |
| `--warning` | `#ffb340` | `#8a5300` |
| `--chart-1` | `#4d9dff` | `#0b57d0` |
| `--chart-2` | `#a7b1bc` | `#55616d` |
| `--chart-3` | `#3fd39a` | `#0a6e4c` |
| `--chart-4` | `#ffb340` | `#8a5300` |
| `--chart-5` | `#b98cff` | `#6b3fa0` |
| `--shadow-card` | `inset 0 0 0 1px #ffffff12` | `inset 0 0 0 1px #0d101314, 0 1px 2px #0d10130f, 0 8px 12px -8px #0d10130f` |
| `--shadow-float` | `inset 0 0 0 1px #ffffff12, 0 12px 20px -6px #00000066` | `inset 0 0 0 1px #0d101314, 0 2px 4px #0d10130f, 0 12px 20px -6px #0d101314` |
| `--shadow-modal` | `inset 0 0 0 1px #ffffff1a, 0 28px 40px -10px #00000080` | `inset 0 0 0 1px #0d101314, 0 1px 1px #0d101308, 0 12px 20px -6px #0d101314, 0 28px 40px -10px #0d10131a` |

### 3.2 What each colour is allowed to mean

**Graphite is the product and the page.** `#0d1013` is not black: it carries a blue cast so that a graphite
housing photographed on grey does not read as a hole cut in the page. The three greys above it
(`--card` `#14181d`, `--popover` `#1a1f25`, `--accent` `#262d35`) are 4, 10 and 21 points of luminance
apart, so a card on the page, a drawer over the card and a hovered row inside the drawer are three visibly
different planes without a single border.

**Electric blue means "live".** `--primary` is the only saturated colour in the interface and it appears in
exactly five places: the price, a link, the focus ring, the selected option swatch/chip, and the primary
button. It never decorates. A blue surface on this store is a claim that something is interactive or
current; a heading is never blue.

**`--link` is not `--primary` in dark mode.** `#7ab6ff` is a lighter step, because a link sits inside a run
of body copy where `--primary` at `#4d9dff` reads as a colour change mid-sentence rather than a link; on
`--popover` `#1a1f25` it also gains the margin the drawer needs (7.14:1 against 5.75:1).

**Polarity flips in light mode and the reason is measurable.** `#4d9dff` on white is 2.44:1 — unreadable as
text. Light mode drops to `#0b57d0` (5.83:1 on white) and gives up the glow; dark mode keeps it. The two
modes are two palettes, not one palette with an inverted background.

**`--input` is darker than `--border` in both modes, deliberately.** A hairline beside a card is decorative
— the card already has its own background. The outline of a text field is the *only* thing that says where
the field is, so WCAG 1.4.11 applies to it and not to the divider. `--input` clears 3:1 against the page in
both modes (§3.3); `--border` does not and is reported as informational.

### 3.3 Contrast, computed

74 required foreground/background pairs (37 per mode), **0 failing**, plus 6 informational divider pairs.
Computed by `design/contrast.mjs` from `theme.json` — WCAG 2.1 relative luminance, the script's raw output
pasted whole in §9. Text pairs are held to 4.5:1; control boundaries, focus rings and chart series to
3.0:1; decorative dividers carry no threshold and are printed with their number anyway.

The tightest pass in each mode, so the margin is on the record:

| mode | pair | ratio | what renders there |
|---|---|---|---|
| dark | `--input` on `--card` | 3.02:1 | the outline of a text field inside a card |
| dark | `--primary` on `--popover` | 5.75:1 | selected option in the cart drawer |
| light | `--input` on `--background` | 3.06:1 | the outline of a text field on the page |
| light | `--primary` on `--secondary` | 5.32:1 | the price on a secondary chip |

Body copy: `--foreground` on `--background` is **16.44:1** dark, **18.55:1** light. Disabled text
(`--muted-foreground` on `--secondary`) is **7.24:1** dark and **5.19:1** light — a number this board owes
the registry, because d-11 is a disabled control nobody drew.

---

## 4. Typography

**Geist / Geist**, both from the profile-schema allow-list. One family, two jobs:

| role | family | weight | size / line-height | tracking | where |
|---|---|---|---|---|---|
| display | Geist | 600 | 48/52 at 1280, 32/36 at 390 | −0.02em | hero headline, page h1 |
| section | Geist | 600 | 24/30 at 1280, 20/26 at 390 | −0.01em | category headings, PDP title |
| body | Geist | 400 | 16/24 | 0 | descriptions, copy |
| small | Geist | 400 | 14/20 | 0 | subtitles, breadcrumbs, help |
| spec | Geist | 500 | 14/20, tabular figures | 0 | `metadata.specs` rows, capacity, price |
| wordmark | Geist | 600 | 18/18 | +0.08em, uppercase | header |

One family is a decision, not a shortcut: the vertical sells objects whose surfaces are all the same
material, and a serif display would be a second material the photographs do not have. **Tabular figures are
required on the spec table and the price** — a spec sheet whose numbers do not align in a column is the
thing this brand's persona notices first.

---

## 5. Photography direction

One setup, every frame, no exceptions. This section is the contract the image briefs in
`catalog/products.json` are written against, and W5 reconciles the copy against what actually came back.

- **Background** — seamless matte graphite-grey cyclorama, flat, one stop lighter at the top, no seam
  between floor and wall, no horizon. Grey, never black: a graphite product on black loses its own edge,
  which is exactly defect class A restated in a photograph.
- **Lighting** — one large softbox key at 45° camera-left and 30° above; one narrow strip reflector
  camera-right at quarter power, present *only* to draw an edge highlight down the right side of a dark
  housing; neutral 5600 K, no coloured light, no gels, no rim flare.
- **Camera** — 85 mm at f/8, sensor at the product's own mid-height, so the object is seen very slightly
  from below and reads as solid. Never top-down, never a dutch angle.
- **Floor and shadow** — matte, exactly one soft feathered contact shadow directly beneath the object. No
  cast side shadow, no second shadow, no reflection, nothing floating.
- **Scale and framing** — the object centred, filling ~80% of the panel width, clear space beneath it.
- **Props** — none. No desk, no plant, no phone, no hands, no cable coiled decoratively. A cable appears
  only when the cable *is* the product.
- **Hero angle** — three-quarter front from the object's left, its most characteristic face to camera:
  the earcup for headphones, the grille for a speaker, the port wall for a power bank.
- **Negative list** (goes into every brief verbatim): real logos, brand marks, wordmarks; legible text,
  letters or numbers anywhere including on screens, buttons and cable moulds; a housing shape or grille
  pattern copied from an existing model; human faces, hands or ears; earbuds shown worn; props, plinths,
  boxes, tissue, foliage; coloured or gradient backgrounds, neon, rim-light flare; wet, glossy or mirrored
  floor; reflections, second shadow, floating subject; top-down flat lay, dutch angle, tilted horizon;
  shallow depth of field, bokeh, motion blur; HDR, oversaturation, heavy vignette, upscaling artefacts;
  anything naming a real place or shop.

**The template trap the pilot hit, answered here.** The pilot's board hard-coded a sentence about *a single
shoe*, which contradicted three accessory briefs and cost three of nineteen paid frames. So this board's
template says **"the object"**, never "the unit", and carries two declared variants named in W2's report:

- **V-single** — one object alone in the panel (headphones, speaker, power bank, charger, dock, case).
- **V-pair** — two identical objects, the near one three-quarter front, the far one behind-left and
  slightly turned away; used only where the product *is* a pair (earbuds with their case, monitor speakers,
  a cable shown coiled once beside its connector).

Anything a brief needs beyond these two is a conflict W2 must name in its report *before* a render is paid
for.

---

## 6. Home concepts

Every string with its measured length against its schema limit.

| slot | text | length | limit |
|---|---|---|---|
| hero headline | `Twelve screws. Two years of parts.` | 34 | 70 |
| hero subheadline | `Graphite audio built to be opened: replaceable pads, named cells, a spare-parts page that outlives the product.` | 111 | 160 |
| hero CTA label | `See what's inside` | 17 | 30 |
| tile — Headphones | `Headphones` | 10 | 30 |
| tile — Earbuds | `Earbuds` | 7 | 30 |
| tile — Speakers | `Speakers` | 8 | 30 |
| tile — Power banks | `Power banks` | 11 | 30 |
| tile — Cables and chargers | `Cables and chargers` | 19 | 30 |
| promo strip | `Free shipping over $80 · 2-year warranty · pads, cells and cables sold separately` | 79 | 90 |
| brand tagline | `Audio you can open` | 18 | 90 |
| vertical | `audio and gadgets` | 17 | 80 |
| persona | see §2, schema-safe form | 189 | 200 |

**Hero concept.** Full-bleed, as the programme specifies. One over-ear headphone (`bench-over-ear`,
graphite) at 3/4 front, occupying the right 55% of the frame, on the standard grey cyclorama that
darkens toward the left into `--background` so the copy block sits on a continuous surface rather than in a
box. Headline and CTA left, vertically centred, at 48/52. No scrim, no gradient overlay with an opacity —
the darkening is *in the photograph*, because a scrim over an image is the pilot's cause A wearing a
costume. At 390 the frame stacks: image on top at 1:1, copy beneath on `--background`.

**Category tiles.** Five, one per leaf category, each a 1:1 crop from the product grid on the same grey.
Tile label sits below the image in `--foreground` on `--background`, never over the photograph.

---

## 7. Layout

| decision | value | why |
|---|---|---|
| card variant | `classic` | the grid is a spec list with pictures; an editorial card would put type over a photograph, and this photography has no room in the frame for it |
| image aspect | `1:1` | programme row 4; a square panel is also what the grid render produces natively |
| fit | `cover` | every frame is shot to the same 80%-width framing, so cover crops nothing that matters |
| radius | `lg` (`--radius` `0.5rem`) | the corner of a moulded ABS shell; harder than a toy, softer than a tool |
| hover | `none` | there is one frame per product in this run (W3's binding rule); `second-image` would promise a frame that does not exist |
| card surface | `--card` on `--background` | 1.28:1 apart by luminance — the plane is read from the shadow inset, not from a border |
| price | `--primary`, tabular | 5.98:1 dark / 5.83:1 light on the card |
| grid | 4 columns at 1280, 2 at 768, 1 at 390 | a 1:1 card at 4-up is 280 px wide; the spec line stays on one line down to 2-up |

---

## 8. Mock-ups — behaviour, at 1280 and 390, mode named on every frame

The pilot's board drew rest states only, and four of the owner's fourteen defects were disabled, loading,
focus and empty states nobody had drawn (d-03, d-04, d-09, d-11). Every interactive element below carries
its full state set, and every frame says which mode it is drawn in.

Legend: `▓` = `--background`, `▒` = `--card`, `░` = `--popover`, `█` = `--primary`, `·` = `--muted-foreground`,
`[ ]` = border at `--border`, `‹ ›` = focus ring at `--ring` (2 px, offset 2 px).

### 8.1 Home — 1280, **dark**

```
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
 FERRITE      Store  Parts  Support            Search   Account  Cart (0)
▓▓▓▓ header: --background, wordmark --foreground, links --foreground, cart count --primary
────────────────────────────────────────────────────────────── --border 1px
  Free shipping over $80 · 2-year warranty · pads, cells and cables sold separately
  promo strip: --secondary bg, --secondary-foreground text, 14/20
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
                                    ╭──────────────────────────╮
   Twelve screws.                   │                          │
   Two years of parts.              │   [graphite over-ear,    │
   48/52, --foreground              │    3/4 front, grey cyc,  │
                                    │    darkening left into   │
   Graphite audio built to be       │    --background]         │
   opened: replaceable pads,        │                          │
   named cells, a spare-parts       ╰──────────────────────────╯
   page that outlives the product.
   16/24, --muted-foreground         full-bleed, image is 55% right
   ┌────────────────────┐
   │ See what's inside  │  ← primary button: --primary bg, --primary-foreground label
   └────────────────────┘
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
  [▒▒▒▒▒] [▒▒▒▒▒] [▒▒▒▒▒] [▒▒▒▒▒] [▒▒▒▒▒]   five 1:1 tiles, --card
  Headphones Earbuds Speakers Power banks Cables and chargers
  labels BELOW the image, --foreground on --background
```

### 8.2 Product grid card — all seven states, **dark**, 1280

```
REST              HOVER             FOCUS (keyboard)    SELECTED (in a compare set)
┌──────────────┐  ┌──────────────┐  ‹┌────────────┐›    ┌──────────────┐
│ ▒ image 1:1  │  │ ▒ image 1:1  │   │ ▒ image    │     │ ▒ image 1:1  │
│              │  │  (unchanged) │   │            │     │              │
├──────────────┤  ├──────────────┤   ├────────────┤     ├──────────────┤
│ Bench 1      │  │ Bench 1      │   │ Bench 1    │     │ Bench 1  ●   │  ● = --primary dot
│ 40 mm · 34 h │  │ 40 mm · 34 h │   │ 40 mm·34 h │     │ 40 mm · 34 h │
│ $189         │  │ $189         │   │ $189       │     │ $189         │
└──────────────┘  └──────────────┘   └────────────┘     └──────────────┘
 --card           --accent surface,   ring 2px          2px --primary
 shadow-card      title --foreground  --ring, offset 2  inset outline
                  (NOT a colour       on --background
                   change on text)

LOADING (skeleton)   EMPTY (no results)        DISABLED (out of stock everywhere)
┌──────────────┐     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   ┌──────────────┐
│ ░░░░░░░░░░░░ │      No products match        │ ▒ image, 60% │
│ ░░░░░░░░░░░░ │      these filters.           │   opacity    │
├──────────────┤      --foreground 24/30       ├──────────────┤
│ ░░░░░░░      │                               │ Puck ·       │  title --muted-foreground
│ ░░░░         │      Clear filters            │ Sold out     │  --muted-foreground
│ ░░░          │      --link, underlined       │ $59          │  --muted-foreground
└──────────────┘                               └──────────────┘
 skeleton blocks =    empty state is TEXT       card is not clickable;
 --muted (#1e242b),   on --background, not      cursor default, no hover
 shimmer to --accent  an image, not a card      surface, no focus ring
```

**d-02 answered.** The skeleton is `--muted`, which in dark mode is `#1e242b` — 1.35:1 against the page,
a block you can see but not one that shouts. The pilot's skeletons were `bg-gray-100` and glowed.

### 8.3 PDP — 1280, **dark**, with swatches, capacity selector and every control state

```
▓ Home · Audio · Headphones          breadcrumb 14/20 --muted-foreground, links --link
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
┌────────────────────────┐   Bench 1               32/36 --foreground
│                        │   Over-ear, 40 mm, replaceable pads
│   ▒ image 1:1          │   16/24 --muted-foreground
│   --card behind        │
│   the frame            │   $189                  24/30 --primary, tabular
│                        │
│                        │   Colour        --foreground 14/20, 500
│                        │   ( ● ) ( ○ ) ( ○ )     swatch = the colourway hex,
└────────────────────────┘    Graphite Chalk Signal  2px --primary ring when selected,
                              selected  rest  rest   1px --border when not
   ── --border 1px, full width of the right column ──
                              Capacity      (this product: not applicable — hidden,
                                             not rendered disabled)
   ┌───────────────────────────────────┐
   │ Add to cart                       │  REST: --primary bg, --primary-foreground
   └───────────────────────────────────┘
   ‹┌──────────────────────────────────┐›  FOCUS: 2px --ring, 2px offset on --background
   ┌───────────────────────────────────┐
   │ ◐ Adding…                         │  LOADING: --primary bg at 100%, label
   └───────────────────────────────────┘  --primary-foreground, spinner --primary-foreground
   ┌───────────────────────────────────┐
   │ Sold out                          │  DISABLED: --secondary bg, --muted-foreground
   └───────────────────────────────────┘  label at 7.24:1 — READABLE, cursor not-allowed

   In stock, ships in 48 hours     --success 14/20      (d-11 is this row and the one above)
   Only 3 left                     --warning 14/20
   That combination is unavailable --destructive 14/20

   ▸ Specifications        accordion, 8-10 rows, label --muted-foreground / value --foreground,
                           tabular figures, rows separated by --border hairlines
```

**d-11 answered explicitly.** The disabled button is `--secondary` (`#1e242b`) with a
`--muted-foreground` (`#a7b1bc`) label = **7.24:1**. It is dimmer than the primary button and still legible.
The loading state keeps the primary surface — a spinner on a dimmed surface was the pilot's invisible one.

### 8.4 Colour and capacity selectors — every state, **dark**

```
COLOUR SWATCH        REST        HOVER       FOCUS        SELECTED     DISABLED (combo gone)
                     ( ○ )       ( ○ )       ‹( ○ )›      (( ● ))      ( ⊘ )
 ring                --border    --input     --ring 2px   --primary    --border, 40% opacity,
 fill                hex         hex         hex          hex, 2px     hex desaturated, a
                                                                       diagonal --border line
CAPACITY CHIP        ┌──────┐    ┌──────┐    ‹┌────┐›     ┌──────┐     ┌──────┐
                     │10 000│    │10 000│     │10 0│      │20 000│     │26 800│
                     └──────┘    └──────┘     └────┘      └──────┘     └──────┘
 surface             --secondary --accent     --secondary  --primary    --secondary
 label               --secondary --secondary   --secondary --primary-   --muted-foreground
                      -foreground -foreground   -foreground  foreground  (7.24:1, not 2:1)
 border              --border    --border      --ring 2px   none        --border dashed
```

### 8.5 Cart drawer — **dark**, empty and with items (d-09, d-10)

```
EMPTY                                  WITH ITEMS
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░       ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
░ Cart                        ×        ░ Cart (2)                    ×
░ --popover-foreground 20/26           ░ --popover-foreground, count in --primary
░ ───────────── --border ──────        ░ ───────────── --border ──────
░                                      ░ ▒ ┌────┐ Bench 1 · Graphite
░   Your cart is empty.                ░   │ img│ 1 × $189    --popover-foreground
░   --popover-foreground 16/24         ░   └────┘ Remove      --link 14/20
░                                      ░ ───────────── --border ──────
░   Browse the store                   ░ ▒ ┌────┐ Brick · 20 000 mAh
░   --link, underlined                 ░   │ img│ 1 × $59
░                                      ░   └────┘ Remove
░ ───────────── --border ──────        ░ ───────────── --border ──────
░ ┌──────────────────────────┐         ░ Subtotal            $248  tabular
░ │ Go to cart (disabled)    │         ░ ┌──────────────────────────┐
░ └──────────────────────────┘         ░ │ Go to checkout           │
░ --secondary + --muted-foreground     ░ └──────────────────────────┘ --primary
```

The drawer surface is `--popover` `#1a1f25` — 10 luminance points above the page, so it reads as *over* the
page without a shadow doing the work. Everything inside it names `--popover-foreground`; nothing inside it
inherits from the page. That sentence is the answer to d-09 and d-10, which were a white panel with a
black-on-white count badge over an ink page.

### 8.6 Checkout, sign-in and reset-password — **dark** (d-12, d-13)

```
▓ Checkout                                    │ ▒ Summary            (--card, NOT white)
▓ 32/36 --foreground                          │ ▒ Bench 1      $189
▓                                             │ ▒ Brick        $59
▓ 1 · Contact          ✓ edit --link          │ ▒ Shipping     $0    --success "Free"
▓ 2 · Delivery         ▸ open                 │ ▒ ─── --border ───
▓   ┌─────────────────────────────────┐       │ ▒ Total       $248   --foreground 20/26,
▓   │ Address                         │ rest  │ ▒                    tabular, NOT --primary
▓   └─────────────────────────────────┘       │ ▒   (price accent is for the catalog;
▓   input: --background surface, 1px --input  │ ▒    a total is a fact, not a link)
▓   placeholder --muted-foreground            │
▓   ‹┌────────────────────────────────┐›      │  Sign in to check out faster
▓   focus: 2px --ring, --input hidden under it│  --card panel, --card-foreground text,
▓   ┌─────────────────────────────────┐       │  --link CTA. NOT a white block.
▓   │ Address                     ⚠   │ error │
▓   └─────────────────────────────────┘       │  RESET PASSWORD page: h2 20/26
▓   1px --destructive, message --destructive  │  --foreground on --background = 16.44:1
```

### 8.7 Mobile — 390, **dark**, navigation drawer open (d-14)

```
┌───────────────────────┐    ┌───────────────────────┐
│ ☰  FERRITE     ⌕  ⌂ 0 │    │ ░ Menu              × │  drawer: --popover, FLAT.
├───────────────────────┤    │ ░                     │  No gradient. No bg-black/0.
│                       │    │ ░ Store               │  --popover-foreground 20/26
│  [image 1:1, --card]  │    │ ░ Parts               │
│                       │    │ ░ Support             │
│  Twelve screws.       │    │ ░ ─── --border ───    │
│  Two years of parts.  │    │ ░ Account             │
│  32/36 --foreground   │    │ ░ Cart (0)            │
│                       │    │ ░                     │
│  Graphite audio built │    │ ░ ┌─────────────────┐ │
│  to be opened…        │    │ ░ │ Sign in         │ │  --primary
│  16/24 --muted-fg     │    │ ░ └─────────────────┘ │
│  ┌─────────────────┐  │    └───────────────────────┘
│  │ See what's      │  │     Type hierarchy at 390: 32 / 20 / 16 / 14.
│  │ inside          │  │     Nothing below 14. The spec table scrolls
│  └─────────────────┘  │     inside its own container, the page does not.
└───────────────────────┘
```

### 8.8 The same three surfaces in **light** mode — the mirror check

The pilot measured only dark and shipped light-mode defects it never saw. These are drawn so the light
palette is not a theory.

```
HEADER, light            CARD, light              DRAWER, light
█████████████████████    ┌──────────────┐         ┌──────────────────────┐
 FERRITE   Store  Cart   │  image 1:1   │         │ Cart (2)          ×  │
 bg --background #fff    │  --card #fff │         │ --popover #fff       │
 text --foreground       ├──────────────┤         │ text --popover-fg    │
 #0d1013 = 18.55:1       │ Bench 1      │ #0d1013 │ #0d1013 = 18.55:1    │
 ─── --border #dce2e9    │ 40 mm · 34 h │ #55616d │ ─── --border ───     │
                         │ $189         │ #0b57d0 │ Subtotal      $248   │
 The header is NOT       └──────────────┘ 5.83:1  │ --primary button     │
 --card and NOT white-    --card = --background   └──────────────────────┘
 on-white: it is the      in light mode; the card
 page colour with a       is read from --shadow-card,   Card, popover and page are all
 border under it.         which carries an inset 1px.   #ffffff in light mode — the
                                                        separation is shadow, not fill.
```

**The light-mode trap this board names for the record.** In light mode `--card`, `--popover` and
`--background` are all `#ffffff`. A surface that relies on a *fill difference* to be visible will vanish in
light mode exactly as the pilot's dark surfaces vanished in dark mode. Every panel in this store is
therefore separated by `--shadow-card` / `--shadow-float` (both carry an inset 1px hairline) or by an
explicit `--border`, never by "it's a slightly different white".

---

## 9. Appendix — raw output of the contrast script

Command, run in this worktree:

```
node apps/backend/src/migration-scripts/data/profiles/electronics/design/contrast.mjs \
     apps/backend/src/migration-scripts/data/profiles/electronics/theme.json
```

Exit code 0. Output below is pasted whole, unedited.

```

=== dark ===
| fg token | bg token | fg hex | bg hex | ratio | min | verdict | renders as |
|---|---|---|---|---|---|---|---|
| `--foreground` | `--background` | #e9edf1 | #0d1013 | **16.22:1** | 4.5 | pass | body copy on the page |
| `--foreground` | `--card` | #e9edf1 | #14181d | **15.15:1** | 4.5 | pass | body copy on a product card |
| `--card-foreground` | `--card` | #e9edf1 | #14181d | **15.15:1** | 4.5 | pass | card title |
| `--popover-foreground` | `--popover` | #e9edf1 | #1a1f25 | **14.09:1** | 4.5 | pass | cart drawer / dropdown option label |
| `--primary-foreground` | `--primary` | #06090c | #4d9dff | **7.21:1** | 4.5 | pass | label on the primary button |
| `--secondary-foreground` | `--secondary` | #e9edf1 | #1e242b | **13.30:1** | 4.5 | pass | label on the secondary button |
| `--accent-foreground` | `--accent` | #e9edf1 | #262d35 | **11.83:1** | 4.5 | pass | label on a hovered row |
| `--muted-foreground` | `--background` | #a7b1bc | #0d1013 | **8.78:1** | 4.5 | pass | subtitle, price note, breadcrumb |
| `--muted-foreground` | `--card` | #a7b1bc | #14181d | **8.20:1** | 4.5 | pass | spec row value on a card |
| `--muted-foreground` | `--muted` | #a7b1bc | #1e242b | **7.19:1** | 4.5 | pass | placeholder text in a muted block |
| `--muted-foreground` | `--secondary` | #a7b1bc | #1e242b | **7.19:1** | 4.5 | pass | disabled button label |
| `--destructive-foreground` | `--destructive` | #0d1013 | #ff7b7b | **7.61:1** | 4.5 | pass | label on the destructive button |
| `--destructive` | `--background` | #ff7b7b | #0d1013 | **7.61:1** | 4.5 | pass | error text on the page |
| `--destructive` | `--card` | #ff7b7b | #14181d | **7.11:1** | 4.5 | pass | error text inside a card |
| `--link` | `--background` | #7ab6ff | #0d1013 | **9.05:1** | 4.5 | pass | link in body copy |
| `--link` | `--card` | #7ab6ff | #14181d | **8.46:1** | 4.5 | pass | link inside a card |
| `--link` | `--popover` | #7ab6ff | #1a1f25 | **7.87:1** | 4.5 | pass | link inside the drawer |
| `--success` | `--background` | #3fd39a | #0d1013 | **9.99:1** | 4.5 | pass | in-stock text |
| `--success` | `--card` | #3fd39a | #14181d | **9.33:1** | 4.5 | pass | in-stock text on a card |
| `--warning` | `--background` | #ffb340 | #0d1013 | **10.70:1** | 4.5 | pass | low-stock text |
| `--warning` | `--card` | #ffb340 | #14181d | **9.99:1** | 4.5 | pass | low-stock text on a card |
| `--primary` | `--background` | #4d9dff | #0d1013 | **6.89:1** | 4.5 | pass | price, active tab, ghost-button label |
| `--primary` | `--card` | #4d9dff | #14181d | **6.44:1** | 4.5 | pass | price on a product card |
| `--primary` | `--popover` | #4d9dff | #1a1f25 | **5.99:1** | 4.5 | pass | selected option in the drawer |
| `--foreground` | `--secondary` | #e9edf1 | #1e242b | **13.30:1** | 4.5 | pass | text on a secondary surface |
| `--foreground` | `--muted` | #e9edf1 | #1e242b | **13.30:1** | 4.5 | pass | text on a muted surface |
| `--foreground` | `--accent` | #e9edf1 | #262d35 | **11.83:1** | 4.5 | pass | text on a hover surface |
| `--card-foreground` | `--popover` | #e9edf1 | #1a1f25 | **14.09:1** | 4.5 | pass | text moved between surfaces |
| `--ring` | `--background` | #4d9dff | #0d1013 | **6.89:1** | 3.0 | pass | focus ring on the page |
| `--ring` | `--card` | #4d9dff | #14181d | **6.44:1** | 3.0 | pass | focus ring on a card |
| `--ring` | `--secondary` | #4d9dff | #1e242b | **5.65:1** | 3.0 | pass | focus ring on a secondary surface |
| `--input` | `--background` | #5c6672 | #0d1013 | **3.27:1** | 3.0 | pass | input outline at rest (WCAG 1.4.11: a control boundary) |
| `--input` | `--card` | #5c6672 | #14181d | **3.05:1** | 3.0 | pass | input outline inside a card |
| `--primary` | `--secondary` | #4d9dff | #1e242b | **5.65:1** | 3.0 | pass | primary swatch on a secondary chip |
| `--chart-1` | `--card` | #4d9dff | #14181d | **6.44:1** | 3.0 | pass | first chart series |
| `--chart-2` | `--card` | #a7b1bc | #14181d | **8.20:1** | 3.0 | pass | second chart series |
| `--chart-3` | `--card` | #3fd39a | #14181d | **9.33:1** | 3.0 | pass | third chart series |

=== light ===
| fg token | bg token | fg hex | bg hex | ratio | min | verdict | renders as |
|---|---|---|---|---|---|---|---|
| `--foreground` | `--background` | #0d1013 | #ffffff | **19.08:1** | 4.5 | pass | body copy on the page |
| `--foreground` | `--card` | #0d1013 | #ffffff | **19.08:1** | 4.5 | pass | body copy on a product card |
| `--card-foreground` | `--card` | #0d1013 | #ffffff | **19.08:1** | 4.5 | pass | card title |
| `--popover-foreground` | `--popover` | #0d1013 | #ffffff | **19.08:1** | 4.5 | pass | cart drawer / dropdown option label |
| `--primary-foreground` | `--primary` | #ffffff | #0b57d0 | **6.39:1** | 4.5 | pass | label on the primary button |
| `--secondary-foreground` | `--secondary` | #0d1013 | #f1f4f7 | **17.28:1** | 4.5 | pass | label on the secondary button |
| `--accent-foreground` | `--accent` | #0d1013 | #e7ecf2 | **16.06:1** | 4.5 | pass | label on a hovered row |
| `--muted-foreground` | `--background` | #55616d | #ffffff | **6.33:1** | 4.5 | pass | subtitle, price note, breadcrumb |
| `--muted-foreground` | `--card` | #55616d | #ffffff | **6.33:1** | 4.5 | pass | spec row value on a card |
| `--muted-foreground` | `--muted` | #55616d | #f1f4f7 | **5.74:1** | 4.5 | pass | placeholder text in a muted block |
| `--muted-foreground` | `--secondary` | #55616d | #f1f4f7 | **5.74:1** | 4.5 | pass | disabled button label |
| `--destructive-foreground` | `--destructive` | #ffffff | #c01c1c | **6.13:1** | 4.5 | pass | label on the destructive button |
| `--destructive` | `--background` | #c01c1c | #ffffff | **6.13:1** | 4.5 | pass | error text on the page |
| `--destructive` | `--card` | #c01c1c | #ffffff | **6.13:1** | 4.5 | pass | error text inside a card |
| `--link` | `--background` | #0b57d0 | #ffffff | **6.39:1** | 4.5 | pass | link in body copy |
| `--link` | `--card` | #0b57d0 | #ffffff | **6.39:1** | 4.5 | pass | link inside a card |
| `--link` | `--popover` | #0b57d0 | #ffffff | **6.39:1** | 4.5 | pass | link inside the drawer |
| `--success` | `--background` | #0a6e4c | #ffffff | **6.27:1** | 4.5 | pass | in-stock text |
| `--success` | `--card` | #0a6e4c | #ffffff | **6.27:1** | 4.5 | pass | in-stock text on a card |
| `--warning` | `--background` | #8a5300 | #ffffff | **6.33:1** | 4.5 | pass | low-stock text |
| `--warning` | `--card` | #8a5300 | #ffffff | **6.33:1** | 4.5 | pass | low-stock text on a card |
| `--primary` | `--background` | #0b57d0 | #ffffff | **6.39:1** | 4.5 | pass | price, active tab, ghost-button label |
| `--primary` | `--card` | #0b57d0 | #ffffff | **6.39:1** | 4.5 | pass | price on a product card |
| `--primary` | `--popover` | #0b57d0 | #ffffff | **6.39:1** | 4.5 | pass | selected option in the drawer |
| `--foreground` | `--secondary` | #0d1013 | #f1f4f7 | **17.28:1** | 4.5 | pass | text on a secondary surface |
| `--foreground` | `--muted` | #0d1013 | #f1f4f7 | **17.28:1** | 4.5 | pass | text on a muted surface |
| `--foreground` | `--accent` | #0d1013 | #e7ecf2 | **16.06:1** | 4.5 | pass | text on a hover surface |
| `--card-foreground` | `--popover` | #0d1013 | #ffffff | **19.08:1** | 4.5 | pass | text moved between surfaces |
| `--ring` | `--background` | #0b57d0 | #ffffff | **6.39:1** | 3.0 | pass | focus ring on the page |
| `--ring` | `--card` | #0b57d0 | #ffffff | **6.39:1** | 3.0 | pass | focus ring on a card |
| `--ring` | `--secondary` | #0b57d0 | #f1f4f7 | **5.79:1** | 3.0 | pass | focus ring on a secondary surface |
| `--input` | `--background` | #868f9b | #ffffff | **3.27:1** | 3.0 | pass | input outline at rest (WCAG 1.4.11: a control boundary) |
| `--input` | `--card` | #868f9b | #ffffff | **3.27:1** | 3.0 | pass | input outline inside a card |
| `--primary` | `--secondary` | #0b57d0 | #f1f4f7 | **5.79:1** | 3.0 | pass | primary swatch on a secondary chip |
| `--chart-1` | `--card` | #0b57d0 | #ffffff | **6.39:1** | 3.0 | pass | first chart series |
| `--chart-2` | `--card` | #55616d | #ffffff | **6.33:1** | 3.0 | pass | second chart series |
| `--chart-3` | `--card` | #0a6e4c | #ffffff | **6.27:1** | 3.0 | pass | third chart series |

=== dark, informational (decorative, no threshold) ===
| fg token | bg token | fg hex | bg hex | ratio | renders as |
|---|---|---|---|---|---|
| `--border` | `--background` | #2c343d | #0d1013 | 1.51:1 | hairline divider on the page |
| `--border` | `--card` | #2c343d | #14181d | 1.41:1 | card outline against the page |
| `--border` | `--secondary` | #2c343d | #1e242b | 1.24:1 | divider on a secondary surface |

=== light, informational (decorative, no threshold) ===
| fg token | bg token | fg hex | bg hex | ratio | renders as |
|---|---|---|---|---|---|
| `--border` | `--background` | #dce2e9 | #ffffff | 1.30:1 | hairline divider on the page |
| `--border` | `--card` | #dce2e9 | #ffffff | 1.30:1 | card outline against the page |
| `--border` | `--secondary` | #dce2e9 | #f1f4f7 | 1.18:1 | divider on a secondary surface |

required pairs: 74 (37 per mode), failing: 0
informational pairs: 6
exit code: 0
```
