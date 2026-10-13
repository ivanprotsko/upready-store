# template:check — 2026-10-12

**Итог: SELF-TEST PASS.** Проверено целей: 4 (шаблоны × страницы, блоки площадки, ширины 360 и 1280 px). Фикстура, без базы: отказов gate 52.

Commit 70d91198 · fixtures · baseline none · exit 0

## Rules

| Rule | Kind | Threshold | Checked | Pass | Fail | New gate failures | Baseline failures |
|---|---|---|---|---|---|---|---|
| QR-TYPE-SCALE | gate | every size on the declared type scale; neighbours ≥ 1.15×; ≤ 8 sizes | 4 | 2 | 2 | 14 | 0 |
| QR-TYPE-ROLE | gate | one role, one size on a page and across a template's pages | 4 | 2 | 2 | 6 | 0 |
| QR-HEADING-RANK | gate | one h1 per page; no level skipped; size never grows with the level | 4 | 2 | 2 | 4 | 0 |
| QR-SECTION-RANK | gate | section title ÷ body ≥ 1.5 | 4 | 2 | 2 | 2 | 0 |
| QR-WEIGHT | gate | font-weight ≤ 600 | 4 | 2 | 2 | 4 | 0 |
| QR-CASE | gate | capitals only at ≤ 12px with tracking ≥ 0.06em | 4 | 2 | 2 | 2 | 0 |
| QR-MEASURE | gate | 45 ≤ characters per line ≤ 90 (45 for prose only) | 2 | 1 | 1 | 1 | 0 |
| QR-COLUMN-RANK | gate | the longest text (> 200 chars) sits in a column ≥ 480px | 2 | 1 | 1 | 1 | 0 |
| QR-SPACE-SCALE | gate | padding, margin and gap on 4·8·12·16·24·32·48·64·96·128 | 4 | 2 | 2 | 22 | 0 |
| QR-SECTION-RHYTHM | report | ≤ 2 distinct gaps between bands | 4 | 4 | 0 | 0 | 0 |
| QR-GRID-AXES | gate | every content container on one left edge | 4 | 2 | 2 | 2 | 0 |
| QR-DENSITY | report | 12 ≤ text elements above the fold ≤ 32 | 2 | 1 | 1 | 0 | 0 |
| QR-IMG-ASPECT | gate | every picture in a hard box; one ratio per role, on a page and across pages; nothing drawn 0×0 | 4 | 2 | 2 | 6 | 0 |
| QR-IMG-FRAME | gate | card pictures on one surface, with one fit | 4 | 2 | 2 | 4 | 0 |
| QR-CARD-SURFACE | gate | a product card has a background, a border or a rounded picture | 4 | 2 | 2 | 2 | 0 |
| QR-GALLERY | gate | one main frame; thumbnail ratio = frame ratio (±0.01); product page ≤ 6000px at 1280 | 4 | 2 | 2 | 4 | 0 |
| QR-ALT | gate | product pictures carry a real alt; no image lacks the attribute; no «Product image 1» | 4 | 2 | 2 | 4 | 0 |
| QR-EMPTY | gate | the no-photo placeholder sits in the frame's own ratio box; an empty block draws nothing | 4 | 2 | 2 | 4 | 0 |
| QR-CARD-GRAMMAR | gate | card roles in canon order; the same product has one card signature on every page | 4 | 2 | 2 | 2 | 0 |
| QR-PRICE | gate | tabular-nums; no «,00»; no-break space before ₽; card price differs from the title in weight or size | 4 | 2 | 2 | 6 | 0 |
| QR-RADIUS | gate | radii only 6 · --radius · 12 · pill; one radius per component role across pages | 4 | 2 | 2 | 2 | 0 |
| QR-ELEVATION | gate | ≤ 1 shadow recipe | 4 | 2 | 2 | 2 | 0 |
| QR-CONTROL-DENSITY | gate | ≤ 4 icon-only controls in one header row | 4 | 2 | 2 | 2 | 0 |
| QR-TECTONICS | report | the footer's surface differs from the page | 2 | 1 | 1 | 0 | 0 |
| QR-OCCLUSION | gate | titles, prices and buttons are on top at their own point | 4 | 2 | 2 | 2 | 0 |
| QR-JS | gate | 0 page errors | 4 | 2 | 2 | 2 | 0 |
| QR-CONTRAST | gate | 0 axe color-contrast violations (AA) | 4 | 2 | 2 | 2 | 0 |
| QR-OVERFLOW | gate | 0px horizontal overflow | 2 | 1 | 1 | 1 | 0 |
| QR-HIT | gate | every target ≥ 44px high; icon-only ≥ 44px wide; inline links exempt | 2 | 1 | 1 | 6 | 0 |
| QR-FOCUS | gate | a visible focus ring, distinct from rest, on every target | 4 | 2 | 2 | 2 | 0 |
| QR-MOTION | gate | durations ≤ 240ms; under prefers-reduced-motion ≤ 10ms | 4 | 2 | 2 | 4 | 0 |

Not ported from the lab: QR-PROSE (checks the text of the lab's own template files; on the storefront the long text is the shop's catalogue, not the template); QR-TOKENS (a source check of literal values in block CSS; `pnpm lint:blocks` does it on src/modules/blocks); QR-TOKEN-COVERAGE (scale tokens a lab template overrode; a manifest here names closed layers only, held by validateTemplate()).

## Gate failures

| Target | Rule | Measured |
|---|---|---|
| fixture/bad@360 | QR-TYPE-SCALE | 13px ×4, e.g. p.tiny «Мелкая строка в тринадцать п» |
| fixture/bad@360 | QR-TYPE-SCALE | 13.33px ×1, e.g. button.nofocus «Купить без кольца фокуса» |
| fixture/bad@360 | QR-TYPE-SCALE | 18.72px ×1, e.g. h3[product-title] «Масло» |
| fixture/bad@360 | QR-TYPE-SCALE | 13→13.33 = 1.025 |
| fixture/bad@360 | QR-TYPE-SCALE | 13.33→14 = 1.05 |
| fixture/bad@360 | QR-TYPE-SCALE | 14→16 = 1.143 |
| fixture/bad@360 | QR-TYPE-SCALE | 18.72→20 = 1.068 |
| fixture/bad@360 | QR-TYPE-ROLE | section-title: 20, 32px |
| fixture/bad@360 | QR-TYPE-ROLE | card-title: 13, 18.72px |
| fixture/bad@360 | QR-TYPE-ROLE | card-price: 13, 16px |
| fixture/bad@360 | QR-HEADING-RANK | h1 × 2 |
| fixture/bad@360 | QR-HEADING-RANK | h2 32px > h1 20px |
| fixture/bad@360 | QR-SECTION-RANK | 20px ÷ 16px = 1.25 |
| fixture/bad@360 | QR-WEIGHT | 700 ×7, e.g. h2.h2b «Заголовок под чужим слоем» |
| fixture/bad@360 | QR-WEIGHT | 800 ×1, e.g. p.heavy «Слишком жирная строка текста» |
| fixture/bad@360 | QR-CASE | p.shout «оксана черкашина» at 20px, tracking 0em |
| fixture/bad@360 | QR-SPACE-SCALE | 16.6px ×2, e.g. h2.h2b «Заголовок под чужим слоем» |
| fixture/bad@360 | QR-SPACE-SCALE | 13.4px ×4, e.g. h1 «Первый заголовок страницы» |
| fixture/bad@360 | QR-SPACE-SCALE | 26.56px ×2, e.g. h2.big-h2 «Раздел крупнее страницы» |
| fixture/bad@360 | QR-SPACE-SCALE | 21.28px ×2, e.g. h4 «Уровень пропущен» |
| fixture/bad@360 | QR-SPACE-SCALE | 20px ×2, e.g. p.shout «оксана черкашина» |
| fixture/bad@360 | QR-SPACE-SCALE | 13px ×6, e.g. p.tiny «Мелкая строка в тринадцать п» |
| fixture/bad@360 | QR-SPACE-SCALE | 14px ×2, e.g. p.small «Строка в четырнадцать пиксел» |
| fixture/bad@360 | QR-SPACE-SCALE | 6px ×8, e.g. p.odd «Отступы шесть и десять пиксе» |
| fixture/bad@360 | QR-SPACE-SCALE | 10px ×1, e.g. p.odd «Отступы шесть и десять пиксе» |
| fixture/bad@360 | QR-SPACE-SCALE | 1px ×4, e.g. button.nofocus «Купить без кольца фокуса» |
| fixture/bad@360 | QR-SPACE-SCALE | 18.72px ×2, e.g. h3[product-title] «Масло» |
| fixture/bad@360 | QR-GRID-AXES | 0, 40 |
| fixture/bad@360 | QR-IMG-ASPECT | card: 0.75, 1, 0.833 |
| fixture/bad@360 | QR-IMG-ASPECT | role card: a frame without aspect-ratio |
| fixture/bad@360 | QR-IMG-ASPECT | picture without a hard box: img |
| fixture/bad@360 | QR-IMG-FRAME | rgb(255, 255, 255) \| rgb(0, 0, 0) |
| fixture/bad@360 | QR-IMG-FRAME | contain, cover |
| fixture/bad@360 | QR-CARD-SURFACE | 2 of 2, e.g. /products/a |
| fixture/bad@360 | QR-GALLERY | 2 frames |
| fixture/bad@360 | QR-GALLERY | 1 vs 0.75 |
| fixture/bad@360 | QR-ALT | product picture with an empty alt: img.fill |
| fixture/bad@360 | QR-ALT | picture without an alt attribute: img |
| fixture/bad@360 | QR-EMPTY | placeholder of card outside a ratio box |
| fixture/bad@360 | QR-EMPTY | 0.833 vs 0.75 |
| fixture/bad@360 | QR-CARD-GRAMMAR | card signature off the canon: card-media>card-price>card-title |
| fixture/bad@360 | QR-PRICE | span[price] «990 ₽»: normal |
| fixture/bad@360 | QR-PRICE | 1 355,00 ₽ |
| fixture/bad@360 | QR-PRICE | 990 ₽ |
| fixture/bad@360 | QR-RADIUS | 3px ×1, e.g. div.r3 «Скругление три пикселя и пер» |
| fixture/bad@360 | QR-ELEVATION | rgba(0, 0, 0, 0.2) 0px 2px 8px 0px \| rgba(0, 128, 0, 0.3) 0px 4px 12px 0px |
| fixture/bad@360 | QR-CONTROL-DENSITY | 5 |
| fixture/bad@360 | QR-OCCLUSION | h2.h2b «Заголовок под чужим слоем» under div.cover |
| fixture/bad@360 | QR-JS | page error: bad fixture: a script error on load |
| fixture/bad@360 | QR-CONTRAST | p «Бледный текст, который почти»: 1.6 < 4.5:1 |
| fixture/bad@360 | QR-OVERFLOW | 856px: p.wide-text «Очень длинная строка без огр» \| div.overflow |
| fixture/bad@360 | QR-HIT | 20×20: button «Поиск» |
| fixture/bad@360 | QR-HIT | 20×20: button «Язык» |
| fixture/bad@360 | QR-HIT | 20×20: button «Валюта» |
| fixture/bad@360 | QR-HIT | 20×20: button «Аккаунт» |
| fixture/bad@360 | QR-HIT | 20×20: button «Корзина» |
| fixture/bad@360 | QR-HIT | 178×21: button.nofocus «Купить без кольца фокуса» |
| fixture/bad@360 | QR-FOCUS | no focus ring: button «Купить без кольца фокуса» |
| fixture/bad@360 | QR-MOTION | transition 600ms, e.g. div.r3 |
| fixture/bad@360 | QR-MOTION | 600ms, e.g. transition div.r3 |
| fixture/bad@1280 | QR-TYPE-SCALE | 13px ×4, e.g. p.tiny «Мелкая строка в тринадцать п» |
| fixture/bad@1280 | QR-TYPE-SCALE | 13.33px ×1, e.g. button.nofocus «Купить без кольца фокуса» |
| fixture/bad@1280 | QR-TYPE-SCALE | 18.72px ×1, e.g. h3[product-title] «Масло» |
| fixture/bad@1280 | QR-TYPE-SCALE | 13→13.33 = 1.025 |
| fixture/bad@1280 | QR-TYPE-SCALE | 13.33→14 = 1.05 |
| fixture/bad@1280 | QR-TYPE-SCALE | 14→16 = 1.143 |
| fixture/bad@1280 | QR-TYPE-SCALE | 18.72→20 = 1.068 |
| fixture/bad@1280 | QR-TYPE-ROLE | section-title: 20, 32px |
| fixture/bad@1280 | QR-TYPE-ROLE | card-title: 13, 18.72px |
| fixture/bad@1280 | QR-TYPE-ROLE | card-price: 13, 16px |
| fixture/bad@1280 | QR-HEADING-RANK | h1 × 2 |
| fixture/bad@1280 | QR-HEADING-RANK | h2 32px > h1 20px |
| fixture/bad@1280 | QR-SECTION-RANK | 20px ÷ 16px = 1.25 |
| fixture/bad@1280 | QR-WEIGHT | 700 ×7, e.g. h2.h2b «Заголовок под чужим слоем» |
| fixture/bad@1280 | QR-WEIGHT | 800 ×1, e.g. p.heavy «Слишком жирная строка текста» |
| fixture/bad@1280 | QR-CASE | p.shout «оксана черкашина» at 20px, tracking 0em |
| fixture/bad@1280 | QR-MEASURE | 138 cpl in 1200px: p.wide-text «Очень длинная строка без огр» |
| fixture/bad@1280 | QR-COLUMN-RANK | 290 chars in 300px: p.narrow «Самый длинный текст страницы» |
| fixture/bad@1280 | QR-SPACE-SCALE | 16.6px ×2, e.g. h2.h2b «Заголовок под чужим слоем» |
| fixture/bad@1280 | QR-SPACE-SCALE | 13.4px ×4, e.g. h1 «Первый заголовок страницы» |
| fixture/bad@1280 | QR-SPACE-SCALE | 26.56px ×2, e.g. h2.big-h2 «Раздел крупнее страницы» |
| fixture/bad@1280 | QR-SPACE-SCALE | 21.28px ×2, e.g. h4 «Уровень пропущен» |
| fixture/bad@1280 | QR-SPACE-SCALE | 20px ×2, e.g. p.shout «оксана черкашина» |
| fixture/bad@1280 | QR-SPACE-SCALE | 13px ×6, e.g. p.tiny «Мелкая строка в тринадцать п» |
| fixture/bad@1280 | QR-SPACE-SCALE | 14px ×2, e.g. p.small «Строка в четырнадцать пиксел» |
| fixture/bad@1280 | QR-SPACE-SCALE | 6px ×8, e.g. p.odd «Отступы шесть и десять пиксе» |
| fixture/bad@1280 | QR-SPACE-SCALE | 10px ×1, e.g. p.odd «Отступы шесть и десять пиксе» |
| fixture/bad@1280 | QR-SPACE-SCALE | 1px ×4, e.g. button.nofocus «Купить без кольца фокуса» |
| fixture/bad@1280 | QR-SPACE-SCALE | 18.72px ×2, e.g. h3[product-title] «Масло» |
| fixture/bad@1280 | QR-GRID-AXES | 0, 40 |
| fixture/bad@1280 | QR-IMG-ASPECT | card: 0.75, 1, 0.833 |
| fixture/bad@1280 | QR-IMG-ASPECT | role card: a frame without aspect-ratio |
| fixture/bad@1280 | QR-IMG-ASPECT | picture without a hard box: img |
| fixture/bad@1280 | QR-IMG-FRAME | rgb(255, 255, 255) \| rgb(0, 0, 0) |
| fixture/bad@1280 | QR-IMG-FRAME | contain, cover |
| fixture/bad@1280 | QR-CARD-SURFACE | 2 of 2, e.g. /products/a |
| fixture/bad@1280 | QR-GALLERY | 2 frames |
| fixture/bad@1280 | QR-GALLERY | 1 vs 0.75 |
| fixture/bad@1280 | QR-ALT | product picture with an empty alt: img.fill |
| fixture/bad@1280 | QR-ALT | picture without an alt attribute: img |
| fixture/bad@1280 | QR-EMPTY | placeholder of card outside a ratio box |
| fixture/bad@1280 | QR-EMPTY | 0.833 vs 0.75 |
| fixture/bad@1280 | QR-CARD-GRAMMAR | card signature off the canon: card-media>card-price>card-title |
| fixture/bad@1280 | QR-PRICE | span[price] «990 ₽»: normal |
| fixture/bad@1280 | QR-PRICE | 1 355,00 ₽ |
| fixture/bad@1280 | QR-PRICE | 990 ₽ |
| fixture/bad@1280 | QR-RADIUS | 3px ×1, e.g. div.r3 «Скругление три пикселя и пер» |
| fixture/bad@1280 | QR-ELEVATION | rgba(0, 0, 0, 0.2) 0px 2px 8px 0px \| rgba(0, 128, 0, 0.3) 0px 4px 12px 0px |
| fixture/bad@1280 | QR-CONTROL-DENSITY | 5 |
| fixture/bad@1280 | QR-OCCLUSION | h2.h2b «Заголовок под чужим слоем» under div.cover |
| fixture/bad@1280 | QR-JS | page error: bad fixture: a script error on load |
| fixture/bad@1280 | QR-CONTRAST | p «Бледный текст, который почти»: 1.6 < 4.5:1 |
| fixture/bad@1280 | QR-FOCUS | no focus ring: button «Купить без кольца фокуса» |
| fixture/bad@1280 | QR-MOTION | transition 600ms, e.g. div.r3 |
| fixture/bad@1280 | QR-MOTION | 600ms, e.g. transition div.r3 |

## Targets

| Target | Gate rules failed (new / baseline) | Report rules out of range |
|---|---|---|
| fixture/bad@360 | QR-TYPE-SCALE (7/0), QR-TYPE-ROLE (3/0), QR-HEADING-RANK (2/0), QR-SECTION-RANK (1/0), QR-WEIGHT (2/0), QR-CASE (1/0), QR-SPACE-SCALE (11/0), QR-GRID-AXES (1/0), QR-IMG-ASPECT (3/0), QR-IMG-FRAME (2/0), QR-CARD-SURFACE (1/0), QR-GALLERY (2/0), QR-ALT (2/0), QR-EMPTY (2/0), QR-CARD-GRAMMAR (1/0), QR-PRICE (3/0), QR-RADIUS (1/0), QR-ELEVATION (1/0), QR-CONTROL-DENSITY (1/0), QR-OCCLUSION (1/0), QR-JS (1/0), QR-CONTRAST (1/0), QR-OVERFLOW (1/0), QR-HIT (6/0), QR-FOCUS (1/0), QR-MOTION (2/0) | QR-SECTION-RHYTHM ok [16] |
| fixture/bad@1280 | QR-TYPE-SCALE (7/0), QR-TYPE-ROLE (3/0), QR-HEADING-RANK (2/0), QR-SECTION-RANK (1/0), QR-WEIGHT (2/0), QR-CASE (1/0), QR-MEASURE (1/0), QR-COLUMN-RANK (1/0), QR-SPACE-SCALE (11/0), QR-GRID-AXES (1/0), QR-IMG-ASPECT (3/0), QR-IMG-FRAME (2/0), QR-CARD-SURFACE (1/0), QR-GALLERY (2/0), QR-ALT (2/0), QR-EMPTY (2/0), QR-CARD-GRAMMAR (1/0), QR-PRICE (3/0), QR-RADIUS (1/0), QR-ELEVATION (1/0), QR-CONTROL-DENSITY (1/0), QR-OCCLUSION (1/0), QR-JS (1/0), QR-CONTRAST (1/0), QR-FOCUS (1/0), QR-MOTION (2/0) | QR-SECTION-RHYTHM ok [16]; QR-DENSITY ok 16; QR-TECTONICS out {"footer":"rgb(255, 255, 255)","page":"rgb(255, 255, 255)"} |
| fixture/good@360 | none | QR-SECTION-RHYTHM ok [32] |
| fixture/good@1280 | none | QR-SECTION-RHYTHM ok [32]; QR-DENSITY out 11; QR-TECTONICS ok {"footer":"rgb(31, 77, 58)","page":"rgb(255, 255, 255)"} |

Per target and per rule, pass or fail with the measured value and every failure: `report.json`.
