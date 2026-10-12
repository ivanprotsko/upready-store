# template:check — 2026-10-12

**Итог: PASS.** Проверено целей: 2 (шаблоны × страницы, блоки площадки, ширины 360 и 1280 px). Новых отказов gate: **0**; отказов из базы (известный долг существующих вариантов): 11; report-правил вне порога: 0.
Что делать: ничего, новых отказов нет. Отказы из базы — долг существующих вариантов композиции, он виден в report.json.

Commit 70d91198 · http://localhost:8130 as globex.shipshift.dev · locale en · --only hero/g · baseline 745 keys · exit 0

## Rules

| Rule | Kind | Threshold | Checked | Pass | Fail | New gate failures | Baseline failures |
|---|---|---|---|---|---|---|---|
| QR-TYPE-SCALE | gate | every size on the declared type scale; neighbours ≥ 1.15×; ≤ 8 sizes | 2 | 0 | 2 | 0 | 3 |
| QR-TYPE-ROLE | gate | one role, one size on a page and across a template's pages | 2 | 2 | 0 | 0 | 0 |
| QR-HEADING-RANK | gate | one h1 per page; no level skipped; size never grows with the level | 2 | 2 | 0 | 0 | 0 |
| QR-SECTION-RANK | gate | section title ÷ body ≥ 1.5 | 2 | 2 | 0 | 0 | 0 |
| QR-WEIGHT | gate | font-weight ≤ 600 | 2 | 2 | 0 | 0 | 0 |
| QR-CASE | gate | capitals only at ≤ 12px with tracking ≥ 0.06em | 2 | 0 | 2 | 0 | 2 |
| QR-MEASURE | gate | 45 ≤ characters per line ≤ 90 (45 for prose only) | 1 | 1 | 0 | 0 | 0 |
| QR-COLUMN-RANK | gate | the longest text (> 200 chars) sits in a column ≥ 480px | 1 | 1 | 0 | 0 | 0 |
| QR-SPACE-SCALE | gate | padding, margin and gap on 4·8·12·16·24·32·48·64·96·128 | 2 | 0 | 2 | 0 | 2 |
| QR-SECTION-RHYTHM | report | ≤ 2 distinct gaps between bands | 0 | 0 | 0 | 0 | 0 |
| QR-GRID-AXES | gate | every content container on one left edge | 2 | 2 | 0 | 0 | 0 |
| QR-DENSITY | report | 12 ≤ text elements above the fold ≤ 32 | 0 | 0 | 0 | 0 | 0 |
| QR-IMG-ASPECT | gate | every picture in a hard box; one ratio per role, on a page and across pages; nothing drawn 0×0 | 2 | 2 | 0 | 0 | 0 |
| QR-IMG-FRAME | gate | card pictures on one surface, with one fit | 2 | 2 | 0 | 0 | 0 |
| QR-CARD-SURFACE | gate | a product card has a background, a border or a rounded picture | 2 | 2 | 0 | 0 | 0 |
| QR-GALLERY | gate | one main frame; thumbnail ratio = frame ratio (±0.01); product page ≤ 6000px at 1280 | 0 | 0 | 0 | 0 | 0 |
| QR-ALT | gate | product pictures carry a real alt; no image lacks the attribute; no «Product image 1» | 2 | 2 | 0 | 0 | 0 |
| QR-EMPTY | gate | the no-photo placeholder sits in the frame's own ratio box; an empty block draws nothing | 2 | 2 | 0 | 0 | 0 |
| QR-CARD-GRAMMAR | gate | card roles in canon order; the same product has one card signature on every page | 2 | 2 | 0 | 0 | 0 |
| QR-PRICE | gate | tabular-nums; no «,00»; no-break space before ₽; card price differs from the title in weight or size | 2 | 2 | 0 | 0 | 0 |
| QR-RADIUS | gate | radii only 6 · --radius · 12 · pill; one radius per component role across pages | 2 | 2 | 0 | 0 | 0 |
| QR-ELEVATION | gate | ≤ 1 shadow recipe | 2 | 2 | 0 | 0 | 0 |
| QR-CONTROL-DENSITY | gate | ≤ 4 icon-only controls in one header row | 2 | 2 | 0 | 0 | 0 |
| QR-TECTONICS | report | the footer's surface differs from the page | 0 | 0 | 0 | 0 | 0 |
| QR-OCCLUSION | gate | titles, prices and buttons are on top at their own point | 2 | 2 | 0 | 0 | 0 |
| QR-JS | gate | 0 page errors | 0 | 0 | 0 | 0 | 0 |
| QR-CONTRAST | gate | 0 axe color-contrast violations (AA) | 2 | 2 | 0 | 0 | 0 |
| QR-OVERFLOW | gate | 0px horizontal overflow | 1 | 1 | 0 | 0 | 0 |
| QR-HIT | gate | every target ≥ 44px high; icon-only ≥ 44px wide; inline links exempt | 1 | 0 | 1 | 0 | 2 |
| QR-FOCUS | gate | a visible focus ring, distinct from rest, on every target | 2 | 2 | 0 | 0 | 0 |
| QR-MOTION | gate | durations ≤ 240ms; under prefers-reduced-motion ≤ 10ms | 2 | 0 | 2 | 0 | 2 |

Not ported from the lab: QR-PROSE (checks the text of the lab's own template files; on the storefront the long text is the shop's catalogue, not the template); QR-TOKENS (a source check of literal values in block CSS; `pnpm lint:blocks` does it on src/modules/blocks); QR-TOKEN-COVERAGE (scale tokens a lab template overrode; a manifest here names closed layers only, held by validateTemplate()).

## New gate failures

None.

## Targets

| Target | Gate rules failed (new / baseline) | Report rules out of range |
|---|---|---|
| block/hero/g@360 | QR-TYPE-SCALE (0/1), QR-CASE (0/1), QR-SPACE-SCALE (0/1), QR-HIT (0/2), QR-MOTION (0/1) | – |
| block/hero/g@1280 | QR-TYPE-SCALE (0/2), QR-CASE (0/1), QR-SPACE-SCALE (0/1), QR-MOTION (0/1) | – |

Per target and per rule, pass or fail with the measured value and every failure: `report.json`.
