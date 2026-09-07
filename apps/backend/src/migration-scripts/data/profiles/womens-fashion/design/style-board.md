# Larchant — style board (`womens-fashion`, wave 2 W1)

Written 2026-09-08 WITA in worktree `feat/store/womens-fashion`. The programme row is decided and is
not re-chosen here: women's clothing · options Size XS–XL and Colour · cream plus black, serif display ·
frame 4:5 with hover to a second frame · Playfair Display / Inter · full-bleed campaign hero.
`artifacts/registries/theme-surface-defects.json` was read before this document was started; §8 exists
because four of the owner's fourteen defects were states nobody had drawn.

---

## 1. Brand

**Larchant.** Wordmark, all caps, letter-spaced, Playfair Display.

- **Tagline:** *Clothes that outlast the season.*
- **Legal name:** Larchant Atelier Ltd.
- **Name check (required, done, not assumed):** web search 2026-09-08 for `"Larchant" clothing brand
  womenswear label fashion` returned no womenswear label of that name — the results were LoveShackFancy,
  The Fold, LARACE, LASCANA and other unrelated brands. A first candidate, *Calenne*, was **rejected**:
  the same search surfaced **Calanne**, a live online womenswear boutique, one letter away. Verdict:
  Larchant is free in this vertical; Calenne is not.
- **Voice, three sentences.** We say what a thing is made of before we say what it is worth. We write
  the number we measured — grams, centimetres, momme, micron — and we do not write an adjective where a
  number will do. When something has a drawback we name it in the same paragraph as the reason we kept it.

## 2. Audience

Claire, 41, city, cold winter. Buys four or five things a year and expects to still be wearing them in
five. Reads the fibre content before the price, keeps a tailor, and has stopped believing size charts.
She does not want to be sold to; she wants the measurement of the shoulder and the length in size M.

## 3. Palette — canon tokens, both modes

Light is the default mode and the mode the brand was drawn in. Dark is a **full second palette** warmed
to the same cream, not an inversion: the pilot measured only dark and shipped light-mode defects it
never saw, so this theme states both and §8 names the mode of every frame.

The identity is two colours — **warm cream paper** and **ink black type**. A third, **clay red**, is the
only saturated value in the store and it means exactly one thing: *this is the one* — sale price, link,
focus ring, selected swatch. If clay appears anywhere else, that is a bug.

### 3.1 Light (default)

| token | value | what it paints |
|---|---|---|
| `--background` | `#f7f2e9` | the page: warm cream, never white |
| `--foreground` | `#17140f` | ink, the type colour |
| `--card` / `--card-foreground` | `#fdfaf4` / `#17140f` | product card, half a tone above the page |
| `--popover` / `--popover-foreground` | `#fffdf8` / `#17140f` | drawer, dropdown |
| `--primary` / `--primary-foreground` | `#17140f` / `#f7f2e9` | the black button; cream label |
| `--secondary` / `--secondary-foreground` | `#e9dfd0` / `#332c22` | quiet button, size chip |
| `--muted` / `--muted-foreground` | `#efe8db` / `#5c5346` | spec table, helper text |
| `--accent` / `--accent-foreground` | `#8c3b2e` / `#fbf7f0` | clay: the one colour |
| `--destructive` / `--destructive-foreground` | `#9b2c22` / `#fbf7f0` | error |
| `--border` / `--input` | `#ded3c2` | hairline rules, field edges |
| `--ring` / `--link` | `#8c3b2e` | focus, links |
| `--success` / `--warning` | `#3f6444` / `#7a5714` | in stock / low stock |
| `--radius` | `0.125rem` | an editorial page has no rounded chrome |

### 3.2 Dark

Same key set, 31 tokens, identical names. `--background #14110d`, `--foreground #f2eadc`,
`--card #1c1813`, `--primary #f2eadc` on `--primary-foreground #14110d` (cream becomes the button),
`--accent #e0907a` (clay lifted so it survives on near-black), `--link #e6a48f`, `--border #3a3128`.
Full values live in `theme.json` and are not duplicated here, because two copies of a palette is one
copy too many.

### 3.3 Contrast — computed, not asserted

Output of `node design/contrast.mjs`, pasted, not retyped. Sixteen pairs per mode, WCAG 2.1 relative
luminance. **Zero pairs under floor in either mode; key sets identical, 31 keys.**

```
LIGHT  (31 tokens)
ratio   floor  fg                      bg                      what
16.47    4.5  --foreground #17140f    --background #f7f2e9    body copy on the page
17.63    4.5  --card-foreground #17140f --card #fdfaf4          copy on a product card
18.07    4.5  --popover-foreground #17140f --popover #fffdf8       copy in a dropdown or drawer
16.47    4.5  --primary-foreground #f7f2e9 --primary #17140f       label inside the primary button
10.45    4.5  --secondary-foreground #332c22 --secondary #e9dfd0     label inside the secondary button
 6.20    4.5  --muted-foreground #5c5346 --muted #efe8db         helper text on a muted panel
 6.77    4.5  --muted-foreground #5c5346 --background #f7f2e9    helper text on the page
 7.07    4.5  --accent-foreground #fbf7f0 --accent #8c3b2e        label inside the accent chip
 6.77    4.5  --accent #8c3b2e        --background #f7f2e9    the accent as text: sale price, active swatch label
 7.08    4.5  --destructive-foreground #fbf7f0 --destructive #9b2c22   label inside a destructive button
 6.78    4.5  --destructive #9b2c22   --background #f7f2e9    error text on the page
 6.77    4.5  --link #8c3b2e          --background #f7f2e9    a link in running text
 6.04    4.5  --success #3f6444       --background #f7f2e9    in-stock line
 5.88    4.5  --warning #7a5714       --background #f7f2e9    low-stock line
 6.77    3.0  --ring #8c3b2e          --background #f7f2e9    focus ring against the page (non-text, 3:1)
 1.33    1.5  --border #ded3c2        --background #f7f2e9    a hairline rule; informational, no WCAG floor

DARK  (31 tokens)
ratio   floor  fg                      bg                      what
15.75    4.5  --foreground #f2eadc    --background #14110d    body copy on the page
14.78    4.5  --card-foreground #f2eadc --card #1c1813          copy on a product card
14.45    4.5  --popover-foreground #f2eadc --popover #1f1a15       copy in a dropdown or drawer
15.75    4.5  --primary-foreground #14110d --primary #f2eadc       label inside the primary button
11.59    4.5  --secondary-foreground #e8dfd0 --secondary #2b241c     label inside the secondary button
 6.61    4.5  --muted-foreground #b0a390 --muted #241f18         helper text on a muted panel
 7.61    4.5  --muted-foreground #b0a390 --background #14110d    helper text on the page
 7.56    4.5  --accent-foreground #14110d --accent #e0907a        label inside the accent chip
 7.56    4.5  --accent #e0907a        --background #14110d    the accent as text: sale price, active swatch label
 6.94    4.5  --destructive-foreground #14110d --destructive #e8806e   label inside a destructive button
 6.94    4.5  --destructive #e8806e   --background #14110d    error text on the page
 9.03    4.5  --link #e6a48f          --background #14110d    a link in running text
 7.56    4.5  --success #7fb083       --background #14110d    in-stock line
 9.07    4.5  --warning #d7ae63       --background #14110d    low-stock line
 7.56    3.0  --ring #e0907a          --background #14110d    focus ring against the page (non-text, 3:1)
 1.48    1.5  --border #3a3128        --background #14110d    a hairline rule; informational, no WCAG floor

key sets identical across modes: true (31 keys)
pairs under floor: 0
```

`--border` is listed at 1.33 / 1.48 and that is deliberate: a hairline rule is decoration, not text and
not a control boundary, and WCAG sets no floor for it. It is the one row in the table with an
informational floor, and it is marked as such in the script rather than quietly excluded.

**This table measures the FILE.** It is arithmetic over JSON and proves only that the values are
self-consistent. What the browser paints is measured on the stand — see §9 and the theme record.

## 4. Typography

Display **Playfair Display**, body **Inter**, both from the profile allow-list. Display is used for the
wordmark, the hero headline, the product title on the PDP and nothing else; every price, label, spec and
button is Inter. A serif that appears in a size chip stops being a serif and becomes noise.

## 5. Photography direction

One set, twelve garments, one session. The garment is worn by an **invisible mannequin** — it holds a
human shape with nobody inside it. No faces, no hands, no skin: a rendered face is a liability and a
rendered hand is a defect, and neither is what the customer is buying.

- **Background:** seamless matte warm cream cyclorama, flat pale sand, half a stop lighter at the top,
  no floor-to-wall seam, no horizon. **Never white** — half of this catalogue is ivory and an ivory
  garment on white loses its own edge, which is defect class A wearing a photographer's hat.
- **Light:** one very large softbox key at 40° camera-left and 25° above; one full-height white bounce
  camera-right lifting the shadow side; neutral 5200 K; soft, low contrast, no coloured light.
- **Camera:** 85 mm at f/8, at the chest height of the garment, square on, no tilt.
- **Placement:** centred, full length in the panel, filling 78 % of panel height, clear space above and
  below, exactly one soft feathered contact shadow beneath the hem, no cast side shadow, no reflection.
- **Template variants** (named here so the merchandiser can flag a brief that does not fit — the pilot
  defect that cost three of nineteen paid frames): **V-form** garment on a full invisible form;
  **V-lower** waist-down form for trousers and skirts; **V-drape** no form at all, for the scarf and the
  silk square, which hang.
- **Hero, the one full-size frame outside the grid:** a figure in a bare cream-plastered room, from
  behind, **cropped at the shoulder line so no head and no face is in frame**, late raking window light
  from the left, the right half of the frame falling into shadow so a headline has somewhere to sit.
- **Negative list:** real logos, brand marks, wordmarks; legible text, letters or numbers anywhere,
  including labels, tags, buttons and hardware; a cut or hardware detail copied from an existing house;
  faces, heads, hands, bare skin, a person wearing the garment; hangers, rails, visible stands, plinths,
  boxes, tissue, furniture, plants, phones; coloured or gradient backgrounds, gels, neon, rim flare;
  wet, glossy or mirrored floor, reflections, a second shadow, a floating garment; flat lay, dutch angle,
  tilted horizon; shallow depth of field, bokeh, motion blur; HDR, oversaturation, heavy vignette,
  upscaling artefacts; anything naming a real place or a real shop; caption, grid line, border, collage
  frame, transparency, checkerboard.

## 6. Home — strings, each inside its schema limit, with its length

| slot | string | limit | length |
|---|---|---|---|
| hero headline | *The four things you wear all winter* | 8–70 | 35 |
| hero subheadline | *Bias-cut silk, Scottish lambswool and double-faced wool, cut long and made to be repaired. Fewer pieces, kept longer.* | ≤160 | 118 |
| hero CTA label | *See the autumn edit* | 2–30 | 19 |
| hero CTA href | `/collections/autumn-edit` | pattern | valid |
| promo strip | *Free alterations on trousers and coats · Repairs for the life of the piece* | ≤90 | 73 |
| tagline | *Clothes that outlast the season* | 8–90 | 30 |
| tiles | Dresses · Knitwear · Shirts and blouses · Trousers and skirts · Coats and jackets | 2–30 each | 7 / 8 / 18 / 19 / 17 |

Hero is **full-bleed**: the photograph runs edge to edge, the headline sits in the right third over the
shadow side of the frame, in Playfair Display, in cream. Category tiles are five 4:5 crops of frames
already paid for, captioned beneath rather than over, because a caption over a cream backdrop is the
white-on-white defect waiting to happen.

## 7. Layout

Card variant `classic` (the only one wave 1 ships; `editorial` is T0j and is not pretended here).
Image frame **4:5**, `fit: cover`, `radius: none`, **`hover: second-image`**. The second frame is real:
every product carries a `-detail.webp` cut at native pixels from the same paid cell, a closer window over
the upper body where the weave, the knit and the button actually read. A `second-image` hover with only
one image per product is silently inert — the storefront guards it with `Boolean(secondSrc)` — and a
silent nothing is exactly the class of defect this wave exists to clear.

## 8. States — ASCII mock-ups, each naming its state AND its mode

The pilot's board drew only rest states, and four of the fourteen defects were disabled, loading, focus
and empty states nobody had drawn. Every interactive element below carries its full set.

### 8.1 Home, 1280, LIGHT (rest)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Free alterations on trousers and coats · Repairs for the life…       │ promo, --muted
├──────────────────────────────────────────────────────────────────────┤
│ LARCHANT            Dresses  Knitwear  Shirts  Trousers  Coats   ⌕ ⧉ │ Playfair / Inter
├──────────────────────────────────────────────────────────────────────┤
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│▓ photograph, full bleed         ░  The four things you wear all     ░│ Playfair, cream
│▓                                ░  winter                           ░│ on the shadow half
│▓                                ░  Bias-cut silk, Scottish lamb…    ░│ Inter
│▓                                ░  [ See the autumn edit ]          ░│ primary button
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
├──────────────────────────────────────────────────────────────────────┤
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                        │ five 4:5 tiles
│  │ 4:5  │ │ 4:5  │ │ 4:5  │ │ 4:5  │ │ 4:5  │                        │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                        │
│  Dresses  Knitwear Shirts   Trousers Coats                           │ caption BELOW
└──────────────────────────────────────────────────────────────────────┘
```

### 8.2 Listing card, LIGHT — rest / hover / focus / empty

```
rest                     hover (second-image)      focus (keyboard)         empty result
┌──────────┐             ┌──────────┐              ┏━━━━━━━━━━┓            ┌──────────────────┐
│  4:5     │             │  4:5     │              ┃  4:5     ┃ 2px ring   │ Nothing in this  │
│  hero    │             │  DETAIL  │ cross-fade   ┃  hero    ┃ --ring     │ size yet.        │
└──────────┘             └──────────┘              ┗━━━━━━━━━━┛ clay       │ [Clear filters]  │
Ondine bias-cut          Ondine bias-cut           offset 2px, never       └──────────────────┘
slip dress               slip dress                the browser default     --muted-foreground
$289                     $289                                              + one action
```

### 8.3 PDP, 1280, LIGHT — size and colour, every state

```
Colour   ( ● Ivory )  ( ○ Ink )              selected = 2px --accent ring + label in --accent
Size     [XS] [S] [M] [L] [XL]
          ▲    ▲    ▲    ▲    ▲
          │    │    │    │    └ DISABLED — sold out: --muted bg, --muted-foreground label,
          │    │    │    │      a diagonal rule through the chip, and `aria-disabled`.
          │    │    │    └────── SELECTED — --primary bg, --primary-foreground label
          │    │    └─────────── HOVER — --secondary bg
          │    └──────────────── FOCUS — 2px --ring, offset 2
          └───────────────────── REST — --card bg, --border hairline

[ Add to bag ]  rest      --primary / --primary-foreground, radius 0.125rem
[ Add to bag ]  loading   label replaced by a 16px spinner in --primary-foreground,
                          the button keeps its width — no layout jump
[ Select a size ] disabled  --muted bg, --muted-foreground label, ratio 4.5:1 or it is
                            not a disabled button, it is an invisible one
In stock · ships tomorrow   --success        Low stock · 2 left   --warning
```

### 8.4 PDP, 390, LIGHT (rest + sticky bar)

```
┌────────────────────┐
│  4:5 image         │
│                    │
├────────────────────┤
│ Ondine bias-cut    │ Playfair, 24/28
│ slip dress         │
│ $289               │ Inter 18, --accent
│ Colour ( ● ) ( ○ ) │
│ Size [XS][S][M]…   │ wraps to two rows, never scrolls horizontally
├────────────────────┤
│ [   Add to bag   ] │ sticky, full width, --primary
└────────────────────┘
```

### 8.5 Cart drawer, LIGHT — filled and empty

```
filled                                  empty
┌────────────────────────────┐          ┌────────────────────────────┐
│ Bag (2)                  ✕ │          │ Bag                      ✕ │
├────────────────────────────┤          ├────────────────────────────┤
│ ▢ Ondine slip dress        │          │                            │
│   Ivory / M      $289  [–] │          │   Your bag is empty.       │ --muted-foreground
│ ▢ Aubin merino crew        │          │   [ Browse the autumn edit ]│ one action, not a
│   Sage / S       $145  [–] │          │                            │ dead end
├────────────────────────────┤          └────────────────────────────┘
│ Subtotal            $434   │
│ [      Checkout        ]   │
└────────────────────────────┘
```

### 8.6 Checkout, 1280, DARK — the same screen in the second mode

```
┌──────────────────────────────────────────────────────────────────────┐  --background #14110d
│ LARCHANT                                                    Step 2/3 │  --foreground #f2eadc
├──────────────────────────────────────────────────────────────────────┤
│ Email     [ claire@example.com                    ]                  │  --input border
│ Address   [                                        ]  ← FOCUS: 2px   │  --ring #e0907a
│ Postcode  [        ]  Required                       --destructive   │  #e8806e, 6.94:1
│                                                                      │
│ [ Continue to payment ]  rest --primary #f2eadc / label #14110d      │
│ [ Continue to payment ]  disabled --muted #241f18 / #b0a390, 6.61:1  │
└──────────────────────────────────────────────────────────────────────┘
```

Every frame above is drawn in the mode it names. §8.1–8.5 are LIGHT, the default mode; §8.6 is DARK, so
the second palette is drawn and not merely tabulated.

## 9. What this document does not prove

A palette in a file is not a palette on a screen. The pilot's theme was correct as a file and wrong on
the surface, and that is root cause of half the registry. The claims that must be measured on the live
stand, not here, are: the preset reaches the painted surfaces (coverage gate); the six token pairs
measured from **computed** styles; `data-theme` and `data-mode` set before first paint; every hero and
tile URL answering 200 with a byte size. Those numbers live in the theme record, not in this board.
