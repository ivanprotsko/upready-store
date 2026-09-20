# Приёмка PR #29 · t11-seo-redirects · раунд 3

Приёмщик: headless-сессия в основном чекауте `/Users/ivanprotsko/upready/projects/upready-store` (ветка `dev`).
Показание системных часов на момент промпта диспетчера: 2026-09-15 08:09 WITA.
PR: https://github.com/ivanprotsko/upready-store/pull/29 · head `feat/day16-seo-redirects` · base `dev`.

## Состояние ветки

- `gh pr view 29`: `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN` (в раундах 1 и 2 был `CONFLICTING`).
- Воркtree `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-seo-redirects`:
  `git status --short` пусто, `HEAD == origin/feat/day16-seo-redirects == 5d7186c3`, `HEAD..origin/dev` пусто
  (мерж `8d3e6ba` втянул `origin/dev` 9720910).
- Диффа с `dev`: 46 файлов, +1489/−19. Секретов в добавленных строках нет, миграции те же две, аддитивные.

## Стенд приёмщика (свой, не воркера)

БД `upready_store_t11acc3` = `pg_dump upready_store_mt` + restore (0 ошибок) + `npx medusa db:migrate` (rc=0,
`tenant_redirect` и `tenant_page.seo_title/seo_description` созданы). Бэкенд `:9121`, витрина `:8121`,
панель `:5187` — всё из воркtree ветки. Тенант `cherkashino` создан через `POST /admin/tenants`,
`default_locale=ru`, `enabled_locales=[ru,en]`, каталог засеян (`POST /tenants/seed` → 10 товаров, 7 категорий).

## Критерии приёмки — замеры

### 1. Владелец задаёт title/description у товара, категории и страницы → они в `<head>`

Товар и категория заполнены ЧЕРЕЗ ПАНЕЛЬ (Playwright: логин владельца, форма товара/категории, Save).
Подпись поля в панели: `Заголовок для поиска (Русский, 0/70)` — то есть панель пишет в локаль магазина,
а не в литерал `en` (претензия раунда 2 закрыта). В БД после сохранения:
`product.metadata.seo = {"ru": {"title": "Куб №1 мелом — купить в Черкашино", …}}`.

```
curl -s http://cherkashino.localhost:8121/ru/products/cube-1-cherkashino
<title>Куб №1 мелом — купить в Черкашино | Оксана Черкашина</title>
<meta name="description" content="Ручная работа, отгрузка за два дня со склада Черкашино. Проверка приёмки t11 раунд 3."/>

curl -s http://cherkashino.localhost:8121/ru/categories/forms-cherkashino
<title>Формы из гипса — каталог Черкашино | Оксана Черкашина</title>
<meta name="description" content="Категория «Формы»: кубы, сферы и цилиндры ручной работы. Проверка приёмки t11 раунд 3."/>

curl -s http://cherkashino.localhost:8121/ru/pages/about
<title>О мастерской Черкашино — история и подход | Оксана Черкашина</title>
<meta name="description" content="Кто делает эти формы: мастерская Оксаны Черкашиной, ручная работа с 2014 года. Приёмка t11 раунд 3."/>
```

### 2. Постраничные 301 с адресов olavka.ru (замер приёмщика, `301-measurements.txt`)

```
/ru/ru/products/zubnaya-pasta-tayskaya-otbelivayuschaya → 301 → /ru/products/zubnaya-pasta-tayskaya-otbelivayuschaya-cherkashino
/ru/ru/products/ingalyator-portativnyy               → 301 → /ru/products/ingalyator-portativnyy-cherkashino
/ru/ru/categories/dobavki                            → 301 → /ru/categories/dobavki-cherkashino
/ru/ru/categories/multivarki                         → 301 → /ru/categories/multivarki-cherkashino
```
Смена хендла товара через API панели пишет свой 301: `/ru/products/cube-1-cherkashino` → 301 →
`/ru/products/cube-1-cherkashino-new`; занятый хендл — `invalid_data: the handle "…" is already in use`
(без молчаливого суффикса). Дубль `from_path` в `POST /tenants/redirects` — тоже `invalid_data`.

### 3. Петля не вешает запрос

`/loop-a → /loop-b`, `/loop-b → /loop-a` (созданы через `POST /tenants/redirects`):
оба адреса отдают `HTTP/1.1 508 Loop Detected` (`loop-508.txt`).

### 4. Импорт таблицы клиента

```
npx medusa exec ./src/scripts/import-cherkashino-redirects.ts <02-mapping-registry.json>
1-й прогон: 47 written, 0 already present, 0 unmapped (tenant cherkashino, dry_run=false)
2-й прогон:  0 written, 47 already present, 0 unmapped
psql: select count(*) from tenant_redirect → 47 (все status_code=301)
```

### 5. Sitemap двух тенантов не пересекается (`sitemap-compare.txt`)

`acme` 1693 `<loc>`, `cherkashino` 1008 `<loc>`. По видам путей:
`products: acme=1260 cherkashino=360 пересечение=0`; `categories: 36 / 252 / 0`; `pages: 1 / 1 / 0`.
Собственная страница тенанта видна в его sitemap: `http://cherkashino.localhost:8121/ru/pages/about`.
Пересечение есть ТОЛЬКО в секции коллекций (108 путей) — коллекции в Medusa не привязаны к тенанту,
это прямо описано комментарием в `sitemap.ts` и вынесено из области задачи.

### 6. Верификация поисковиков (шаг 6 брифа)

`PUT /tenants/seo-verification {"yandex":"acc3yandex0001","google":"acc3google0001"}` →
на `http://cherkashino.localhost:8121/ru`:
`<meta name="google-site-verification" content="acc3google0001"/>`, `<meta name="yandex-verification" content="acc3yandex0001"/>`;
на `http://acme.localhost:8121/ru` этих значений НЕТ (0 вхождений).

## Проверки кода

| Проверка | Результат |
|---|---|
| `apps/backend` `npx tsc --noEmit` | rc=0 |
| `apps/storefront` `npx tsc --noEmit` | rc=0 |
| `apps/tenant-panel` `pnpm typecheck` | rc=0 |
| `apps/storefront` `pnpm test:unit` (vitest) | 14 файлов, 141/141 зелёных |
| `apps/backend` `pnpm test:unit` | 115/116; падает `profile-data.unit.spec.ts` |
| тот же тест на `dev` (основной чекаут) | 14/15 — падение ПРЕДСУЩЕСТВУЮЩЕЕ, к t11 отношения не имеет |
| `apps/backend` `DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9198 pnpm test:integration:http` | 172/175; красные: `tenants.spec.ts` (2 — склады/доставка), `tenants-domains.spec.ts` (1 — лишнее поле `is_primary`) |
| те же два спека на `dev` (основной чекаут, тот же env) | ТЕ ЖЕ 3 падения (48/51) — предсуществующие, PR #29 их не приносил |

Первый прогон интеграции (17/17 красных, `role "ivanprotsko" does not exist`) — ошибка ЗАМЕРА приёмщика:
раннер берёт `DB_PORT` из env и по умолчанию идёт на 5432, а Postgres стенда на 5433 (правило 18h).

## Вердикт: MERGED

Все критерии приёмки замерены на живом стенде приёмщиком (не по тексту PR). Претензии раундов 1 и 2 закрыты:
конфликт с `dev` разведён (мерж `8d3e6ba`), поля SEO товара/категории в панели есть и пишут в локаль магазина.

## Нитки (в PR-комментарий, не причина отказа)

1. Нет seam-спека на новые роуты `/tenants/redirects*` и `/tenants/seo-verification` — у всех соседних
   ресурсов тенанта такой есть (`tenants-pages.spec.ts`, `tenants-domains.spec.ts`, …). Кандидат в задачу.
2. Тело PR устарело: в разделе «Что НЕ сделано» до сих пор написано, что SEO-полей товара/категории в панели
   нет, — они добавлены в раундах 2–3.
3. Панель правит ОДНУ локаль (`default_locale` магазина); переключателя языка у пары полей нет. Если владелец
   успеет нажать Save до того, как приедут настройки локали, значения лягут в `en` — узкое окно, но реальное.
4. Экран таблицы редиректов и поле верификации в панели остаются API-only — в PLAN.md это строка «перенос».
5. Коллекции в sitemap не скоупятся по тенанту (108 общих путей у acme и cherkashino) — предсуществующее,
   в коде описано комментарием; кандидат в отдельную задачу.
6. 39 строк `legacy_page` и 16 `page` реестра миграции остаются без 301 (бриф просил 47 = товары+категории).
7. Три КРАСНЫХ теста на самом `dev` (unit `profile-data`, 2 в `tenants.spec`, 1 в `tenants-domains`) — чинить
   отдельной задачей, к t11 отношения не имеют.
