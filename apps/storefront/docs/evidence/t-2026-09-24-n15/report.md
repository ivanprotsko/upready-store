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
