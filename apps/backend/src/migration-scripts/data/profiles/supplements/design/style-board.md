# Scruple — style board for the `supplements` store profile

Wave 2, stage W1. Every colour ratio in section 3.2 was **computed** by
`scratchpad/palette.mjs` and the raw output is pasted in the appendix; a ratio nobody computed
is not a ratio. The programme row for `supplements`
(`artifacts/docs/2026-09-08-wave2-program.md:19`) fixes the vertical, the options, the palette
character, the **light** default mode, the 4:5 frame, the Manrope/Inter pair and the split hero.
Those were decided before this document and are not re-chosen here.

---

## 1. Brand

**Name — Scruple.** A scruple is an apothecary unit of weight, twenty grains, the smallest
measure an old dispensary worked in. It also means the conscientiousness that stops you cutting a
corner. Both readings are the product.

**Verification.** Three web searches were run before the name was settled, and two candidates
were discarded on their results:

| Candidate | Search | Result | Verdict |
|---|---|---|---|
| Halewell | `"Halewell" supplements vitamins brand` | Returned **Haleon** (Centrum, Caltrate, Emergen-C) and **Healthwell**, both live in this exact vertical | **Rejected** — collides by sound with two incumbents |
| Plumbline | `"Plumbline" supplements vitamins brand nutrition` | **Plumbline Nutrition** (plumblinenutrition.com) is a live supplement distributor | **Rejected** — the name is taken |
| **Scruple** | `"Scruple" supplements vitamins brand company` | No supplement or vitamin brand of that name in the results; returns were Thorne, New Chapter, Vitamin World, Schiff, Nutrilite | **Accepted** |

**Tagline** — "The apothecary's smallest measure" (33 chars, limit 90).

**Wordmark** — `SCRUPLE`, style `wordmark`. Manrope at weight 600, letter-spacing `0.14em`, set in
`--foreground`, never in the mint. The mint is for one accent per screen and a wordmark is not it.

**Voice, in three sentences.** State the dose, the chemical form and how strong the evidence
actually is, in that order. Never promise an outcome, and where the category would promise one,
say instead what the product will not do — "this is not a sedative", "it will not give you energy
you have not slept for". Prefer the plain number to the adjective: the label says 200 mg
elemental magnesium because that is the figure a reader can compare, and everything else is
decoration.

**What that voice forbids.** No exclamation marks. No "clinically proven", "powerful",
"advanced", "optimal" or "supports" used as a hedge for a claim we cannot make. No proprietary
blend. Where the evidence is thin — the ashwagandha, the collagen — the copy says so in the same
paragraph that sells the product.

## 2. Audience persona

Nadia, 38, reads the supplement-facts panel before the front label, was once sold a proprietary
blend that was mostly rice flour, and wants the elemental dose and a batch certificate, not a
promise. She is not buying transformation; she is closing known gaps in a diet she already
mostly manages, and she will pay a premium for a number she can check. She distrusts the
category's visual language — the fruit, the sunrise, the smiling woman on a yoga mat — which is
why section 5's negative list is as long as it is.

## 3. Palette

Programme character: **clinical white + mint**, default mode **light**. `supplements` is the
first light theme of the wave, and the pilot measured only dark. The mirror class of the pilot's
"black text on the ink page" is **white on white**, so both modes are stated in full below and
every frame in section 8 names the mode it is drawn in.

### 3.1 Tokens

The key set is the full canon set — 31 keys, identical in both modes, checked against
`specs/design-system/themes/sneakers.theme.json` (0 missing, 0 extra in each mode).

| Token | Light | Dark |
|---|---|---|
| `--radius` | `0.5rem` | `0.5rem` |
| `--background` | `#ffffff` | `#0a1310` |
| `--foreground` | `#10201b` | `#e9f1ee` |
| `--card` | `#ffffff` | `#0f1a16` |
| `--card-foreground` | `#10201b` | `#e9f1ee` |
| `--popover` | `#ffffff` | `#142019` |
| `--popover-foreground` | `#10201b` | `#e9f1ee` |
| `--primary` | `#0a6a52` | `#57e0b0` |
| `--primary-foreground` | `#ffffff` | `#06110d` |
| `--secondary` | `#eef5f2` | `#182420` |
| `--secondary-foreground` | `#10201b` | `#e9f1ee` |
| `--muted` | `#eef5f2` | `#182420` |
| `--muted-foreground` | `#4d5f59` | `#9cb2ab` |
| `--accent` | `#e2eee9` | `#1e2b26` |
| `--accent-foreground` | `#10201b` | `#e9f1ee` |
| `--destructive` | `#b3261e` | `#ff6b6b` |
| `--destructive-foreground` | `#ffffff` | `#0a1310` |
| `--border` | `#d7e3de` | `#263330` |
| `--input` | `#d7e3de` | `#263330` |
| `--ring` | `#0a6a52` | `#57e0b0` |
| `--link` | `#0a6a52` | `#57e0b0` |
| `--success` | `#0a6a52` | `#57e0b0` |
| `--warning` | `#7a4b00` | `#ffb020` |
| `--chart-1` … `--chart-5` | `#0a6a52` `#4d5f59` `#7d918a` `#a9bcb5` `#d7e3de` | `#57e0b0` `#9cb2ab` `#6d827b` `#44544e` `#263330` |
| `--shadow-card` / `--shadow-float` / `--shadow-modal` | ink `#10201b` at 4–8 % | black at 16–48 % over a `#ffffff0f` inset |

**The one deliberate polarity flip.** The brand mint is `#57e0b0`. On white it scores **1.63:1**
and is unusable for anything that carries meaning, so light mode carries the darkened emerald
`#0a6a52` in `--primary`, `--ring`, `--link` and `--success` (6.57:1 on white) and keeps the mint
itself only in dark mode (11.40:1 on the ink ground). The pale mints `#eef5f2` and `#e2eee9`
carry the "mint" character of the light theme as *surfaces*, not as text.

**Why `--warning` is brown in light mode.** Amber `#ffb020` scores 1.87:1 on white. A warning
that cannot be read is not a warning, so light mode uses `#7a4b00` (7.41:1).

### 3.2 Computed contrast

22 pairs per mode, 44 in total, every one computed. **0 failures.** Full raw output in the
appendix.

Floors, and why each is the floor that applies:

- **4.5:1** — WCAG 1.4.3 AA, all body-size text.
- **3.0:1** — WCAG 1.4.11, the focus ring: it is the only affordance that identifies focus.
- **1.25:1** — hairline borders only. A hairline here is **not** a component boundary: our inputs
  also change fill on focus and carry a 2 px `--ring`, so 1.4.11 does not bind the border alone.
  Recorded rather than waived — light `--border` on `--background` is **1.32:1**, against the
  canon `sneakers` preset's **1.27:1**, so this theme separates slightly *more* than the pilot.

Worst text pair in either mode: `--muted-foreground` on `--muted`, light, **6.13:1** — 1.36x
above the floor.

### 3.3 The pair this board does NOT control

`d-11` in the defect registry is the disabled button, measured by the gates retro at **2.06:1 in
light mode** (`--fg-disabled` `rgb(169,169,169)` on `--bg-disabled` `rgb(240,240,240)`). That
pair is **bridge-derived, not preset-derived**: it is not one of the 31 keys above, and no value
this board can set will change it. It is one of the foundation's 8 known failing nodes and it is
expected to persist into this theme. Naming it here so that its appearance in the W7 gate output
is recognised as inherited, not introduced.

## 4. Typography

From the allow-list, fixed by the programme row: **display Manrope, body Inter**.

| Role | Face | Size / line | Weight | Tracking |
|---|---|---|---|---|
| Wordmark | Manrope | 20 / 24 | 600 | `0.14em` |
| H1 hero | Manrope | 44 / 48 (1280), 30 / 34 (390) | 600 | `-0.02em` |
| H2 section | Manrope | 28 / 34 (1280), 22 / 28 (390) | 600 | `-0.01em` |
| Product title | Manrope | 17 / 24 | 500 | `0` |
| Price | Inter | 17 / 24 | 600 tabular | `0` |
| Body / description | Inter | 15 / 24 | 400 | `0` |
| Spec table | Inter | 14 / 22 tabular | 400 | `0` |
| Caption, dose line | Inter | 13 / 18 | 500 | `0.01em` |

Numerals are **tabular** in price and in the spec table. This shop's whole argument is that its
numbers are comparable, and proportional figures that fail to line up in a column undercut it.

## 5. Photography direction

**Background** — seamless matte white cyclorama, very slightly cool, no seam between floor and
wall, no horizon line. White on white is the point: the product is a bottle, and the bottle is
mint.

**Lighting** — one large softbox key at 40° camera-left, 25° above; a white bounce card
camera-right for fill; neutral 5600 K; clean even pharmacy light. No coloured gels, no rim light.

**Camera** — 100 mm macro at f/9, at **label height**, straight on, no tilt. The label band is
the subject; shooting from above turns a bottle into a lid.

**Floor and shadow** — matte, one soft feathered contact shadow directly beneath the subject. No
cast side shadow, no reflection, nothing floating.

**Props** — the vessel, and the dose form beside it (capsules, softgels, a filled scoop, the
loose pipette). Nothing else. A "prop rule" in this vertical is mostly a list of refusals,
which is section 5's negative list.

**Frame** — 4:5, per the programme row. `fit` is **`contain`**, not `cover`: a bottle cropped by
a square card loses its cap or its base, and the cap is half the silhouette.

**Negative list** (carried verbatim into every `imageBrief.doNotShow`, 12 entries): logos and
wordmarks; legible text, numbers or supplement-facts panels; health claims, seals, badges, award
marks; human faces, hands, mouths, bodies; spilled powder or loose capsules outside the vessel
unless briefed; pills arranged as a face, heart, smile or any pictogram; coloured or gradient
backgrounds, gels, neon, rim-light flare; wet, glossy or mirrored floor, reflections, second
shadow, floating subject; top-down flat lay, dutch angle, tilted horizon; shallow depth of field,
bokeh, motion blur; HDR, oversaturation, heavy vignette, upscaling artefacts; fruit, leaves,
flowers, mortar and pestle or any wellness-stock prop.

The last entry is the one that matters most here. Every visual cliché of this category is a
health claim smuggled in as decoration, and the brand voice in section 1 forbids the claim.

## 6. Home concepts

**Hero — `split`**, per the programme row: the bottle on one side, three benefits on the other.
"Benefits" in this brand are **facts**, not outcomes.

- Headline (43 / 70): **"Doses you can check, on labels you can read"**
- Subheadline (126 / 160): **"Third-party tested vitamins at everyday doses, with the batch
  certificate published against its number. No proprietary blends."**
- CTA (19 / 30): **"Shop the foundation"** → `/store`
- Three facts beside it: *Elemental dose on the front* · *Batch certificate, by number* ·
  *No proprietary blends*
- Image: `media/home-hero.webp`, 16:9, bottle left of centre, empty white right half for the type.

**Category tiles — three**, each `media/tile-<handle>.webp`: Multivitamins · Sleep and calm ·
Gut health. **Why three and not five:** tiles are bought as cells of a nine-cell grid
(directive §3.1), grid B carries six product frames plus three tiles, and a fourth tile would
have required a third $0.30 grid for one image. Recorded as an economics decision, not a design
one — `joints-and-mobility` and `vitamins-and-minerals` are reachable from the nav and from the
`daily-foundations` / `targeted-support` parents.

**Promo strip** (81 / 90): **"Free shipping over $45 · batch certificate on every product page ·
60-day returns"**. Every clause is a fact the shop can keep.

## 7. Layout

| Field | Value | Why |
|---|---|---|
| `cardVariant` | `compact` | States intent only. **Measured: 0 consumers** in `apps/storefront/src` and `apps/backend/src` — the field is required by the schema and rendered by nothing. See the report. |
| `imageTreatment.aspect` | `4:5` | Programme row |
| `imageTreatment.fit` | `contain` | A bottle must not lose its cap to a crop |
| `imageTreatment.radius` | `md` | `0.5rem`, matching `--radius` |
| `imageTreatment.hover` | `none` | One frame per product; there is no second image to swap to |
| Grid | 4 up at 1280, 2 up at 768, 1 up at 390 | |

## 8. ASCII mock-ups — behaviour, not just rest

Every interactive element below is drawn in **all** of its states. Four of the owner's fourteen
defects (`d-03`, `d-04`, `d-11`, and the empty drawer in `d-09`) were states nobody had drawn.
Each frame names its **mode**.

### 8.1 Home — 1280, LIGHT (default mode)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ SCRUPLE            Store  Daily  Targeted  Journal        ⌕   Account  Cart⁰ │  header: --background
├──────────────────────────────────────────────────────────────────────────────┤
│ Free shipping over $45 · batch certificate on every page · 60-day returns    │  promo: --secondary
├───────────────────────────────────┬──────────────────────────────────────────┤
│                                   │  Doses you can check,                    │  H1 Manrope 44/48
│      ▁▁▁▁▁                        │  on labels you can read                  │  --foreground
│     ▕     ▏  mint bottle          │                                          │
│     ▕     ▏  on white             │  Third-party tested vitamins at everyday │  --muted-foreground
│     ▕_____▏  ● ● ●  capsules      │  doses, with the batch certificate       │
│       ───                         │  published against its number.           │
│                                   │                                          │
│                                   │  ✓ Elemental dose on the front           │  ✓ in --primary
│                                   │  ✓ Batch certificate, by number          │
│                                   │  ✓ No proprietary blends                 │
│                                   │  ┌────────────────────┐                  │
│                                   │  │ Shop the foundation│ ← primary, rest  │  --primary bg
│                                   │  └────────────────────┘   #0a6a52/#fff   │
└───────────────────────────────────┴──────────────────────────────────────────┘
  hero image: 4:5 contain on --background        split, image left, type right

  CTA states, LIGHT:
   rest      bg --primary #0a6a52   fg #ffffff              6.57:1
   hover     bg #085743 (--primary darkened one step)       7.9:1
   focus     rest + ring 2px --ring #0a6a52, offset 2px     ring vs bg 6.57:1
   active    bg #064534
   disabled  INHERITED bridge pair, 2.06:1 — see §3.3, not settable here
   loading   label replaced by a 16px spinner in --primary-foreground, button keeps its width

┌──────────────┬──────────────┬──────────────┐
│  ▤ tile      │  ▤ tile      │  ▤ tile      │   category tiles, 3 up
│ Multivitamins│Sleep and calm│  Gut health  │   label --foreground on --card
└──────────────┴──────────────┴──────────────┘   hover: --accent #e2eee9, no lift
```

### 8.2 Category listing — 1280, LIGHT · the two dropdowns that produced d-03 and d-04

```
Daily foundations › Multivitamins                      4 products
┌─ Count ────────── ▾ ┐  ┌─ Flavour ──── ▾ ┐   ← filter selects
│ 60 · 120 · 180      │  │ Unfl. Van. Coc. │
└─────────────────────┘  └─────────────────┘

  select states, LIGHT — the d-03/d-04 class, drawn:
   rest      bg --background  border --input #d7e3de  text --foreground
   hover     bg --accent #e2eee9
   FOCUS     border --ring + ring 2px --ring #0a6a52 offset 2px.
             NOT the browser default blue. d-03/d-04 were exactly this.
   open      popover bg --popover #ffffff, border --border, --shadow-float
   option    rest   text --popover-foreground #10201b on #ffffff   16.87:1
             hover  bg --accent #e2eee9, text --popover-foreground  14.17:1
             selected  bg --secondary, ✓ in --primary
             disabled  text --muted-foreground at 60%, no hover
   Every option label names --popover-foreground. In light mode an option that
   inherits its colour is BLACK ON WHITE and looks fine; the mirror bug is a
   label that inherits WHITE. Both are prevented the same way: name the token.

┌────────────┬────────────┬────────────┬────────────┐
│  ▤ 4:5     │  ▤ 4:5     │  ▤ 4:5     │  ▤ 4:5     │  card: --card + --shadow-card
│ Baseline   │ Baseline   │ Baseline   │ The Starter│  title --card-foreground
│ Daily      │ 50+        │ Prenatal   │ Fortnight  │
│ 23 nutrient│ iron-free  │ 600mcg DFE │ 14 sachets │  --muted-foreground 6.78:1
│ $29        │ $32        │ $34        │ $19        │  price, Inter 600 tabular
└────────────┴────────────┴────────────┴────────────┘

  card states: rest --card · hover --accent + --shadow-float · focus-visible ring 2px --ring
  LOADING (skeleton, the d-02 class):  blocks are --muted #eef5f2, NEVER a literal grey.
  ┌────────────┐   In light mode a bg-neutral-200 skeleton is nearly invisible on white —
  │ ▒▒▒▒▒▒▒▒▒▒ │   the mirror of the pilot's light-grey block on the ink page. Same fix:
  │ ▒▒▒▒▒▒     │   the skeleton is --muted, and it is the only surface allowed to pulse.
  └────────────┘
  EMPTY:  "No products match these filters."  --muted-foreground, centred, with a
          "Clear filters" link in --link. Never a bare blank column.
```

### 8.3 PDP — 1280, LIGHT · swatches and the count selector

```
┌─────────────────────┬────────────────────────────────────────────┐
│                     │  Baseline Daily · multivitamin             │  H1 Manrope 28/34
│    ▤  4:5 contain   │  Twenty-three nutrients at everyday doses   │  --muted-foreground
│    bottle + caps    │                                             │
│                     │  $29                                        │  Inter 600 tabular
│                     │  ─────────────────────────────  --border    │  ← d-06 lives here:
│                     │  Count                                      │    the rule is --border
│                     │  ┌────┐ ┌─────┐ ┌─────┐                     │    #d7e3de, never a
│                     │  │ 60 │ │ 120 │ │ 180 │                     │    literal white/grey
│                     │  └────┘ └─────┘ └─────┘                     │
│                     │   sel    rest    disabled (out of stock)    │
│                     │                                             │
│                     │  Flavour   ● Unflavoured  ○ Vanilla ○ Cocoa │  swatch = metadata.hex
│                     │  ┌───────────────────────┐                  │
│                     │  │   Add to cart         │                  │
│                     │  └───────────────────────┘                  │
└─────────────────────┴────────────────────────────────────────────┘

  Count chip states, LIGHT:
   rest       border --input, text --foreground, bg --background
   hover      bg --accent #e2eee9
   focus      ring 2px --ring #0a6a52 offset 2px
   selected   bg --primary #0a6a52, text --primary-foreground #ffffff   6.57:1
   DISABLED   bg --muted #eef5f2, text --muted-foreground at 60%, strike-through,
              cursor not-allowed, aria-disabled. A struck chip is legible where a
              greyed one is not — this is the d-11 class and the reason the
              disabled STATE here does not rely on the un-settable bridge pair.
  Add-to-cart LOADING: spinner in --primary-foreground on --primary, button width frozen,
              aria-busy. The pilot's spinner was invisible because both it and its
              button were literal colours (d-11).
```

### 8.4 Cart drawer — 390, LIGHT and DARK · the d-09 / d-10 / d-14 class

```
  LIGHT, 2 items                        LIGHT, EMPTY (d-09 was this state)
┌──────────────────────────┐          ┌──────────────────────────┐
│ Cart  ②            ✕     │          │ Cart               ✕     │
│  panel --popover #ffffff │          │                          │
│  heading --popover-fg    │          │      ▢  (outline icon    │
│ ──────────  --border     │          │          in --muted-fg)  │
│ ▤ Baseline Daily   $29   │          │                          │
│   120 count        ✕     │          │   Your cart is empty     │  --popover-foreground
│ ▤ Omega-3 · rTG    $59   │          │   Nothing in it yet.     │  --muted-foreground
│   180 count        ✕     │          │  ┌────────────────────┐  │
│ ──────────               │          │  │ Shop the foundation│  │  --primary
│ Total            $88     │          │  └────────────────────┘  │
│ ┌──────────────────────┐ │          └──────────────────────────┘
│ │      Checkout        │ │            The whole panel is --popover. The pilot's
│ └──────────────────────┘ │            drawer was a white block with only the CTA
└──────────────────────────┘            themed (d-09), and its count badge was a
                                        literal bg-black/text-white (d-10).
  DARK, same drawer: panel --popover #142019, heading --popover-foreground #e9f1ee
  (14.62:1), badge bg --primary #57e0b0 with fg --primary-foreground #06110d (11.61:1).
  The badge NEVER hard-codes black or white in either mode.
```

### 8.5 Checkout — 1280, DARK · the d-13 class

```
┌────────────────────────────────┬──────────────────────────────┐
│ 1 Address                      │  Summary   --card #0f1a16    │
│   ┌──────────────────────────┐ │  ── --border #263330         │
│   │ input, rest              │ │  Baseline Daily  ×1    $29   │
│   └──────────────────────────┘ │  Omega-3 · rTG   ×1    $59   │
│   ┌──────────────────────────┐ │  Shipping             Free   │
│   │ input, FOCUS: ring --ring│ │  ──                          │
│   └──────────────────────────┘ │  Total                $88    │  --card-foreground
│   ┌──────────────────────────┐ │        15.50:1, NOT inherited│
│   │ input, ERROR --destructive│ │                             │
│   └──────────────────────────┘ │  The pilot rendered this      │
│   "Enter a postcode"            │  column white with an        │
│    --destructive #ff6166 6.80:1 │  invisible Total (d-13).     │
│ 2 Delivery                      │                              │
│ 3 Payment — "Select a payment    │                             │
│   method" in --foreground,       │                             │
│   never inherited (d-13)         │                             │
└────────────────────────────────┴──────────────────────────────┘
```

### 8.6 Mobile navigation drawer — 390, DARK · the d-14 class

```
┌──────────────────────────┐   Panel is a FLAT --popover #142019.
│ SCRUPLE            ✕     │   No gradient. d-14 was a black-to-white
│ ──────────  --border     │   gradient panel on which Store / Account /
│  Store                   │   Cart went invisible at the light end.
│  Daily foundations       │   Every row: --popover-foreground #e9f1ee,
│  Targeted support        │   14.62:1. Row hover --accent #1e2b26.
│  ──────────              │   Focus: ring 2px --ring #57e0b0, inset.
│  Account                 │
│  Cart  ②                 │   Same frame in LIGHT: panel #ffffff,
└──────────────────────────┘   rows #10201b, 16.87:1.
```

---

## Appendix — raw output of the contrast script

Produced by `node palette.mjs`, exit code 0. Not retyped; pasted.

```
=== LIGHT ===
pair                                          fg        bg        ratio     floor  verdict
--foreground on --background                  #10201b   #ffffff   16.87:1   4.5    PASS  // body text on the page
--card-foreground on --card                   #10201b   #ffffff   16.87:1   4.5    PASS  // text on a product card
--popover-foreground on --popover             #10201b   #ffffff   16.87:1   4.5    PASS  // text in a dropdown / cart drawer
--primary-foreground on --primary             #ffffff   #0a6a52   6.57:1    4.5    PASS  // label on the primary button
--secondary-foreground on --secondary         #10201b   #eef5f2   15.25:1   4.5    PASS  // text on the secondary surface
--muted-foreground on --muted                 #4d5f59   #eef5f2   6.13:1    4.5    PASS  // secondary copy on the muted surface
--muted-foreground on --background            #4d5f59   #ffffff   6.78:1    4.5    PASS  // secondary copy on the page
--muted-foreground on --card                  #4d5f59   #ffffff   6.78:1    4.5    PASS  // secondary copy on a card
--accent-foreground on --accent               #10201b   #e2eee9   14.17:1   4.5    PASS  // text on the hover surface
--destructive-foreground on --destructive     #ffffff   #b3261e   6.54:1    4.5    PASS  // label on the destructive button
--destructive on --background                 #b3261e   #ffffff   6.54:1    4.5    PASS  // error text on the page
--destructive on --card                       #b3261e   #ffffff   6.54:1    4.5    PASS  // error text on a card
--link on --background                        #0a6a52   #ffffff   6.57:1    4.5    PASS  // link on the page
--link on --card                              #0a6a52   #ffffff   6.57:1    4.5    PASS  // link on a card
--primary on --background                     #0a6a52   #ffffff   6.57:1    4.5    PASS  // accent text / price on the page
--primary on --card                           #0a6a52   #ffffff   6.57:1    4.5    PASS  // accent text / price on a card
--success on --background                     #0a6a52   #ffffff   6.57:1    4.5    PASS  // success text on the page
--warning on --background                     #7a4b00   #ffffff   7.41:1    4.5    PASS  // warning text on the page
--ring on --background                        #0a6a52   #ffffff   6.57:1    3      PASS  // focus ring against the page
--ring on --card                              #0a6a52   #ffffff   6.57:1    3      PASS  // focus ring against a card
--border on --background                      #d7e3de   #ffffff   1.32:1    1.25   PASS  // hairline against the page
--border on --card                            #d7e3de   #ffffff   1.32:1    1.25   PASS  // hairline against a card

=== DARK ===
pair                                          fg        bg        ratio     floor  verdict
--foreground on --background                  #e9f1ee   #0a1310   16.42:1   4.5    PASS  // body text on the page
--card-foreground on --card                   #e9f1ee   #0f1a16   15.50:1   4.5    PASS  // text on a product card
--popover-foreground on --popover             #e9f1ee   #142019   14.62:1   4.5    PASS  // text in a dropdown / cart drawer
--primary-foreground on --primary             #06110d   #57e0b0   11.61:1   4.5    PASS  // label on the primary button
--secondary-foreground on --secondary         #e9f1ee   #182420   13.93:1   4.5    PASS  // text on the secondary surface
--muted-foreground on --muted                 #9cb2ab   #182420   7.14:1    4.5    PASS  // secondary copy on the muted surface
--muted-foreground on --background            #9cb2ab   #0a1310   8.41:1    4.5    PASS  // secondary copy on the page
--muted-foreground on --card                  #9cb2ab   #0f1a16   7.94:1    4.5    PASS  // secondary copy on a card
--accent-foreground on --accent               #e9f1ee   #1e2b26   12.80:1   4.5    PASS  // text on the hover surface
--destructive-foreground on --destructive     #0a1310   #ff6b6b   6.80:1    4.5    PASS  // label on the destructive button
--destructive on --background                 #ff6b6b   #0a1310   6.80:1    4.5    PASS  // error text on the page
--destructive on --card                       #ff6b6b   #0f1a16   6.41:1    4.5    PASS  // error text on a card
--link on --background                        #57e0b0   #0a1310   11.40:1   4.5    PASS  // link on the page
--link on --card                              #57e0b0   #0f1a16   10.76:1   4.5    PASS  // link on a card
--primary on --background                     #57e0b0   #0a1310   11.40:1   4.5    PASS  // accent text / price on the page
--primary on --card                           #57e0b0   #0f1a16   10.76:1   4.5    PASS  // accent text / price on a card
--success on --background                     #57e0b0   #0a1310   11.40:1   4.5    PASS  // success text on the page
--warning on --background                     #ffb020   #0a1310   10.31:1   4.5    PASS  // warning text on the page
--ring on --background                        #57e0b0   #0a1310   11.40:1   3      PASS  // focus ring against the page
--ring on --card                              #57e0b0   #0f1a16   10.76:1   3      PASS  // focus ring against a card
--border on --background                      #263330   #0a1310   1.44:1    1.25   PASS  // hairline against the page
--border on --card                            #263330   #0f1a16   1.36:1    1.25   PASS  // hairline against a card

key sets: light 31, dark 31, identical: true
failing pairs: 0
```
