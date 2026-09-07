# Profile home page — mock-up (stage S1c, store-profiles pilot)

Date 2026-09-07 · scope: the storefront blocks driven by `profile.json`
(`home.hero`, `home.categoryTiles`, `home.promoStrip`, `layout.imageTreatment`, `brand`)
of `specs/store-profiles/store-profile.schema.json`.

Canon: `~/upready/packages/geist-kit/AGENTS.md` — sentence case everywhere, font-weight ≤ 600,
exactly one accent (`--link` blue, links and success only), hairline 1px `--border`,
Geist Mono + `tabular-nums` for every number, dark-mode elevation = borders and never shadows.
Marketing surfaces use the **display scale** (20–48px, weight 600, tracking −0.03…−0.05em, pill CTAs);
the product rail and the cards keep the **tool scale** (14px/1.45) — the canon forbids mixing the two
inside one surface, so the boundary is drawn at the end of the hero.

Document form follows `~/upready/projects/design-docs/docs/theme-configurator/06-ui-panel.md`:
one frame per state, every frame labelled with its state, then the behaviour the frame is obliged
to show, then the human-eyes acceptance criteria (rule 27d).

## How to read the frames

| Symbol | Meaning |
|---|---|
| `░` | photographic image area (`next/image`, `fill`) |
| `▚` | image area under hover transform |
| `( label → )` | pill CTA, polarity flip: bg `--fg`, text `--bg`, weight 500 |
| `·` | separator inside a meta line, never rendered as a bullet |
| `{path}` | the profile field the string is bound to |

Character scale: a 1280-wide frame is 78 inner columns, so **1 char ≈ 16px**;
a 390-wide frame is 32 inner columns, so **1 char ≈ 12px**. Vertical rhythm is written
into the frame as an explicit px note, never inferred from line count.

Frame index: 18 frames — 4 hero, 5 category tiles, 2 promo strip, 2 product rail,
3 PDP thumbnail aspect, 2 assembled page.

---

## 1 · Hero — `home.hero`

### Frame 1 — state: hero · layout=`full-bleed` · viewport 1280

```
┌ state: hero · layout=full-bleed · viewport 1280 · height 560px ──────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░  {home.hero.image} · next/image fill · priority · sizes="100vw"          ░░│
│░░  scrim: linear-gradient(90deg, rgba(0,0,0,.62) 0%, rgba(0,0,0,.10) 62%)  ░░│
│░░                                                                          ░░│
│░░   Built for the long way home                                            ░░│
│░░   {home.hero.headline} · 48px/600/-0.04em · sentence case · #fff         ░░│
│░░                                                                          ░░│
│░░   Cushioned trail runners for pavement that turns to dirt                ░░│
│░░   {home.hero.subheadline} · 16px/400/1.5 · rgba(255,255,255,.78)         ░░│
│░░                                                                          ░░│
│░░   ( Shop the drop → )                                                    ░░│
│░░   {home.hero.cta.label} -> {home.hero.cta.href} · Link · pill r-9999     ░░│
│░░   h 44px · px 24 · bg #fff · text #0a0a0a · 500 · hover: bg #ededed      ░░│
│░░                                                                          ░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
└ text block: left-aligned, max-w 620px, inset from content-container gutter ──┘
```

Behaviour this frame is obliged to show: the image is the full bleed of the viewport, not of the
content container; the copy sits inside the container gutter so it lines up with the nav wordmark
above it; the scrim is horizontal, not a flat overlay, so the right two fifths of the photograph
stay clean; the CTA is one pill and there is no second, competing button.

### Frame 2 — state: hero · layout=`split` · viewport 1280

```
┌ state: hero · layout=split · viewport 1280 · height 560px ───────────────────┐
│                                    ┃░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│  Built for the long way home        ┃░░                                    ░░│
│  {home.hero.headline}               ┃░░  {home.hero.image}                 ░░│
│  44px/600/-0.04em · --fg            ┃░░  next/image fill · priority        ░░│
│                                     ┃░░  object-fit: cover                 ░░│
│  Cushioned trail runners for        ┃░░  sizes="(max-width:1024px) 100vw,  ░░│
│  pavement that turns to dirt        ┃░░          50vw"                     ░░│
│  {home.hero.subheadline}            ┃░░                                    ░░│
│  16px/400/1.5 · --muted             ┃░░                                    ░░│
│                                     ┃░░                                    ░░│
│  ( Shop the drop → )                ┃░░                                    ░░│
│  bg --fg · text --bg · 500          ┃░░                                    ░░│
│                                     ┃░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
└ grid 1fr 1fr · text pane on --bg, no scrim · ┃ = hairline 1px --border ──────┘
```

Behaviour this frame is obliged to show: in `split` the copy is on the page background and therefore
uses the theme's own `--fg` / `--muted`, **not** the on-image whites of frame 1; the two panes are
separated by a hairline border, never by a shadow or a gap; the headline drops one step (48 → 44px)
because it no longer has to hold its own against a photograph.

### Frame 3 — state: hero · layout=`full-bleed` · viewport 390

```
┌ state: hero · full-bleed · 390 · h 440px ┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░          │
│░░                            ░░          │
│░░  scrim: linear 180deg      ░░          │
│░░  rgba(0,0,0,.20) 40%       ░░          │
│░░  -> rgba(0,0,0,.70) 100%   ░░          │
│░░                            ░░          │
│░░                            ░░          │
│░░  Built for the long        ░░          │
│░░  way home                  ░░          │
│░░  30px/600/-0.03em          ░░          │
│░░                            ░░          │
│░░  Cushioned trail runners   ░░          │
│░░  14px/400 · rgba(#fff,.78) ░░          │
│░░                            ░░          │
│░░ ( Shop the drop → )        ░░          │
│░░  full-width pill · h 44    ░░          │
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░          │
└ copy anchored to the BOTTOM ─────────────┘
```

Behaviour: at 390 the scrim turns vertical and the copy anchors to the bottom edge, so the subject of
the photograph keeps the top two thirds; the CTA spans the container width because a 44px pill next to
a 390px viewport otherwise reads as a stray chip.

### Frame 4 — state: hero · layout=`split` · viewport 390

```
┌ state: hero · split · 390 ────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                       │
│░░                            ░░                       │
│░░  {home.hero.image}         ░░                       │
│░░  aspect 4:5 · cover        ░░                       │
│░░                            ░░                       │
│░░                            ░░                       │
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                       │
│────────────────────────────────                       │
│                                                       │
│ Built for the long                                    │
│ way home                                              │
│ 30px/600/-0.03em · --fg                               │
│                                                       │
│ Cushioned trail runners for                           │
│ pavement that turns to dirt                           │
│ 14px/400/1.5 · --muted                                │
│                                                       │
│ ( Shop the drop → )                                   │
│                                                       │
└ split stacks: image first, copy under a hairline rule ┘
```

Behaviour: `split` does not survive as two columns at 390 — it stacks, image first, and the vertical
hairline of frame 2 becomes a horizontal one. Nothing about the copy changes between the two mobile
heroes except the colour layer it sits on, which is the whole point of the two layouts.

---

## 2 · Category tiles — `home.categoryTiles` (3…6 items per the schema)

Column rule, written once and obeyed by every frame below:
`n === 4 → 4 columns · n === 3 | 5 | 6 → 3 columns · viewport < 640 → 2 columns, always`.
A 5-tile profile therefore renders 3 + 2 with the short row left-aligned, never centred and never
stretched — a stretched orphan row is the one thing that makes a grid look broken.

### Frame 5 — state: tiles · n=3 · viewport 1280 · 3 columns

```
┌ state: category tiles · n=3 · viewport 1280 · grid 3 cols · gap 24px ────────┐
│                                                                              │
│  Shop by category                                                            │
│  20px/600/-0.02em · sentence case · --fg · mb 24px                           │
│                                                                              │
│ ┌────────────────────────┐┌────────────────────────┐┌────────────────────────│
│ │░░░░░░░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░░░░░░░░░░│
│ │░░  {tiles[0].image}  ░░││░░  {tiles[1].image}  ░░││░░  {tiles[2].image}  ░░│
│ │░░  aspect 4:5        ░░││░░  aspect 4:5        ░░││░░  aspect 4:5        ░░│
│ │░░  object-fit cover  ░░││░░                    ░░││░░                    ░░│
│ │░░░░░░░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░░░░░░░░░░│
│ │ Trail runners          ││ Road                   ││ Recovery slides        │
│ │ {tiles[0].label} 14/500││ {tiles[1].label}       ││ {tiles[2].label}       │
│ └────────────────────────┘└────────────────────────┘└────────────────────────│
│  href=/categories/{tiles[i].categoryHandle} · whole tile is one <Link>       │
│  card: hairline 1px --border · radius --r-md · overflow hidden · no shadow   │
└ 3 x 397px tracks ────────────────────────────────────────────────────────────┘
```

### Frame 6 — state: tiles · n=4 · viewport 1280 · 4 columns

```
┌ state: category tiles · n=4 · viewport 1280 · grid 4 cols · gap 24px ────────┐
│                                                                              │
│ ┌──────────────────┐┌──────────────────┐┌──────────────────┐┌─────────────── │
│ │░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░ │
│ │░░  aspect 4:5  ░░││░░  aspect 4:5  ░░││░░  aspect 4:5  ░░││░░ aspect 4:5 ░░│
│ │░░              ░░││░░              ░░││░░              ░░││░░            ░░│
│ │░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░ │
│ │ Trail runners    ││ Road             ││ Recovery slides  ││ Apparel        │
│ └──────────────────┘└──────────────────┘└──────────────────┘└─────────────── │
│                                                                              │
│  4 x 292px tracks · the label never wraps to a second line at this width     │
│  because {label} is capped at 30 chars by the schema; a longer one truncates │
│  with text-overflow: ellipsis rather than pushing the card taller            │
└ n=4 is the only count that takes 4 columns ──────────────────────────────────┘
```

### Frame 7 — state: tiles · n=6 · viewport 1280 · 3 columns x 2 rows

```
┌ state: category tiles · n=6 · viewport 1280 · grid 3 cols · 2 rows ──────────┐
│ ┌────────────────────────┐┌────────────────────────┐┌────────────────────────│
│ │░░░░░░ aspect 4:5 ░░░░░░││░░░░░░ aspect 4:5 ░░░░░░││░░░░░░ aspect 4:5 ░░░░░░│
│ │░░░░░░░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░░░░░░░░░░│
│ │ Trail runners          ││ Road                   ││ Recovery slides        │
│ └────────────────────────┘└────────────────────────┘└────────────────────────│
│                          gap-y 24px                                          │
│ ┌────────────────────────┐┌────────────────────────┐┌────────────────────────│
│ │░░░░░░ aspect 4:5 ░░░░░░││░░░░░░ aspect 4:5 ░░░░░░││░░░░░░ aspect 4:5 ░░░░░░│
│ │░░░░░░░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░░░░░░░░░░│
│ │ Apparel                ││ Socks                  ││ Archive                │
│ └────────────────────────┘└────────────────────────┘└────────────────────────│
│                                                                              │
│  rows are equal height: every tile crops to the same aspect, so a portrait   │
│  source and a landscape source in the same profile still line up             │
└ 6 tiles = two full rows, never 4 + 2 ────────────────────────────────────────┘
```

### Frame 8 — state: tile · hover (pointer: fine) · viewport 1280

```
┌ state: category tile · HOVER · viewport 1280 · transition 200ms ease-out ────┐
│                                                                              │
│   rest                              hover                                    │
│ ┌────────────────────────┐        ┌────────────────────────┐                 │
│ │░░░░░░░░░░░░░░░░░░░░░░░░│        │▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚│  image only:    │
│ │░░  scale(1)          ░░│        │▚▚  scale(1.04)       ▚▚│  transform,     │
│ │░░  border --border   ░░│        │▚▚  border --ring     ▚▚│  the card does  │
│ │░░░░░░░░░░░░░░░░░░░░░░░░│        │▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚│  NOT move       │
│ │ Trail runners          │        │ Trail runners  →       │                 │
│ │ --fg · no underline    │        │ --fg · arrow fades in  │                 │
│ └────────────────────────┘        └────────────────────────┘                 │
│                                                                              │
│  hover  = image transform: scale(1.04) inside overflow:hidden                │
│         + border-color --border -> --ring (hairline, still 1px)              │
│         + a 14px arrow glyph fades 0 -> 1 next to the label                  │
│  NOT    = no shadow (canon: dark elevation is borders), no colour change on  │
│           the label, no lift/translate of the card, no second accent         │
│  focus-visible = ring 2px rgba(135,135,135,.5) — same target, keyboard parity│
│  @media (prefers-reduced-motion: reduce) -> transform dropped, border remains│
└ hover is the ONLY interactive state the tile has ────────────────────────────┘
```

### Frame 9 — state: tiles · n=6 · viewport 390 · 2 columns

```
┌ state: category tiles · n=6 · 390 · 2 cols ┐
│                                            │
│ Shop by category                           │
│ 18px/600 · mb 16px                         │
│                                            │
│ ┌─────────────┐┌─────────────┐             │
│ │░░ 4:5     ░░││░░ 4:5     ░░│             │
│ │░░░░░░░░░░░░░││░░░░░░░░░░░░░│             │
│ │ Trail runne…││ Road        │             │
│ └─────────────┘└─────────────┘             │
│ ┌─────────────┐┌─────────────┐             │
│ │░░ 4:5     ░░││░░ 4:5     ░░│             │
│ │░░░░░░░░░░░░░││░░░░░░░░░░░░░│             │
│ │ Recovery sl…││ Apparel     │             │
│ └─────────────┘└─────────────┘             │
│ ┌─────────────┐┌─────────────┐             │
│ │░░ 4:5     ░░││░░ 4:5     ░░│             │
│ │░░░░░░░░░░░░░││░░░░░░░░░░░░░│             │
│ │ Socks       ││ Archive     │             │
│ └─────────────┘└─────────────┘             │
│                                            │
│ 2 x 163px tracks · gap 12px                │
│ label 13px/500 · truncates                 │
│ no hover branch (coarse ptr)               │
└ 2 columns at every count 3..6 ─────────────┘
```

Behaviour the tile frames are obliged to show: the tile is one link, so the image and the label share
a single focus target and a single hover branch; the grid never centres a short row; at 390 the hover
transform is not merely invisible, it is not attached — the pointer is coarse.

---

## 3 · Promo strip — `home.promoStrip`

The strip already exists as `modules/layout/components/promo-banner` and is rendered by
`app/[locale]/(main)/layout.tsx`, i.e. above the nav on **every** page, not only on home.
S1c changes what it says, not where it lives: the text becomes
`home.promoStrip.text`, with a per-locale override, and `home.promoStrip.enabled === false`
removes the strip from the whole site. The home page therefore does **not** render a second copy.

### Frame 10 — state: promo strip · enabled=true · locale=en · viewport 1280

```
┌ state: promo strip · enabled=true · locale=en · 1280 · h 40px ────────────────┐
│                                                                               │
│────────────────────────────────────────────────────────────────────────────── │
│        Free shipping over $120 · 30-day returns                       ✕       │
│        {home.promoStrip.text} · 13px/400 · --muted-on-strip                   │
│        numbers in Geist Mono, tabular-nums (canon: ALL data is mono)          │
│────────────────────────────────────────────────────────────────────────────── │
│                                                                               │
│  bg --secondary · text --fg · hairline --border on the BOTTOM edge only       │
│  ✕ = 26x26 icon button, --r-sm, hover bg --hover; sets _promo_banner_dismissed│
│  the strip is centred in the content-container; ✕ is pinned to the right edge │
│  with an invisible spacer of equal width on the left so the text stays centred│
└ enabled=false -> the component returns null, no empty 40px band ──────────────┘
```

### Frame 11 — state: promo strip · locale=de (override present) · viewport 390

```
┌ state: promo strip · locale=de · 390 · h 48px ┐
│────────────────────────────────               │
│ Kostenloser Versand ab 120 $ ✕                │
│ i18n.de.home.promoStrip.text                  │
│ 12px/400 · wraps to 2 lines                   │
│ before it truncates                           │
│────────────────────────────────               │
│                                               │
│ locale with NO override:                      │
│   -> falls back to the                        │
│      English base text,                       │
│      never to an empty strip                  │
│      and never to the old                     │
│      messages/*.json copy                     │
└ fallback chain: i18n[locale] -> base text ────┘
```

---

## 4 · Product rail — existing `home/components/featured-products`

The rail is not rewritten by S1c; it is placed. Its cards inherit the image treatment through
`layout.imageTreatment` (section 5), which is the only way the profile reaches them.

### Frame 12 — state: product rail · viewport 1280 · 4 across

```
┌ state: product rail · collection row · viewport 1280 · 4 cards ──────────────┐
│                                                                              │
│                          Everyday trainers                     View all →    │
│                          {collection.title} · h3 · centred     --link · 14px │
│                                                                              │
│ ┌──────────────────┐┌──────────────────┐┌──────────────────┐┌─────────────── │
│ │░ ImageFrame    ░░││░ ImageFrame    ░░││░ ImageFrame    ░░││░ ImageFrame  ░░│
│ │░ aspect from   ░░││░ profile.layout░░││░ .imageTreatm. ░░││░ .aspect     ░░│
│ │░ the profile   ░░││░                ░││░                ░││░             ░░│
│ │░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░░░░││░░░░░░░░░░░░░░░ │
│ │ Cascade Trail 2  ││ Ridgeline Low    ││ Slipstream       ││ Halfpipe       │
│ │ 14px/400 · --fg  ││                  ││                  ││                │
│ │ $ 129.00         ││ $ 145.00         ││ $ 98.00          ││ $ 112.00       │
│ │ Geist Mono · tabular-nums · right-aligned within the card is NOT used here:│
│ │ the price sits under the title, left-aligned, because the card is a link   │
│ └──────────────────┘└──────────────────┘└──────────────────┘└─────────────── │
│                                                                              │
│  tool scale starts here: 14px/1.45, no negative tracking, no display weights │
└ grid 4 cols at >=1024, 2 cols below — unchanged from the current storefront ─┘
```

### Frame 13 — state: product rail · viewport 390 · 2 across

```
┌ state: product rail · 390 · 2 cards ┐
│                                     │
│ Everyday trainers                   │
│ 16px/600      View all →            │
│                                     │
│ ┌─────────────┐┌─────────────┐      │
│ │░ ImageFrame ││░ ImageFrame │      │
│ │░ aspect var ││░ aspect var │      │
│ │░░░░░░░░░░░░░││░░░░░░░░░░░░░│      │
│ │ Cascade Tr… ││ Ridgeline   │      │
│ │ $ 129.00    ││ $ 145.00    │      │
│ └─────────────┘└─────────────┘      │
│                                     │
│ the aspect is the SAME value        │
│ as on the desktop rail — the        │
│ treatment is a profile choice,      │
│ not a breakpoint choice             │
└ 2 cols, gap 8px ────────────────────┘
```

---

## 5 · Image treatment — `layout.imageTreatment`

One component, `ImageFrame`, owns the box the picture sits in. It reads four CSS custom properties
that the pre-paint script sets on `<html>` from four `data-*` attributes, and falls back to the value
baked into `profile.generated.json` at build time when the attribute layer is not present.
The attributes exist so the choice is applied **before first paint** and the listing cannot reflow.

| `data-*` attribute on `<html>` | allowed values | CSS custom property | resolved value |
|---|---|---|---|
| `data-image-aspect` | `1-1` · `4-5` · `3-4` | `--image-aspect` | `1/1` · `4/5` · `3/4` |
| `data-image-fit` | `cover` · `contain` | `--image-fit` | `cover` · `contain` |
| `data-image-radius` | `none` · `md` · `lg` | `--image-radius` | `0` · `8px` · `12px` |
| `data-image-hover` | `none` · `second-image` · `zoom` | `--image-hover-scale` | `1` · `1` · `1.04` |

`second-image` and `zoom` differ in mechanism, not only in scale: `zoom` transforms the single image,
`second-image` cross-fades to `images[1]` when the product has one and otherwise behaves as `none`.

### Frame 14 — state: PDP thumbnail · aspect=`1:1` · fit=cover · radius=md

```
┌ state: image frame · aspect=1:1 · data-image-aspect="1-1" · --image-aspect: 1/1 ┐
│                                                                                 │
│   ┌────────────────────────────┐                                                │
│   │░░░░░░░░░░░░░░░░░░░░░░░░░░░░│   w 440px · h 440px                            │
│   │░░                        ░░│   aspect-ratio: var(--image-aspect, 1/1)       │
│   │░░      square crop       ░░│   object-fit: var(--image-fit, cover)          │
│   │░░                        ░░│   border-radius: var(--image-radius, 8px)      │
│   │░░░░░░░░░░░░░░░░░░░░░░░░░░░░│                                                │
│   └────────────────────────────┘   the widest of the three: a rail of four      │
│                                     1:1 cards is 176px shorter than 3:4         │
└ catalogue look — packs the most rows above the fold ────────────────────────────┘
```

### Frame 15 — state: PDP thumbnail · aspect=`4:5` · fit=cover · radius=md

```
┌ state: image frame · aspect=4:5 · data-image-aspect="4-5" · --image-aspect: 4/5 ─────────┐
│                                                                                          │
│   ┌────────────────────────────┐                                                         │
│   │░░░░░░░░░░░░░░░░░░░░░░░░░░░░│   w 440px · h 550px                                     │
│   │░░                        ░░│                                                         │
│   │░░      portrait crop     ░░│   the default for apparel and footwear:                 │
│   │░░      (editorial)       ░░│   a shoe photographed three-quarter fills               │
│   │░░                        ░░│   4:5 without cropping the toe or the heel              │
│   │░░░░░░░░░░░░░░░░░░░░░░░░░░░░│                                                         │
│   │░░░░░░░░░░░░░░░░░░░░░░░░░░░░│                                                         │
│   └────────────────────────────┘                                                         │
└ the middle option — chosen by the sneakers profile unless the style board says otherwise ┘
```

### Frame 16 — state: PDP thumbnail · aspect=`3:4` · fit=contain · radius=lg

```
┌ state: image frame · aspect=3:4 · fit=contain · data-image-radius="lg" ──────────────┐
│                                                                                      │
│   ┌────────────────────────────┐                                                     │
│   │      ░░░░░░░░░░░░░░░       │   w 440px · h 587px                                 │
│   │     ░░              ░░     │   object-fit: contain -> the image is               │
│   │    ░░  tall crop,    ░░    │   letterboxed, so the frame needs its own           │
│   │    ░░  contained     ░░    │   background: --secondary, never white              │
│   │     ░░              ░░     │   hardcoded (canon: tokens only)                    │
│   │      ░░░░░░░░░░░░░░░       │   radius --r-lg = 12px                              │
│   │                            │                                                     │
│   └────────────────────────────┘                                                     │
└ contain + a token background is the only combination where the frame edge is visible ┘
```

---

## 6 · The page assembled

### Frame 17 — state: home · profile=sneakers · hero=full-bleed · tiles n=4 · viewport 1280

```
┌ state: home page assembled · viewport 1280 ──────────────────────────────────┐
│──────────────────────────────────────────────────────────────────────────────│
│  Free shipping over $120 · 30-day returns                             ✕      │
│──────────────────────────────────────────────────────────────────────────────│
│  NORDVELT        Store   Categories   Search              Account   Cart (0) │
│  {brand.wordmark.text} · nav is NOT part of S1c                              │
│──────────────────────────────────────────────────────────────────────────────│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░   Built for the long way home                                            ░░│
│░░   Cushioned trail runners for pavement that turns to dirt                ░░│
│░░   ( Shop the drop → )                                    hero · 560px    ░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│                                                                              │
│  Shop by category                                            py 64px         │
│ ┌──────────────────┐┌──────────────────┐┌──────────────────┐┌─────────────── │
│ │░ Trail runners  ░││░ Road           ░││░ Recovery slides░││░ Apparel     ░ │
│ └──────────────────┘└──────────────────┘└──────────────────┘└─────────────── │
│                                                                              │
│  Everyday trainers                                          View all →       │
│ ┌──────────────────┐┌──────────────────┐┌──────────────────┐┌─────────────── │
│ │░ ImageFrame     ░││░ ImageFrame     ░││░ ImageFrame     ░││░ ImageFrame  ░ │
│ │ Cascade Trail 2  ││ Ridgeline Low    ││ Slipstream       ││ Halfpipe       │
│ │ $ 129.00         ││ $ 145.00         ││ $ 98.00          ││ $ 112.00       │
│ └──────────────────┘└──────────────────┘└──────────────────┘└─────────────── │
│                                                                              │
│  Footer                                                                      │
└ order: strip (layout) · nav (layout) · hero · tiles · rail · footer ─────────┘
```

### Frame 18 — state: home · profile=default (no backend profile directory) · viewport 1280

```
┌ state: home page · profile=default · viewport 1280 · TODAY'S LOOK, UNCHANGED ┐
│──────────────────────────────────────────────────────────────────────────────│
│  Free shipping…  <- the DEFAULT strip text, i.e. the current messages/*.json │
│──────────────────────────────────────────────────────────────────────────────│
│  Upready Store   Store   Categories   Search              Account   Cart (0) │
│──────────────────────────────────────────────────────────────────────────────│
│                                                                              │
│   NO hero        home.hero absent in the default profile -> nothing renders, │
│                  not an empty band and not a placeholder image               │
│                                                                              │
│   NO tiles       home.categoryTiles absent -> the section is not emitted     │
│                                                                              │
│  Everyday trainers                                          View all →       │
│ ┌──────────────────┐┌──────────────────┐┌──────────────────┐┌─────────────── │
│ │░ 9:16 legacy    ░││░ 9:16 legacy    ░││░ 9:16 legacy    ░││░ 9:16 legacy ░ │
│ │ the rail keeps the aspect it has today; the default profile declares NO    │
│ │ imageTreatment, so ImageFrame is bypassed and Thumbnail's own classes win  │
│ └──────────────────┘└──────────────────┘└──────────────────┘└─────────────── │
│                                                                              │
│  Footer                                                                      │
└ acceptance for the default profile: a pixel diff against dev must be empty ──┘
```

---

## Behaviour the mock-up commits the code to

1. Every block is driven by the generated profile and by nothing else — no block reads a hardcoded
   string, and no block reads the backend at request time.
2. Absent section = absent markup. `home.hero`, `home.categoryTiles` and `home.promoStrip` each
   render nothing at all when the profile does not carry them; none of them degrades to a spacer,
   a skeleton or a placeholder.
3. The `default` profile is today's storefront, byte for byte: no hero, no tiles, the strip text
   from `messages/*.json`, the thumbnail aspect the repository ships.
4. The two hero layouts differ in more than a class name: `full-bleed` puts copy on the photograph
   and switches to on-image whites, `split` puts copy on the theme background and uses `--fg`.
5. The tile grid never centres a short row, and the tile is one link with one hover branch.
6. The image treatment reaches the card through `<html>` attributes so it is applied before first
   paint; the baked profile value is a fallback, not the primary path.
7. Numbers everywhere — prices, counters, the cart badge — are Geist Mono with `tabular-nums`.

## Acceptance by eye (rule 27d — machine checks do not close this)

1. At 1280 with `full-bleed`, the headline is legible over the busiest third of the photograph
   without squinting, and the scrim is not visible as a grey rectangle with an edge.
2. Switching `home.hero.layout` from `full-bleed` to `split` and reloading changes the composition,
   not merely the crop: the copy visibly moves onto the page background.
3. A 5-tile profile at 1280 does not look broken: the second row is left-aligned under the first,
   and no tile is wider than its neighbours.
4. Tile hover is noticeable at arm's length and does not read as a layout jump: nothing outside the
   image moves.
5. At 390 the hero CTA is reachable with a thumb without scrolling the hero.
6. Changing `layout.imageTreatment.aspect` from `1:1` to `3:4` changes the shape of every card on the
   listing and the PDP in the same reload — no card keeps the old shape.
7. With `profile=default` the home page is indistinguishable from the current dev storefront.
