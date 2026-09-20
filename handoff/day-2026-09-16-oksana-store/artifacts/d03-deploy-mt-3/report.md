# d03-deploy-mt-3 — финальный деплой dev на живой mt-хост, волна 3 (attempt 4)

Время отчёта: 2026-09-15 14:25 WITA. Часы хоста Contabo — CEST (UTC+2), это WITA минус 6 часов:
окно этого прогона на хосте — 08:07…08:25 CEST = 14:07…14:25 WITA.

**Итог: задеплирован `2286d43`, 5/5 платформенных URL и 5/5 карточек магазина клиента отдают 200,
бэкенд поднялся на новом образе (падения из-за `sharp` больше нет).**

## 1. Что задеплировано

| | |
|---|---|
| Предыдущий sha (волна 2, `d02-deploy-mt-2/report.md`) | `2508708` |
| Задеплированный sha (`git rev-parse --short origin/dev`) | **`2286d43`** |
| Коммитов между ними (`git log --oneline 2508708..origin/dev \| wc -l`) | 41 (16 продуктовых PR + служебные handoff-коммиты) |

Важная особенность прогона: локальный чекаут `dev` **разошёлся** с `origin/dev` (6 своих
handoff-коммитов впереди, 6 продуктовых коммитов позади, `git merge-base --is-ancestor origin/dev HEAD` → NO).
Поэтому на хост уехал не рабочий каталог, а ровно дерево `origin/dev`, выгруженное
`git archive origin/dev | tar -x -C <tmp>` — иначе rsync отправил бы устаревший продуктовый код
(ровно та находка про stale-чекаут, что записана в коммите `e93a837` предыдущей попытки).

### Продуктовые PR в составе волны 3 (`2508708..origin/dev`)

#44 f17-backend-image-sharp · #42 f03-guest-order-not-in-account · #32 t12-legal-requisites ·
#43 f07-page-markdown-tables · #41 f05-checkout-legal-stubs · #40 f04-address-without-city ·
#39 f02-order-email-not-sent · #37 t17-analytics · #38 f01-thankyou-brand · #36 t16-owner-branding ·
#35 t15-product-attributes · #34 t14-product-import · #29 t11-seo-redirects · #30 t09-reviews ·
#33 t13-customers-screen · #31 t10-blog.

## 2. Полный список PR, смёрженных сегодня

Команда из брифа (`merged:>=2026-09-15`, граница по UTC), вывод — `artifacts/d03-deploy-mt-3/merged-prs.json`.
**N = 13:**

| # | Задача | Заголовок | mergedAt (UTC) |
|---|---|---|---|
| #29 | t11-seo-redirects | feat(seo): SEO магазина: мета-поля, sitemap тенанта, 301 со старых адресов | 2026-09-15T00:29:44Z |
| #34 | t14-product-import | feat(products): Импорт и выгрузка каталога таблицей CSV или XLSX | 2026-09-15T01:17:04Z |
| #35 | t15-product-attributes | feat(catalog): Произвольные характеристики товара и фильтры по ним | 2026-09-15T02:09:55Z |
| #36 | t16-owner-branding | feat(branding): Бренд владельца: логотип, цвета, фавикон, картинка для соцсетей | 2026-09-15T02:24:08Z |
| #38 | f01-thankyou-brand | fix(storefront): Страница «Спасибо» после оплаты показывает бренд UPREADY и чужую плашку | 2026-09-15T02:51:37Z |
| #37 | t17-analytics | feat(analytics): Счётчики магазина и сводка продаж в панели | 2026-09-15T02:51:53Z |
| #39 | f02-order-email-not-sent | fix(orders): Письмо о заказе не уходит, а магазин пишет «подтверждение отправлено» | 2026-09-15T02:58:34Z |
| #40 | f04-address-without-city | fix(checkout): Заказ проходит без города и индекса — отправить посылку нельзя | 2026-09-15T03:55:44Z |
| #41 | f05-checkout-legal-stubs | fix(storefront): В чекауте ссылки на оферту и политику ведут на заглушки стартера | 2026-09-15T04:04:17Z |
| #43 | f07-page-markdown-tables | fix(storefront): На страницах магазина таблицы выводятся сырым markdown-текстом | 2026-09-15T04:21:06Z |
| #32 | t12-legal-requisites | feat(tenant,tenant-panel): Реквизиты продавца подставляются в юридические тексты | 2026-09-15T04:29:06Z |
| #42 | f03-guest-order-not-in-account | fix(account): Заказ гостя не появляется в кабинете при регистрации с тем же e-mail | 2026-09-15T05:30:21Z |
| #44 | f17-backend-image-sharp | fix(backend): Образ mt-backend не содержит модуль sharp — бэкенд падает на старте после деплоя | 2026-09-15T06:05:16Z |

Поправка к этому списку, важная для сводки дня: граница команды — UTC, а рабочий день идёт по WITA
(UTC+8). Ещё **три** PR того же рабочего дня смёржены до полуночи UTC и в выборку не попали:
**#31** t10-blog (2026-09-14T23:26:23Z), **#33** t13-customers-screen (23:42:36Z), **#30** t09-reviews
(23:57:00Z). По рабочему дню задач получается **16**, по UTC-суткам — **13**.

## 3. Дампы БД — до и после

| Когда | Путь | Размер |
|---|---|---|
| ДО деплоя | `/opt/upready-store/backups/medusa_mt-pre-d03-20260915-080906.dump` | 5 578 143 байт |
| ПОСЛЕ деплоя | `/opt/upready-store/backups/medusa_mt-post-d03-20260915-082505.dump` | 5 581 654 байт |

Находка по команде из брифа: `pg_dump -U postgres` на этом хосте **не работает** —
`FATAL: role "postgres" does not exist`, и при этом `> файл` создаёт дамп **нулевого размера** с rc=1.
Рабочая форма — `-U medusa` (как в памятке protected-infra). В `/opt/upready-store/backups/` лежат два
таких пустых файла-обрубка от неудачных вызовов (`…-050737.dump`, `…-080855.dump`, оба 0 байт);
ничего не удалял. Рецепт в брифах d01/d03 стоит поправить на `-U medusa`.

## 4. Сборка и подъём

- Liveness-проба хоста: `ssh rc=0`.
- Env `/opt/upready-store/mt/deploy/mt/shipshift.env` не трогал, md5 `b788f1886315a512485e0515aeb8fb53` —
  совпадает с волной 2. Новых переменных смёрженные задачи не потребовали.
- rsync кода (дерево `origin/dev`, без `--delete`): rc=0.
- Сборка `docker compose build backend storefront panel`, лог на хосте
  `/opt/upready-store/mt-build-d03-20260915-081007.log`. Все три образа `Built`.
- **Гвард из f17 отработал в сборке:** `verify-runtime-modules: 324 boot modules required, all imports resolve`.
- **Проверка `sharp` в новом образе ДО `up -d`** (то, чего не хватило попытке 3):
  `docker run --rm --entrypoint node mt-backend:latest -e 'require("sharp")'` → `sharp OK 0.35.4`, rc=0.
- Откатная точка на месте и не перетёрта: `mt-backend:wave2-2508708`, `mt-storefront:wave2`, `mt-panel:wave2`.
  Новые образы дополнительно помечены `:d03-final`. Сломанный образ попытки 3
  (`mt-backend:d03-new-broken-sharp`) оставлен как есть — ничего не удалял и не пруинил.
- `docker compose up -d`: `mt-backend Recreated → Healthy`, затем `mt-storefront` и `mt-panel`.

### Образы (`CreatedAt` — внутри окна прогона 08:07…08:25 CEST)

```
mt-backend:latest     2026-09-15 08:18:24 +0200 CEST   (= mt-backend:d03-final)
mt-storefront:latest  2026-09-15 08:16:34 +0200 CEST   (= mt-storefront:d03-final)
mt-panel:latest       2026-09-15 08:12:32 +0200 CEST   (= mt-panel:d03-final)
```

### Контейнеры

```
mt-backend       Up 4 minutes (healthy)   mt-backend:latest
mt-storefront    Up 3 minutes (healthy)   mt-storefront:latest
mt-panel         Up 3 minutes (healthy)   mt-panel:latest
mt-postgres      Up 3 days (healthy)      postgres:16-alpine
mt-ingress-sync  Up 3 days                postgres:16-alpine
```

## 5. Миграции и бэкфиллы

`docker-entrypoint.sh` гоняет `medusa db:migrate` на каждом старте, дамп был снят до этого.

- **Выполнилась одна миграция:** `Migration20260915063900` → `Completed successfully`.
  Это `apps/backend/src/modules/tenant/migrations/Migration20260915063900.ts` из **#32 t12-legal-requisites**
  — таблица `tenant_requisites` (реквизиты продавца). Создаётся через `create table if not exists`.
- Все остальные модули: `Skipped. Database is up-to-date for module.` Ошибок в логе старта нет.
- `backfill-hero-copy.js`: 13 home documents, 0 patched, 13 left alone.
- `backfill-option-translations.js`: profile "sneakers", 5 options × 36 locales — 0 rewritten, 0 created,
  1224 already right.

Оба бэкфилла идемпотентны и правок не потребовали.

## 6. Финальный health-свип

### Пять платформенных URL

| URL | код |
|---|---|
| https://shipshift.dev/health | 200 |
| https://start.upready.dev/start/onboarding | 200 |
| https://panel-store.upready.dev/ | 200 |
| https://cherkashino.shipshift.dev/ru | 200 |
| https://zolotaya-nit-1057.shipshift.dev/ru | 200 |

### Пять карточек магазина клиента

Handle'ы взяты из HTML каталога `https://cherkashino.shipshift.dev/ru/store`
(`href="/products/…"`, 12 карточек на странице), не придуманы:

| URL | код |
|---|---|
| https://cherkashino.shipshift.dev/ru/products/gepachisty-cherkashino | 200 |
| https://cherkashino.shipshift.dev/ru/products/kapli-v-nos-asd-i-serebro-cherkashino | 200 |
| https://cherkashino.shipshift.dev/ru/products/maz-ot-varikoza-s-kashtanom-cherkashino | 200 |
| https://cherkashino.shipshift.dev/ru/products/sila-razdelnogo-pitaniya-250-retseptov-poleznyh-blyud-cherkashino | 200 |
| https://cherkashino.shipshift.dev/ru/products/tabletki-ot-varikoza-s-kashtanom-cherkashino | 200 |

### Проверки реестра protected-infra (`upready-store-mt-platform`)

```
start.upready.dev/start/onboarding                 200
panel-store.upready.dev/                           200
zolotaya-nit-1057.shipshift.dev/  (code ssl)       302 0   # редирект на /ru, TLS валиден
shipshift.dev/static/store-profiles/abstract/…webp 200
cherkashino.shipshift.dev/ru      (code ssl)       200 0
```

### Маркер «отвечает именно новый код»

На хосте нет `.git`, поэтому кроме `CreatedAt` взят прямой маркер: маршрут **t16** `/tenants/branding/upload`
(тот самый, ради которого нужен `sharp`) отвечает **401** (требует авторизации), а не 404 — код из #36/#44
загружен и обслуживает запросы.

### Каталог клиента — свой, не демо

`GET /store/products?limit=1` с публикуемым ключом тенанта cherkashino → **`count=29`**, первый товар —
«Свечи АСД с чесноком». Совпадает с зафиксированным в x01/d02 (29 опубликованных из 38).

## 7. Медиа и риск бэкапов

| | |
|---|---|
| `/opt/upready-store/media-tenants` всего | **117 МБ**, 3 каталога тенантов |
| Каталог клиента `ten_01M2GQVGEN1204CN90C510DNRG` (= handle `cherkashino`, сверено по `select id, handle from tenant`) | **117 МБ, 338 файлов** |
| `ten_01M2EY6NESKPSDK0MT0P4NSKD7` (accept-commerce-1106) | 96 КБ, 5 файлов |
| `ten_01M2EY8J0450YYQS29J04FFRGK` (accept-content-1107) | 452 КБ, 2 файла |

То есть практически весь объём загрузок платформы — это картинки магазина Оксаны.

**РИСК №15 «Эксплуатация»** (`research/upready-store-capabilities.md`, п. 15 списка пробелов, и §3 строка
«Бэкапы и экспорт данных тенанта»): медиа лежат **на одном хосте, без S3 и без автоматических бэкапов** —
`S3_BUCKET` на МТ не задан, ночной per-tenant job и R2/restic существуют только спекой
`docs/multitenancy/backup-spec.md`. `pg_dump` спасает БД, но **не байты картинок**: потеря
`/opt/upready-store/media-tenants` = 338 файлов магазина клиента, восстановить неоткуда (в git их нет
по правилу «media never enter git»). Сегодня, по брифу, не чинится — вынесено как риск для Ивана.

## 8. Что удивило

1. **Локальный `dev` разошёлся с `origin/dev`** — наивный `rsync ./` уехал бы со старым продуктовым кодом.
   Лечится выгрузкой `git archive origin/dev`; это же объясняет находку `e93a837` предыдущей попытки.
2. **`pg_dump -U postgres` из брифа не существует на этом хосте** и молча оставляет дамп в 0 байт при rc=1
   (правило 20a: пустое — это не «нет данных», это отсутствие замера). Рабочее — `-U medusa`.
3. **Первая выборка handle'ов дала пять 404** — я вытащил `/ru/products/<handle>` регуляркой по всему HTML
   и поймал не ссылки магазина, а поля `source_url` импорта (`https://olavka.ru/ru/ru/products/…`) в
   метаданных товаров. Реальные адреса — `/products/<handle>-cherkashino`. Не дефект витрины: это следы
   происхождения каталога, оставленные импортом; но если такие `source_url` не нужны покупателю в HTML,
   это кандидат в задачу (чужой домен уезжает в разметку страницы).
4. Storefront и panel пришлось пересобирать не только из-за f17: образы `d03-new` попытки 3 собраны в
   05:23 CEST, а #40, #41, #43, #32 и #42 смёржены **позже** (03:55…05:30 UTC = 05:55…07:30 CEST), то есть
   в тех образах этих правок не было.
