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

## Remark 15 · footer: first column empty, content one column right (Ivan 2026-09-25)

«в футере давай первую колонку оставим пустой, т.е. чтобы все колонки с контентом футера сместились на 1 колонку вправо»:
`/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/ivan-remarks-2026-09-25/remark-15-footer-shift-right.md`.

`FooterOlavka` (`src/modules/layout/templates/footer/variants/olavka.tsx`) adds `large:[&>*:nth-child(3n+1)]:col-start-2`
to its grid: from 1440 (four product columns) every footer row starts at column 2. Below 1440 (three columns at
1024–1439, two on a tablet and a phone) the footer starts at column 1 as before. With an empty column, three columns would
push «© Черкашино» onto a second row, and two columns would squeeze the text. A fourth cell (the seller's requisites; Olavka
has none) opens the next row at column 2 under Категории. Checked with a probe cell appended in the page: x 378, next row
(`footer-shift/req15.mjs`). Other shops keep their footer.

Heading x (Chromium, header and bottom bar hidden for the shot, `footer-shift/foot15.mjs`):

| Shop, width | product columns | before | after |
|---|---|---|---|
| olavka 1440 | 24 / 378 / 732 / 1086 | Категории 24, Информация 378, © Черкашино 732, col 4 empty | col 1 empty, Категории 378, Информация 732, © Черкашино 1086 |
| olavka 1920 (zoom 1.333) | 32 / 504 / 976 / 1448 | — | Категории 504, Информация 976, © Черкашино 1448 |
| olavka 1280 (3 columns) | 24 / 442.7 / 861.3 | 24 / 442.7 / 861.3 | unchanged |
| olavka 390 (2 columns) | 16 / 201 | 16 / 201, © Черкашино 16 on the next row | unchanged |
| nochlavka 1440 / 390 | — | F1 footer | unchanged |

Shots: `footer-shift/<olavka|nochlavka>-<width>-<before|after>.png` (before from :8233 at e4346db9, after from dev :8234).
The 390 pair is identical because the phone layout is unchanged. The pair is there for Ivan to decide whether the phone
should get the empty column too. With two columns that leaves a single content column of about 170 px.

Not moved: the legal row under the columns («Публичная оферта · Политика конфиденциальности», x 24). It is a row, not a
column, and it is part of the duplicates question still open with Ivan (remark 13).

## Remark 16 · Firefox ring colours after a scroll; empty slot on the left after a reload (Ivan 2026-09-25)

Ivan's words and the lead's reading, with the addition («если снять стиль "display: flex" с контейнера у которого рамка,
баг исчезает. Там кстати также не нужен стиль с backdrop-blur»):
`/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/ivan-remarks-2026-09-25/remark-16-firefox-rings-repaint-left-gap.md`.

**16.2 · Empty slot on the left: the cause and the fix.** The server rendered clone · real · clone with the track at
scroll 0. That centres the FIRST LEADING CLONE on the start padding, with nothing to its left. Only the `OlavkaLoopTrack`
island, after hydration, scrolled the track to the rest position (first real card centred, the last clone peeking left).
So until hydration, the first paint had an empty slot left of the centred card. A slow hydration (a dev build, a busy tab)
kept it on screen. Fix:
- CSS draws the rest position before the island runs (`.carousel:not([data-loop-ready])`). The leading clones are
  `display: none` except the last one (`data-peek`), which gets `margin-inline-start: -(card + gap)`. The start padding
  is `50cqi − card/2`, which centres the first real card at scroll 0.
- The island sets `data-loop-ready`, which brings the clones back, and in the same layout effect scrolls to the card
  that is centred at that moment. That is the first real card, or the one a visitor swiped to before hydration. There is
  no frame in between, so there is no jump.
- One source for the card width and the gap: `--item` / `--gap` on the track, also used by `.carousel > .item`.

Visible cards: server markup (JS off = the first paint; above 1440 the inline zoom is added by hand, since with JS on it
runs before the first paint) and after hydration. Same numbers in Chromium and in Firefox (Playwright):

| Width | first paint before | first paint after | after hydration (before = after) |
|---|---|---|---|
| 1440 | clone «Чистка печени» 378…1062, **nothing left** | «Товары от варикоза» −330…354, «Чистка печени» 378…1062, «Чистка лимфы» 1086…1770 | the same three at the same x |
| 2240 (zoom 1.333) | 664…1576, **nothing left** | −280…632, 664…1576, 1608…2520 | the same |
| 720 | 24…596 (not centred) | −522…50, 74…646, 670…1242 | the same |
| 360 | 12…300 (not centred) | −264…24, 36…324, 336…624 | the same |

Shots `slider-first-paint/<chromium|firefox>-<width>-nojs-<before|after>.jpg`, `chromium-<width>-js-after.jpg`. Logs
`slider-first-paint/chip-*.log`, script `chip16.mjs`. No hydration warning or page error in either engine at 1440 and 360
(`cons16.mjs`; the only console lines are the product images' existing `quality` warnings).

**16.1 · Rings: Ivan's fix.** `.chip` is now `display: block` with no `backdrop-filter` / `-webkit-backdrop-filter`. The
Figma background blur is dropped on Ivan's word. In both engines the block lays `inner` out exactly as the flex row did.
Every chip's border box, `inner` box and text box is identical to 0.01 px before and after: 46 chips at 1440, 2240, 720
and 360, in Chromium and in Firefox (`chip-before-*.log` against `chip-after-*.log`). The only pixels that change in Chromium
are the 3 px band between the ring and the fill, which now shows the picture sharp instead of blurred
(`chip-ring/chromium-<1440|720|360>-diff-before-after.png`, red = changed). The text, the fill and the ring are the same.

**Real Firefox 156 with GPU: the white rings did not reproduce here.** Scratch profile, window captured with
`screencapture -l`. Each run: reload, then 12 wheel swipes both ways, including the loop jumps. After every swipe the ring
pixels of every dark chip are sampled (`chip-ring/r16w.mjs`, logs `real-*.log`):
- 1440 window, dpr 1: every dark ring #312721, before the fix.
- 2240 window (Ivan's >1920 case), dpr 1: #312721 at every step, before and after the fix
  (`chip-ring/firefox-real-156-2240-swipes-before-after.jpg`).
- 1728 window (the built-in display's full width), dpr 2: #312721 on the first swipes before and after. Then the window
  lost focus and the rest of that run is void (`out`).

A background Firefox window is not repainted on macOS, so these runs need the scratch window in front. That takes focus
from the desktop: one stray «y» landed in the scratch window's address bar. So I stopped after these runs. The proof that
the white rings are gone has to come from Ivan's own Firefox on :8233: reload, then swipe both ways.

## Remark 17 · product card: 1rem, price above the title, no 2-line reserve, no meta line (Ivan 2026-09-25)

«По дизайну карточек товаров 1. нужно сделать размер текста 1rem, 2. цены поставить НАД заголовком товара, 3. НЕ
резервировать высоту в две строки для заголовка. 4. граммы, количество и другие отметки уменьшенным размером текста и менее
контрастным цветом — убираем совсем. Остается только заголовок и цена.»:
`/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/ivan-remarks-2026-09-25/remark-17-product-card-text.md`.

Two components draw a product card:
- `ProductCard` (`src/modules/products/components/product-card/index.tsx`): home «В магазине», /store, category pages. It
  has its own Olavka branch, chosen on the server with `isOlavkaShop()`. Order: image → price → title. Both are
  `text-base` (1rem, 24px line). The title keeps `line-clamp-2` as a cap but has no `min-h`. There is no unit line and no
  colour swatches. A card with no price shows only the title.
- `ProductRowTile` (`product-row/tile.tsx`): the product page's rows («С этим товаром покупают», «Вы недавно
  просматривали»). It already had price → title and no meta line; now it is 1rem too. The «recently viewed» row renders
  on the client, so the tile learns the shop from `data-shop="olavka"`, which `(main)/layout.tsx` puts on the page
  wrapper.

The shop list is now one place, `OLAVKA_SHOP_HANDLES` / `isOlavkaShop()` in `src/lib/data/olavka-shop.ts`, and the remark
13 footer reads it too. Its old `OLAVKA_FOOTER_HANDLES` is gone and the list is the same.

Measured on the first four cards per page, identical in headless Chromium and Firefox:

| Page (1440 / 390) | title before → after | price before → after | order after | meta line before → after | title min-height before → after |
|---|---|---|---|---|---|
| home «В магазине» | 14/20 px, 500 → 16/24, 500 | 16 px, 600 → 16 px, 600 | price above | «10 шт», «2 банки», «100 шт» → none | 40px → auto |
| /store | 14/20 → 16/24 | 16 → 16 | price above | «30 гр», «100 мл», «1 шт» → none | 40px → auto |
| category (Мультиварки) | 14/20 → 16/24 | 16 → 16 | price above | «2 л» → none | 40px → auto |
| product page row | 14/20, 400 → 16/24, 400 | 14 px → 16 px | price above (as before) | none → none | auto → auto |

A title now takes 1 or 2 lines as it needs: 1440 home 1/2, /store 2/1. The card box still stretches to its grid row, but
nothing inside reserves space.

Another shop is unchanged: **acme** (acme.localhost) home, /store, a category and a product page, at 1440 and 390. The
card metrics are identical before and after, and the screenshots are identical pixel for pixel (0 differing channels in
all 8 pairs).

Shots `product-card-text/<chromium|firefox>-<olavka|acme>-<1440|390>-<home|store|category|product>-<before|after>.jpg`
(acme in Chromium only). Logs `r17-*.log`, script `card17.mjs`. Before = :8233 at b825bfdb, after = dev :8234.
The /store sidebar filter «Количество» (10 шт, 100 шт …) is a filter, not a card mark, and stays.

## Remark 18 · the search overlay opens without a focus ring on its field (Ivan 2026-09-25)

«нужно сделать так, чтобы когда поиск появлялся, то не появлялось фокусной состояние у строки поиска»:
`/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/ivan-remarks-2026-09-25/remark-18-search-no-focus-ring.md`.

**The overlay is shared by all shops.** `src/modules/layout/components/search/index.tsx` is used by the Olavka navigation
row, the bottom bar and headers h1–h6. Its field has `focus-visible:ring-2 ring-[var(--ring)]`, and a text field matches
`:focus-visible` whenever it has focus, so the ring showed on every opening. Changed for Olavka only, as asked: the field
gets `[[data-shop=olavka]_&]:focus-visible:ring-0`. Other shops keep the ring until Ivan decides for them.

The dialog is a portal at the end of `<body>`, outside the page wrapper. So the Olavka mark `data-shop="olavka"` moved
from the `(main)` wrapper (remark 17) to `<html>` in the root layout. The remark 17 row tile reads the same mark and is
still 16/24 on olavka and 14/20 on acme after the move (re-measured on the product page at 1440 and 390).

Headless Chromium and Firefox. At 1440 the overlay is opened with Cmd/Ctrl+K; Olavka has no visible search button there.
At 390 it is opened with the bottom bar's button. Olavka values, identical in both engines:

| | before | after |
|---|---|---|
| focus on open | the field («Поиск товаров»), `:focus-visible` | the same |
| field ring (box-shadow) | 2px rgb(10,106,82) | 0px, no ring |
| field outline / row border | transparent / rgb(215,227,222) | unchanged |
| typing «асд» right away | goes into the field | the same |
| Tab to «Очистить» | outline 2px rgb(10,106,82) | the same: other controls keep their ring |
| Esc | overlay closed (0 dialogs) | the same |

acme (another shop, Chromium, 1440 Cmd+K and 390 button): the ring is 2px rgb(214,255,59) before and after, unchanged.

Shots `search-focus/<chromium|firefox>-<olavka|acme>-<1440-cmdk|390-button>-<before|after>.jpg`, crops of the field
`search-focus/olavka-input-crops-before-after.png`, logs `r18-*.log`, script `search18.mjs`.

## Remark 19 · footer: no offer/privacy row under the columns (Ivan 2026-09-27)

«в футере нужно бурать дубль ссылок "Публичная оферта Политика конфиденциальности" который в самом низу под всеми
колонками идут»:
`/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/ivan-remarks-2026-09-25/remark-19-footer-legal-row-duplicate.md`.

The footer switch `src/modules/layout/templates/footer/index.tsx` no longer puts `FooterLegal` under the Olavka footer.
Both links stay in the «© Черкашино» column, which is built from the same `footerLegalLinks`, so the privacy policy is
still one click from every page (audit B-01). `FooterLegal` loses the `bare` prop that remark 13 added for Olavka and is
byte-identical to its state before remark 13. Other shops keep the row, and a shop with its footer switched off
(`footer: "none"`) still gets the row alone, Olavka included.

Headless Chromium, prod :8233, home page:

| | before | after |
|---|---|---|
| olavka 1440: `[data-testid=footer-legal-links]` | «Публичная оферта · Политика конфиденциальности» under the columns | none |
| olavka 1440: columns | Категории 378 · Информация 732 · © Черкашино 1086 | the same |
| olavka 390: `[data-testid=footer-legal-links]` | the same row | none |
| olavka 390: columns | Категории 16 · Информация 201 · © Черкашино 16 (second row) | the same |
| olavka «©» column | Публичная оферта · Политика конфиденциальности · Создание интернет-магазина | the same |
| horizontal lines below the product grid | none | none |

Other shops cannot show the row on this live copy: none of acme, barhst, globex, initech, nochlavka, testovyy-magazin, tstr,
zolotaya-nit-1057 and night-tribute-1045 has published an offer or a privacy page, so none rendered the row before either.
acme's footer is the same before and after. At 390 the shots are pixel-identical. At 1440 the whole crop is 3 px higher,
because the crop is cut from a full-page shot, while the footer text and lines are the same.

One duplicate is still there: «Информация» lists the shop's own pages, and two of them are «Политика конфиденциальности»
and «Публичная оферта». Remark 19 names only the bottom row, so this list is untouched.

Shots `footer-legal-row/<olavka-com|acme>-<1440|390>-<before|after>.jpg`, script `footer-legal-row/foot19.mjs`.

## Remark 21 · the logo's focus ring with rounded corners (Ivan 2026-09-27)

«нужно сделать чтобы "фокусное" состояние на контейнере логотипа также было со скруглением а не так как сейчас с острыми
углами»: `/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/ivan-remarks-2026-09-25/remark-21-logo-focus-rounded.md`.

**Cause.** The app-wide keyboard ring in `src/styles/globals.css` (since 00abd2a0, 2026-09-08, shared by every shop) is
`:where(a[href], button, …):focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; border-radius: inherit }`.
With `inherit`, a control that has no corners of its own follows its container. It also overrides the corners a control
does have, because both rules have the same specificity and the global one comes later. The logo link sits in
`BrandUnlock`'s `display: contents` span with 0 radius, so on focus its 32px went to 0. That squared the ring and, in the
scrolled state, the logo's grey pill as well.

The same defect was on every other control in the h7 header, including the menu button the lead named as the model. Before,
measured by Tab on :8233, identical in headless Chromium and Firefox:

| control | radius at rest | on focus, before | on focus, after |
|---|---|---|---|
| logo (1440 and 390, rest and scrolled) | 32px | 0px (ring and pill square) | 32px |
| burger disc (1440), burger icon (390) | 999px | 0px (the white disc itself square) | 999px |
| account (1440) | 999px | 0px | 999px |
| «Корзина» pill (1440) | 9999px | 0px | 9999px |
| «Россия» / «₽» (1440) | 9999px | 32px, from the parent pill | 9999px |
| «Россия» / «₽» (390) | 9999px | 0px | 9999px |
| cart icon (390) | a narrow 0px link inside a 36px disc | square ring around the link | the disc carries the ring, round |

**Fix, in the h7 header only.** The global rule is not touched.
- `h7.module.css`: the focused burger and icon buttons get `border-radius: 999px` and the focused logo gets `32px` (the
  selectors have higher specificity than the global rule). The compact bar's cart disc draws the ring when its link has focus
  (`:has`), and the link's own ring goes transparent.
- The branch-local header variants get `focus-visible:rounded-full`: `RegionSelect` `text` / `icons` and `CartDropdown`
  `pill` (added by this task, used only by h7).

Outline colour, width and offset are unchanged: 2px rgb(10,106,82), offset 2px.

**Scope.** h7 is on every shop of this branch through the demo switch `DEMO_HEADER = "h7"` (`nav/variants/index.ts`), so
acme and the others get the same rounded rings in this header, as with remarks 7, 10 and 11. Headers h1–h6 and every other
focus ring on the site are unchanged.

The long press on the logo still opens the studio dialog, checked in Chromium and Firefox at 1440 and 390: a 2.3 s hold opens
it and keeps the page, and Esc closes it. A short click and Tab + Enter still follow the link.

Found on the way, not changed:
- Other shops have the same square ring wherever a rounded control's focus is not styled by its own component. Fixing that
  means dropping `border-radius: inherit` from the global rule, a change shared by every shop, so it waits for the lead and
  Ivan.
- The logo's `href` is `/` with no locale, and the middleware redirects `/` by the browser's Accept-Language. A visitor on
  `/ru` with an English browser lands on `/en` after a click on the logo. Headless Chromium and Firefox did exactly that.

Crops of the logo `logo-focus/<engine>-olavka-com-<1440|390>-<top|scrolled>-<before|after>.png`. Every header control focused
in turn: `logo-focus/header-controls-<engine>-<width>-<state>-<before|after>.png`, at 3×. Before-crops were shot in Chromium;
the Firefox before-values are in the table. Radii: `logo-focus/radius-after.log`. Scripts: `logo21.mjs`, `hdrfocus21.mjs`,
`hdrshot21.mjs`, `hold21.mjs`.

## Remark 22 · every visible banner opens its link; arrows on desktop (Ivan 2026-09-27)

«когда в слайдере с баннерами 3 баннера … на первые два можно кликнуть, а на третий нет» and «нужны какие-то контролы для
прокрутки влево и в право для тех кто на desktop не имеет tochpad»:
`/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/ivan-remarks-2026-09-25/remark-22-slider-third-banner-click-arrows.md`.

**Cause.** The loop renders the banners three times, as clone · real · clone, and the clones were `inert`. An inert element
takes no pointer events, so a click on it reached the `ul` and no link. One neighbour of the centred card is a clone
whenever the first or the last real banner is centred. At rest it is always the left one, and with the last banner centred
it is the right one: Ivan's «ЧИСТКА ПЕЧЕНИ». Measured on :8233 before the fix, with a real mouse click at the visible centre
of every card in view, at rest and after one-card scrolls 4 times forward and 5 times back: 42 of 180 clicks failed, all on
clones, in both engines and at every width (`slider-click-arrows/before-click.log`).

**Fix.**
- The clones lose `inert`. They stay `aria-hidden`, and their link gets `tabIndex={-1}`, so they are still out of the
  accessibility tree and the tab order, but a click opens the same link as the real card.
- `OlavkaLoopTrack` draws two round buttons, «Назад» / «Далее» (the existing `OlavkaHome.slider.previous/next` keys), with
  `aria-controls` pointing at the track.
- The look follows the chrxnasdmds carousel arrows, drawn like the header's burger disc: 40px, white, a hairline ring, a
  soft shadow, a 20px chevron, `--accent` on hover. The keyboard ring is 2px `--ring` and stays round (the remark 21 lesson).
  Figma 238:17551 has no arrows.
- Each arrow sits on the gap between the centred card and its neighbour, at the cards' middle. Absolute positioning, so the
  slider's layout does not move. The arrows are hidden until the island is ready.
- An arrow moves the centred card by one, through the loop. Quick clicks count from the card the last click aims at.
  Clicks beyond the clones (more than the number of banners at once) run after the loop has jumped back and the browser
  has re-snapped. Chrome cuts a smooth scroll that starts inside that re-snap, which showed up as lost clicks until this
  was handled. A wheel, a touch or a key on the track takes over from the arrows.
- **390 and tablet: no arrows** (below 1024). The track is swiped there, and at 390 a 40px disc on a 12px gap would
  cover the card's edge.

After, on :8233, headless Chromium and Firefox:

| check | result |
|---|---|
| a click at every visible card, at rest, 4 × forward, 5 × back, by scroll and by arrows, at 1440 / 1920 / 2240 | 360 of 360 clicks reach the card's link (`after-click-scroll.log`, `after-click-arrows.log`) |
| arrow geometry at 1440 | 40×40 at x 346 / 1054, centred on the 24px gaps of the 684px card; at 1920 and 2240 the zoomed 53.3px |
| 1023 and 390 | arrows `display: none` |
| 5 × next quickly, then 7 × previous | «Товары от варикоза», then «Чистка лимфы»: the right cards |
| 10 clicks at 60 / 250 / 700 ms apart, both ways; 7 at 90 ms at 1920 / 2240 | always ends on the right REAL card (`after-burst.log`) |
| Enter and Space on a focused arrow | one card each |
| Tab | real cards → Назад → Далее; clones never; ring 2px rgb(10,106,82), radius 999px |
| clones | all `aria-hidden="true"`, links `tabIndex -1` |

Firefox also stops Tab on the track itself before the first card, because Firefox makes a scroll container
keyboard-focusable. This was the same before and is not changed.

Shots: `slider-click-arrows/<engine>-<1440|1920|2240>-arrows-after.jpg`; Tab focus on «Далее»
`<engine>-<1440|1920>-next-tab-focus-after.png` and `next-tab-focus-strip.png` at 4×. Scripts: `click22.mjs`,
`arrows22.mjs`, `burst22.mjs`, `tabfocus22.mjs`.

## Remark 20 · the light/dark switch as an icon at the bottom of the burger menu (Ivan 2026-09-27)

«мы можем сделать переключение темной темы и добавить его внизу всплывающего меню в виде иконки вместо надписи "© 2026
Черкашино. Все права защищены."»:
`/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/ivan-remarks-2026-09-25/remark-20-dark-mode-toggle-in-menu.md`.

### 1. Olavka in dark mode today, measured before building

The dark mode is the visitor's stored choice (`localStorage["upready-store.mode"] = "dark"`), applied by the existing
pre-paint script. Pages checked, headless Chromium, 1440 and 390, on :8233 before the change: home, home scrolled, burger
menu, search overlay with results, all products, a category, a product page, cart.

A scan of every element on each page looked for two things: text under 3:1 contrast against its real background, and light
surfaces (L > 0.6, over 1500 px²) left on the dark page. The banner slider is left out of the scan because its chips sit on
the pictures.

| page | 1440 low-contrast / light surfaces | 390 |
|---|---|---|
| home, menu, search, all products, category, cart | 0 / 0 | 0 / 0 |
| product page | 0 / 1: the active tab pill in `bg-ui-fg-base`, inverted on purpose | 0 / 1, the same |

Everything dark comes from tokens that already exist: the `supplements` preset's `[data-mode="dark"]` block in
`src/styles/themes.css`, plus the h7 header's own dark rules from remark 10. **No new colour was needed, and none was added.**
These dark colours are not from Figma: Figma has no dark olavka, as far as I could reach it.

What Ivan should see and decide:
- **Product photos stay white tiles** on the dark page. The white is in the pictures themselves, not in CSS: home, store,
  category and product page (`dark-toggle/pages/1440-dark-home.jpg`).
- The banner chips keep their light and dark fills in both modes, because they are drawn on the pictures.
- The 404 page stays light even with dark stored: its `<html>` goes back to `light` about 0.7 s after load.
- A content finding: the banner «Чистка печени» links to `/products/course-ochishchenie-pecheni-cherkashino`, which is a
  404 on this live copy.

Shots: `dark-toggle/pages/<1440|390>-dark-<page>.jpg`, the 1440 sheet `pages/sheet-1440-dark.jpg`, scan `dark-scan.log`,
script `dark20.mjs`.

### 2. The switch

- **Olavka only.** `SideMenu` (shared with h1, and h7 is on every shop of the branch) gets the prop `modeToggle`. h7 passes
  `isOlavkaShop()`. With the prop on, the «© year shop» line gives way to a 40px round icon button with a hairline
  `ui-border-base` ring and a 20px icon. acme's menu still ends with «© 2026 Acme. Все права защищены.»
- **The same `ModeToggle` as the other headers**, so the choice is kept in `localStorage` and applied by the pre-paint
  script before the first paint. The icon shows the mode a click switches to: a moon in light, a sun in dark.
- **Accessibility.** A new prop `pressed` gives the button a fixed name, «Тёмная тема» (new key `Nav.modeDark` in all 36
  locales; English text outside ru, as the neighbouring keys), and `aria-pressed` true/false. Without the prop the other
  headers keep their action labels («Переключить на тёмную тему») and no `aria-pressed`.
- **Focus.** Keyboard focus draws the 2px `--ring` ring, and it stays round (`focus-visible:rounded-full`, the remark 21
  lesson).

Checked on :8233, headless Chromium and Firefox, at 1440 and 390, all the same:

| step | result |
|---|---|
| first visit | SSR `data-mode="light"`; menu: switch «Тёмная тема», `aria-pressed="false"`, moon; no «©» line |
| Tab ×6 from the open menu | the switch has `:focus-visible`, a 2px ring rgb(10,106,82), radius 9999px |
| Enter | `<html data-mode="dark">`, stored `dark`, `aria-pressed="true"`, sun |
| reload | SSR still sends `light`; **at the first animation frame, before the first paint, the page is already `dark`** |
| click, then Space | light / stored `light`, then dark / stored `dark` |
| another page (`/ru/store`) | dark from the first frame |
| acme | no switch; «© 2026 Acme. Все права защищены.» |

Shots: menus `dark-toggle/<engine>-<1440|390>-menu-<light|dark>.png`, the sheet `menus-1440-390-light-dark.jpg`; the focused
switch `<engine>-<width>-toggle-focus-<light|dark>.png`. Logs `toggle-chromium.log`, `toggle-firefox.log`; script
`toggle20.mjs`. The dark scan ran in Chromium. Firefox checked the switch's behaviour. One Firefox launch was refused by
macOS («library load denied by system policy»), and the next one ran normally.

## Remark 24 · «В КОРЗИНЕ − N +» after «В корзину» (Ivan 2026-09-27), part 1: code and unit tests

«я ранее просил сделать кнопку "В корзине" со счетчиком предметов в корзине после нажатия на кнопку "В корзину", но это до
сих пор не готово»: `/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/ivan-remarks-2026-09-25/remark-24-in-cart-button-counter.md`,
section 2 of `/Users/ivanprotsko/upready/prompts/2026-09-25-w25-olavka-home-rails-journal-incart.md`.

**Where.** On Olavka the button is on the product page only: the buy box and the phone's sticky bar. Olavka's product
cards have no «В корзину» button to turn into a stepper: remark 17 left title and price only («Остается только заголовок и
цена»). Whether cards should get a cart button is a question for Ivan. The «Характеристики и описание» drawer keeps its own
«В корзину», which adds one more to the same line.

**What.**
- `in-cart-stepper/logic.ts` is pure state logic:
  - not in the cart, «+» → add one;
  - N, «+» → N + 1, but not over the stock of a tracked variant without back orders (the `variantInStock` rule);
  - N > 1, «−» → N − 1;
  - 1, «−» → the line is removed and the button is «В корзину» again.
- 8 unit tests in `logic.test.ts`.
- `InCartStepper` takes the add button's place, size (40px, round) and fill (`ui-button-inverted`, the same green): «В
  КОРЗИНЕ» on the left links to /cart, «− N +» on the right. No new colours.
  - «+» and «−» change the number at once and send `updateLineItem` / `deleteLineItem`. Those revalidate the cart, so the
    page, the header count included, comes back with the server's numbers; a failed request falls back to them.
  - Accessibility: `role="group"`, «Убрать одну» / «Добавить ещё одну» labels, the number in `aria-live`.
  - Keys `ProductActions.inCart/decreaseQuantity/increaseQuantity` are in all 36 locales.
- `ProductActionsWrapper` reads the visitor's cart on the Olavka shop only (`retrieveCart`: a read, and none at all without
  a cart cookie). Other shops read nothing and render as before.

**Checked so far** (no cart was created: writes to `upready_store_live_copy` wait for Ivan's ok through the lead):
- vitest 413/413, 8 of them new;
- tsc 0; lint 0 errors;
- the product page without a cart on :8233, olavka and acme, 1440/390: «В корзину» / «Выбрать вариант» as before. At 390
  the buy box shots are byte-identical; at 1440 26–27 bytes differ on both shops, and acme's code path is unchanged
  (`in-cart-button/chromium-<shop>-<width>-buybox-<before|after>.png`).

**Waiting:** the stepper in a real cart. Add, «+» to 2, «−» back to 1, «−» to «В корзину», and the header count, in
Chromium and Firefox at 1440 and 390. This runs once Ivan allows test carts on :9251.

## Remark 23 · a count next to each option filter in the catalog sidebar (Ivan 2026-09-27)

«Показывать напротив пункта фильтра справа кол-во элементов которое будет показано при активации данного пункта»:
`/Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/ivan-remarks-2026-09-25/remark-23-catalog-filter-counts.md`.

**Where the counts come from: the backend, through the listing's own query.** For each checkbox of an option group
(«Количество», «Фасовка»), `countOptionBuckets` (`src/lib/data/products.ts`) asks `/store/products` with the same narrowing
the list uses and `limit: 1, fields: id`. The narrowing is: the category and its subtree on a category page; the products the
characteristics left; `option_value_id` = the values already checked plus this checkbox's. The answer's `count` is the
list's total by construction. A checked box shows the current total. If the characteristics left nothing, every count is 0.

**Cost per page load:** one small request per checkbox, in parallel (12 on olavka's /store), cached under the `products` tag
like the listing. A new filter combination pays them once. Measured render of /ru/store: 0.15–0.18 s. The characteristic
facets keep the counts the backend already sends; they are untouched.

**Semantics, measured.** The backend combines checked values with AND. On /ru/store: no filter 19, «10 шт» 1, «2 банки» 1,
both 0. So the counts fall to 0 once one box is on, and they say so before the click.

**Proof, on :8233, headless Chromium 1440:** every checkbox's shown count equals `data-total-count` of the list after
clicking it, first with no filter and then with «10 шт» already on (a combination). **24 of 24 equal**
(`filter-counts/counts-olavka-store-chromium-1440.log`, script `counts23.mjs`; semantics `sem23.mjs`).
- Two checkboxes show 0 with no filter at all: «Фасовка: 30 гр» and «100 гр». Their values belong to no product in the
  listing, so the list really comes out empty.

**Scope.** `FilterSidebar` is shared. The counts render only when the page passes `optionCounts`, and only the Olavka shop
does (`isOlavkaShop()`, in the store and category templates); acme's sidebar has none (0 `filter-option-count` on its
/ru/store). The checkbox grouping moved unchanged from `filter-panel` to `optionBuckets` in
`src/lib/util/option-filter-groups.ts`, so the server builds the same checkboxes. The phone's filter sheet and the
collection page show no counts yet. Other shops wait for the lead's word.

Shot `filter-counts/sidebar-olavka-1440.png`.
