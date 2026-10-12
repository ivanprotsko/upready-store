# template:check — 2026-10-12

**Итог: PASS.** Проверено целей: 8 (шаблоны × страницы, блоки площадки, ширины 360 и 1280 px). Новых отказов gate: **0**; отказов из базы (известный долг существующих вариантов): 190; report-правил вне порога: 3.
Что делать: ничего, новых отказов нет. Отказы из базы — долг существующих вариантов композиции, он виден в report.json.

Commit 70d91198 · http://localhost:8130 as globex.shipshift.dev · locale en · --only long-morning · baseline 745 keys · exit 0

## Rules

| Rule | Kind | Threshold | Checked | Pass | Fail | New gate failures | Baseline failures |
|---|---|---|---|---|---|---|---|
| QR-TYPE-SCALE | gate | every size on the declared type scale; neighbours ≥ 1.15×; ≤ 8 sizes | 6 | 0 | 6 | 0 | 34 |
| QR-TYPE-ROLE | gate | one role, one size on a page and across a template's pages | 8 | 4 | 4 | 0 | 8 |
| QR-HEADING-RANK | gate | one h1 per page; no level skipped; size never grows with the level | 6 | 2 | 4 | 0 | 4 |
| QR-SECTION-RANK | gate | section title ÷ body ≥ 1.5 | 6 | 4 | 2 | 0 | 2 |
| QR-WEIGHT | gate | font-weight ≤ 600 | 6 | 6 | 0 | 0 | 0 |
| QR-CASE | gate | capitals only at ≤ 12px with tracking ≥ 0.06em | 6 | 0 | 6 | 0 | 12 |
| QR-MEASURE | gate | 45 ≤ characters per line ≤ 90 (45 for prose only) | 3 | 3 | 0 | 0 | 0 |
| QR-COLUMN-RANK | gate | the longest text (> 200 chars) sits in a column ≥ 480px | 3 | 3 | 0 | 0 | 0 |
| QR-SPACE-SCALE | gate | padding, margin and gap on 4·8·12·16·24·32·48·64·96·128 | 6 | 0 | 6 | 0 | 30 |
| QR-SECTION-RHYTHM | report | ≤ 2 distinct gaps between bands | 6 | 6 | 0 | 0 | 0 |
| QR-GRID-AXES | gate | every content container on one left edge | 6 | 6 | 0 | 0 | 0 |
| QR-DENSITY | report | 12 ≤ text elements above the fold ≤ 32 | 3 | 3 | 0 | 0 | 0 |
| QR-IMG-ASPECT | gate | every picture in a hard box; one ratio per role, on a page and across pages; nothing drawn 0×0 | 8 | 5 | 3 | 0 | 3 |
| QR-IMG-FRAME | gate | card pictures on one surface, with one fit | 6 | 6 | 0 | 0 | 0 |
| QR-CARD-SURFACE | gate | a product card has a background, a border or a rounded picture | 6 | 6 | 0 | 0 | 0 |
| QR-GALLERY | gate | one main frame; thumbnail ratio = frame ratio (±0.01); product page ≤ 6000px at 1280 | 6 | 6 | 0 | 0 | 0 |
| QR-ALT | gate | product pictures carry a real alt; no image lacks the attribute; no «Product image 1» | 6 | 6 | 0 | 0 | 0 |
| QR-EMPTY | gate | the no-photo placeholder sits in the frame's own ratio box; an empty block draws nothing | 6 | 6 | 0 | 0 | 0 |
| QR-CARD-GRAMMAR | gate | card roles in canon order; the same product has one card signature on every page | 8 | 0 | 8 | 0 | 14 |
| QR-PRICE | gate | tabular-nums; no «,00»; no-break space before ₽; card price differs from the title in weight or size | 6 | 6 | 0 | 0 | 0 |
| QR-RADIUS | gate | radii only 6 · --radius · 12 · pill; one radius per component role across pages | 8 | 2 | 6 | 0 | 17 |
| QR-ELEVATION | gate | ≤ 1 shadow recipe | 6 | 3 | 3 | 0 | 3 |
| QR-CONTROL-DENSITY | gate | ≤ 4 icon-only controls in one header row | 6 | 6 | 0 | 0 | 0 |
| QR-TECTONICS | report | the footer's surface differs from the page | 3 | 0 | 3 | 0 | 0 |
| QR-OCCLUSION | gate | titles, prices and buttons are on top at their own point | 6 | 6 | 0 | 0 | 0 |
| QR-JS | gate | 0 page errors | 6 | 6 | 0 | 0 | 0 |
| QR-CONTRAST | gate | 0 axe color-contrast violations (AA) | 6 | 6 | 0 | 0 | 0 |
| QR-OVERFLOW | gate | 0px horizontal overflow | 3 | 3 | 0 | 0 | 0 |
| QR-HIT | gate | every target ≥ 44px high; icon-only ≥ 44px wide; inline links exempt | 3 | 0 | 3 | 0 | 57 |
| QR-FOCUS | gate | a visible focus ring, distinct from rest, on every target | 6 | 6 | 0 | 0 | 0 |
| QR-MOTION | gate | durations ≤ 240ms; under prefers-reduced-motion ≤ 10ms | 6 | 0 | 6 | 0 | 6 |

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
| template/long-morning/home@1280 | QR-TYPE-SCALE (0/6), QR-TYPE-ROLE (0/1), QR-HEADING-RANK (0/1), QR-SECTION-RANK (0/1), QR-CASE (0/2), QR-SPACE-SCALE (0/6), QR-IMG-ASPECT (0/1), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/2), QR-MOTION (0/1) | QR-SECTION-RHYTHM ok []; QR-DENSITY ok 12; QR-TECTONICS out {"footer":"rgb(253, 251, 247)","page":"rgb(253, 251, 247)"} |
| template/long-morning/category@1280 | QR-TYPE-SCALE (0/5), QR-HEADING-RANK (0/1), QR-CASE (0/2), QR-SPACE-SCALE (0/5), QR-IMG-ASPECT (0/1), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/4), QR-ELEVATION (0/1), QR-MOTION (0/1) | QR-SECTION-RHYTHM ok [32]; QR-DENSITY ok 16; QR-TECTONICS out {"footer":"rgb(253, 251, 247)","page":"rgb(253, 251, 247)"} |
| template/long-morning/product@1280 | QR-TYPE-SCALE (0/5), QR-CASE (0/2), QR-SPACE-SCALE (0/6), QR-IMG-ASPECT (0/1), QR-CARD-GRAMMAR (0/1), QR-RADIUS (0/3), QR-ELEVATION (0/1), QR-MOTION (0/1) | QR-SECTION-RHYTHM ok []; QR-DENSITY ok 23; QR-TECTONICS out {"footer":"rgb(253, 251, 247)","page":"rgb(253, 251, 247)"} |
| template/long-morning/pages@1280 | QR-TYPE-ROLE (0/3), QR-CARD-GRAMMAR (0/4) | – |

Per target and per rule, pass or fail with the measured value and every failure: `report.json`.
