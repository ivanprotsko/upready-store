# t-2026-09-21-01 — storefront visual quality for the real client store (cherkashino)

Branch `feat/o21-storefront-visual-cherkashino`, base `dev`. Read `COMMON.md` next to this file first.

## Objective

On the tenant storefront, measured on a local copy of the client's store, every product photo is shown whole inside one consistent frame, grids are even, the product page, filters, footer and phone layout look like finished design, and the recorded storefront interface defects are closed.

## What the lead measured on the live store (2026-09-21 02:09 WITA, https://cherkashino.shipshift.dev)

Screenshots: `/private/tmp/claude-502/-Users-ivanprotsko-upready-projects-upready-store/c9f1f7c6-e09d-43f8-8d8b-963322ee5848/scratchpad/live/{d,m}-{home,store,pdp}.png` (may be gone later; re-shoot with your own probe).

1. `/ru/store`: 9 of 9 product images have a natural ratio of 0.75 (3:4) and are rendered into a 1:1 box with `object-fit: cover`. The client's photos are marketplace infographics with text at the top and bottom, so the crop cuts the captions («2 ШТ.», «ИНГАЛЯТОР», «ЗУБНАЯ ПАСТА», «СРЕДСТВО ОТ 1000 БОЛЕЗНЕЙ»). This is what Ivan calls «обрезаными как попало».
2. Home, «В магазине»: three columns, the first row is taller than the second, tiles mix white packshots, tinted cards and full-bleed infographics with no common surface, titles and prices sit at different baselines.
3. Products without photos render an empty frame that is TALLER than the cards with photos, with a tiny icon in the middle. On the product page a product without photos collapses: the title floats in the centre and the gallery column disappears.
4. Catalog filters: six raw selects in a wrapping row («Количество», «Фасовка», «Объём», «Комплектация», «Формат», «Страна производства») plus a bare range «Объём, мл 10 — 2000». Nothing shows which filters are active, there is no reset, and on the phone the row is a wall.
5. Footer: the brand column is an empty rectangle with the shop name. No phone, no e-mail, no messenger, no requisites, no payment or delivery marks. For a real shop this is the trust block.
6. Product page: title, a lone «Описание» chip, price and button float with large voids; no thumbnails, no attributes table, the «Вам может понравиться» grid repeats the same cropping.
7. Typography and rhythm are generic: section titles are small and unanchored, vertical spacing is uneven (large void under the hero, tight grid below).

## Design decisions (made by the lead, implement these)

### D1. One media frame for product imagery

Create one component that every product image goes through (cards, related, cart lines, search results, product gallery, order lines). Rules:

- The frame has a fixed aspect ratio per context, chosen once in one place: cards `4 / 5`, product gallery main `4 / 5` on phone and `1 / 1` or `4 / 5` on desktop (decide by looking at the client's real photos, state the reason), cart and order thumbnails `1 / 1`.
- Product media is NEVER cropped: `object-fit: contain`, centred, on a neutral surface token of the theme. The surface is the same for every tile, so white packshots, tinted photos and full-bleed infographics sit on one rhythm. Inner padding is small and consistent; an image whose ratio equals the frame fills it edge to edge with the frame's radius.
- Optional upgrade when time allows: sample the image's edge colour server-side (or at import) and use it as the tile background so full-bleed infographics blend. Only if it is robust; otherwise keep the neutral surface.
- The no-photo state is a designed placeholder INSIDE the same frame (same ratio, same surface, a quiet mark and the localized words for «Фото скоро будет»), never a different height.
- `next/image` with correct `sizes`, width and height or `fill` inside the ratio box so there is zero layout shift; blur or colour placeholder while loading; second image on hover for desktop cards when the product has one.
- `cover` stays allowed only for non-product imagery: hero, category tiles, journal covers, where the owner chose an image for decoration. Category tiles get a focal-point-safe treatment (centre crop plus a scrim for the label).

### D2. Product card and grids

- Card: frame, title clamped to two lines with a reserved height, price row pinned to the bottom of the card, optional unit line («50 гр») in a fixed slot, sale price and badge slots. Cards in one row have equal height by construction.
- Grid: 4 columns at 1440, 3 at 1024 to 1280, 2 at 390, one gap scale. The home grid and the catalog grid use the same card.
- Section headers on home: a real heading with a «Все товары» link on the right, consistent spacing above and below; remove the void under the hero.

### D3. Catalog filters

- Desktop: facets live in the left column under the categories as collapsible groups with checkboxes and counts, the range facet is a labelled control («Объём: от 10 до 2000 мл»), active filters appear above the grid as removable chips with «Сбросить всё».
- Phone: one «Фильтры» button with a count badge opening a bottom sheet with the same groups and a sticky «Показать N товаров» button; sorting next to it.
- A facet that has one value or no products is not shown. The duplicated facet of seeded stores (task `t-2026-09-12-seed-option-filter-duplicates`) must not come back: one facet per option title.
- Filter state lives in the URL, as it does today. Do not break deep links.

### D4. Product page

- Two columns on desktop: gallery on the left (main frame plus a thumbnail rail, keyboard operable, arrow keys, visible focus, zoom on click or lightbox), buy box on the right (title, price, unit, variant pickers, stock state, button, delivery and return as an accordion under it).
- Below: description as readable prose with a sane measure, attributes as a two-column table, reviews, then related products with the D2 card.
- Phone: swipeable gallery with dots, sticky buy bar at the bottom that never covers the bottom navigation or content.
- A product without photos keeps the two-column layout with the placeholder frame.

### D5. Footer and trust

- Brand column: shop name or logo, one-line description, contacts (phone, e-mail, messengers, address, hours) and legal requisites taken from tenant data (requisites and contacts already exist in the platform: tasks t12 and the pages module; find the source, do not invent a second one). Payment and delivery marks only for methods the shop really has enabled.
- The header becomes a `banner` landmark outside `<main>` (task `t-header-not-a-landmark`).

### D6. It must hold for every shop, not one

No tenant-specific code. The client's character comes from tenant branding (logo, colours, task t16) and theme presets. Verify the result on the cherkashino dataset AND on one seeded demo shop with a different preset, light and dark.

## Layout artefact (rule 27d): wireframes and the named reference

Canon for tokens, spacing and type: `/Users/ivanprotsko/upready/packages/geist-kit/AGENTS.md` (rule 27: Geist everywhere). The «before» reference is the live shop `https://cherkashino.shipshift.dev` at `/ru`, `/ru/store` and a product page, shot at 1440 and 390 at the start of your run; every «after» frame is compared against its «before» frame dimension by dimension (frame ratio, clipping, card height, baseline of title and price, gaps, section spacing, surface colour), and each claimed improvement is re-verified on the frame, not on the CSS.

Product card (all grids use it):

```
┌──────────────────────┐
│ ┌──────────────────┐ │  frame 4:5, one neutral surface,
│ │                  │ │  image object-fit: contain, centred,
│ │   whole photo    │ │  small even padding, same radius
│ │   never cropped  │ │
│ └──────────────────┘ │
│ Title, max two lines │  reserved height for two lines
│ 50 гр                │  unit slot (empty slot keeps its height)
│ 1 355,00 ₽   [sale]  │  price row pinned to the card bottom
└──────────────────────┘
```

Catalog at 1440 and at 390:

```
1440                                              390
┌ Каталог ─────────────────────────────────────┐  ┌ Все товары ───────────┐
│ Категории   │ [chip ×][chip ×]  Сбросить всё │  │ [Фильтры •2] [Сорт. ▾]│
│  Мультиварки│ Сортировка ▾                   │  │ [chip ×][chip ×]      │
│  Стевия     │ ┌───┐ ┌───┐ ┌───┐ ┌───┐        │  │ ┌────┐ ┌────┐         │
│ Фильтры     │ │   │ │   │ │   │ │   │        │  │ │    │ │    │         │
│ ▾ Фасовка   │ └───┘ └───┘ └───┘ └───┘        │  │ └────┘ └────┘         │
│  ☐ 50 гр (4)│ ┌───┐ ┌───┐ ┌───┐ ┌───┐        │  │ ┌────┐ ┌────┐         │
│ ▾ Объём     │ │   │ │   │ │   │ │   │        │  │ │    │ │    │         │
│  от 10 до   │ └───┘ └───┘ └───┘ └───┘        │  │ └────┘ └────┘         │
│  2000 мл    │           1 2 3                │  │ sheet: groups + sticky│
└─────────────┴────────────────────────────────┘  │ «Показать 12 товаров» │
                                                  └───────────────────────┘
```

Product page at 1440 and at 390:

```
1440                                              390
┌ crumbs ──────────────────────────────────────┐  ┌ crumbs ───────────────┐
│ ┌─┐ ┌──────────────────┐  Title              │  │ ┌───────────────────┐ │
│ │t│ │                  │  1 355,00 ₽  50 гр  │  │ │ swipe gallery 4:5 │ │
│ │h│ │  main frame      │  [variant pickers]  │  │ └─────── • ◦ ◦ ─────┘ │
│ │u│ │  contain, zoom   │  В наличии          │  │ Title                 │
│ │m│ │                  │  [ В корзину ]      │  │ 1 355,00 ₽   50 гр    │
│ │b│ └──────────────────┘  ▸ Доставка и возврат│ │ Описание…             │
│ └─┘                                          │  │ Характеристики…       │
│ Описание (readable measure) │ Характеристики │  │ ───────────────────── │
│ Отзывы                                       │  │ sticky: цена [В корзину]│
│ Вам может понравиться: the same card, 4 cols │  └───────────────────────┘
└──────────────────────────────────────────────┘
```

Footer: `[logo or name + one-line description + phone, e-mail, messengers, address, hours] [Категории] [Информация] [Реквизиты + payment and delivery marks]`, then the copyright row.

## Human-eyes criteria (rule 27d; the lead judges these by looking at the running shop, a screenshot file is not a verdict)

- On every card of the client's catalog the captions printed on the photo (for example «ЗУБНАЯ ПАСТА с углем», «ИНГАЛЯТОР», «СРЕДСТВО ОТ 1000 БОЛЕЗНЕЙ») are readable from the first to the last letter.
- In any grid row the titles start on one line and the prices stand on one line across the row.
- White packshots, tinted photos and full-bleed infographics next to each other read as one calm grid: no tile looks like a hole or a sticker.
- A product without photos does not look broken: a buyer would call it «фото скоро будет», not «сайт сломан».
- The catalog at 390 shows the first product cards within the first screen: filters do not push the goods below the fold.
- The product page has no unexplained voids: between the header and the title, and between the buy box and the description, the spacing follows one scale.
- The footer answers «кто продавец и как с ним связаться» without scrolling inside it.
- The shop looks like one designed thing in light AND in dark mode at 1440 AND at 390.

## Outstanding recorded tasks folded into this unit

For each: first check on `dev` whether it still reproduces, then fix or record «not reproducible» with the measurement. Read the task with `node /Users/ivanprotsko/upready/.ai/scripts/handoff.mjs --file=/Users/ivanprotsko/upready/projects/upready-store/HANDOFF.json task show <id>` (read only; never write the HANDOFF).

- `t-2026-09-12-seed-option-filter-duplicates`
- `t-2026-09-12-seeded-hosts-no-locale-controls`
- `t-header-not-a-landmark`
- `t-select-allowlist-gap` (Tailwind content allowlist; see `AGENTS.md`, «Things That Break Silently»)
- `t-port-account-info-alignment`
- `t-2026-09-08-02` (lint gate for the `/NN` opacity modifier on a bare `var()` colour)
- `t-2026-09-10-02` (sticky category strip background)

## Files you may change

`apps/storefront/**` (modules, styles, lib, messages, tailwind config, tests, probes), plus a probe script under `scripts/` and docs under `docs/`. Backend only when a storefront need cannot be met otherwise (for example exposing contacts to the footer), and then the smallest possible change with `pnpm check:backend-build` green. Do not touch `apps/tenant-panel/**`. Another worker (t-2026-09-21-03) owns `apps/storefront/src/lib/data/**` cache and revalidation fixes: if you must edit a file there, keep the edit minimal and say so in the PR.

## Deliverables

1. The code.
2. A committed Playwright probe (`scripts/` or `apps/storefront/e2e/`) that, for a given base URL, walks home, catalog, a category, a product page and the related grid at 1440 and 390 and prints per image: natural ratio, frame ratio, `object-fit`, clipped yes or no; per grid row: card heights; and fails when any product image is clipped, frames differ within a grid, or card heights differ within a row.
3. Before and after screenshot pairs for every changed screen, light and dark, 1440 and 390, looked at by you.
4. `docs/storefront/live-content-punch-list-cherkashino.md`: what must be fixed in the LIVE shop's content by a human (test products such as «Настойка 50 мл» whose description says it is a temporary acceptance product, products without photos, photos that need re-shooting or a clean packshot, missing contacts). Read-only observation of the live site; you change nothing there.
5. Gemini critique files and your verdicts (see `COMMON.md`).

## Acceptance (the lead checks each line on a running instance)

1. Home, catalog, a category and the related block at 1440 and 390: every product image has `object-fit: contain` and zero clipping, every frame in a grid has one aspect ratio, cards in a row have equal height. Measured by the committed probe.
2. A product without photos: card and product page show the designed placeholder in the same frame, the product page layout does not collapse.
3. Catalog filters: one group without duplicate facets on desktop, a button and a sheet at 390, active filters as removable chips, the range labelled in human words.
4. Product page: gallery with thumbnails operable from the keyboard, sticky buy bar on the phone, attributes and description laid out, CLS below 0.1.
5. The footer carries the brand block with contacts and requisites from shop data; the header is a `banner` landmark outside `main`.
6. Every changed screen is shot in light and dark; before and after pairs exist.
7. `apps/storefront`: `npx tsc --noEmit`, `npx next lint`, `npx next build` green; parity of the 36 message catalogs with real translations.
8. One verdict line per folded task: fixed with a measurement, or not reproducible with a measurement.
9. Gemini Pro critique attached, valid findings closed.
10. The live content punch list exists.

## Verify yourself before finishing

The probe against your local stand, the three storefront checks above, `node scripts/check-locale-catalogs.mjs`, the catalog parity one-liner from `AGENTS.md`, and your own eyes on every screenshot.
