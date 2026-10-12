# template:check — 2026-10-12

**Итог: FAIL.** Проверено целей: 8 (шаблоны × страницы, блоки площадки, ширины 360 и 1280 px). Новых отказов gate: **3**; унаследованных (долг общих частей витрины на страницах шаблона): 180; отказов из базы (известный долг существующих вариантов): 0; report-правил вне порога: 3.
Что делать: каждый новый отказ ниже — с id правила, целью и замером. Чинить блок или шаблон; базу не переписывать, чтобы спрятать отказ.
Унаследованные не валят прогон: база держит тот же отказ (правило и замер) на той же странице и ширине другого шаблона, его дают общие части витрины, а не этот шаблон. Они перечислены отдельной таблицей ниже.

Commit 36f841dc · http://localhost:8131 as globex.shipshift.dev · locale en · --only uhod · baseline 745 keys · exit 1

## Rules

| Rule | Kind | Threshold | Checked | Pass | Fail | New gate failures | Inherited failures | Baseline failures |
|---|---|---|---|---|---|---|---|---|
| QR-TYPE-SCALE | gate | every size on the declared type scale; neighbours ≥ 1.15×; ≤ 8 sizes | 6 | 0 | 6 | 2 | 35 | 0 |
| QR-TYPE-ROLE | gate | one role, one size on a page and across a template's pages | 8 | 4 | 4 | 0 | 8 | 0 |
| QR-HEADING-RANK | gate | one h1 per page; no level skipped; size never grows with the level | 6 | 4 | 2 | 0 | 2 | 0 |
| QR-SECTION-RANK | gate | section title ÷ body ≥ 1.5 | 6 | 4 | 2 | 0 | 2 | 0 |
| QR-WEIGHT | gate | font-weight ≤ 600 | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-CASE | gate | capitals only at ≤ 12px with tracking ≥ 0.06em | 6 | 0 | 6 | 0 | 12 | 0 |
| QR-MEASURE | gate | 45 ≤ characters per line ≤ 90 (45 for prose only) | 3 | 3 | 0 | 0 | 0 | 0 |
| QR-COLUMN-RANK | gate | the longest text (> 200 chars) sits in a column ≥ 480px | 3 | 3 | 0 | 0 | 0 | 0 |
| QR-SPACE-SCALE | gate | padding, margin and gap on 4·8·12·16·24·32·48·64·96·128 | 6 | 0 | 6 | 0 | 26 | 0 |
| QR-SECTION-RHYTHM | report | ≤ 2 distinct gaps between bands | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-GRID-AXES | gate | every content container on one left edge | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-DENSITY | report | 12 ≤ text elements above the fold ≤ 32 | 3 | 3 | 0 | 0 | 0 | 0 |
| QR-IMG-ASPECT | gate | every picture in a hard box; one ratio per role, on a page and across pages; nothing drawn 0×0 | 8 | 5 | 3 | 0 | 3 | 0 |
| QR-IMG-FRAME | gate | card pictures on one surface, with one fit | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-CARD-SURFACE | gate | a product card has a background, a border or a rounded picture | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-GALLERY | gate | one main frame; thumbnail ratio = frame ratio (±0.01); product page ≤ 6000px at 1280 | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-ALT | gate | product pictures carry a real alt; no image lacks the attribute; no «Product image 1» | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-EMPTY | gate | the no-photo placeholder sits in the frame's own ratio box; an empty block draws nothing | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-CARD-GRAMMAR | gate | card roles in canon order; the same product has one card signature on every page | 8 | 0 | 8 | 0 | 14 | 0 |
| QR-PRICE | gate | tabular-nums; no «,00»; no-break space before ₽; card price differs from the title in weight or size | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-RADIUS | gate | radii only 6 · --radius · 12 · pill; one radius per component role across pages | 8 | 2 | 6 | 0 | 17 | 0 |
| QR-ELEVATION | gate | ≤ 1 shadow recipe | 6 | 3 | 3 | 0 | 3 | 0 |
| QR-CONTROL-DENSITY | gate | ≤ 4 icon-only controls in one header row | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-TECTONICS | report | the footer's surface differs from the page | 3 | 0 | 3 | 0 | 0 | 0 |
| QR-OCCLUSION | gate | titles, prices and buttons are on top at their own point | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-JS | gate | 0 page errors | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-CONTRAST | gate | 0 axe color-contrast violations (AA) | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-OVERFLOW | gate | 0px horizontal overflow | 3 | 3 | 0 | 0 | 0 | 0 |
| QR-HIT | gate | every target ≥ 44px high; icon-only ≥ 44px wide; inline links exempt | 3 | 0 | 3 | 1 | 52 | 0 |
| QR-FOCUS | gate | a visible focus ring, distinct from rest, on every target | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-MOTION | gate | durations ≤ 240ms; under prefers-reduced-motion ≤ 10ms | 6 | 0 | 6 | 0 | 6 | 0 |

Not ported from the lab: QR-PROSE (checks the text of the lab's own template files; on the storefront the long text is the shop's catalogue, not the template); QR-TOKENS (a source check of literal values in block CSS; `pnpm lint:blocks` does it on src/modules/blocks); QR-TOKEN-COVERAGE (scale tokens a lab template overrode; a manifest here names closed layers only, held by validateTemplate()).

## New gate failures

| Target | Rule | Measured |
|---|---|---|
| template/uhod/home@360 | QR-TYPE-SCALE | 9 sizes: 11, 12, 13, 14, 16, 18, 20, 24, 32 |
| template/uhod/home@360 | QR-HIT | 328×24: a.shrink-0 «See all» |
| template/uhod/home@1280 | QR-TYPE-SCALE | 9 sizes: 12, 13, 14, 16, 18, 20, 24, 32, 48 |

## Inherited gate failures

| Target | Rule | Measured | Baseline holds it for |
|---|---|---|---|
| template/uhod/home@360 | QR-TYPE-SCALE | 13px ×10, e.g. span.truncate «Cookware» | ferrite, long-morning |
| template/uhod/home@360 | QR-TYPE-SCALE | 11px ×1, e.g. span.flex «G» | ferrite, long-morning |
| template/uhod/home@360 | QR-TYPE-SCALE | 11→12 = 1.091 | ferrite |
| template/uhod/home@360 | QR-TYPE-SCALE | 12→13 = 1.083 | ferrite |
| template/uhod/home@360 | QR-TYPE-SCALE | 13→14 = 1.077 | ferrite, long-morning |
| template/uhod/home@360 | QR-TYPE-SCALE | 14→16 = 1.143 | ferrite, long-morning |
| template/uhod/home@360 | QR-TYPE-SCALE | 16→18 = 1.125 | ferrite, long-morning |
| template/uhod/home@360 | QR-TYPE-SCALE | 18→20 = 1.111 | ferrite, long-morning |
| template/uhod/home@360 | QR-TYPE-ROLE | section-title: 18, 24px | ferrite, long-morning |
| template/uhod/home@360 | QR-SECTION-RANK | 18px ÷ 20px = 0.9 | ferrite, long-morning |
| template/uhod/home@360 | QR-CASE | a[nav-store-link] «Globex» at 14px, tracking 0em | ferrite, long-morning |
| template/uhod/home@360 | QR-CASE | a.txt-compact-medium-plus «Globex» at 14px, tracking 0em | ferrite, long-morning |
| template/uhod/home@360 | QR-SPACE-SCALE | 6px ×32, e.g. button[wishlist-button] «Add to wishlist» | long-morning |
| template/uhod/home@360 | QR-SPACE-SCALE | 40px ×4, e.g. div.grid «GlobexCategoriesThe kitchenT» | ferrite, long-morning |
| template/uhod/home@360 | QR-SPACE-SCALE | 20px ×1, e.g. div.flex «Globex» | long-morning |
| template/uhod/home@360 | QR-CARD-GRAMMAR | card signature off the canon: card-media>card-title>card-meta>card-price | long-morning |
| template/uhod/home@360 | QR-RADIUS | 8px ×4, e.g. a[category-tile] «Cookware→» | ferrite, long-morning |
| template/uhod/home@360 | QR-RADIUS | 2px ×1, e.g. a.shrink-0 «See all» | long-morning |
| template/uhod/home@360 | QR-RADIUS | 24px ×1, e.g. nav.lg:hidden «G» | ferrite, long-morning |
| template/uhod/home@360 | QR-HIT | 53×20: a[nav-store-link] «Globex» | ferrite, long-morning |
| template/uhod/home@360 | QR-HIT | 20×63: a[nav-cart-link] «Cart (0)» | ferrite, long-morning |
| template/uhod/home@360 | QR-HIT | 32×32: button[wishlist-button] «Add to wishlist» | long-morning |
| template/uhod/home@360 | QR-HIT | 328×20: a.txt-compact-medium-plus «Globex» | ferrite, long-morning |
| template/uhod/home@360 | QR-HIT | 76×19: a.txt-compact-medium «The kitchen» | ferrite, long-morning |
| template/uhod/home@360 | QR-HIT | 68×19: a.txt-compact-medium «The house» | ferrite, long-morning |
| template/uhod/home@360 | QR-HIT | 107×19: a.txt-compact-medium «Made to be used» | ferrite, long-morning |
| template/uhod/home@360 | QR-HIT | 117×19: a.txt-compact-medium «The morning table» | ferrite, long-morning |
| template/uhod/home@360 | QR-HIT | 186×18: a.underline «создание интернет-магазина» | ferrite, long-morning |
| template/uhod/home@360 | QR-HIT | 20×20: button.text-ui-fg-subtle «Categories» | ferrite, long-morning |
| template/uhod/home@360 | QR-HIT | 20×20: button[search-button] «Search» | ferrite, long-morning |
| template/uhod/home@360 | QR-HIT | 20×20: a[bottom-nav-store-link] «G» | ferrite, long-morning |
| template/uhod/home@360 | QR-HIT | 20×20: a «Account» | ferrite, long-morning |
| template/uhod/home@360 | QR-MOTION | 200ms, e.g. transition header.relative | ferrite, long-morning |
| template/uhod/category@360 | QR-TYPE-SCALE | 40px ×1, e.g. h1[category-page-title] «The kitchen» | ferrite, long-morning |
| template/uhod/category@360 | QR-TYPE-SCALE | 13px ×13, e.g. span «Filters» | ferrite, long-morning |
| template/uhod/category@360 | QR-TYPE-SCALE | 11px ×1, e.g. span.flex «G» | ferrite, long-morning |
| template/uhod/category@360 | QR-TYPE-SCALE | 13→14 = 1.077 | ferrite, long-morning |
| template/uhod/category@360 | QR-TYPE-SCALE | 14→16 = 1.143 | ferrite, long-morning |
| template/uhod/category@360 | QR-HEADING-RANK | level skipped h1→h3 | ferrite, long-morning |
| template/uhod/category@360 | QR-CASE | a[nav-store-link] «Globex» at 14px, tracking 0em | ferrite, long-morning |
| template/uhod/category@360 | QR-CASE | a.txt-compact-medium-plus «Globex» at 14px, tracking 0em | ferrite, long-morning |
| template/uhod/category@360 | QR-SPACE-SCALE | 6px ×36, e.g. button[wishlist-button] «Add to wishlist» | ferrite, long-morning |
| template/uhod/category@360 | QR-SPACE-SCALE | 40px ×5, e.g. p[products-end] «You have seen every product» | ferrite, long-morning |
| template/uhod/category@360 | QR-SPACE-SCALE | 20px ×1, e.g. div.flex «Globex» | long-morning |
| template/uhod/category@360 | QR-CARD-GRAMMAR | card signature off the canon: card-media>card-title>card-meta>card-price | ferrite, long-morning |
| template/uhod/category@360 | QR-RADIUS | 8px ×4, e.g. div[category-header-image] | ferrite, long-morning |
| template/uhod/category@360 | QR-RADIUS | 24px ×1, e.g. nav.lg:hidden «G» | ferrite, long-morning |
| template/uhod/category@360 | QR-HIT | 53×20: a[nav-store-link] «Globex» | ferrite, long-morning |
| template/uhod/category@360 | QR-HIT | 20×63: a[nav-cart-link] «Cart (0)» | ferrite, long-morning |
| template/uhod/category@360 | QR-HIT | 66×20: a.hover:text-ui-fg-base «Showcase» | ferrite, long-morning |
| template/uhod/category@360 | QR-HIT | 51×20: a.hover:text-ui-fg-base «Catalog» | ferrite, long-morning |
| template/uhod/category@360 | QR-HIT | 86×36: button[mobile-filters-button] «Filters» | ferrite, long-morning |
| template/uhod/category@360 | QR-HIT | 32×32: button[wishlist-button] «Add to wishlist» | ferrite, long-morning |
| template/uhod/category@360 | QR-HIT | 328×20: a.txt-compact-medium-plus «Globex» | ferrite, long-morning |
| template/uhod/category@360 | QR-HIT | 76×19: a.txt-compact-medium «The kitchen» | ferrite, long-morning |
| template/uhod/category@360 | QR-HIT | 68×19: a.txt-compact-medium «The house» | ferrite, long-morning |
| template/uhod/category@360 | QR-HIT | 107×19: a.txt-compact-medium «Made to be used» | ferrite, long-morning |
| template/uhod/category@360 | QR-HIT | 117×19: a.txt-compact-medium «The morning table» | ferrite, long-morning |
| template/uhod/category@360 | QR-HIT | 186×18: a.underline «создание интернет-магазина» | ferrite, long-morning |
| template/uhod/category@360 | QR-HIT | 20×20: button.text-ui-fg-subtle «Categories» | ferrite, long-morning |
| template/uhod/category@360 | QR-HIT | 20×20: button[search-button] «Search» | ferrite, long-morning |
| template/uhod/category@360 | QR-HIT | 20×20: a[bottom-nav-store-link] «G» | ferrite, long-morning |
| template/uhod/category@360 | QR-HIT | 20×20: a «Account» | ferrite, long-morning |
| template/uhod/category@360 | QR-MOTION | 200ms, e.g. transition header.relative | ferrite, long-morning |
| template/uhod/product@360 | QR-TYPE-SCALE | 13px ×7, e.g. a.shrink-0 «Showcase» | ferrite, long-morning |
| template/uhod/product@360 | QR-TYPE-SCALE | 11px ×1, e.g. span.flex «G» | ferrite, long-morning |
| template/uhod/product@360 | QR-TYPE-SCALE | 11→12 = 1.091 | ferrite, long-morning |
| template/uhod/product@360 | QR-TYPE-SCALE | 12→13 = 1.083 | ferrite, long-morning |
| template/uhod/product@360 | QR-TYPE-SCALE | 13→14 = 1.077 | ferrite, long-morning |
| template/uhod/product@360 | QR-TYPE-SCALE | 14→16 = 1.143 | ferrite, long-morning |
| template/uhod/product@360 | QR-CASE | a[nav-store-link] «Globex» at 14px, tracking 0em | ferrite, long-morning |
| template/uhod/product@360 | QR-CASE | a.txt-compact-medium-plus «Globex» at 14px, tracking 0em | ferrite, long-morning |
| template/uhod/product@360 | QR-SPACE-SCALE | 28px ×1, e.g. div[product-summary-card] «Showcase/Catalog/The kitchen» | ferrite, long-morning |
| template/uhod/product@360 | QR-SPACE-SCALE | 20px ×4, e.g. div[product-summary-card] «Showcase/Catalog/The kitchen» | ferrite, long-morning |
| template/uhod/product@360 | QR-SPACE-SCALE | 14px ×2, e.g. nav[breadcrumb-pill] «Showcase/Catalog/The kitchen» | ferrite, long-morning |
| template/uhod/product@360 | QR-SPACE-SCALE | 6px ×4, e.g. nav[breadcrumb-pill] «Showcase/Catalog/The kitchen» | ferrite, long-morning |
| template/uhod/product@360 | QR-SPACE-SCALE | 10px ×8, e.g. button[add-product-button] «Select variant» | ferrite, long-morning |
| template/uhod/product@360 | QR-SPACE-SCALE | 40px ×4, e.g. div.grid «GlobexCategoriesThe kitchenT» | ferrite, long-morning |
| template/uhod/product@360 | QR-CARD-GRAMMAR | card signature off the canon: card-media>card-price>card-title | ferrite, long-morning |
| template/uhod/product@360 | QR-RADIUS | 16px ×3, e.g. div[product-gallery-card] | ferrite, long-morning |
| template/uhod/product@360 | QR-RADIUS | 8px ×4, e.g. button[option-button] | ferrite, long-morning |
| template/uhod/product@360 | QR-RADIUS | 24px ×1, e.g. nav.lg:hidden «G» | ferrite, long-morning |
| template/uhod/product@360 | QR-ELEVATION | rgba(0, 0, 0, 0.04) 0px 0px 0px 1px, rgba(0, 0, 0, 0.06) 0px 1px 2px -1px, rgba(0, 0, 0, 0.06) 0px 4px 12px -4px \| rgba(0, 0, 0, 0.12) 0px 1px 2px 0px, rgba(0, 0, 0, 0.08) 0px 0px 0px 1px \| rgba(0, 0, 0, 0.06) 0px -4px 16px 0px | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 53×20: a[nav-store-link] «Globex» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 20×63: a[nav-cart-link] «Cart (0)» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 62×20: a.shrink-0 «Showcase» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 47×20: a.shrink-0 «Catalog» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 70×20: a.shrink-0 «The kitchen» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 38×38: button[wishlist-button] «Add to wishlist» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 40×40: button[option-button] | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 143×40: button[option-button] «Small» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 143×40: button[option-button] «Large» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 236×40: button[product-details-opener] «Specifications and descripti» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 294×40: button[add-product-button] «Select variant» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 125×40: button[mobile-actions-button] «Select options» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 125×40: button[mobile-cart-button] «Select variant» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 328×20: a.txt-compact-medium-plus «Globex» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 76×19: a.txt-compact-medium «The kitchen» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 68×19: a.txt-compact-medium «The house» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 107×19: a.txt-compact-medium «Made to be used» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 117×19: a.txt-compact-medium «The morning table» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 186×18: a.underline «создание интернет-магазина» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 20×20: button.text-ui-fg-subtle «Categories» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 20×20: button[search-button] «Search» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 20×20: a[bottom-nav-store-link] «G» | ferrite, long-morning |
| template/uhod/product@360 | QR-HIT | 20×20: a «Account» | ferrite, long-morning |
| template/uhod/product@360 | QR-MOTION | 200ms, e.g. transition header.relative | ferrite, long-morning |
| template/uhod/pages@360 | QR-TYPE-ROLE | home 32px, category 40px, product 24px | ferrite, long-morning |
| template/uhod/pages@360 | QR-TYPE-ROLE | home 18px, product 24px | ferrite, long-morning |
| template/uhod/pages@360 | QR-TYPE-ROLE | home 16px, category 16px, product 14px | ferrite, long-morning |
| template/uhod/pages@360 | QR-CARD-GRAMMAR | home card-media>card-title>card-meta>card-price · product card-media>card-price>card-title | long-morning |
| template/uhod/pages@360 | QR-CARD-GRAMMAR | home card-media>card-title>card-meta>card-price · category card-media>card-title>card-meta>card-price · product card-media>card-price>card-title | ferrite, long-morning |
| template/uhod/pages@360 | QR-CARD-GRAMMAR | home card-media>card-title>card-meta>card-price · category card-media>card-title>card-meta>card-price · product card-media>card-price>card-title | ferrite, long-morning |
| template/uhod/pages@360 | QR-CARD-GRAMMAR | category card-media>card-title>card-meta>card-price · product card-media>card-price>card-title | ferrite, long-morning |
| template/uhod/home@1280 | QR-TYPE-SCALE | 13px ×9, e.g. a[nav-category-link] «The kitchen» | ferrite, long-morning |
| template/uhod/home@1280 | QR-TYPE-SCALE | 12→13 = 1.083 | ferrite, long-morning |
| template/uhod/home@1280 | QR-TYPE-SCALE | 13→14 = 1.077 | ferrite, long-morning |
| template/uhod/home@1280 | QR-TYPE-SCALE | 14→16 = 1.143 | ferrite, long-morning |
| template/uhod/home@1280 | QR-TYPE-SCALE | 16→18 = 1.125 | long-morning |
| template/uhod/home@1280 | QR-TYPE-SCALE | 18→20 = 1.111 | long-morning |
| template/uhod/home@1280 | QR-TYPE-ROLE | section-title: 20, 32px | ferrite, long-morning |
| template/uhod/home@1280 | QR-SECTION-RANK | 20px ÷ 20px = 1 | long-morning |
| template/uhod/home@1280 | QR-CASE | a[nav-store-link] «Globex» at 14px, tracking 0em | ferrite, long-morning |
| template/uhod/home@1280 | QR-CASE | a.txt-compact-medium-plus «Globex» at 14px, tracking 0em | ferrite, long-morning |
| template/uhod/home@1280 | QR-SPACE-SCALE | 6px ×33, e.g. button[nav-country-select-button] «$» | long-morning |
| template/uhod/home@1280 | QR-SPACE-SCALE | 40px ×2, e.g. ul.grid «Hook rail · blackened steel$» | long-morning |
| template/uhod/home@1280 | QR-SPACE-SCALE | 20px ×1, e.g. div.flex «Globex» | ferrite, long-morning |
| template/uhod/home@1280 | QR-IMG-ASPECT | picture without a hard box: img.shrink-0 | long-morning |
| template/uhod/home@1280 | QR-CARD-GRAMMAR | card signature off the canon: card-media>card-title>card-meta>card-price | long-morning |
| template/uhod/home@1280 | QR-RADIUS | 2px ×2, e.g. img.shrink-0 | long-morning |
| template/uhod/home@1280 | QR-RADIUS | 8px ×4, e.g. a[category-tile] «Cookware→» | ferrite, long-morning |
| template/uhod/home@1280 | QR-MOTION | 200ms, e.g. transition header.relative | ferrite, long-morning |
| template/uhod/category@1280 | QR-TYPE-SCALE | 13px ×27, e.g. a[nav-category-link] «The kitchen» | ferrite, long-morning |
| template/uhod/category@1280 | QR-TYPE-SCALE | 40px ×1, e.g. h1[category-page-title] «The kitchen» | ferrite, long-morning |
| template/uhod/category@1280 | QR-TYPE-SCALE | 12→13 = 1.083 | long-morning |
| template/uhod/category@1280 | QR-TYPE-SCALE | 13→14 = 1.077 | ferrite, long-morning |
| template/uhod/category@1280 | QR-TYPE-SCALE | 14→16 = 1.143 | ferrite, long-morning |
| template/uhod/category@1280 | QR-HEADING-RANK | level skipped h1→h3 | ferrite, long-morning |
| template/uhod/category@1280 | QR-CASE | a[nav-store-link] «Globex» at 14px, tracking 0em | ferrite, long-morning |
| template/uhod/category@1280 | QR-CASE | a.txt-compact-medium-plus «Globex» at 14px, tracking 0em | ferrite, long-morning |
| template/uhod/category@1280 | QR-SPACE-SCALE | 6px ×39, e.g. button[nav-country-select-button] «$» | ferrite, long-morning |
| template/uhod/category@1280 | QR-SPACE-SCALE | 20px ×4, e.g. div.hidden «CookwareTablewareKitchen tex» | ferrite, long-morning |
| template/uhod/category@1280 | QR-SPACE-SCALE | 2px ×6, e.g. div.flex «TerracottaSlateClayOat» | ferrite, long-morning |
| template/uhod/category@1280 | QR-SPACE-SCALE | 40px ×3, e.g. ul[products-list] «Table runner · heavy linen$5» | ferrite, long-morning |
| template/uhod/category@1280 | QR-SPACE-SCALE | 0.02px ×6, e.g. div.mt-auto «$57.99» | ferrite, long-morning |
| template/uhod/category@1280 | QR-IMG-ASPECT | picture without a hard box: img.shrink-0 | long-morning |
| template/uhod/category@1280 | QR-CARD-GRAMMAR | card signature off the canon: card-media>card-title>card-meta>card-price | ferrite, long-morning |
| template/uhod/category@1280 | QR-RADIUS | 2px ×1, e.g. img.shrink-0 | long-morning |
| template/uhod/category@1280 | QR-RADIUS | 8px ×4, e.g. div[category-header-image] | ferrite, long-morning |
| template/uhod/category@1280 | QR-RADIUS | 3px ×3, e.g. div.text-ui-fg-on-inverted | ferrite, long-morning |
| template/uhod/category@1280 | QR-RADIUS | 4px ×2, e.g. summary.flex «Colour» | ferrite, long-morning |
| template/uhod/category@1280 | QR-ELEVATION | rgba(0, 0, 0, 0.12) 0px 1px 2px 0px, rgba(0, 0, 0, 0.08) 0px 0px 0px 1px \| rgba(0, 0, 0, 0.04) 0px 0px 0px 1px, rgba(0, 0, 0, 0.06) 0px 1px 2px -1px, rgba(0, 0, 0, 0.06) 0px 4px 12px -4px | long-morning |
| template/uhod/category@1280 | QR-MOTION | 200ms, e.g. transition header.relative | ferrite, long-morning |
| template/uhod/product@1280 | QR-TYPE-SCALE | 13px ×10, e.g. a[nav-category-link] «The kitchen» | ferrite, long-morning |
| template/uhod/product@1280 | QR-TYPE-SCALE | 28px ×2, e.g. h1[product-title] «Cross-back apron · washed li» | ferrite, long-morning |
| template/uhod/product@1280 | QR-TYPE-SCALE | 12→13 = 1.083 | ferrite, long-morning |
| template/uhod/product@1280 | QR-TYPE-SCALE | 13→14 = 1.077 | ferrite, long-morning |
| template/uhod/product@1280 | QR-TYPE-SCALE | 14→16 = 1.143 | ferrite, long-morning |
| template/uhod/product@1280 | QR-CASE | a[nav-store-link] «Globex» at 14px, tracking 0em | ferrite, long-morning |
| template/uhod/product@1280 | QR-CASE | a.txt-compact-medium-plus «Globex» at 14px, tracking 0em | ferrite, long-morning |
| template/uhod/product@1280 | QR-SPACE-SCALE | 6px ×3, e.g. button[nav-country-select-button] «$» | ferrite, long-morning |
| template/uhod/product@1280 | QR-SPACE-SCALE | 40px ×2, e.g. div[product-container] «Showcase/Catalog/The kitchen» | ferrite, long-morning |
| template/uhod/product@1280 | QR-SPACE-SCALE | 36px ×1, e.g. div[product-summary-card] «Showcase/Catalog/The kitchen» | ferrite, long-morning |
| template/uhod/product@1280 | QR-SPACE-SCALE | 20px ×7, e.g. div[product-summary-card] «Showcase/Catalog/The kitchen» | ferrite, long-morning |
| template/uhod/product@1280 | QR-SPACE-SCALE | 14px ×2, e.g. nav[breadcrumb-pill] «Showcase/Catalog/The kitchen» | ferrite, long-morning |
| template/uhod/product@1280 | QR-SPACE-SCALE | 10px ×2, e.g. button[add-product-button] «Select variant» | ferrite, long-morning |
| template/uhod/product@1280 | QR-IMG-ASPECT | picture without a hard box: img.shrink-0 | long-morning |
| template/uhod/product@1280 | QR-CARD-GRAMMAR | card signature off the canon: card-media>card-price>card-title | ferrite, long-morning |
| template/uhod/product@1280 | QR-RADIUS | 2px ×1, e.g. img.shrink-0 | long-morning |
| template/uhod/product@1280 | QR-RADIUS | 16px ×3, e.g. div[product-gallery-card] | ferrite, long-morning |
| template/uhod/product@1280 | QR-RADIUS | 8px ×4, e.g. button[option-button] | ferrite, long-morning |
| template/uhod/product@1280 | QR-ELEVATION | rgba(0, 0, 0, 0.04) 0px 0px 0px 1px, rgba(0, 0, 0, 0.06) 0px 1px 2px -1px, rgba(0, 0, 0, 0.06) 0px 4px 12px -4px \| rgba(0, 0, 0, 0.12) 0px 1px 2px 0px, rgba(0, 0, 0, 0.08) 0px 0px 0px 1px | long-morning |
| template/uhod/product@1280 | QR-MOTION | 200ms, e.g. transition header.relative | ferrite, long-morning |
| template/uhod/pages@1280 | QR-TYPE-ROLE | home 48px, category 40px, product 28px | ferrite, long-morning |
| template/uhod/pages@1280 | QR-TYPE-ROLE | home 20px, product 28px | ferrite, long-morning |
| template/uhod/pages@1280 | QR-TYPE-ROLE | home 16px, category 16px, product 14px | ferrite, long-morning |
| template/uhod/pages@1280 | QR-CARD-GRAMMAR | home card-media>card-title>card-meta>card-price · product card-media>card-price>card-title | long-morning |
| template/uhod/pages@1280 | QR-CARD-GRAMMAR | home card-media>card-title>card-meta>card-price · category card-media>card-title>card-meta>card-price · product card-media>card-price>card-title | ferrite, long-morning |
| template/uhod/pages@1280 | QR-CARD-GRAMMAR | home card-media>card-title>card-meta>card-price · category card-media>card-title>card-meta>card-price · product card-media>card-price>card-title | ferrite, long-morning |
| template/uhod/pages@1280 | QR-CARD-GRAMMAR | category card-media>card-title>card-meta>card-price · product card-media>card-price>card-title | ferrite, long-morning |

## Targets

| Target | Gate rules failed (new / inherited / baseline) | Report rules out of range |
|---|---|---|
| template/uhod/home@360 | QR-TYPE-SCALE (1/8/0), QR-TYPE-ROLE (0/1/0), QR-SECTION-RANK (0/1/0), QR-CASE (0/2/0), QR-SPACE-SCALE (0/3/0), QR-CARD-GRAMMAR (0/1/0), QR-RADIUS (0/3/0), QR-HIT (1/13/0), QR-MOTION (0/1/0) | QR-SECTION-RHYTHM ok [] |
| template/uhod/category@360 | QR-TYPE-SCALE (0/5/0), QR-HEADING-RANK (0/1/0), QR-CASE (0/2/0), QR-SPACE-SCALE (0/3/0), QR-CARD-GRAMMAR (0/1/0), QR-RADIUS (0/2/0), QR-HIT (0/16/0), QR-MOTION (0/1/0) | QR-SECTION-RHYTHM ok [32] |
| template/uhod/product@360 | QR-TYPE-SCALE (0/6/0), QR-CASE (0/2/0), QR-SPACE-SCALE (0/6/0), QR-CARD-GRAMMAR (0/1/0), QR-RADIUS (0/3/0), QR-ELEVATION (0/1/0), QR-HIT (0/23/0), QR-MOTION (0/1/0) | QR-SECTION-RHYTHM ok [] |
| template/uhod/pages@360 | QR-TYPE-ROLE (0/3/0), QR-CARD-GRAMMAR (0/4/0) | – |
| template/uhod/home@1280 | QR-TYPE-SCALE (1/6/0), QR-TYPE-ROLE (0/1/0), QR-SECTION-RANK (0/1/0), QR-CASE (0/2/0), QR-SPACE-SCALE (0/3/0), QR-IMG-ASPECT (0/1/0), QR-CARD-GRAMMAR (0/1/0), QR-RADIUS (0/2/0), QR-MOTION (0/1/0) | QR-SECTION-RHYTHM ok []; QR-DENSITY ok 19; QR-TECTONICS out {"footer":"rgb(253, 251, 250)","page":"rgb(253, 251, 250)"} |
| template/uhod/category@1280 | QR-TYPE-SCALE (0/5/0), QR-HEADING-RANK (0/1/0), QR-CASE (0/2/0), QR-SPACE-SCALE (0/5/0), QR-IMG-ASPECT (0/1/0), QR-CARD-GRAMMAR (0/1/0), QR-RADIUS (0/4/0), QR-ELEVATION (0/1/0), QR-MOTION (0/1/0) | QR-SECTION-RHYTHM ok [32]; QR-DENSITY ok 16; QR-TECTONICS out {"footer":"rgb(253, 251, 250)","page":"rgb(253, 251, 250)"} |
| template/uhod/product@1280 | QR-TYPE-SCALE (0/5/0), QR-CASE (0/2/0), QR-SPACE-SCALE (0/6/0), QR-IMG-ASPECT (0/1/0), QR-CARD-GRAMMAR (0/1/0), QR-RADIUS (0/3/0), QR-ELEVATION (0/1/0), QR-MOTION (0/1/0) | QR-SECTION-RHYTHM ok []; QR-DENSITY ok 23; QR-TECTONICS out {"footer":"rgb(253, 251, 250)","page":"rgb(253, 251, 250)"} |
| template/uhod/pages@1280 | QR-TYPE-ROLE (0/3/0), QR-CARD-GRAMMAR (0/4/0) | – |

Per target and per rule, pass or fail with the measured value and every failure: `report.json`.
