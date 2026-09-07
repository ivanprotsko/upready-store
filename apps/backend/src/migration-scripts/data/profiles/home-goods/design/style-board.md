# Long Morning — style board (`home-goods`, wave 2 W1)

Programme row 2 of `artifacts/docs/2026-09-08-wave2-program.md` §1 decides the vertical (kitchen and
home), the options (Colour · Size), the palette character (warm neutral + terracotta), the frame
(4:5), the font pair (Fraunces / DM Sans) and the hero (full-bleed, a kitchen in morning light).
None of those are re-chosen here. Everything else below is this document's work.

---

## 1. Brand

**Name — Long Morning.** Verified by one web search on 2026-09-08 (`"Long Morning" homeware kitchen
brand shop`): no live kitchen or homeware brand carries it. The nearest indexed neighbour is *Morning
Glory*, a Korean stationery company — a different vertical and a different word. Two earlier
candidates were rejected on the same search discipline and the rejections are recorded so nobody
re-proposes them: **Quernstone** is a live Shetland knitwear label (`quernstone.co.uk`), which is not
this vertical but *is* the vertical of `womens-fashion`, another theme in this same wave; **Emberware**
sits one letter from *Ember Cookware*, a funded 2024 cookware brand, which is exactly this vertical.

**Tagline — "Things that earn their shelf."**

**Wordmark — `LONG MORNING`**, Fraunces at a low optical size, letter-spaced, all caps, in
`--foreground`. Never in terracotta: the accent is reserved (§3.3) and a wordmark that takes it leaves
the accent meaning nothing.

**Voice, three sentences.** We describe what a thing is made of, how heavy it is and how it is
cleaned, because those are the three facts that decide whether it stays in your kitchen. We do not
call an object *essential*, *curated* or *elevated*, and we never imply that owning it makes the
morning better than the morning already was. When something has a drawback — the clay pot must be
soaked, the cast iron will rust if you leave it wet — we put it in the description rather than in a
FAQ nobody opens.

## 2. Audience persona

**Hana, 41, Rotterdam.** Cooks five nights a week in a kitchen she does not own and cannot renovate.
She has replaced the same non-stick pan three times and has decided that this is the last time she
buys anything she cannot re-season, re-oil or put in a dishwasher. She reads the weight in grams
before the price, because a 3.4 kg braiser is a thing she has to lift with one hand while the other
holds a lid. She is the reason every product page here carries a weight, a diameter and a care line,
and the reason nothing on the site is sold as a *set* unless the set is genuinely cheaper.

## 3. Palette

Warm neutral ground, one terracotta accent, no second accent. The ground is warm on purpose: a
neutral-grey store next to terracotta reads as a hardware shop, and the programme asked for *warm*.

### 3.1 Tokens — the full canon set the preset schema requires, both modes

| token | light | dark |
|---|---|---|
| `--radius` | `0.375rem` | `0.375rem` |
| `--background` | `#fdfbf7` | `#1a1512` |
| `--foreground` | `#241c16` | `#f2ebe2` |
| `--card` | `#ffffff` | `#221c18` |
| `--card-foreground` | `#241c16` | `#f2ebe2` |
| `--popover` | `#ffffff` | `#26201b` |
| `--popover-foreground` | `#241c16` | `#f2ebe2` |
| `--primary` | `#a64b2a` | `#e08a63` |
| `--primary-foreground` | `#ffffff` | `#1a1512` |
| `--secondary` | `#f2ebe0` | `#26201b` |
| `--secondary-foreground` | `#241c16` | `#f2ebe2` |
| `--muted` | `#f2ebe0` | `#26201b` |
| `--muted-foreground` | `#6b5b4e` | `#b3a395` |
| `--accent` | `#ece2d3` | `#302823` |
| `--accent-foreground` | `#241c16` | `#f2ebe2` |
| `--destructive` | `#a3241c` | `#ff7a6b` |
| `--destructive-foreground` | `#ffffff` | `#1a1512` |
| `--border` | `#e2d8ca` | `#38302a` |
| `--input` | `#e2d8ca` | `#38302a` |
| `--ring` | `#a64b2a` | `#e08a63` |
| `--link` | `#a64b2a` | `#e08a63` |
| `--success` | `#3e6b3a` | `#8fc98a` |
| `--warning` | `#7a4b00` | `#ffb020` |
| `--chart-1` … `--chart-5` | terracotta → clay ramp, §3.4 | same ramp inverted |

`--primary` flips polarity between modes, the way `supplements` had to. The signature terracotta
`#c2603c` scores **4.04:1** on the light ground — under AA for text — so light mode carries the fired
version `#a64b2a` (5.55:1) and dark mode carries the risen version `#e08a63` (6.88:1). `#c2603c` was
also tried as the promo-strip *surface* and dropped: white copy on it measures **4.17:1**, also under
AA, so the strip carries `#a64b2a` too. The signature hex therefore appears nowhere on the storefront.
Both numbers were computed, not estimated; they are in appendix A.

### 3.2 Contrast table — every ratio computed, raw output in the appendix

| pair | mode | ratio | floor | verdict |
|---|---|---|---|---|
| body text on background | light | **16.22:1** | 4.5 | pass |
| muted text on background | light | **6.29:1** | 4.5 | pass |
| muted text on muted surface | light | **5.49:1** | 4.5 | pass |
| primary text / link on background | light | **5.55:1** | 4.5 | pass |
| primary button label on primary | light | **5.74:1** | 4.5 | pass |
| card text on card | light | **16.76:1** | 4.5 | pass |
| destructive on background | light | **7.19:1** | 4.5 | pass |
| success on background | light | **6.03:1** | 4.5 | pass |
| warning on background | light | **7.17:1** | 4.5 | pass |
| focus ring on background | light | **5.55:1** | 3.0 | pass |
| border on background | light | **1.36:1** | 1.3 | pass |
| body text on background | dark | **15.31:1** | 4.5 | pass |
| muted text on background | dark | **7.41:1** | 4.5 | pass |
| muted text on muted surface | dark | **6.58:1** | 4.5 | pass |
| primary text / link on background | dark | **6.88:1** | 4.5 | pass |
| primary button label on primary | dark | **6.88:1** | 4.5 | pass |
| card text on card | dark | **14.24:1** | 4.5 | pass |
| destructive on background | dark | **7.11:1** | 4.5 | pass |
| success on background | dark | **9.39:1** | 4.5 | pass |
| warning on background | dark | **9.90:1** | 4.5 | pass |
| border on background | dark | **1.40:1** | 1.3 | pass |

Twenty-one pairs, twenty-one passes, worst text pair **5.49:1**. Borders are held to 1.3 rather than
4.5 because a border is not text; the number is still printed so nobody has to guess whether it was
checked.

### 3.3 Where the accent is allowed

Exactly five places, and a screenshot that shows none of them is a defect, not a taste question:
1. the price on the product card and on the PDP;
2. the primary button fill (add to cart, checkout, hero CTA);
3. the focus ring;
4. the selected state of a colour swatch and a size chip;
5. the promo strip background — `#a64b2a` (light) with `#ffffff` copy, `#8a3f24` (dark) with
   `#f7e9e2` copy, measured **5.74:1** and **6.29:1**.

Everything else — headings, body, borders, icons — is foreground, muted-foreground or border.

### 3.4 Chart ramp

Light: `#a64b2a`, `#c2603c`, `#d18b62`, `#e2b592`, `#f2ddc8`. Dark: `#e08a63`, `#c2603c`, `#9b4a2c`,
`#6d3a26`, `#3f2a20`. Used by nothing on the storefront today; the schema requires the keys and a
preset with invented placeholders would be a lie in a file that gets copied.

## 4. Typography

Programme row: **Fraunces** (display) / **DM Sans** (body), both on the allow-list.

- Fraunces at `wght 600`, `SOFT 40`, `WONK 1` for h1/h2 and the wordmark. Its wonky terminals are the
  only decorative thing on the site, which is why nothing else gets to be decorative.
- DM Sans 400/500/700 for body, labels, buttons, prices, specs.
- Prices in DM Sans **500 with tabular figures** — a price column that jitters between rows is the
  cheapest possible way to look unfinished.
- Scale: 12 / 14 / 16 / 18 / 22 / 28 / 36 / 48 px. Body 16, never 14; the persona reads specs.

## 5. Photography direction

**Backdrop — warm putty plaster, `#e4dacb`, flat, seamless, no horizon line.** This is a deliberate
answer to the open question `q-white-backdrop-in-dark-mode` recorded against the previous theme, and
it is the one direction in this document taken *because* of a defect rather than because of taste. A
white studio backdrop turns every product card into a blinding white rectangle on a near-black page,
and the store then reads as a light store forced into a dark one. Putty at luma ≈ 216 sits far enough
below white to stop being a flare in dark mode and far enough above the dark `--card` (`#221c18`) to
still read as a photograph rather than a hole. It costs nothing: we are shooting fresh.

- **Lighting.** One large diffused source at 60° camera-left and 25° above, standing in for a kitchen
  window in morning light, plus a white bounce card camera-right at quarter power. Warm daylight,
  4800 K. One soft feathered contact shadow directly under each object, falling to camera-right. No
  cast side shadow, no second shadow, no reflection.
- **Camera.** 85 mm at f/8, tripod at two-thirds the object's height, so the object is seen very
  slightly from above and its top face is legible — which is what a bowl, a plate and a board need,
  and where the sneakers-style below-eye-level view would fail.
- **Frame.** Vertical 4:5. The object is centred, fills **60 % of the panel width**, and carries clear
  space above and below it. Sixty rather than eighty because the panel is cut out of a square grid
  cell and a subject at 80 % loses its edges to the crop.
- **Props.** None. No food, no linen scrunched under the object, no plants, no hands, no worktop, no
  window in the shot. The window is in the *light*, not in the frame.
- **Materials must read.** The glaze speckle, the linen slub, the cast-iron pebble texture and the
  oak grain are the whole argument for the price; sharp front-to-back, matte surfaces stay matte.
- **Hero angle** (the one exception to all of the above): a real kitchen interior at eye level,
  morning sun raking across a worktop from a window out of frame camera-left, warm putty and clay
  tones, deep enough to hold a headline over the darker right third.
- **Negative list.** Real logos, brand marks, wordmarks, legible text, letters or numbers anywhere;
  human faces, hands or bodies; food, drink, steam; props, plinths, boxes, tissue paper; coloured or
  gradient backgrounds, coloured gels; wet, glossy or mirrored floor; reflections, second shadow,
  floating subject; top-down flat lay; dutch angle; shallow depth of field, bokeh, motion blur; HDR,
  oversaturation, heavy vignette, visible upscaling artefacts; caption, label, number, grid line,
  border, drawn seam between panels, collage frame; transparency, checkerboard pattern.

**Two packshot templates.** *V-single* — one object alone, three-quarter front from its left.
*V-stack* — two or three identical objects, the near one three-quarter front, the others behind and
slightly turned, for anything sold as a set. A brief that fits neither must say so in W2's report
before a render is paid for; that mismatch cost the pilot three of nineteen frames.

## 6. Hero, tiles, promo strip — every string inside its schema limit, length written

| slot | string | chars |
|---|---|---|
| hero headline | `Kitchen things that outlive the kitchen` | 39 |
| hero subheadline | `Cast iron, stoneware and linen for a rented kitchen you cook in every night. Weight, diameter and care notes on every page.` | 123 |
| hero CTA | `Shop the kitchen` | 16 |
| tile 1 | `Cookware` | 8 |
| tile 2 | `Tableware` | 9 |
| tile 3 | `Kitchen textiles` | 16 |
| tile 4 | `Storage and light` | 17 |
| promo strip | `Free shipping over $60 · care notes on every page · 60-day returns` | 66 |

Hero layout is **full-bleed**, per the programme row: the photograph runs the full width, the copy
sits in the left third over the part of the frame the light does not reach, and the darkening is *in
the photograph* — never a scrim rectangle. The previous theme shipped a hero whose copy sat at
1.00:1 over a 404; the number to beat is measured, not assumed.

## 7. Layout

| decision | value | why |
|---|---|---|
| card variant | `editorial` | the object needs air; `compact` crops a 4:5 frame to a strip. `spacious` was written here first and rejected by the schema, whose enum is classic/editorial/compact/showcase |
| image aspect | `4:5` | programme row 2 |
| image fit | `contain` | putty backdrop is part of the frame; `cover` would crop plates to ellipses |
| radius | `md` (`0.375rem`) | soft, not round: this is stoneware, not a toy |
| hover | `zoom` | schema enum is none/second-image/zoom; `second-image` is out because we shoot one frame per product |
| grid | 4 columns at 1280, 2 at 768, 1 at 390 | see the empty-row rule below |

**The empty-row rule.** Any collection or category that renders on the home page carries **at least
four products**, so a four-column row is never 75 % empty. On a near-black page an empty three-quarter
row is a black band mid-page and reads as a broken build. A category with three products is a
category that does not get a home-page row.

## 8. ASCII mock-ups — behaviour, with the mode named on every frame

### 8.1 Home, 1280, LIGHT
```
┌──────────────────────────────────────────────────────────────────┐
│ LONG MORNING        Kitchen  House  About        ⌕  ♡  🛒(2)     │  header on --background
├──────────────────────────────────────────────────────────────────┤
│▓▓▓▓ photograph, full bleed, 1920x900, darkening INTO the left ▓▓▓│
│▓ Kitchen things that outlive       (Fraunces 48)               ▓▓│
│▓ the kitchen                                                   ▓▓│
│▓ Cast iron, stoneware and linen…   (DM Sans 18, --foreground)  ▓▓│
│▓ ┌───────────────────┐                                         ▓▓│
│▓ │  Shop the kitchen │ ← --primary fill #a64b2a, white label   ▓▓│
│▓ └───────────────────┘                                         ▓▓│
├──────────────────────────────────────────────────────────────────┤
│ Free shipping over $60 · care notes · 60-day returns             │  strip: #a64b2a bg, white text
├──────────────────────────────────────────────────────────────────┤
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                      │
│ │Cookware│ │Tablewar│ │Textiles│ │Storage │   4 tiles, 4:5       │
│ └────────┘ └────────┘ └────────┘ └────────┘                      │
├──────────────────────────────────────────────────────────────────┤
│ The morning table                            (Fraunces 28)       │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                              │
│ │ img  │ │ img  │ │ img  │ │ img  │  ← 4 of 6; row is FULL       │
│ │Title │ │Title │ │Title │ │Title │                              │
│ │$68   │ │$34   │ │$52   │ │$96   │  ← price in --primary        │
│ └──────┘ └──────┘ └──────┘ └──────┘                              │
└──────────────────────────────────────────────────────────────────┘
```

### 8.2 Category listing, 1280, DARK — rest / hover / focus / empty
```
Kitchen › Cookware                        Sort: Featured ▾     [DARK]
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ img  │ │ img  │ │ img  │ │ img  │   REST    card #221c18, border #38302a
│Braise│ │Clay  │ │Skille│ │Runner│           putty frame #e4dacb inside the card:
│$96   │ │$48   │ │$74   │ │$44   │           a photograph, NOT a white flare
└──────┘ └──────┘ └──────┘ └──────┘
         ┌══════┐                     HOVER   zoom 1.03 on the frame, title -> --primary
         │ img  │
         └══════┘
                  ╔══════╗            FOCUS   2px --ring #e08a63, 2px offset, visible on #1a1512
                  ║ img  ║                    at 6.88:1 — the gate Tab-walks this
                  ╚══════╝
EMPTY (filter matched nothing):
   ┌────────────────────────────────────────────┐
   │        Nothing here in this size            │  --muted-foreground #b3a395, 7.41:1
   │        [ Clear filters ]  ← outline button  │
   └────────────────────────────────────────────┘
```

### 8.3 PDP, 1280, LIGHT — swatches, sizes, selected, disabled, loading
```
Kitchen › Cookware › Braiser                                   [LIGHT]
┌──────────────────┐   Braiser · 9 inch            (Fraunces 36)
│                  │   Enamelled cast iron, 3.4 kg  (--muted-foreground)
│   4:5 photograph │   $96                          (--primary #a64b2a)
│   putty backdrop │
│                  │   Colour
│                  │    ●Terracotta  ○Oat  ○Slate
└──────────────────┘    └ SELECTED: 2px --primary ring + filled dot
 ┌──┐┌──┐┌──┐           ○ REST: 1px --border
 └──┘└──┘└──┘           ⊘ DISABLED (Slate, 11" only): swatch at 40%,
 one frame only,          diagonal rule, aria-disabled — 5.31:1 label,
 the strip is a           NOT the vendor's 1.95:1 grey
 crop of the same       Size
                         [ 9 inch ]  [ 11 inch ]  [ 13 inch ]
                          SELECTED     REST        DISABLED, out of stock
                         ┌──────────────────────────────┐
                         │        Add to cart           │  --primary, white label 5.74:1
                         └──────────────────────────────┘
                         LOADING: label -> spinner, button keeps --primary fill and
                                  its width; it never turns grey (that is the disabled
                                  colour and the two states must not look alike)
                         Weight 3.4 kg · Ø 24 cm · Dishwasher no · Oven to 260 °C
```

### 8.4 Cart drawer, 390, DARK — and the empty state
```
┌───────────────────────────┐   [DARK]  panel --popover #26201b, OPAQUE.
│ Your basket           ✕   │   The foundation shipped this at 1.00:1 because
├───────────────────────────┤   the panel was painted with a semi-transparent
│ ┌──┐ Braiser · 9 in       │   token; it is a flat token here on purpose.
│ │im│ Terracotta           │
│ └──┘ 1 ×  $96      [−][+] │
│ ┌──┐ Waffle towels        │
│ │im│ Clay                 │
│ └──┘ 2 ×  $34      [−][+] │
├───────────────────────────┤
│ Subtotal          $164    │
│ ┌───────────────────────┐ │
│ │      Checkout         │ │  --primary
│ └───────────────────────┘ │
└───────────────────────────┘
EMPTY: "Nothing in the basket yet" (--muted-foreground) + outline "Browse the kitchen"
```

### 8.5 Checkout, 390, LIGHT — rest / focus / error / loading
```
┌───────────────────────────┐   [LIGHT]
│ 1 Address  2 Ship  3 Pay  │   step 1 --foreground, 2–3 --muted-foreground 6.29:1
├───────────────────────────┤
│ Email                     │
│ ┌───────────────────────┐ │  REST: 1px --input #e2d8ca on --card #ffffff
│ │ hana@example.com      │ │
│ └───────────────────────┘ │
│ Postcode *                │  the asterisk is --destructive #a3241c = 7.19:1
│ ╔═══════════════════════╗ │  FOCUS: 2px --ring, offset 2 — NOT a colour swap
│ ║                       ║ │
│ ╚═══════════════════════╝ │
│ ⚠ Enter a postcode        │  ERROR: --destructive text + 1px --destructive border
│ ┌───────────────────────┐ │
│ │   ◐ Placing order…    │ │  LOADING: --primary kept, spinner, width frozen
│ └───────────────────────┘ │
└───────────────────────────┘
```

### 8.6 Mobile drawer, 390, DARK — the one that was invisible
```
┌───────────────────────────┐   [DARK] --popover #26201b, opacity 1, over a
│ ✕                         │   40 % scrim. Measured 1.00:1 on the foundation
│ Kitchen                 › │   before tonight's fix; the gate now opens this
│ House                   › │   drawer and Tab-walks it, so every row below is
│ About                     │   a focus target with a visible 2px --ring.
│ ─────────────────────     │
│ Sign in                   │
└───────────────────────────┘
```

---

## Appendix A — raw output of `design/contrast.mjs`

Run: `node apps/backend/src/migration-scripts/data/profiles/home-goods/design/contrast.mjs '<pairs>'`

```
PASS  16.22:1  (needs 4.5)  light body text  fg #241C16 on bg #FDFBF7
PASS  6.29:1  (needs 4.5)  light muted text  fg #6B5B4E on bg #FDFBF7
PASS  5.49:1  (needs 4.5)  light muted text on muted surface  fg #6B5B4E on bg #F2EBE0
PASS  5.55:1  (needs 4.5)  light primary text/link  fg #A64B2A on bg #FDFBF7
PASS  5.74:1  (needs 4.5)  light primary button label  fg #FFFFFF on bg #A64B2A
PASS  1.36:1  (needs 1.3)  light border on bg  fg #E2D8CA on bg #FDFBF7
PASS  7.19:1  (needs 4.5)  light destructive  fg #A3241C on bg #FDFBF7
PASS  6.03:1  (needs 4.5)  light success  fg #3E6B3A on bg #FDFBF7
PASS  7.17:1  (needs 4.5)  light warning  fg #7A4B00 on bg #FDFBF7
PASS  5.55:1  (needs 3)  light ring on bg  fg #A64B2A on bg #FDFBF7
PASS  16.76:1  (needs 4.5)  light card text  fg #241C16 on bg #FFFFFF
PASS  15.31:1  (needs 4.5)  dark body text  fg #F2EBE2 on bg #1A1512
PASS  7.41:1  (needs 4.5)  dark muted text  fg #B3A395 on bg #1A1512
PASS  6.58:1  (needs 4.5)  dark muted text on muted surface  fg #B3A395 on bg #26201B
PASS  6.88:1  (needs 4.5)  dark primary text/link  fg #E08A63 on bg #1A1512
PASS  6.88:1  (needs 4.5)  dark primary button label  fg #1A1512 on bg #E08A63
PASS  7.11:1  (needs 4.5)  dark destructive  fg #FF7A6B on bg #1A1512
PASS  9.39:1  (needs 4.5)  dark success  fg #8FC98A on bg #1A1512
PASS  9.90:1  (needs 4.5)  dark warning  fg #FFB020 on bg #1A1512
PASS  14.24:1  (needs 4.5)  dark card text  fg #F2EBE2 on bg #221C18
PASS  1.40:1  (needs 1.3)  dark border on bg  fg #38302A on bg #1A1512
worst pair: 1.36:1
```

Second run, the four pairs §3.3 and §8.3 depend on — two of them are the rejections above:

```
FAIL  4.17:1  (needs 4.5)  promo strip light: white on #c2603c  fg #FFFFFF on bg #C2603C
PASS  6.29:1  (needs 4.5)  promo strip dark: #f7e9e2 on #8a3f24  fg #F7E9E2 on bg #8A3F24
FAIL  4.04:1  (needs 4.5)  signature terracotta as text on light bg  fg #C2603C on bg #FDFBF7
PASS  5.31:1  (needs 4.5)  disabled swatch label light  fg #7A6558 on bg #FDFBF7
worst pair: 4.04:1
```

## Appendix B — the registry defects this board is written against

Read from `artifacts/registries/theme-surface-defects.json` before writing. The board answers them at
the point where a board can: §3.1 states both modes in full (the pilot measured only dark); §8 draws
rest, hover, focus, selected, disabled, loading and empty for every interactive element, because four
of the owner's fourteen defects were states nobody had drawn; §8.4 and §8.6 name the opacity of the
drawer and the cart panel explicitly, because both shipped transparent; §5 chooses a mid-luma backdrop
so the product frames are not white flares in dark mode; §7 forbids a home-page row with fewer than
four products, because a one-product row on a near-black page is a black band.
