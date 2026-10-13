# template:check — 2026-10-13

**Итог: PASS.** Проверено целей: 6 (шаблоны × страницы, блоки площадки, ширины 360 и 1280 px). Новых отказов gate: **0**; унаследованных (известный долг общих частей витрины на страницах шаблона и в блоках): 13; отказов из базы (известный долг существующих вариантов): 0; report-правил вне порога: 0.
Что делать: ничего, новых отказов нет. Отказы из базы — долг существующих вариантов композиции, он виден в report.json.
Унаследованные не валят прогон: база держит тот же отказ (правило и замер) на той же странице и ширине другого шаблона, его дают общие части витрины, а не этот шаблон; в блоке — отказ, которого нет, когда элементы внутри переиспользованной части витрины (колонка «Shared part») не замеряются, и который база держит для блока той же ширины. Всё остальное блок отвечает сам. Они перечислены отдельной таблицей ниже.

Commit 94583d91 · http://localhost:8152 as globex.shipshift.dev · locale en · --only collage/mosaic · baseline 737 keys · exit 0

## Rules

| Rule | Kind | Threshold | Checked | Pass | Fail | New gate failures | Inherited failures | Baseline failures |
|---|---|---|---|---|---|---|---|---|
| QR-TYPE-SCALE | gate | every size on the declared type scale; neighbours ≥ 1.15×; ≤ 8 sizes | 6 | 4 | 2 | 0 | 6 | 0 |
| QR-TYPE-ROLE | gate | one role, one size on a page and across a template's pages | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-HEADING-RANK | gate | one h1 per page; no level skipped; size never grows with the level | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-SECTION-RANK | gate | section title ÷ body ≥ 1.5 | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-WEIGHT | gate | font-weight ≤ 600 | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-CASE | gate | capitals only at ≤ 12px with tracking ≥ 0.06em | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-MEASURE | gate | 45 ≤ characters per line ≤ 90 (45 for prose only) | 3 | 3 | 0 | 0 | 0 | 0 |
| QR-COLUMN-RANK | gate | the longest text (> 200 chars) sits in a column ≥ 480px | 3 | 3 | 0 | 0 | 0 | 0 |
| QR-SPACE-SCALE | gate | padding, margin and gap on 4·8·12·16·24·32·48·64·96·128 | 6 | 4 | 2 | 0 | 2 | 0 |
| QR-SECTION-RHYTHM | report | ≤ 2 distinct gaps between bands | 0 | 0 | 0 | 0 | 0 | 0 |
| QR-GRID-AXES | gate | every content container on one left edge | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-DENSITY | report | 12 ≤ text elements above the fold ≤ 32 | 0 | 0 | 0 | 0 | 0 | 0 |
| QR-IMG-ASPECT | gate | every picture in a hard box; one ratio per role, on a page and across pages; nothing drawn 0×0 | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-IMG-FRAME | gate | card pictures on one surface, with one fit | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-CARD-SURFACE | gate | a product card has a background, a border or a rounded picture | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-GALLERY | gate | one main frame; thumbnail ratio = frame ratio (±0.01); product page ≤ 6000px at 1280 | 0 | 0 | 0 | 0 | 0 | 0 |
| QR-ALT | gate | product pictures carry a real alt; no image lacks the attribute; no «Product image 1» | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-EMPTY | gate | the no-photo placeholder sits in the frame's own ratio box; an empty block draws nothing | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-CARD-GRAMMAR | gate | card roles in canon order; the same product has one card signature on every page | 6 | 4 | 2 | 0 | 2 | 0 |
| QR-PRICE | gate | tabular-nums; no «,00»; no-break space before ₽; card price differs from the title in weight or size | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-RADIUS | gate | radii only 6 · --radius · 12 · pill; one radius per component role across pages | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-ELEVATION | gate | ≤ 1 shadow recipe | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-CONTROL-DENSITY | gate | ≤ 4 icon-only controls in one header row | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-TECTONICS | report | the footer's surface differs from the page | 0 | 0 | 0 | 0 | 0 | 0 |
| QR-OCCLUSION | gate | titles, prices and buttons are on top at their own point | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-JS | gate | 0 page errors | 0 | 0 | 0 | 0 | 0 | 0 |
| QR-CONTRAST | gate | 0 axe color-contrast violations (AA) | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-OVERFLOW | gate | 0px horizontal overflow | 3 | 3 | 0 | 0 | 0 | 0 |
| QR-HIT | gate | every target ≥ 44px high; icon-only ≥ 44px wide; inline links exempt | 3 | 2 | 1 | 0 | 1 | 0 |
| QR-FOCUS | gate | a visible focus ring, distinct from rest, on every target | 6 | 6 | 0 | 0 | 0 | 0 |
| QR-MOTION | gate | durations ≤ 240ms; under prefers-reduced-motion ≤ 10ms | 6 | 4 | 2 | 0 | 2 | 0 |

Not ported from the lab: QR-PROSE (checks the text of the lab's own template files; on the storefront the long text is the shop's catalogue, not the template); QR-TOKENS (a source check of literal values in block CSS; `pnpm lint:blocks` does it on src/modules/blocks); QR-TOKEN-COVERAGE (scale tokens a lab template overrode; a manifest here names closed layers only, held by validateTemplate()).

## New gate failures

None.

## Inherited gate failures

| Target | Rule | Measured | Shared part | Baseline holds it for |
|---|---|---|---|---|
| block/collage/mosaic@360 | QR-TYPE-SCALE | 13px ×1, e.g. span[product-unit] «Medium · Large» | ProductCard | footer/f1, footer/f2, footer/f3, footer/f4, footer/f5, footer/f6, footer/f7, header/h5, header/h6, listing/p1, listing/p2, listing/p3, listing/p4, listing/p5, tiles/on, ProductCard |
| block/collage/mosaic@360 | QR-TYPE-SCALE | 13→14 = 1.077 | ProductCard | footer/f1, footer/f2, footer/f3, footer/f4, footer/f5, footer/f6, footer/f7, header/h5, header/h6, listing/p1, listing/p2, listing/p3, listing/p4, listing/p5, ProductCard |
| block/collage/mosaic@360 | QR-TYPE-SCALE | 14→16 = 1.143 | ProductCard | hero/k, hero/l, listing/p1, listing/p2, listing/p3, listing/p4, listing/p5, ProductCard |
| block/collage/mosaic@360 | QR-SPACE-SCALE | 6px ×4, e.g. button[wishlist-button] «Add to wishlist» | ProductCard | header/h1, header/h5, header/h6, hero/m, listing/p1, listing/p2, listing/p4, listing/p5, ProductCard |
| block/collage/mosaic@360 | QR-CARD-GRAMMAR | card signature off the canon: card-media>card-title>card-meta>card-price | ProductCard | listing/p1, listing/p2, listing/p4, listing/p5, ProductCard |
| block/collage/mosaic@360 | QR-HIT | 32×32: button[wishlist-button] «Add to wishlist» | ProductCard | listing/p1, listing/p2, listing/p4, listing/p5, ProductCard |
| block/collage/mosaic@360 | QR-MOTION | 150ms, e.g. transition button.absolute | ProductCard | footer/f1, footer/f2, footer/f3, footer/f4, footer/f5, footer/f6, footer/f7, header/h1, header/h2, header/h3, header/h4, header/h5, header/h6, hero/g, hero/h, hero/k, hero/l, listing/p1, listing/p2, listing/p3, listing/p4, listing/p5, tiles/on, ProductCard |
| block/collage/mosaic@1280 | QR-TYPE-SCALE | 13px ×1, e.g. span[product-unit] «Medium · Large» | ProductCard | footer/f1, footer/f2, footer/f3, footer/f4, footer/f5, footer/f6, footer/f7, header/h2, header/h3, header/h4, header/h5, header/h6, listing/p1, listing/p2, listing/p3, listing/p4, listing/p5, ProductCard |
| block/collage/mosaic@1280 | QR-TYPE-SCALE | 13→14 = 1.077 | ProductCard | footer/f1, footer/f2, footer/f3, footer/f4, footer/f5, footer/f6, footer/f7, header/h2, header/h3, header/h4, header/h5, header/h6, listing/p1, listing/p2, listing/p3, listing/p4, listing/p5, ProductCard |
| block/collage/mosaic@1280 | QR-TYPE-SCALE | 14→16 = 1.143 | ProductCard | hero/g, listing/p1, listing/p2, listing/p3, listing/p4, listing/p5, ProductCard |
| block/collage/mosaic@1280 | QR-SPACE-SCALE | 6px ×4, e.g. button[wishlist-button] «Add to wishlist» | ProductCard | header/h1, header/h2, header/h4, header/h5, header/h6, listing/p1, listing/p2, listing/p4, listing/p5, ProductCard |
| block/collage/mosaic@1280 | QR-CARD-GRAMMAR | card signature off the canon: card-media>card-title>card-meta>card-price | ProductCard | listing/p1, listing/p2, listing/p4, listing/p5, ProductCard |
| block/collage/mosaic@1280 | QR-MOTION | 150ms, e.g. transition button.absolute | ProductCard | footer/f1, footer/f2, footer/f3, footer/f4, footer/f5, footer/f6, footer/f7, header/h1, header/h2, header/h3, header/h4, header/h5, header/h6, hero/g, hero/h, hero/k, hero/l, listing/p1, listing/p2, listing/p3, listing/p4, listing/p5, tiles/on, ProductCard |

## Stale baseline keys

None.

## Targets

| Target | Gate rules failed (new / inherited / baseline) | Report rules out of range |
|---|---|---|
| block/collage/mosaic@360 | QR-TYPE-SCALE (0/3/0), QR-SPACE-SCALE (0/1/0), QR-CARD-GRAMMAR (0/1/0), QR-HIT (0/1/0), QR-MOTION (0/1/0) | – |
| block/collage/mosaic:empty@360 | none | – |
| block/collage/mosaic:five@360 | none | – |
| block/collage/mosaic@1280 | QR-TYPE-SCALE (0/3/0), QR-SPACE-SCALE (0/1/0), QR-CARD-GRAMMAR (0/1/0), QR-MOTION (0/1/0) | – |
| block/collage/mosaic:empty@1280 | none | – |
| block/collage/mosaic:five@1280 | none | – |

Per target and per rule, pass or fail with the measured value and every failure: `report.json`.
