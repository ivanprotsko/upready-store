# Evidence · t-2026-09-24-n15 · redesign-olavka: Header, Cover, Navigation, HeroSlider (rule 27f)

Shop «Оксана Черкашина» (tenant `cherkashino`), live render of the branch `redesign-olavka` on
http://olavka-com.localhost:8233 (dev server, code commit 872f8ad2) against the stand backend :9121.
Shots by Playwright/Chromium, three widths (1440, 768, 390), two themes (`light`, `dark` via the
`upready-store.mode` localStorage axis the storefront's own toggle writes). Built after Ivan's Figma
file `2zPDDEfMdYM1tbv5xKfnLX`, page «Main MVP», node 227:8180 «MainPage / initial» (1216 wide) and its
master components 227:9557 «Header» (variant `initial`), 227:9296 «Cover», 227:9297 «Navigation»,
227:9298 «HeroSliders». The file has NO mobile or tablet frame: 768 and 390 are an adaptation of the
desktop node (burger + wordmark + cart in the bar, country/currency in the bottom-nav menu, the
navigation row scrolls sideways, the banner is the viewport minus 80px).

| Group | What it shows |
|---|---|
| `home/` | The whole home page `/ru`, full height: Header → Cover → Navigation → HeroSlider → the tenant's listing p4 → footer (the category-tiles block self-suppresses on this tenant: none of its categories has an image, the same as on `dev`; the composed hero k is skipped under the demo blocks, see `home/variants/index.ts`). |
| `header/` | The h7 header element alone, Figma 227:9557 `initial`: burger disc · country pill («Россия») · currency pill («₽ RUB») — wordmark in Ruslan Display — account disc · «Корзина» pill · contact disc. 768/390: burger · wordmark · cart pill (icon only). The node's heart disc is not built (no wishlist in the storefront); the `scrolled` variant (24px wordmark in a pill) is not built — states come later from Ivan. |
| `header-mobile-menu-open/` | The header's side menu opened from the burger; 768 and 390 only — at 1440 the burger opens the same menu, the state is the same. |
| `cover/` | The Cover block, Figma 227:9296: PT Serif Italic 32px centred, line 1 bold = the shop's name, line 2 = the headline of the tenant's home document («Заказ от 5 кг — скидка 10%») standing in for the node's tagline until the panel has a `tagline` field. |
| `navigation/` | The Navigation block, Figma 227:9297: the search pill (opens the search dialog), then one tinted pill per top-level category in alphabetical order, the node's own fill/ink pairs; scrolls sideways below 1024. The node's «Курсы» pill is absent: there is no courses listing route to point it at (open question). |
| `hero-slider/` | The HeroSlider block, Figma 227:9298, on slide 1 of 2: the tenant's course products («Очищение печени» with its course cover, «Очищение почек» without an image), the active banner 800×320 with neighbours peeking, labels «Курс» / title / «Смотреть», arrows, dots. The node's date kicker («17 августа») has no data field yet and is not drawn. |
| `hero-slider-slide-2/` | The same block after one «›» click: slide 2 of 2 («Очищение почек», no cover on the stand, so the banner is the theme's muted surface). |
| `store/` | `/ru/store` viewport: the h7 header above the catalog page, proving the header is site-wide. |

Notes on the dev render: Next's dev overlay (`nextjs-portal`) is hidden in the shots. In `dark` the console
carries one hydration warning on `<html data-mode>` (the pre-paint script switches the mode from
localStorage before React hydrates; root layout on `dev`, not this branch) and next/image `qualities`
deprecation warnings for every hero and product image (pre-existing on `dev`, the new blocks use the same
`quality` values as the existing variants). Neither is touched here (lead: no self-initiated refactors).
The navigation pills keep the node's light tints in `dark` too — every pill is a self-contained fill/ink
pair the node proved readable, and the file has no dark variant.
