# Приёмка PR #21 — t02-cherkashina-port, круг 1

Приёмщик: headless `claude -p`, главный чекаут `dev`. Замеры: 2026-09-15 03:48 WITA.
Ветка `feat/day16-cherkashina-port` @ 0d43931, база `dev`, `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`.
Воркtree `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-cherkashina-port`:
дерево чистое, HEAD == origin.

## Объём: 22 файла, +2633/-49, без снимка каталога, без удалений, секретов не найдено

`git diff --name-only origin/dev...HEAD | grep -i json` — пусто (43k-строчный снимок в dev не приехал).
`git diff --diff-filter=D --name-only origin/dev...HEAD` — пусто.
Grep по паролям/токенам/ключам в `scripts/cherkashina-migration/` — 0 совпадений.

## Критерии приёмки (мои замеры, не текст PR)

1. **`--help` вместо падения на зашитом пути.** Все восемь скриптов, rc=0:
```
export-source.mjs: rc=0     | export-source.mjs — read the SOURCE store into one JSON snapshot…
feature-inventory.mjs: rc=0 | feature-inventory.mjs — write the feature inventory…
import.mjs: rc=0            | import.mjs — create the tenant and import the source catalog…
measure-source.mjs: rc=0    | measure-source.mjs — count the SOURCE store…
measure-target.mjs: rc=0    | measure-target.mjs — the same counts on the TARGET database…
rehost-images.mjs: rc=0     | rehost-images.mjs — move every migrated image URL…
render-registry.mjs: rc=0   | render-registry.mjs — render the mapping registry as markdown…
render-report.mjs: rc=0     | render-report.mjs — render 03-migration-report.md…
```
`README.md` на месте: таблица «читает / пишет / требует в командной строке» по каждому скрипту + один копируемый пример.

2. **`GET /store/tenant/pages?locale=ru` отдаёт русский.** Стенд бэкенда ветки на :9088, БД `upready_store_t02`,
тенант `ten_01M29Q4KYQHC70JZBENWZ8Z88M`:
```
?locale=ru → {"pages":[{"key":"contacts","title":"Контакты и реквизиты","locale":"ru"},
                       {"key":"about","title":"Черкашина Оксана","locale":"ru"},
                       {"key":"privacy","title":"Политика конфиденциальности","locale":"ru"},
                       {"key":"offer","title":"Публичная оферта","locale":"ru"}]}
?locale=en → about: "Oksana Cherkashina"/en, остальные три — ru (фолбэк, en-строк нет)
```
Детальный маршрут:
```
about?locale=ru          http=200 locale=ru title=Черкашина Оксана
about?locale=en          http=200 locale=en title=Oksana Cherkashina
offer?locale=en          http=200 locale=ru title=Публичная оферта     (фолбэк)
offer?locale=de          http=200 locale=ru title=Публичная оферта     (фолбэк)
about?locale=%3Cscript%3E http=200 locale=en                            (кривая локаль ≠ 400)
x-medusa-locale: ru, без ?locale → locale "ru", "Черкашина Оксана"
```
Витрина ветки на :8088 (`cherkashino.localhost`):
```
/ru/pages/about  http=200  <title>Черкашина Оксана | Оксана Черкашина</title>
/en/pages/about  http=200  <title>Oksana Cherkashina | Оксана Черкашина</title>
/ru/pages/offer  http=200  <title>Публичная оферта | Оксана Черкашина</title>
/en/pages/offer  http=200  <title>Публичная оферта | Оксана Черкашина</title>  (фолбэк на ru)
```
В футере `/ru/pages/offer` все четыре ссылки (`/pages/contacts`, `/pages/about`, `/pages/privacy`,
`/pages/offer`) с русскими заголовками — по одному вхождению каждого.

3. **Seam-сьюита целиком зелёная** (мой прогон, не цитата):
```
cd apps/backend && DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9199 \
  pnpm test:integration:http -- integration-tests/http/tenants-pages.spec.ts     rc=0
PASS integration-tests/http/tenants-pages.spec.ts (12.643 s)
  ✓ serves the visitor's locale on the storefront and falls back to en, then to any locale (449 ms)
Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total            ← ноль fail по ВСЕМУ файлу
```

4. **Сборка витрины и линт бэкенда чистые:**
```
apps/backend  npx medusa lint      rc=0  (✖ 6 problems, 0 errors, 6 warnings)
apps/backend  npx tsc --noEmit     rc=0
apps/storefront npx tsc --noEmit   rc=0
apps/storefront npx next lint      rc=0  ✔ No ESLint warnings or errors
apps/storefront npx next build     rc=0
```

## Красный unit-тест: проверен, не привнесён PR

`pnpm test:unit` в воркtree: rc=1, `Tests: 1 failed, 61 passed, 62 total`,
падает `src/migration-scripts/__tests__/profile-data.unit.spec.ts` › «leaves a locale the profile never
translated identical to the base».
Тот же прогон в главном чекауте на `dev` (2fbb6ac): rc=1, `Tests: 1 failed, 61 passed, 62 total` —
те же числа, тот же тест. Файл `src/migration-scripts/**` в диффе PR отсутствует. Это состояние `dev`,
отдельная задача, а не регрессия этого PR.

## Вердикт

Сделано ровно то, что просила задача: скрипты + локаль публичных страниц + три документа миграции;
ветка `feat/cherkashina-tenant` не слита, снимок каталога не занесён, правка файлового провайдера
намеренно выброшена в пользу `LOCAL_FILE_BACKEND_URL` (проверено по `medusa-config.ts` и
`src/tenant-files/index.ts`). Тенант не создавался, импорт не запускался, деплоя нет. **MERGED.**
