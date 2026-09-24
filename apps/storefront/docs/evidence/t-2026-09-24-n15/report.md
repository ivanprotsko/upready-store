# Evidence · t-2026-09-24-n15 · redesign-olavka: Header, Cover, Navigation, HeroSlider (rule 27f)

Shop «Оксана Черкашина» (tenant `cherkashino`), live render of the branch `redesign-olavka` on
http://olavka-com.localhost:8233 (dev server, code commit 7e2631b1) against the stand backend :9121.
Shots by Playwright/Chromium, three widths (1440, 768, 390), two themes (`light`, `dark` via the
`upready-store.mode` localStorage axis the storefront's own toggle writes). Stage: GROUNDWORK — the
Figma node 227-8180 was not readable yet, so the layout is neutral; every group is re-shot after the
Figma pass.

| Group | What it shows |
|---|---|
| `home/` | The whole home page `/ru`, full height: h7 header, Cover, Navigation, HeroSlider, then the tenant's own composed blocks (hero k, category tiles, listing p4) and the footer. |
| `header/` | The h7 header element alone: logo (shop name), five category links + «Все товары», mode toggle, search, RU/₽ switcher, account, cart at 1440; burger + logo + cart at 768 and 390 (the rest lives in the bottom nav). |
| `header-mobile-menu-open/` | The header's side menu opened from the burger; 768 and 390 only — at 1440 the burger does not exist, so there is no such state. |
| `cover/` | The Cover block: tenant hero copy («Заказ от 5 кг — скидка 10%», subtitle, CTA) over the tenant's hero photograph with a left scrim. |
| `navigation/` | The Navigation block: all nine top-level categories in the owner's order plus «Все товары»; scrolls horizontally at 390. |
| `hero-slider/` | The HeroSlider block on slide 1 of 4 (the tenant's hero), with dots and arrows. |
| `hero-slider-slide-2/` | The same block after one «Далее» click: slide 2 of 4, the first category («Мультиварки») illustrated by one of its own product photographs. |
| `store/` | `/ru/store` viewport: the h7 header above the catalog page, proving the header is site-wide. |

Notes on the dev render: Next's dev overlay (`nextjs-portal`) is hidden in the shots. In `dark` the console carries
one hydration warning on `<html data-mode>` (the pre-paint script switches the mode from localStorage before React
hydrates; root layout on `dev`, not this branch) and next/image `qualities` deprecation warnings for every hero and
product image (pre-existing on `dev`, the new blocks use the same `quality` values as the existing variants). Neither
is touched here (lead: no self-initiated refactors).
