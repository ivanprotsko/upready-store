# План ночного хода (Иван спит, работаем автономно до результата)

Заказ Ивана 2026-09-09: (1) `text-wrap: balance`; (2) переснять скриншоты;
(3) на лендинге `~/upready/projects/upready-dev` в блоке «Примеры магазинов»:
пятая ТЕМА, новые кадры с новым hero, свои заголовок+описание каждой карточке,
карточки УЖЕ, кадры ВЫТЯНУТЕЕ; (4) деплой на upready.dev — разрешён заранее,
хуки разрешено обходить.

## Шаги

1. [x] `text-balance` на заголовок и подзаголовок hero (оба макета) — upready-store.
2. [x] Переснять пять стендов: viewport 1440x1920, PNG → webp 960x1280
       (`images/demo-<slug>.webp` в upready-dev). Пятая карточка = sneakers HOME,
       не каталог (у каталога нет hero).
3. [x] `index.html` лендинга: карточка `flex:0 0 min(84%,420px)` → 320px,
       шаг рельса 421 → 321 (`prevCard`/`nextCard`), `aspect-ratio:16/11` → `3/4`.
4. [x] Массив `get showcase()` — пять строк, свои eyebrow/title/desc/alt.
5. [x] `<meta name="ext-resource-dependency">` — пять кадров, catalog убрать.
6. [x] Лид-абзац секции: перечень пяти тем без «последняя показана каталогом».
7. [x] `node artifacts/docs/check-showcase.mjs` — пять условий приёмки
       (count=5, nw/nh = новый размер, brokenImgs=[], unresolved=0, hscroll=false).
8. [x] Коммит в `main` + `node artifacts/scripts/deploy-upready-dev.mjs`.

Рецепт (обязателен к соблюдению): `~/upready/projects/upready-dev/artifacts/docs/recipe-showcase-cards.md`

## Итог 2026-09-09 (все восемь шагов закрыты)

Живой upready.dev: пять карточек, каждая 320 px, кадр 960x1280 (3/4), заголовки
«Магазин наушников / Магазин одежды / Товары для дома / Магазин добавок / Магазин кроссовок».
Коммиты: upready-store `f232bdc`, upready-dev `63d21c9`, память `36b262d`.

Ловушка, стоившая бы суток: Pages выкатил новые кадры ПОД ТЕМИ ЖЕ ИМЕНАМИ, и край отдавал
старые (`cf-cache-status: HIT`, `max-age=86400`). Вычищено `purge_cache` по 16 URL, после
чего все пять кадров на проде проверены `magick identify` — 960x1280.
См. `~/upready/memory/cloudflare-pages-same-filename-stale-asset-2026-09-09.md`.
