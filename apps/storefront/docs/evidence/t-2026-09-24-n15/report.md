# Evidence · t-2026-09-24-n15 · redesign-olavka round 2: header per device, banner slider (rule 27f)

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
| `header/` | The h7 header element: desktop = burger disc · «Россия» pill · «₽ RUB» pill — wordmark — account disc · «Корзина» pill · contact disc; 768 and 390 = wordmark left, then flag disc · currency disc · cart · burger disc with 1×12 dividers (Figma 227:9557 `Device=tablet|mobile, Scrolled=false`). The `Scrolled=true` variants are not built (states later); the heart disc is not built (Ivan 3.1). |
| `header-mobile-menu-open/` | The side menu opened from the burger of the compact header; 768 and 390 only. |
| `hero-slider-1/` | The slider with ONE banner saved: one card the whole content width (1168 / 672 / 336 in the file). |
| `hero-slider-2/` | TWO banners (the fixture): a pair 572×400 side by side at 1440 (no scrolling); one card with the next peeking at 768 and 390. |
| `hero-slider-2-swiped/` | The same two banners at 768 and 390 after a swipe: the second card centred, the first peeking left (`Swiped=true`). |
| `hero-slider-3plus/` | THREE banners (the third — «%» / «Коллекция» / «Товары от варикоза» / «Выбрать», the node's own picture 239:17763 — saved on the worker's database only, NOT in the fixture): a scroll-snap carousel on every width; at 1440 the first card is centred (x 322 as in the frame) with the next peeking right — the frame also shows a previous banner peeking left, i.e. an endless loop, which is not built (the one difference); at 768 and 390 the first card sits at the left padding with the next peeking (`Swiped=false`). |
| `hero-slider-3plus-swiped/` | The three-banner carousel at 768 and 390 after a swipe: the second card centred, neighbours peeking on both sides. |
| `store/` | `/ru/store` viewport: the header above the catalog page, proving it is site-wide. |

Every banner card is ONE link (`<Link>` for a product or a site path, `<a target="_blank" rel="noopener
noreferrer">` for an external URL) with the four chips as plain spans inside; the card's own focus ring is the
keyboard focus. Pictures come through `srcset` cut by `scripts/media/make-image-variants.mjs`
(`/static/home-banners/<slug>/<slug>-{480,768,1080,1440,1920}.webp`).

Notes on the dev render: Next's dev overlay (`nextjs-portal`) is hidden in the shots. In `dark` the console
carries one hydration warning on `<html data-mode>` and next/image `qualities` deprecation warnings, both
pre-existing on `dev` (not touched).
