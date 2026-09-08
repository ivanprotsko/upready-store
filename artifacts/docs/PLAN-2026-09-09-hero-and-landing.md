# План ночного хода (Иван спит, работаем автономно до результата)

Заказ Ивана 2026-09-09: (1) `text-wrap: balance`; (2) переснять скриншоты;
(3) на лендинге `~/upready/projects/upready-dev` в блоке «Примеры магазинов»:
пятая ТЕМА, новые кадры с новым hero, свои заголовок+описание каждой карточке,
карточки УЖЕ, кадры ВЫТЯНУТЕЕ; (4) деплой на upready.dev — разрешён заранее,
хуки разрешено обходить.

## Шаги

1. [x] `text-balance` на заголовок и подзаголовок hero (оба макета) — upready-store.
2. [ ] Переснять пять стендов: viewport 1440x1920, PNG → webp 960x1280
       (`images/demo-<slug>.webp` в upready-dev). Пятая карточка = sneakers HOME,
       не каталог (у каталога нет hero).
3. [ ] `index.html` лендинга: карточка `flex:0 0 min(84%,420px)` → 320px,
       шаг рельса 421 → 321 (`prevCard`/`nextCard`), `aspect-ratio:16/11` → `3/4`.
4. [ ] Массив `get showcase()` — пять строк, свои eyebrow/title/desc/alt.
5. [ ] `<meta name="ext-resource-dependency">` — пять кадров, catalog убрать.
6. [ ] Лид-абзац секции: перечень пяти тем без «последняя показана каталогом».
7. [ ] `node artifacts/docs/check-showcase.mjs` — пять условий приёмки
       (count=5, nw/nh = новый размер, brokenImgs=[], unresolved=0, hscroll=false).
8. [ ] Коммит в `main` + `node artifacts/scripts/deploy-upready-dev.mjs`.

Рецепт (обязателен к соблюдению): `~/upready/projects/upready-dev/artifacts/docs/recipe-showcase-cards.md`
