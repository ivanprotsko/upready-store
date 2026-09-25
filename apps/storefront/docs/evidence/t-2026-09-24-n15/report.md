# Evidence · t-2026-09-24-n15 · redesign-olavka rounds 2–3: header per device, banner slider (rule 27f)

Shop «Оксана Черкашина» (tenant `cherkashino`), live render of the branch `redesign-olavka` on
http://olavka-com.localhost:8233 (dev server) against the worker's own backend :9251 / database
`upready_store_w15_n15` (a copy of the stand, marketplace secrets truncated). Shots by Playwright/Chromium,
three widths (1440, 768, 390), two themes (`light`, `dark` via the `upready-store.mode` localStorage axis the
storefront's own toggle writes). Built after Ivan's Figma file `2zPDDEfMdYM1tbv5xKfnLX`: MainPage set
233:15256 (desktop 1216 / tablet 720 / mobile 360), Header set 227:9557 (`Scrolled=false` variants), HeroSliders
set 238:17551 (`Device × Items × Swiped`). Breakpoints are the storefront's own: mobile below 640, tablet
640–1023, desktop from 1024 (the file draws 360 / 720 / 1216).

Home order on every width: Header → HeroSliders → «В магазине» (p4) → footer. Cover and Navigation are OFF
(Ivan 2026-09-25); the components stay in the branch, their evidence groups are dropped.

| Group | What it shows |
|---|---|
| `home/` | The whole home page `/ru` with the fixture's two banners (`o27-seed-home-banners`). |
| `header/` | The h7 header element (round 3): desktop = burger disc · flag + «Россия» as plain text · «₽» alone — wordmark — account icon (no fill) · «Корзина» white pill outlined by the node's shadows; 768 and 390 = wordmark left, whole (the size steps down for a long name, never «…»), then flag · «₽» · cart · burger as plain icon buttons, no rings, no dividers (Figma 227:9557 `Scrolled=false`). `Scrolled=true` is not built; the heart is not built (Ivan 3.1). |
| `header-mobile-menu-open/` | The side menu opened from the burger of the compact header; 768 and 390 only. |
| `hero-slider-1/` | The slider with ONE banner saved: one card the whole content width (1168 / 672 / 336 in the file). |
| `hero-slider-2/` | TWO banners (the fixture): a pair 572×400 side by side at 1440 (no scrolling); one card with the next peeking at 768 and 390. |
| `hero-slider-2-swiped/` | The same two banners at 768 and 390 after a swipe: the second card centred, the first peeking left (`Swiped=true`). |
| `hero-slider-3plus/` | THREE banners (the third — «%» / «Коллекция» / «Товары от варикоза» / «Выбрать», the node's own picture 239:17763 — saved on the worker's database only, NOT in the fixture): a scroll-snap carousel on every width; at 1440 the first card is centred (x 322, 572 wide, as in the frame) with the next peeking right at x 918 — the frame shows the SECOND banner centred with the first peeking left; — superseded by the loop below (Ivan's C3 decision); at 768 and 390 the first card sits at the left padding with the next peeking (`Swiped=false`). |
| `hero-slider-3plus-swiped/` | The three-banner carousel at 768 and 390 after a swipe: the second card centred, neighbours peeking on both sides. |
| `store/` | `/ru/store` viewport: the header above the catalog page, proving it is site-wide. |
| `header-scrolled/` | The header in its `Scrolled=true` state (page scrolled 300px): 1440 / 768 / 390 × light / dark. |
| `desktop-scale/` | Ivan's remark 1: the home page at 1440 / 1680 / 1920 / 2200 (light, dark) with the container's edge lines drawn in red — header, banners and catalog on the same lines; 1920 = the 1440 layout × 1.333, 2200 = the same scale centred. |

Every banner card is ONE link (`<Link>` for a product or a site path, `<a target="_blank" rel="noopener
noreferrer">` for an external URL) with the four chips as plain spans inside; the card's own focus ring is the
keyboard focus. Pictures come through `srcset` cut by `scripts/media/make-image-variants.mjs`
(`/static/home-banners/<slug>/<slug>-{480,768,1080,1440,1920}.webp`).

Notes on the dev render: Next's dev overlay (`nextjs-portal`) is hidden in the shots. In `dark` the console
carries one hydration warning on `<html data-mode>` and next/image `qualities` deprecation warnings, both
pre-existing on `dev` (not touched).

48 PNG in the nine 27f groups above (plus 8 in `desktop-scale/`) (1440 / 768 / 390 × light / dark; the swiped and menu groups at 768 / 390 only).

## Round 3 · pixel check against the Figma exports (lead's method)

Ivan's verdict on e640d95b: «результат получается очень плохой, это не уровень модели fable». Round 3 rebuilt
the banner chips and the header after the node values; this section is the check.

**Sources.** Node values: the REST dumps of 238:17551 and 227:9557 taken in round 2 (before the API rate
limit), kept by the lead at
`/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/figma-2026-09-25-round2/w15-cache-nodes2.json`
and `w15-cache-nodes3.json`. Figma pictures: the lead's scale-1 exports in
`/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/lead-pixel-check-w15-r2/`.

**Pairs.** `pixel/<device>-<variant>-{figma,render,overlay}.png`, rendered at the EXACT frame widths
1216 / 720 / 360, dpr 1, light theme; overlay = render at 50% over the export. Variants: `header`, `items1`,
`items2` (tablet/mobile compare against the `Items=2+` frame — two banners are a carousel there), `items2plus`,
`items2plus-swiped` (tablet, mobile; the frame has no desktop swiped state). The overflowing exports carry the
off-frame cards, so they are cropped at the frame origin (desktop 2+ −274, tablet swiped −522, mobile swiped −264).
The data differ from the mockup and show in every pair: the shop's name is «Оксана Черкашина» (the mockup:
«Олавка»), the country is Россия / ₽ (mockup: Тайланд / $), the first banner's date is «10 октября» (mockup
tablet/mobile: «17 августа»), and the picture crop follows `object-fit: cover`.

Mean absolute difference per channel (0–255) of the whole pair:

| Pair | desktop 1216 | tablet 720 | mobile 360 |
|---|---|---|---|
| header | 10.1 | 17.0 | 15.2 |
| items1 | 9.1 | 8.3 | 10.3 |
| items2 | 7.1 | 9.0 | 10.4 |
| items2plus | 49.6 (different card at rest, C3) | 9.0 | 10.4 |
| items2plus-swiped | — | 10.1 | 10.3 |

**Element table.** Measured in the live DOM (`getBoundingClientRect`, relative to the banner card or the
viewport), against the node. x, y, w, h in px; «Δ» = render − node.

| Element | Node | Render | Δ px |
|---|---|---|---|
| Slider block height d / t / m | 496 / 432 / 432 | 496 / 432 / 432 | 0 |
| Card d `Items=2` | 24,48 572×400 | 24,48 572×400 | 0 |
| Card t / m `Items=2+` | 24,16 572×400 / 12,16 288×400 | same | 0 |
| Card `Items=1` d / t / m | 1168 / 672 / 336 wide | 1168 / 672 / 336 | 0 |
| Card `Items=2+` d, current / next | x 322 / 918, 572 wide | 322 / 918, 572 | 0 (the left neighbour: C3, open) |
| Card radius d,t / m | 48 / 24 | 48 / 24 | 0 |
| Frame ring: inset, width, radius d,t / m | 4, 3px #fff, 44 / 20 | 4, 3px #fff, 44 / 20 | 0 |
| Chip surface ring | 4px, padding 7 | 4px border + 3px padding | 0 |
| Date chip d: surface / inner | 40,40 167×64 r18 / 47,47 153×50 r11 | 40,40 166.5×64 r18 / 47,47 152.5×50 r11 | w −0.5 |
| Date text d «10 октября» | 121×20 | 120.5×19.9 | −0.5 / −0.1 |
| «Курс» chip d: surface / text | x 432 (right 40), 100×64 / 54×20 (w475, +1.4 tracking) | x 430.7 (right 40), 101.3×64 / 55.3×19.9 | w +1.3 |
| «Смотреть» chip d: surface / text | 379,296 153×64 / 107×20 | 379.5,296 152.5×64 / 106.5×19.9 | −0.5 |
| Title chip d: surface / inner | 36,212 161×152 r36 / 43,219 147×138 r29 | 36,211.8 160.3×152.2 r36 / 43,218.8 146.3×138.2 r29 | ≤ 0.7 |
| Title text d «ЧИСТКА⏎ПЕЧЕНИ» | 107×90 | 106.3×90.2 | −0.7 / +0.2 |
| Tablet chips offset | 28 (label padding 24 + ring frame 4) | 28 | 0 |
| Tablet «Курс» surface | 446,28 98×64 | 446.5,28 97.5×64 | ±0.5 |
| Tablet title surface | 28,220 161×152 | 28,219.8 160.3×152.2 | ≤ 0.7 |
| Mobile chips | date and title only | date and title only («Курс», «Смотреть» hidden) | — |
| Mobile date: surface / inner | 20,20 127×50 r12 / 113×36 r6 («17 августа») | 20,20 130.2×50 r12 / 116.2×36 r6 («10 октября») | w +3.2 = text length (93 → 96.2) |
| Mobile title: surface / inner / text | 20,257 138×123 r20 / 124×109 r16 / 100×77 | 20,256.7 137.9×123.3 r20 / 123.9×109.3 r16 / 99.9×77.3 | ≤ 0.3 |
| Type, date / button | Roboto Flex 28/90%, «Bold» 532, UPPER | Roboto Flex 28px / 25.2px, 532, wdth 25, UPPER | 0 (wdth fitted) |
| Type, «Курс» (desktop) | 28/90%, 475, +1.4 | 28 / 25.2, 475, +1.4px | 0 |
| Type, title d,t / m | 56/90% 425 / 48/90% 425 | 56/50.4 425 / 48/43.2 425 | 0 |
| Type, mobile date | 20/90% 532 | 20 / 18, 532 | 0 |
| Leading trim | CAP_HEIGHT | `text-box: trim-both cap alphabetic` | 0 in Chromium; Firefox without `text-box` pads the title 19/11 instead |
| Colours: light chip | #ffffff / text #1a1b09 | same | 0 |
| Colours: dark chip | #312721 / text #ffffff (export sampled #332720) | #312721 / #ffffff | 0 |
| Header height d / t / m | 76 / 57 / 53 | 76 / 57 / 53 | 0 |
| Header bottom line | hidden stroke | none | 0 |
| Burger d | 25,18 40×40, white, shadows 0 0 0 1px 8% + 0 1px 2px 12% | 25,17.5 40×40, same shadows | y −0.5 |
| Country d (flag + text, padding 12.5) | x 77, flag x 90, Inter 500 14 | x 77, flag x 89.5, Inter 500 14 (cyrillic) | 0 / −0.5 |
| Currency d | x 184 40×40, «$» Rubik 500 15 | x 175.8 40×40, «₽» Rubik 500 15 | −8.2 = «Россия» is 8.2px shorter than «Тайланд» |
| Account d | 1030,18 40×40, no fill | 1030,17.5 40×40, no fill | y −0.5 |
| «Корзина» d | 1078,18 113×40, white r999, same shadows | 1078,17.5 113×40, same | y −0.5 |
| Wordmark d | Ruslan Display 32, centred | Ruslan Display 28.99, centred | −3.0 size: «Оксана Черкашина» (16 letters) fitted to the column; «Олавка» would render at 32 |
| Tablet: wordmark x / size | 24 / 28 | 24 / 28 | 0 |
| Tablet: flag, ₽, cart, burger | x 549 / 590 / 631 / 672, y 9, 40×40, no fills, dividers opacity 0 | 549 / 590 / 631 / 672, y 9, 40×40, no fills, 1px gaps | 0 |
| Mobile: wordmark x / size | 17 / 28 | 17 / 13.28 | size −14.7: the long name, whole, no «…» |
| Mobile: flag, ₽, cart, burger | x 204 / 241 / 278 / 315, y 8, 36×36 | 204 / 241 / 278 / 315, y 8, 36×36 | 0 |

**Deviations that stay, with the reason.**
- The node marks both chip layers `LUMINOSITY` with a 100px background blur. Figma's own export paints the dark
  chip as plain #312721 (sampled #332720 on both pictures); CSS `mix-blend-mode: luminosity` turns it olive
  (#342a0d / #3e2600), so the chips carry no blend mode. The blur is kept (`backdrop-filter: blur(50px)`); it
  shows only in the 3px gap inside the ring.
- The mobile/tablet group in the node carries a white pill with the same shadows, but the export shows no ring
  (sampled pure #ffffff around the icons); the render follows the export.
- The Roboto Flex width axis is not in the REST dump. `wdth 25` is fitted by width against the node's text
  boxes: «10 ОКТЯБРЯ» 120.5 vs 121, «ПЕЧЕНИ» 106.3 vs 107, mobile «17 АВГУСТА» 92.6 vs 93, «ПЕЧЕНИ» 48px
  99.9 vs 100 (the next step, wdth 35, is 4–11px too wide). «Курс» at weight 475 comes out 1.3px wider.
- The wordmark size depends on the tenant's name length; «Олавка» (the panel's `shop_name_short`) renders at
  the node's 32 / 28.
- Desktop `Items=2+` at rest: the frame shows the second banner centred with the first peeking left; the
  render opens on the first card. Ivan decides (loop or start at the second); `CAROUSEL_REST_INDEX = 1` gives
  the frame's picture in Chromium (checked once: current card x 322, previous peeking left).
- Not in this round, waiting for Ivan: the catalog under the slider (G1: no «В магазине» heading, 4 columns ×
  280) and the mobile bottom tab bar (G2).

## Remark 1 · desktop container and scale (Ivan 2026-09-25)

«нужно сделать, чтобы на десктопе ширина контента тянулась до 1440, а потом масштабировалась пропорционально
до 1920px, затем все центрировалось … баннер должен … выравниваться по красным линиям … в шапке элементы справа
и слева также должны выравниваться по этим линиям.»

- One container for the header, the banners and the catalog: `content-container` (max 1440, 24px sides).
  Desktop banners are fluid in it with the frame's proportions (pair / carousel card = half the content,
  572×400 at 1216, 684×478 at 1440; one banner = the content, 1168×400).
- 1440 → 1920: the whole page is the 1440 layout scaled by `innerWidth / 1440` (CSS `zoom` on `<html>`, set
  before paint by `lib/theme/olavka-zoom.ts`, branch-local, only with the h7 demo); above 1920 the scale stays
  1.333 and the container centres. Viewport units are zoomed too, so `--page-zoom` divides the two desktop
  viewport caps (checkout modal `90dvh`, studio panel) and px `sizes` became `vw` above 1440 (banners, product
  gallery, journal, course page).
- Measured edges (left / right, px), header burger · first banner · «В магазине» vs «Корзина» · last banner ·
  «Все товары», light and dark identical:

| Viewport | zoom | container lines | header | banners | catalog |
|---|---|---|---|---|---|
| 1440 | 1 | 24 / 1416 | 24 / 1416 | 24 / 1416 | 24 / 1416 |
| 1680 | 1.167 | 28 / 1652 | 28 / 1652 | 28 / 1652 | 28 / 1652 |
| 1920 | 1.333 | 32 / 1888 | 32 / 1888 | 32 / 1888 | 32 / 1888 |
| 2200 | 1.333 | 172 / 2028 | 172 / 2028 | 172 / 2028 | 172 / 2028 |

- Checked under zoom at 1920: no horizontal overflow (scrollWidth = viewport), sticky header at top 0 after
  scrolling, side menu / region dialog / cart dropdown open in place, the carousel wheel-scrolls and snaps the
  next card to the centre, the banner picks the 1080w variant for its 912px box (768w at 1440), no page errors.
- 1216 pairs after the change: slider unchanged (7.1), header 4.8; the burger moved from the node's x 25 to 24
  (the node's 1px frame padding dropped so the burger stands on the catalog's line).

## Header `Scrolled=true` (227:9549 / 235:16802 / 238:16965)

Past 12px of scroll `ScrollFlag` sets `data-scrolled="true"` on the sticky header wrapper; the same DOM changes
skin with 200ms transitions (none under `prefers-reduced-motion`). Pairs `pixel/<device>-header-scrolled-*`,
rendered at scrollY 300; the desktop export (1006 wide) is laid out on 1216 by its three columns
(leading +0, main +105, trailing +210), as the layout does. Mean |Δ|: desktop 3.7, tablet 4.9, mobile 10.0.

| Element | Node | Render | Δ px |
|---|---|---|---|
| Desktop country + currency pill | 77,18 147×40 r32, white, shadows, divider 1×12 #e4e4e7 | 76,18 139×40 r32, same | x −1 (burger line 24), w −8 = «Россия» vs «Тайланд» |
| Desktop wordmark pill | 136×40 #f5f5f5 r32, Ruslan 24 | 135×40 rgb(245,245,245) r32, 24px | w −1 |
| Desktop account | white 40 disc, shadows | 1031,18 40×40 white, shadows | 0 |
| Tablet wordmark pill | 8,8 136×40, 24px | 8,9 135×40, 24px | y +1: the bar keeps 57 (node 56) so the height does not jump while scrolling |
| Tablet icon pill | 549,8 163×40 r32, dividers | 549,9 163×40 | y +1 (same reason) |
| Mobile wordmark pill | 9,8 120×37, 24px | 9,8 119×37, 24px | w −1 |
| Mobile icon pill | 204,8 147×36 r999, dividers | 204,8 147×36 | 0 |
| Bar height d / t / m | 76 / 56 / 53 | 76 / 57 / 53 | tablet +1 (no jump) |

## Loop for 3+ banners (Ivan 2026-09-25, C3: «слева в ленте 3+ пусть будет последний баннер, зациклить»)

The server renders the set three times (clone · real · clone; clones `inert` + `aria-hidden`), the
`OlavkaLoopTrack` island centres the first real card at rest and, when a scroll settles on a clone, jumps by
exactly one set to the identical real card (layout px via `offsetLeft`, so the page zoom does not skew it).
Scroll-snap, wheel and swipe stay native. `CAROUSEL_REST_INDEX` is removed.

| State | Frame | Render (card lefts, px) | Note |
|---|---|---|---|
| Desktop rest 1216 | 239:17719: −274 / 322 / 918 | −274 (last) / 322 (first) / 918 (second) | geometry 0; mean |Δ| 43.1 because the frame's centre card is «Лимфа», ours is the first banner |
| Tablet rest 720 | 238:17548 draws the first card at x 24, no left neighbour | −522 (last) / 74 (first) / 670 (second) | deviation by Ivan's rule (loop on all devices); matches the tablet `Swiped=true` geometry (74) |
| Mobile rest 360 | 233:15251: card centred, peeks 24, gap 12 | −264 / 36 / 336 | 0 |
| Swiped (next) t / m | 239:17830 / 239:18368 | 74 / 36 | mean |Δ| 10.1 / 10.3 |
| Swiped back from the first d / t / m | — | settles on the real LAST card at 322 / 74 / 36, the one before it peeking left | `pixel/<device>-items2plus-back-render.png` |

Checks: Tab walks the three real links only; no hydration warnings or page errors in the console.

## Product cards without the grey underlay (Ivan 2026-09-25)

«убрать полупрозачную пленку … карточки товаров … выглядят так, как будто они лежат на светлосером фоне».
Cause, in `ProductMedia` (every grid card, home «В магазине» and `/store`): a 3% black veil over the picture
(`bg-black/[0.03]`, white photo → #f7f7f7) and the tile colour `bg-ui-bg-subtle` under it (a card without a
photo → #e6edea). Both removed; cards are transparent, the photo lies on the page. The product page's own
gallery (`flat`) is unchanged. `product-card-bg/<page>-<width>-<theme>-{before,after}.png`.

| Page · width · theme | tile before | tile after | page | hover after |
|---|---|---|---|---|
| home 1216 / 360 light | #f7f7f7 | #ffffff | #ffffff | #ffffff |
| store 1216 / 360 light | #e6edea | #ffffff | #ffffff | #ffffff |
| store 1216 / 360 dark | #212c28 | #0a1310 | #0a1310 | #0a1310 |
| home 1216 / 360 dark | #ffffff | #ffffff | #0a1310 | #ffffff — the first product's photo has its own white background (in the file, not a veil) |

## Remark 7 · header: no white bar, the wordmark on the controls' centre (Ivan 2026-09-25)

«1.1. Нужно убрать белый фон 1.2. надпись ОЛАВКА нужно выровнять по вертикальному центру относительно других
элементов в хедере» — desktop, tablet, mobile, both states.

**1.1** The bar's fill was removed per remark 1.1; in the nodes the frame had a white fill (227:9200, 227:9549,
235:16409, 235:16802, 235:16816, 238:16965 — SOLID #ffffff, the component's backdrop). `.bar` and the sticky
wrapper `#nav-h7` are `rgba(0,0,0,0)` in both states and both themes; the burger disc, the pills, the icon pill
and the wordmark pill keep their fills and shadows. Scrolled, the page shows between the pills.

**1.2** Cause: the wordmark is an `inline-flex` link, and `text-box` does not apply to a flex container, so the
link's line kept Ruslan Display's ascent 0.688 / descent 0.397 (cap height 0.5, read from the font in the
browser) — the caps' centre stood (0.688 − 0.397 − 0.5) / 2 = 0.1045em above the box's centre: 3.3px at 32px.
Fix: the text sits in a block of its own (`.wordmarkText`) trimmed to the cap height (`text-box: trim-both cap
alphabetic`, line-height 1) and centred by the 40px box; where trimming is not supported, a 0.209em top padding
(the same metrics) moves the caps' centre onto the box's. An uploaded logo image is not touched (`:has(img)`).

Measured on glyph pixels at dpr 4 (quarter-pixel), caps centre − controls centre (burger disc on desktop, the
icon row on tablet / mobile; scrolled, also the wordmark pill's centre — the same number):

| Width · state | Node: caps centre / controls centre | Render light: caps / controls, Δ | Render dark, Δ | No-`text-box` path, Δ |
|---|---|---|---|---|
| 1216 top | 37.5 / 38 | 38 / 38, **0** | −0.12 | −1 (baseline snapped to a whole pixel) |
| 1216 scrolled | 37.5 / 38 | 37.88 / 38, **−0.12** | −0.12 | −0.12 |
| 720 top | 28.5 / 29 | 28.88 / 29, **−0.12** | 0 | −0.12 |
| 720 scrolled | 28 / 28 (bar 56) | 28.88 / 29, **−0.12** (bar 57) | −0.12 | −0.12 |
| 360 top | 26 / 26 | 25.63 / 26, **−0.37** | −0.37 | −0.37 |
| 360 scrolled | 26 / 26 | 25.63 / 26, **−0.37** | −0.37 | −0.37 |
| before the fix, 1216 top (Ivan's #24) | | ≈ −3.3 by the metrics | | |

The node itself sets the caps 0.5px above the controls' centre on desktop and tablet (37.5 vs 38); the render
follows Ivan's rule (centres equal), so against the node it is +0.5 there. The no-`text-box` column is Chromium
with `text-box` switched off and the padding on, standing in for browsers without cap trimming.

Pairs (`pixel/`): `<device>-header-{figma,render,overlay}` (top, mean |Δ| 2.5 / 2.3 / 3.9, before 4.8 / 5.3 / 11.8),
`<device>-header-scrolled-*` (scrollY 300: the banners show through the bar where the frame is white, mean |Δ|
106.1 / 89.6 / 70.4 — the backdrop, not the controls), `<device>-header-scrolled-onwhite-*` (the scrolled skin
over the white page top, mean |Δ| 2.6 / 3.6 / 4.1, before 3.7 / 4.9 / 10.0). Rule 27f: `header/`,
`header-scrolled/` at 1440 / 768 / 390 light + dark, re-shot.

## Remark 10 · logo pill v3 (Ivan 2026-09-25, Header 227:9557 modified 06:51 WITA)

Values: Ivan's words verbatim + `/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/figma-2026-09-25-header-v3/logo-pill-v3-spec.md`
(read by `GET /v1/files?ids=`; `/nodes` and `/images` are 429, so the Figma PNG exports in `pixel/` are still the
round-2 frames — the pill there is the old #f5f5f5 one). Ivan's explicit numbers win over the node (ring .75,
blur 10px in both states), the shadows come from the node. The pill exists in both states on all devices; the
old #f5f5f5 fill is gone; transitions 200ms like the other scrolled properties; the bar geometry is unchanged
(the node's desktop scrolled 56 / 12 is waiting for Ivan).

| Property | Node / Ivan | Render (computed, light) | Δ |
|---|---|---|---|
| Rest fill · ring · blur | rgba(240,240,240,0) · 0.5px rgba(255,255,255,0) · blur(10px) | same | 0 |
| Scrolled fill · ring · blur | rgba(240,240,240,.8) · 0.5px rgba(255,255,255,.75) · blur(10px) | same (Chromium reports the 0.5px width as 1px; the layout uses 0.5) | 0 |
| Scrolled pill shadow | 0 0 0 1px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.12) | same | 0 |
| Scrolled text shadow | 3 × 0 0 1px #fff, 0 0 5px rgba(255,255,255,.5), 4 × 0 0 15px #fff | same, 8 layers | 0 |
| Rest text | #1a1b09, no effects | rgb(26,27,9), none | 0 |
| Pill d / t / m rest | 172×40 / 155×40 / 139×37 (padding 16 / 16 / 8, stroke 1 in layout) | 171.6×40 / 154.4×40 / 138.4×37 | −0.5: Ivan's 0.5px ring vs the node's 1px |
| Pill d / t / m scrolled | 137×40 / 137×40 / 129×37 (padding 16 / 16 / 12) | 137.2×40 / 137.2×40 / 129.2×37 | +0.2 |

Dark (no values from Ivan): fill `color-mix(var(--muted) 80%)` = rgb(24,36,32) at 0.8, ring rgba(255,255,255,.16)
(the bar's dark ring), pill shadow ring rgba(255,255,255,.16) + 0 1px 2px rgba(0,0,0,.12), text glow in the page
colour `var(--background)` #0a1310 (a white glow around the light wordmark would wash it out).

Remark 7 holds — caps centre − controls centre, glyph pixels at dpr 4:

| Width | rest light / dark | scrolled light / dark |
|---|---|---|
| 1216 | 0 / −0.12 | −0.12 / −0.12 |
| 720 | −0.12 / 0 | −0.12 / −0.12 |
| 360 | −0.37 / −0.37 | −0.12 / −0.12 |

Pairs against the round-2 exports (mean |Δ|): top 2.5 / 2.9 / 5.0; scrolled on white 2.9 / 4.2 / 12.4 (mobile:
the new pill is 129 wide with padding 12, the export's is 120); scrolled over the banners 106.7 / 91.0 / 76.5.
Close-ups `logo-pill-v3/1216-scrolled-{light,dark}-x3.png`; 27f `header/`, `header-scrolled/` re-shot.

## Remark 11 · desktop scrolled bar 56, sides 12 (Ivan 2026-09-25)

«да вывысоту нужно уменьшить при скролле на десктопе» + «там отступы тоже становятся меньше». Frame 227:9549 as of
06:51 (`files-ids-header-v3.json`): 1006×56, columns padding 12, controls at y 8. Desktop only; at rest 76 / 24
(remark 1's lines) stay; tablet 57 and mobile 53 unchanged. 200ms transitions (none under reduced motion).

No jump: the 20px the bar gives up become the sticky wrapper's `margin-bottom` (height and margin animate on the
same curve), so the content always starts 76px down; a margin is not hit-tested, so a click in that strip reaches
the page. Measured (`scratchpad/r11.log`, `r11t.log`):

| scrollY 0 → 11 → 13 → 300 → 13 → 11 → 0 | state | bar | wrapper margin | content top (document) | click 10px under the bar |
|---|---|---|---|---|---|
| 1216 and 1440 | false / false / true / true / true / false / false | 76 / 76 / 56 / 56 / 56 / 76 / 76 | 0 / 0 / 20 / 20 / 20 / 0 / 0 | 76 at every step | the slider (section / ul / img), never the header |
| 720 · 360 | as before | 57 · 53 constant | 0 | 57 · 53 | the slider |
| mid-transition, every 3rd frame | | 76 → 68.4 → 62.3 → 57.9 → 56 | 0 → 7.6 → 13.7 → 18.1 → 20 | 76 ± 0.02 | |

1216 scrolled against the frame (the export is still round 2, 76 high, so the pixel pair
`pixel/desktop-header-scrolled-onwhite-*` shows mean |Δ| 10.7 — structure below is the check):

| Element | Frame 227:9549 (x, y, w×h; right = from the right edge) | Render 1216 | Δ |
|---|---|---|---|
| Bar height | 56 | 56 | 0 |
| Burger | 12, 8, 40×40 | 12, 8, 40×40 | 0 |
| Country + currency pill | 64, 8, 147×40 | 64, 8, 138.8×40 | w −8: «Россия» vs «Тайланд» |
| Logo pill | centred, 8, 137×40; text y 22, 104×12 | centre 608 = bar centre, 8, 137.2×40; text y 22, 103.2×12 | 0 / +0.2 |
| Account | right 133, 8, 40×40 | right 133, 8, 40×40 | 0 |
| Cart | right 12, 8, 113×40 | right 12, 8, 113×40 | 0 |

Remark 7 holds: caps centre − controls centre at 1216 rest 0 / −0.12 (light / dark), scrolled −0.12 / −0.12
(controls centre 28 in the 56 bar); 720 and 360 unchanged (0 … −0.37). Pill v3 computed unchanged.
27f `header-scrolled/` re-shot.

## Remark 12 · banner font, clipped «С» in Chrome, Firefox rings (Ivan 2026-09-25)

Ivan's words and the lead's findings: `/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/ivan-remarks-2026-09-25/remark-12-slider-banner-font-clip-firefox.md`.
Crops `banner-font-clip/<chromium|firefox>-<1440|390>-<title|kicker>-<before|after>.png` (Playwright, dpr 2; before =
production :8233 at 4339f102, after = this commit), `chromium-1440-title-c-top-before-after-zoom.png`,
`firefox-real-156-1440-after.png` (Firefox.app 156, GUI, dpr 2, driven over WebDriver BiDi, window captured).

**1 · Font.** `.text` read `font-family: var(--font-olavka-flex), var(--font-body), sans-serif`. `pnpm build` runs the
`build-profile.mjs` prebuild, which on this stand writes the «default» profile with no font pair, so `--font-body` is
undefined, the whole declaration is invalid at computed-value time and the text inherited Inter; Roboto Flex was never
requested. Now `var(--font-olavka-flex, "Roboto Flex"), sans-serif` — no other variable in the stack.

| Browser | computed family before → after | Roboto Flex files in `document.fonts` after |
|---|---|---|
| Chromium (Playwright) | Inter → "Roboto Flex", "Roboto Flex Fallback", sans-serif | 2 loaded (the cyrillic + latin subsets in use) |
| Firefox 153 (Playwright) | Inter → same | 2 loaded |
| Firefox.app 156 (real) | Inter (unloaded) → same | 2 loaded |

Axes: the REST dump has family Roboto Flex, `RobotoFlex-Bold` / `RobotoFlex-Thin` named styles, weights 425 / 532 / 475,
sizes and 90 % line height, but no variable axes. `"wdth" 25` stays a fit by width (подбор, не из Figma) until Ivan
sends the Width / Optical size / Grade values from Figma (asked by the lead).

**2 · «С» clipped in Chrome.** The text box is trimmed to the cap height (`text-box: trim-both cap alphabetic`, the
node's `leadingTrim: CAP_HEIGHT`) and it clipped its own overflow (kept for the ellipsis), so the overshoot of round
letters was cut flat. The clip now has 0.25em of room above and below (`padding-block: 0.25em`, given back by
`margin-block: -0.25em`), enough for overshoots, «Й»/«Ё» marks and «Д»/«Щ» tails; the ellipsis still works (checked
with a long «ЁЖИК Й …» date in both browsers). Layout unchanged: inner heights 138.2 / 50 (1440), 109.3 / 36 (390) in
both browsers.

**2.1 · Firefox looked different.** Firefox has no `text-box`; the old fallback only shifted the title's padding. Now one
fallback for every chip from Roboto Flex's metrics (ascent 0.928, descent 0.244, cap 0.711, line-height 0.9 → the line
box reaches 0.081em above the caps and 0.108em below the baseline, taken back by margins), so the text box is the cap
height in Firefox too. Glyph ink from the fill edge (css px, top / bottom), node 24 / 24 (desktop title) and 16 (mobile):

| Chip · width | Chromium after | Firefox after | Firefox before |
|---|---|---|---|
| title 1440 | 23.5 / 24.0 | 23.5 / 24.0 | 23.5 / 23.0 (Inter) |
| date 1440 | 14.5 / 15.0 | 14.5 / 15.0 | 14.5 / 14.5 (Inter) |
| title 390 | 15.5 / 15.5 | 16.0 / 15.0 | 14.5 / 14.0 (Inter) |
| date 390 | 10.5 / 11.0 | 11.0 / 10.5 | 10.5 / 10.5 (Inter) |

**3 · Firefox ring colours — not reproduced.** Firefox.app 156 (GPU, dpr 2) at 1440 at rest, hovering the left and the
centre card, at 1640 (page zoom 1.139) and after a swipe back: every dark ring is #312721 by pixels (4 css px), the gap
shows the blurred picture, the fill #312721; computed `border-color` rgb(49,39,33) in Playwright Firefox 153 too. In
Ivan's screenshot only the two dark chips of the LEFT banner (varicose: «Коллекция», the title) have a #ffffff ring; the
liver title on the right banner is #312721 — the classes are fixed per chip in the code (`dark` for label and title), so
this is not the cascade. Details asked from Ivan by the lead (Firefox version, window width / zoom, pointer position,
extensions, whether it survives a reload). No change made.

**Strokes 75 %.** In 238:17551 the 75 % white surfaces (and 75 % white fills) belong only to the two all-white banners
not on the storefront (pictures 3ad1c160 «всё чистки для Почек», b639e905 «Профилактика и лечение варикоза»). The
three banners in use (liver, lymph, «Товары от варикоза») have 100 %: dark #312721 title and label, white #ffffff date
and button — as the code draws them. No change.

Seen, not changed: a date chip longer than the space left of the label runs under it (its max-width ignores the label);
pre-existing, only with an extreme text.

## Remark 13 · footer: «© Черкашино» column, product-grid columns, no lines (Ivan 2026-09-25)

Ivan's words and the addition («нужно убрать все горизонтальные линии»):
`/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/ivan-remarks-2026-09-25/remark-13-header-name-footer-columns.md`.
Item 1 (header «ЧЕРКАШИНО») is data, done by the lead in the stand's DB. Items 2.x — code, Olavka only:
`footer/variants/olavka.tsx` (`FooterOlavka`), chosen by the footer switch for the tenant handles `olavka` (production
copy) and `cherkashino` (older stand data), the same per-handle stopgap as `f7-tenant-config.ts`; every other shop keeps
the footer its settings pick.

- Columns: Категории → Информация → «© {tenant name}» (from `tenant.name`, «Черкашино» here) with «Публичная оферта»,
  «Политика конфиденциальности» (the shop's published legal pages, as the legal row links them) and «Создание
  интернет-магазина» (the attribution link: same href, `rel`, and the shop's own anchor text, capitalised).
- Removed: «© 2026 … Все права защищены.» and «создание интернет-магазина — upready» (the row under the columns).
- Grid: the product grid's own class (`PRODUCT_GRID_CLASS`) inside the same `content-container`, so the columns sit on the
  product tracks; the 4th track stays empty (the seller's requisites take it if the shop ever fills them).
- Lines: the footer's top border and the legal row's top border are gone for Olavka (`FooterLegal bare`); other shops
  keep both.

| Page · width | product columns x | footer headings x before | after | horizontal lines under the grid before → after |
|---|---|---|---|---|
| olavka 1440 | 24 / 378 / 732 / 1086 | name 24, Категории 467.4, Информация 961.7 | Категории 24, Информация 378, © Черкашино 732, 4th empty | 3 → 0 |
| olavka 390 | 16 / 201 | 16 / 16 / 16 (stacked) | 16 / 201, © Черкашино 16 on the next row | 3 → 0 |
| nochlavka 1440 / 390 (another shop) | — | «Ночная лавка» 24 / 16, © line, attribution | unchanged | 2 → 2 |

Shots `footer-columns/<olavka|nochlavka>-<1440|390>-<before|after>.png` (header and bottom bar hidden for the shot).

Open for Ivan: «Публичная оферта» and «Политика конфиденциальности» now show three times — in «Информация» (they are
the owner's published pages), in «© Черкашино» (asked), and in the legal row under the footer (every shop has it, audit
B-01). Removing the legal row for Olavka, or those two pages from «Информация», is one line each; not done without his
word.

## Remark 14 · banners run to the window edges; Firefox rings (Ivan 2026-09-25)

«баннеры в слайдере не должны обрезаться» + Ivan's Firefox 100 % / Chrome 75 % shots:
`/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/ivan-remarks-2026-09-25/remark-14-slider-clipped-firefox-rings-repro.md`.

**14.1.1 · Clipping.** Ivan's window is wider than 1920 css px (his shot: the content is 86 % of the window, so the page zoom
sits at its 1.333 cap and the page is centred). `.slider` had `max-width: 1440px`, so above 1920 the carousel's
neighbours stopped at that box, short of the window. Now `.slider` is the whole window; the card width and the
carousel's centring padding use `--content: min(100cqi, 1440px)` (the content container's width), so the centred card
does not move; one or two banners (`.single`, `.pair`, which never scroll) keep a 1440 row. Frame 239:17719 cuts the
neighbours only at its own edge. Chromium, `slider-edges/<width>-<before|after>.png`:

| Width | zoom | track before → after | centred card | leftmost card left (off-window = runs to the edge) |
|---|---|---|---|---|
| 1216 / 1440 / 1680 / 1920 | 1 … 1.333 | whole window → same | unchanged | −274 / −330 / −385 / −440, unchanged |
| 2240 | 1.333 | 160 … 2080 → 0 … 2240 | 664 … 1576, unchanged | −280 (was cut at 160) |
| 2560 | 1.333 | 320 … 2240 → 0 … 2560 | 824 … 1736, unchanged | −120 (was cut at 320) |
| 720 / 360 | 1 | whole window → same | 74 / 36, unchanged | unchanged |
| pair (class swapped in the page) 1440 / 2240 | | 0 … 1440 / 160 … 2080, unchanged | cards 24 … 1416 / 192 … 2048, unchanged | — |

Real Firefox 156 at 2240, dpr 1 (the scratch profile forces `layout.css.devPixelsPerPx` 1): `firefox-real-156-2240-dpr1-
<before|after>.png` — before, cut at the 1440×1.333 box as in Ivan's shot; after, to the window edges.

**14.1 · Firefox rings — still not reproduced here.** Real Firefox 156 (GUI, the window captured) at 1440, 1920, 2000,
2240, 2560 with dpr 2 and at 2240 with dpr 1 (Ivan's layout exactly): the dark chips of the side cards («Коллекция»,
«Чистка лимфы») have the #312721 ring (`firefox-real-156-2240-dpr1-{kollekciya,limfy}-ring.png`), computed
`border-color` rgb(49,39,33) everywhere. In Ivan's Firefox the same chips are white-ringed while the centred card's are
dark. No change to the rings until it is reproduced; one console line from Ivan's Firefox tells a cascade problem from a
paint one (in the report to the lead).
