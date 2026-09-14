## Что изменилось

На платформе не было журнала (`research/upready-store-capabilities.md` §3, строка «Блог» — MISSING,
§6 gap 12), а магазин Оксаны по договорённости с клиентом — «магазин-журнал»: статьи приводят
поисковый и AI-трафик на каталог. Теперь журнал есть у любого тенанта, а 18 опубликованных статей
клиента перенесены скриптом.

### Бэкенд

- **Модель** `apps/backend/src/modules/tenant/models/tenant-article.ts` — `tenant_article`:
  `slug`, `locale`, `title`, `excerpt`, `cover_url`, `body` (markdown), `published`,
  `published_at`, `tags`, `seo_title`, `seo_description`, связь с тенантом. Уникальный индекс
  `(tenant_id, slug, locale)` и индекс `(tenant_id, published, published_at)` под ленту.
  Миграция `Migration20260915053700.ts`.
  **Одна строка на язык:** `slug` — это статья, `(slug, locale)` — её текст на одном языке.
  Посетителю отдаётся его язык, при отсутствии — языковая часть → `en` → любой существующий
  (та же цепочка `pickPageForLocale`, что у страниц), а не 404.
- **Панельное API** `/tenants/articles` — `GET` (все строки тенанта, черновики включительно),
  `POST` (`{slug, locale, title}`), `/tenants/articles/:slug` — `GET`, `PUT` (сохранение одного
  языка), `DELETE` (вся статья или один язык через `?locale=`).
- **Публичное API** `/store/tenant/articles` — лента только опубликованных статей своего тенанта,
  по одной карточке на статью, новые сверху, с `limit`/`offset`; `/store/tenant/articles/:slug` —
  одна статья. Черновик, несуществующий slug и статья соседа отвечают одинаковым 404.
- Ревалидация `tenant.articles` на каждую запись.

### Витрина

- `/[locale]/journal` — лента: обложка, дата, заголовок, краткое описание, пагинация.
- `/[locale]/journal/[slug]` — статья: обложка, текст, `Article` JSON-LD, og:image из обложки,
  canonical и hreflang.
- `apps/storefront/src/app/sitemap.ts` — опубликованные статьи попадают в карту сайта своего
  тенанта (запрос идёт через `sdk.client.fetch` с publishable-ключом этого хоста, поэтому в чужую
  карту сайта они попасть не могут).
- **Пункт «Журнал» в навигации** — только когда у магазина есть хотя бы одна опубликованная статья
  (`hasPublishedArticles`). Добавлен во все шесть вариантов шапки: в боковое меню h1 и в ряд ссылок
  /полосу чипов h2–h6.
- **Читалка markdown** (`lib/util/markdown.ts`) научилась двум блокам — **цитате** (`>`) и
  **разделителю** (`---`), плюс заголовки глубже `###` больше не теряются, а зажимаются до `h3`.
  Это не украшение: замер по 18 статьям источника (`select body from article where
  status='published'`, БД `medusa_chrxn`) — **190 строк `---` и 72 строки `>`**. Без этих блоков
  они рендерились буквальным текстом («---» абзацем и «>» перед строкой) на каждой странице.
- 36 каталогов переводов: раздел `Journal` (9 ключей) и `SideMenu.items.journal`, в каждом языке
  своим текстом.

### Панель

Раздел «Журнал» (`routes/journal`): список статей (по одной строке на статью, с бейджами языков и
их статусом), форма создания (адрес + язык + заголовок), редактор в focus-модалке — заголовок,
краткое описание, **загрузка обложки через существующий `POST /tenants/uploads`**, markdown-тело,
метки, переключатель публикации, дата публикации, SEO-пара; переключатель языков с добавлением
нового; удаление статьи с подтверждением.

### Скрипт переноса

`apps/backend/scripts/cherkashina-migration/import-articles.mjs` — рядом с остальными скриптами
миграции, использует их же `lib/http.mjs` и `lib/mapping-registry.mjs`. Ходит **только** в HTTP API
тенанта, никогда SQL в целевую БД. Берёт только `status='published'` (45 MDX-черновиков и 39
конспектов не читает вовсе), сохраняет slug и дату, кладёт ru и en как две языковые строки одной
статьи, **перезаливает обложки в загрузки тенанта**, идемпотентен, умеет `--dry-run`, и то, что не
удалось перенести как есть, **печатает**, а не выбрасывает.

## Как измерено

Стенд: бэкенд `:9250` на своей БД `upready_store_t10` (клон `upready_store_t05`), витрина `:8041`,
панель `:5180`, тенанты `oksana-t05` (журнал) и `t05acc` (сосед для проверки изоляции).

### Перенос 18 статей

```
$ /opt/homebrew/bin/psql-17 "postgres://ivanprotsko@localhost:5433/medusa_chrxn" -At \
    -c "select count(*) from article where deleted_at is null and status='published';"
18

$ node apps/backend/scripts/cherkashina-migration/import-articles.mjs \
    --backend http://localhost:9250 --admin-email admin@oksana-t05.test \
    --admin-password supersecret --registry artifacts/docs/t10-blog/articles-registry.json
read                 18
created              18
updated              0
unchanged            0
skipped              0
failed               0
covers_rehosted      9      ← 9 файлов на 18 строк: ru и en одной статьи делят одну обложку
covers_attached      18
covers_missing       0
body_refs_reported   0
not carried as-is: nothing — every cover re-hosted, no foreign reference in any body

$ ... тот же вызов второй раз
read                 18
created              0
updated              0
unchanged            18     ← второй прогон не пишет ничего
failed               0
```

Что легло в БД (18 строк = 9 статей × 2 языка, 9 уникальных обложек — все под префиксом тенанта):

```
$ psql-17 "postgres://postgres@localhost:5433/upready_store_t10" -At -F'|' -c \
  "select count(*) rows, count(distinct slug) slugs, count(*) filter (where published) published,
          count(distinct cover_url) covers from tenant_article where deleted_at is null;"
18|9|18|9

$ ... "select distinct cover_url from tenant_article ... limit 1;"
http://localhost:9250/static/tenants/ten_01M2GV25H80DNDC1HKFX50CMT4/1789422790222-detoks-i-kortizol.png
```

Реестр переноса (правило 18b, JSON — запись, а не MD): `artifacts/docs/t10-blog/articles-registry.json`,
`summary: {"article": {"total": 18, "migrated": 18, "skipped": 0, "failed": 0, "pending": 0}}`.

### Витрина

```
$ curl -s --resolve oksana-t05.localhost:8041:127.0.0.1 http://oksana-t05.localhost:8041/ru/journal
http_code=200 ; карточек: 9

$ curl ... http://oksana-t05.localhost:8041/ru/journal/detoks-i-kortizol
http_code=200
journal-article-title">Очищение и хронический стресс: почему детокс не работает на фоне кортизола
```

Разметка страницы статьи (распарсен реальный HTML ответа):

```
Article JSON-LD: {"@type":"Article",
  "headline":"Очищение и хронический стресс: почему детокс не работает на фоне кортизола",
  "inLanguage":"ru",
  "url":"http://oksana-t05.localhost:8041/ru/journal/detoks-i-kortizol",
  "datePublished":"2026-06-14T01:00:36.893Z",       ← дата источника перенесена как есть
  "image":["http://localhost:9250/static/tenants/ten_.../...-detoks-i-kortizol.png"]}
og:image  = http://localhost:9250/static/tenants/ten_.../1789422790222-detoks-i-kortizol.png
canonical = http://oksana-t05.localhost:8041/ru/journal/detoks-i-kortizol
blockquote в HTML: 1 ; <hr>: 11 ; буквальных абзацев «---»: 0 ; обложка на странице: да
```

### Карта сайта: своя статья есть, чужому тенанту не видна

```
$ curl ... http://oksana-t05.localhost:8041/sitemap.xml | grep -c "/ru/journal/"
9
  <loc>http://oksana-t05.localhost:8041/ru/journal</loc>
  <loc>http://oksana-t05.localhost:8041/ru/journal/antiparazitarka-na-travah</loc>
  ...

$ curl ... http://t05acc.localhost:8041/sitemap.xml | grep -c "journal"
0        ← у соседнего тенанта нет ни одной записи журнала, даже ссылки на ленту
```

### Черновик даёт 404, публикация видна без пересборки

```
$ PUT /tenants/articles/thyreogen-shchitovidka {"locale":"ru"|"en", "published": false}   → 200, 200
$ backend log: [revalidate] type=tenant.articles handle=oksana-t05 url=.../api/revalidate status=200
$ лента: 9 → 8 карточек ; GET /ru/journal/thyreogen-shchitovidka → http_code=404
$ sitemap: 9 → 8 записей /ru/journal/
   — всё это без перезапуска витрины

$ обратно (повторный прогон импорта, updated 2) → лента 9 карточек, статья http_code=200
   — тоже без перезапуска
```

### Скриншоты (PNG вне git, абсолютные пути)

Смотрел глазами, не только «файл создан»:

- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-blog/artifacts/docs/t10-blog/storefront-feed-1280x900.png` — лента: 9 карточек, обложки, даты «14 июня 2026 г.», заголовки и описания, в теме магазина
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-blog/artifacts/docs/t10-blog/storefront-feed-390x844.png` — та же лента в одну колонку на телефоне
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-blog/artifacts/docs/t10-blog/storefront-article-1280x900.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-blog/artifacts/docs/t10-blog/storefront-article-390x844.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-blog/artifacts/docs/t10-blog/storefront-article-body-1280x900.png` — тело статьи: врезка «Кратко» карточкой, разделители линиями, подзаголовки; буквальных «---» и «>» на странице нет
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-blog/artifacts/docs/t10-blog/storefront-article-body-390x844.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-blog/artifacts/docs/t10-blog/storefront-nav-1280x900.png` — боковое меню витрины: Главная · Магазин · **Журнал** · Профиль · Корзина
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-blog/artifacts/docs/t10-blog/panel-journal-list-1280x900.png` — экран «Журнал» в панели: 9 статей, публичные адреса, бейджи языков, даты
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-blog/artifacts/docs/t10-blog/panel-journal-list-390x844.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-blog/artifacts/docs/t10-blog/panel-journal-edit-1280x900.png` — редактор: переключатель языков (English · Русский · + Deutsch/Español/Français), заголовок, описание, превью обложки

**Дефект, найденный глазами и исправленный:** на первом прогоне в боковом меню панели пункт стоял
как «Journal» среди русских соседей — не было ключа `app.nav.main.journal` в каталогах панели, и
показывался `defaultValue`. Добавлен в `ru.json`/`en.json`, переснято, замер после фикса:
`nav label = "Журнал"`.

### Наборы тестов (строки результата целого файла)

```
$ cd apps/backend && npx medusa lint
✖ 20 problems (0 errors, 20 warnings)      ← все 20 предсуществующие, ни одного в тронутых файлах
$ npx tsc --noEmit                          → rc=0, 0 ошибок

$ pnpm test:unit
Test Suites: 1 failed, 7 passed, 8 total
Tests:       1 failed, 79 passed, 80 total
  ← падает profile-data.unit.spec.ts «i18n merge». НЕ наша регрессия, проверено прогоном
    того же файла в основном чекауте на dev: Tests: 1 failed, 14 passed, 15 total.

$ DB_HOST=localhost DB_PORT=5433 DB_USERNAME=postgres PORT=9251 \
    pnpm test:integration:http -- tenants-articles
Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total            ← новый seam-файл

$ DB_HOST=localhost DB_PORT=5433 DB_USERNAME=postgres PORT=9260 pnpm test:integration:http
Test Suites: 2 failed, 13 passed, 15 total
Tests:       3 failed, 151 passed, 154 total

$ cd apps/tenant-panel && npx tsc --noEmit && npx eslint src
tsc rc=0 ; eslint: 0 errors, 23 warnings (предсуществующие, вне тронутых файлов)

$ cd apps/storefront && npx vitest run src/lib/util/markdown.test.ts
Test Files  1 passed (1) ; Tests  6 passed (6)
$ npx tsc --noEmit                          → rc=0
$ npx next lint                             → ✔ No ESLint warnings or errors
$ npx next build                            → rc=0
├ ƒ /[locale]/journal                                243 B         125 kB
├ ƒ /[locale]/journal/[slug]                         243 B         125 kB
```

**Три падения в integration:http — разобраны, ни одно не от журнала.** Сначала их было 11: восемь
из них (`tenants-payment-settings`, все) — это `POST /tenants/seed` → 500 «Neither
STORE_PROFILES_MEDIA_BASE_URL nor STORE_MEDIA_BASE_URL is set» на моём стенде; после добавления
переменной в `.env` файл зелёный (8 passed). Оставшиеся три:

1. `tenants.spec` × 2 — «resolves shipping options only from the tenant's own warehouse» и
   «keeps two tenants' warehouses apart even in the same city», строка 309:
   `names.every(n => n.startsWith("Acme"))`. Причина измерена, а не предположена: **t04 (#25,
   коммит-база этой ветки) переименовал дефолтные опции доставки в человеческие имена** — в БД
   стенда они теперь `Pickup` и `Courier delivery`, без префикса магазина вовсе:
   ```
   $ psql ... "select so.name from shipping_option so where so.deleted_at is null limit 4;"
   Pickup | Courier delivery | Pickup | Courier delivery
   ```
   Утверждение теста осталось от старого именования. Мой diff не трогает ни доставку, ни склады,
   ни сид (`git diff --name-only b2453fb..HEAD` — только файлы журнала).
2. `tenants-domains` × 1 — `toEqual` не перечисляет поле `is_primary`, которое ответ теперь несёт.
   Это уже было записано как предсуществующее в теле PR #24 (t05-page-keys).

Отдельно: **локальный `dev` в основном чекауте протух** — `d2b32a0`, и `b2453fb` (#25) в него не
входит, тогда как в `origin/dev` (`2508708`) входит. Первое сравнение «на dev зелено» я сделал
именно против этой протухшей ветки и отбросил его как недействительное; вывод выше построен на
замере имён в БД, а не на том прогоне.

## Что НЕ сделано и почему

- **Отдельный модуль и линк в `apps/backend/src/links/`.** Шаг 1 брифа называл и «own module», и
  «the shape the other tenant-scoped entities already use» — это разные вещи, и я пошёл по второй.
  В `src/links/` лежат связи с *ядровыми* модулями Medusa (product, order, promotion…), а весь
  собственный контент тенанта — `tenant_page`, `tenant_home_config`, `tenant_domain`,
  `tenant_integration_secret` — живёт моделями внутри модуля `tenant` с `belongsTo`. Журнал
  сделан так же: тот же модуль, тот же вид индекса, та же машинерия панели, витрины и ревалидации.
  Отдельный модуль потребовал бы линка и своей копии всего этого без выигрыша.
- **`status` как текст `draft|published`.** В модели `published: boolean` — ровно два значения,
  которые бриф и называет, зато совпадает с `tenant_page` и не заводит check-constraint и второй
  словарь состояний.
- **Тексты только 18 опубликованных статей.** 45 MDX-черновиков и 39 конспектов не переносились
  (бриф это и запрещает), текст моделью не генерировался, генератора статей здесь нет.
- **Деплой не выполнялся**, в живую БД не писалось — бриф запрещает.
- Тенант на стенде — `oksana-t05` (он уже был в клонированной БД), а не живой `cherkashino`:
  задача не разрешает писать в прод. Скрипт переноса принимает любого тенанта параметрами.
- `PUT /tenants/articles/:slug` — запись документа целиком, как у страниц: панель всегда шлёт всю
  форму. Частичный PUT без `cover_url` обнулит обложку. Заметно это на ручных curl'ах, не в панели.

## Как проверить за 10 минут

1. `cd apps/backend && DB_HOST=localhost DB_PORT=5433 DB_USERNAME=postgres PORT=9300 pnpm test:integration:http -- tenants-articles` — ожидается 10/10.
2. `cd apps/storefront && npx vitest run src/lib/util/markdown.test.ts` — 6/6 (цитата, разделитель, зажим заголовка).
3. Стенд: поднять бэкенд на своей БД и витрину, создать тенанта, затем
   `node apps/backend/scripts/cherkashina-migration/import-articles.mjs --backend http://localhost:<порт> --admin-email <...> --admin-password <...> --registry /tmp/reg.json --dry-run`
   — ожидается `read 18`, `skipped 18`, `failed 0`; без `--dry-run` — `created 18`, второй прогон `unchanged 18`.
4. Открыть `http://<handle>.localhost:<порт витрины>/ru/journal` и любую статью: обложка, текст,
   врезка карточкой, разделители линиями. Снять публикацию в панели — статья отдаёт 404, карточка
   уходит из ленты и запись из `/sitemap.xml` без перезапуска.
5. `curl http://<другой-handle>.localhost:<порт>/sitemap.xml | grep -c journal` → `0`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_0182rksZxCBmPrpV4WQixz7W
