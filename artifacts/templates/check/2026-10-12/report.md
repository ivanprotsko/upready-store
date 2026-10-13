# template:check — 2026-10-12

**Итог: PASS.** Проверено целей: 78 (шаблоны × страницы, блоки площадки, ширины 360 и 1280 px). Новых отказов gate: **0**; отказов из базы (известный долг существующих вариантов): 745; report-правил вне порога: 6.
Что делать: ничего, новых отказов нет. Отказы из базы — долг существующих вариантов композиции, он виден в report.json.

Commit 70d91198 · http://localhost:8130 as globex.shipshift.dev · locale en · baseline 745 keys · exit 0

## Rules

| Rule | Kind | Threshold | Checked | Pass | Fail | New gate failures | Baseline failures |
|---|---|---|---|---|---|---|---|
| QR-TYPE-SCALE | gate | every size on the declared type scale; neighbours ≥ 1.15×; ≤ 8 sizes | 72 | 21 | 51 | 0 | 170 |
| QR-TYPE-ROLE | gate | one role, one size on a page and across a template's pages | 76 | 68 | 8 | 0 | 16 |
| QR-HEADING-RANK | gate | one h1 per page; no level skipped; size never grows with the level | 72 | 64 | 8 | 0 | 8 |
| QR-SECTION-RANK | gate | section title ÷ body ≥ 1.5 | 72 | 67 | 5 | 0 | 5 |
| QR-WEIGHT | gate | font-weight ≤ 600 | 72 | 72 | 0 | 0 | 0 |
| QR-CASE | gate | capitals only at ≤ 12px with tracking ≥ 0.06em | 72 | 35 | 37 | 0 | 51 |
| QR-MEASURE | gate | 45 ≤ characters per line ≤ 90 (45 for prose only) | 36 | 36 | 0 | 0 | 0 |
| QR-COLUMN-RANK | gate | the longest text (> 200 chars) sits in a column ≥ 480px | 36 | 36 | 0 | 0 | 0 |
| QR-SPACE-SCALE | gate | padding, margin and gap on 4·8·12·16·24·32·48·64·96·128 | 72 | 19 | 53 | 0 | 143 |
| QR-SECTION-RHYTHM | report | ≤ 2 distinct gaps between bands | 12 | 12 | 0 | 0 | 0 |
| QR-GRID-AXES | gate | every content container on one left edge | 72 | 72 | 0 | 0 | 0 |
| QR-DENSITY | report | 12 ≤ text elements above the fold ≤ 32 | 6 | 6 | 0 | 0 | 0 |
| QR-IMG-ASPECT | gate | every picture in a hard box; one ratio per role, on a page and across pages; nothing drawn 0×0 | 76 | 66 | 10 | 0 | 10 |
| QR-IMG-FRAME | gate | card pictures on one surface, with one fit | 72 | 72 | 0 | 0 | 0 |
| QR-CARD-SURFACE | gate | a product card has a background, a border or a rounded picture | 72 | 72 | 0 | 0 | 0 |
| QR-GALLERY | gate | one main frame; thumbnail ratio = frame ratio (±0.01); product page ≤ 6000px at 1280 | 12 | 12 | 0 | 0 | 0 |
| QR-ALT | gate | product pictures carry a real alt; no image lacks the attribute; no «Product image 1» | 72 | 72 | 0 | 0 | 0 |
| QR-EMPTY | gate | the no-photo placeholder sits in the frame's own ratio box; an empty block draws nothing | 72 | 72 | 0 | 0 | 0 |
| QR-CARD-GRAMMAR | gate | card roles in canon order; the same product has one card signature on every page | 76 | 54 | 22 | 0 | 32 |
| QR-PRICE | gate | tabular-nums; no «,00»; no-break space before ₽; card price differs from the title in weight or size | 72 | 72 | 0 | 0 | 0 |
| QR-RADIUS | gate | radii only 6 · --radius · 12 · pill; one radius per component role across pages | 76 | 43 | 33 | 0 | 51 |
| QR-ELEVATION | gate | ≤ 1 shadow recipe | 72 | 68 | 4 | 0 | 4 |
| QR-CONTROL-DENSITY | gate | ≤ 4 icon-only controls in one header row | 72 | 64 | 8 | 0 | 8 |
| QR-TECTONICS | report | the footer's surface differs from the page | 6 | 0 | 6 | 0 | 0 |
| QR-OCCLUSION | gate | titles, prices and buttons are on top at their own point | 72 | 72 | 0 | 0 | 0 |
| QR-JS | gate | 0 page errors | 14 | 14 | 0 | 0 | 0 |
| QR-CONTRAST | gate | 0 axe color-contrast violations (AA) | 72 | 71 | 1 | 0 | 1 |
| QR-OVERFLOW | gate | 0px horizontal overflow | 36 | 36 | 0 | 0 | 0 |
| QR-HIT | gate | every target ≥ 44px high; icon-only ≥ 44px wide; inline links exempt | 36 | 9 | 27 | 0 | 188 |
| QR-FOCUS | gate | a visible focus ring, distinct from rest, on every target | 72 | 72 | 0 | 0 | 0 |
| QR-MOTION | gate | durations ≤ 240ms; under prefers-reduced-motion ≤ 10ms | 72 | 14 | 58 | 0 | 58 |

Not ported from the lab: QR-PROSE (checks the text of the lab's own template files; on the storefront the long text is the shop's catalogue, not the template); QR-TOKENS (a source check of literal values in block CSS; `pnpm lint:blocks` does it on src/modules/blocks); QR-TOKEN-COVERAGE (scale tokens a lab template overrode; a manifest here names closed layers only, held by validateTemplate()).

## New gate failures

None.

## Targets

| Target | Gate rules failed (new / baseline) | Report rules out of range |
|---|---|---|
| template/long-morning/home@360 | QR-TYPE-SCALE (0/7), QR-TYPE-ROLE (0/1), QR-HEADING-RANK (0/1), QR-SECTION-RANK (0/1), QR-CASE (0/2), QR-SPACE-SCALE (0/4), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/3), QR-HIT (0/16), QR-MOTION (0/1) | QR-SECTION-RHYTHM ok [] |
| template/long-morning/category@360 | QR-TYPE-SCALE (0/5), QR-HEADING-RANK (0/1), QR-CASE (0/2), QR-SPACE-SCALE (0/3), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/2), QR-HIT (0/17), QR-MOTION (0/1) | QR-SECTION-RHYTHM ok [32] |
| template/long-morning/product@360 | QR-TYPE-SCALE (0/6), QR-CASE (0/2), QR-SPACE-SCALE (0/6), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/3), QR-ELEVATION (0/1), QR-HIT (0/24), QR-MOTION (0/1) | QR-SECTION-RHYTHM ok [] |
| template/long-morning/pages@360 | QR-TYPE-ROLE (0/3), QR-CARD-GRAMMAR (0/4) | – |
| template/ferrite/home@360 | QR-TYPE-SCALE (0/9), QR-TYPE-ROLE (0/1), QR-HEADING-RANK (0/1), QR-SECTION-RANK (0/1), QR-CASE (0/3), QR-SPACE-SCALE (0/1), QR-RADIUS (0/2), QR-HIT (0/16), QR-MOTION (0/1) | QR-SECTION-RHYTHM ok [] |
| template/ferrite/category@360 | QR-TYPE-SCALE (0/5), QR-HEADING-RANK (0/1), QR-CASE (0/2), QR-SPACE-SCALE (0/2), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/2), QR-HIT (0/17), QR-MOTION (0/1) | QR-SECTION-RHYTHM ok [32] |
| template/ferrite/product@360 | QR-TYPE-SCALE (0/6), QR-CASE (0/2), QR-SPACE-SCALE (0/6), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/3), QR-ELEVATION (0/1), QR-HIT (0/24), QR-MOTION (0/1) | QR-SECTION-RHYTHM ok [] |
| template/ferrite/pages@360 | QR-TYPE-ROLE (0/3), QR-CARD-GRAMMAR (0/3) | – |
| playground@360 | none | – |
| block/shared/block-section@360 | QR-TYPE-SCALE (0/1), QR-SECTION-RANK (0/1), QR-RADIUS (0/1), QR-HIT (0/1) | – |
| block/header/h1@360 | QR-SPACE-SCALE (0/1), QR-IMG-ASPECT (0/1), QR-RADIUS (0/1), QR-HIT (0/3), QR-MOTION (0/1) | – |
| block/header/h2@360 | QR-CASE (0/1), QR-HIT (0/2), QR-MOTION (0/1) | – |
| block/header/h3@360 | QR-CASE (0/1), QR-HIT (0/2), QR-MOTION (0/1) | – |
| block/header/h4@360 | QR-CASE (0/1), QR-HIT (0/2), QR-MOTION (0/1) | – |
| block/header/h5@360 | QR-TYPE-SCALE (0/3), QR-CASE (0/1), QR-SPACE-SCALE (0/3), QR-IMG-ASPECT (0/1), QR-RADIUS (0/1), QR-HIT (0/7), QR-MOTION (0/1) | – |
| block/header/h6@360 | QR-TYPE-SCALE (0/2), QR-CASE (0/1), QR-SPACE-SCALE (0/3), QR-HIT (0/6), QR-MOTION (0/1) | – |
| block/hero/g@360 | QR-TYPE-SCALE (0/1), QR-CASE (0/1), QR-SPACE-SCALE (0/1), QR-HIT (0/2), QR-MOTION (0/1) | – |
| block/hero/h@360 | QR-TYPE-SCALE (0/1), QR-MOTION (0/1) | – |
| block/hero/j@360 | none | – |
| block/hero/k@360 | QR-TYPE-SCALE (0/2), QR-SPACE-SCALE (0/2), QR-MOTION (0/1) | – |
| block/hero/l@360 | QR-TYPE-SCALE (0/2), QR-SPACE-SCALE (0/2), QR-MOTION (0/1) | – |
| block/hero/m@360 | QR-SPACE-SCALE (0/1) | – |
| block/hero/ga@360 | none | – |
| block/hero/gb@360 | none | – |
| block/tiles/on@360 | QR-TYPE-SCALE (0/1), QR-RADIUS (0/1), QR-MOTION (0/1) | – |
| block/listing/p1@360 | QR-TYPE-SCALE (0/3), QR-SPACE-SCALE (0/2), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/1), QR-HIT (0/2), QR-MOTION (0/1) | – |
| block/listing/p2@360 | QR-TYPE-SCALE (0/3), QR-SPACE-SCALE (0/2), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/1), QR-HIT (0/2), QR-MOTION (0/1) | – |
| block/listing/p3@360 | QR-TYPE-SCALE (0/3), QR-SPACE-SCALE (0/1), QR-RADIUS (0/1), QR-CONTROL-DENSITY (0/1), QR-HIT (0/2), QR-MOTION (0/1) | – |
| block/listing/p4@360 | QR-TYPE-SCALE (0/3), QR-SPACE-SCALE (0/2), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/1), QR-HIT (0/2), QR-MOTION (0/1) | – |
| block/listing/p5@360 | QR-TYPE-SCALE (0/5), QR-SECTION-RANK (0/1), QR-SPACE-SCALE (0/2), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/1), QR-HIT (0/3), QR-MOTION (0/1) | – |
| block/footer/f1@360 | QR-TYPE-SCALE (0/2), QR-CASE (0/1), QR-SPACE-SCALE (0/2), QR-HIT (0/6), QR-MOTION (0/1) | – |
| block/footer/f2@360 | QR-TYPE-SCALE (0/2), QR-CASE (0/1), QR-SPACE-SCALE (0/2), QR-HIT (0/6), QR-MOTION (0/1) | – |
| block/footer/f3@360 | QR-TYPE-SCALE (0/3), QR-CASE (0/1), QR-SPACE-SCALE (0/3), QR-HIT (0/5), QR-MOTION (0/1) | – |
| block/footer/f4@360 | QR-TYPE-SCALE (0/2), QR-CASE (0/1), QR-SPACE-SCALE (0/2), QR-HIT (0/6), QR-MOTION (0/1) | – |
| block/footer/f5@360 | QR-TYPE-SCALE (0/2), QR-CASE (0/1), QR-SPACE-SCALE (0/1), QR-HIT (0/6), QR-MOTION (0/1) | – |
| block/footer/f6@360 | QR-TYPE-SCALE (0/3), QR-CASE (0/1), QR-SPACE-SCALE (0/3), QR-HIT (0/5), QR-MOTION (0/1) | – |
| block/footer/f7@360 | QR-TYPE-SCALE (0/3), QR-SPACE-SCALE (0/2), QR-HIT (0/3), QR-MOTION (0/1) | – |
| block/announcement/text-bar@360 | QR-HIT (0/1) | – |
| block/announcement/text-bar:empty@360 | none | – |
| template/long-morning/home@1280 | QR-TYPE-SCALE (0/6), QR-TYPE-ROLE (0/1), QR-HEADING-RANK (0/1), QR-SECTION-RANK (0/1), QR-CASE (0/2), QR-SPACE-SCALE (0/6), QR-IMG-ASPECT (0/1), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/2), QR-MOTION (0/1) | QR-SECTION-RHYTHM ok []; QR-DENSITY ok 12; QR-TECTONICS out {"footer":"rgb(253, 251, 247)","page":"rgb(253, 251, 247)"} |
| template/long-morning/category@1280 | QR-TYPE-SCALE (0/5), QR-HEADING-RANK (0/1), QR-CASE (0/2), QR-SPACE-SCALE (0/5), QR-IMG-ASPECT (0/1), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/4), QR-ELEVATION (0/1), QR-MOTION (0/1) | QR-SECTION-RHYTHM ok [32]; QR-DENSITY ok 16; QR-TECTONICS out {"footer":"rgb(253, 251, 247)","page":"rgb(253, 251, 247)"} |
| template/long-morning/product@1280 | QR-TYPE-SCALE (0/5), QR-CASE (0/2), QR-SPACE-SCALE (0/6), QR-IMG-ASPECT (0/1), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/3), QR-ELEVATION (0/1), QR-MOTION (0/1) | QR-SECTION-RHYTHM ok []; QR-DENSITY ok 23; QR-TECTONICS out {"footer":"rgb(253, 251, 247)","page":"rgb(253, 251, 247)"} |
| template/long-morning/pages@1280 | QR-TYPE-ROLE (0/3), QR-CARD-GRAMMAR (0/4) | – |
| template/ferrite/home@1280 | QR-TYPE-SCALE (0/7), QR-TYPE-ROLE (0/1), QR-HEADING-RANK (0/1), QR-CASE (0/3), QR-SPACE-SCALE (0/5), QR-RADIUS (0/1), QR-MOTION (0/1) | QR-SECTION-RHYTHM ok []; QR-DENSITY ok 18; QR-TECTONICS out {"footer":"rgb(13, 16, 19)","page":"rgb(13, 16, 19)"} |
| template/ferrite/category@1280 | QR-TYPE-SCALE (0/4), QR-HEADING-RANK (0/1), QR-CASE (0/2), QR-SPACE-SCALE (0/6), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/3), QR-MOTION (0/1) | QR-SECTION-RHYTHM ok [32]; QR-DENSITY ok 14; QR-TECTONICS out {"footer":"rgb(13, 16, 19)","page":"rgb(13, 16, 19)"} |
| template/ferrite/product@1280 | QR-TYPE-SCALE (0/5), QR-CASE (0/2), QR-SPACE-SCALE (0/7), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/2), QR-MOTION (0/1) | QR-SECTION-RHYTHM ok []; QR-DENSITY ok 21; QR-TECTONICS out {"footer":"rgb(13, 16, 19)","page":"rgb(13, 16, 19)"} |
| template/ferrite/pages@1280 | QR-TYPE-ROLE (0/3), QR-CARD-GRAMMAR (0/3) | – |
| playground@1280 | none | – |
| block/shared/block-section@1280 | QR-TYPE-SCALE (0/1), QR-RADIUS (0/1) | – |
| block/header/h1@1280 | QR-CASE (0/1), QR-SPACE-SCALE (0/1), QR-IMG-ASPECT (0/1), QR-RADIUS (0/1), QR-CONTROL-DENSITY (0/1), QR-MOTION (0/1) | – |
| block/header/h2@1280 | QR-TYPE-SCALE (0/3), QR-CASE (0/1), QR-SPACE-SCALE (0/1), QR-IMG-ASPECT (0/1), QR-RADIUS (0/1), QR-CONTROL-DENSITY (0/1), QR-MOTION (0/1) | – |
| block/header/h3@1280 | QR-TYPE-SCALE (0/2), QR-CASE (0/1), QR-CONTROL-DENSITY (0/1), QR-MOTION (0/1) | – |
| block/header/h4@1280 | QR-TYPE-SCALE (0/3), QR-CASE (0/1), QR-SPACE-SCALE (0/1), QR-IMG-ASPECT (0/1), QR-RADIUS (0/1), QR-CONTROL-DENSITY (0/1), QR-CONTRAST (0/1), QR-MOTION (0/1) | – |
| block/header/h5@1280 | QR-TYPE-SCALE (0/3), QR-CASE (0/1), QR-SPACE-SCALE (0/3), QR-IMG-ASPECT (0/1), QR-RADIUS (0/1), QR-CONTROL-DENSITY (0/1), QR-MOTION (0/1) | – |
| block/header/h6@1280 | QR-TYPE-SCALE (0/3), QR-CASE (0/1), QR-SPACE-SCALE (0/3), QR-IMG-ASPECT (0/1), QR-RADIUS (0/1), QR-CONTROL-DENSITY (0/1), QR-MOTION (0/1) | – |
| block/hero/g@1280 | QR-TYPE-SCALE (0/2), QR-CASE (0/1), QR-SPACE-SCALE (0/1), QR-MOTION (0/1) | – |
| block/hero/h@1280 | QR-SPACE-SCALE (0/2), QR-MOTION (0/1) | – |
| block/hero/j@1280 | none | – |
| block/hero/k@1280 | QR-SPACE-SCALE (0/1), QR-MOTION (0/1) | – |
| block/hero/l@1280 | QR-SPACE-SCALE (0/1), QR-MOTION (0/1) | – |
| block/hero/m@1280 | QR-SPACE-SCALE (0/1) | – |
| block/hero/ga@1280 | none | – |
| block/hero/gb@1280 | none | – |
| block/tiles/on@1280 | QR-RADIUS (0/1), QR-MOTION (0/1) | – |
| block/listing/p1@1280 | QR-TYPE-SCALE (0/3), QR-SPACE-SCALE (0/4), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/1), QR-MOTION (0/1) | – |
| block/listing/p2@1280 | QR-TYPE-SCALE (0/3), QR-SPACE-SCALE (0/4), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/1), QR-MOTION (0/1) | – |
| block/listing/p3@1280 | QR-TYPE-SCALE (0/6), QR-SPACE-SCALE (0/4), QR-RADIUS (0/1), QR-CONTROL-DENSITY (0/1), QR-MOTION (0/1) | – |
| block/listing/p4@1280 | QR-TYPE-SCALE (0/3), QR-SPACE-SCALE (0/4), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/1), QR-MOTION (0/1) | – |
| block/listing/p5@1280 | QR-TYPE-SCALE (0/4), QR-SPACE-SCALE (0/3), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/1), QR-MOTION (0/1) | – |
| block/footer/f1@1280 | QR-TYPE-SCALE (0/2), QR-CASE (0/1), QR-SPACE-SCALE (0/2), QR-MOTION (0/1) | – |
| block/footer/f2@1280 | QR-TYPE-SCALE (0/2), QR-CASE (0/1), QR-SPACE-SCALE (0/2), QR-MOTION (0/1) | – |
| block/footer/f3@1280 | QR-TYPE-SCALE (0/3), QR-CASE (0/1), QR-SPACE-SCALE (0/3), QR-MOTION (0/1) | – |
| block/footer/f4@1280 | QR-TYPE-SCALE (0/2), QR-CASE (0/1), QR-SPACE-SCALE (0/2), QR-MOTION (0/1) | – |
| block/footer/f5@1280 | QR-TYPE-SCALE (0/2), QR-CASE (0/1), QR-SPACE-SCALE (0/1), QR-MOTION (0/1) | – |
| block/footer/f6@1280 | QR-TYPE-SCALE (0/3), QR-CASE (0/1), QR-SPACE-SCALE (0/3), QR-MOTION (0/1) | – |
| block/footer/f7@1280 | QR-TYPE-SCALE (0/3), QR-SPACE-SCALE (0/2), QR-MOTION (0/1) | – |
| block/announcement/text-bar@1280 | none | – |
| block/announcement/text-bar:empty@1280 | none | – |

Per target and per rule, pass or fail with the measured value and every failure: `report.json`.
