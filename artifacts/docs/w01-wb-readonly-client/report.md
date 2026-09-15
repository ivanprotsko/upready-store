# w01-wb-readonly-client — WB Seller API: клиент только на чтение по конструкции

Отчёт написан 2026-09-16 04:32 WITA. Ветка `feat/day16-wb-readonly-client`, стенд — локальный
Postgres `127.0.0.1:5433/upready_store_w01`, тенант `cherkashino`. Живой хост не затронут.

## 1. Инвариант Ивана и как он выполнен

> «если ассистент создававший ключи по ошибке выдал права не только на чтение, а еще и на запись,
> то исключить ситуацию что какая-то запись будет выполнена на WB»

Запись в Wildberries невозможна **не потому, что ключ ограничен**, а потому, что её негде выразить:

1. **Реестр** `apps/backend/src/modules/wb/endpoints.ts` — список разрешённых чтений. Валидатор
   `validateRegistry()` вызывается при загрузке модуля и бросает `WbWriteForbiddenError`, если в
   реестре появится `PUT`/`PATCH`/`DELETE`, хост не `*.wildberries.ru`, `POST` без ссылки на
   документацию или дубль id.
2. **Транспорт** `apps/backend/src/modules/wb/transport.ts` — единственный файл репозитория, который
   ходит в `*.wildberries.ru`. Публичная поверхность: `wbRead(endpointId, options)`. Вызывающий
   называет **запись реестра**, а не метод, хост или URL; метод берётся из записи.
   Незарегистрированный id падает до открытия сокета. Модуль не экспортирует ни `fetch`, ни клиент,
   ни базовый URL, ни «сырой запрос» — лазейки нет.
3. **Почему не «запретить глаголы записи», а белый список.** На WB глагол не решает:
   `POST /api/v3/stocks/{warehouseId}` — это «Get Inventory» (чтение), а `PUT` и `DELETE` на **том же
   пути** обновляют и удаляют остатки. Безопасен только список точных пар (метод, путь), которые
   документация называет чтением.
4. **Двойная бухгалтерия по POST.** Каждый `POST`-эндпоинт продублирован руками в
   `POST_READ_ENDPOINT_IDS` внутри `__tests__/transport.unit.spec.ts`. Добавить POST только в реестр —
   значит уронить сюиту, пока человек не впишет его и в тест.
5. **Журнал** `wb_api_call` — строка на каждый запрос (endpoint_id, host, method, path, status, ms,
   fetched_at). Проверяется постфактум одним `select`, без доверия к коду. Ключ туда не попадает,
   в логах `Authorization: ***`.

## 2. Что документация WB реально говорит (правило 17a)

Портал `dev.wildberries.ru` за антиботом: curl отдаёт HTTP 498. Прочитан 2026-09-16 через headed
Chrome, подключённый по CDP (`launchPersistentContext` не проходит — страница показывает «Проверяем
браузер»; Chrome, запущенный руками с `--remote-debugging-port`, проходит). Извлечённый текст и
скриншоты страниц — в `docs/` рядом с этим файлом.

**Биты маски `s`** (раздел «About the token», таблица «Bit values»):

| бит | смысл по документации |
|---|---|
| 1 | Access to Content |
| 2 | Access to Analytics |
| 3 | Access to Prices and discounts |
| 4 | Access to Marketplace |
| 5 | Access to Statistics |
| 7 | Access to Feedbacks and Questions |
| 30 | **Read only token** |

Ключ магазина: `s = 1073742014`, выставлены биты `1,2,3,4,5,7,30`. То есть **бит «только чтение»
выставлен** — и это цитата из документации, а не память. Если бы бита не было, `readOnly` был бы
`false`, а если бы маска не читалась — `"unknown"`, но никогда не `true` «по памяти».

**Зарегистрированные чтения** (9 штук), каждое со ссылкой на страницу документации:

| метод | адрес | название в документации |
|---|---|---|
| GET | common-api.wildberries.ru/ping | Connection Check |
| GET | common-api.wildberries.ru/api/v1/seller-info | Get Seller Information |
| POST | content-api.wildberries.ru/content/v2/get/cards/list | Listings — «Returns the listings.» |
| GET | content-api.wildberries.ru/content/v2/cards/limits | Limits for the Listings |
| GET | discounts-prices-api.wildberries.ru/api/v2/list/goods/filter | Get Items with Prices |
| GET | marketplace-api.wildberries.ru/api/v3/warehouses | Get Warehouses |
| POST | marketplace-api.wildberries.ru/api/v3/stocks/:warehouseId | Get Inventory — «Returns item inventory.» |
| GET | statistics-api.wildberries.ru/api/v1/supplier/orders | Orders |
| GET | feedbacks-api.wildberries.ru/api/v1/feedbacks | Feedbacks |

## 3. Что сделано

| Файл | Что это |
|---|---|
| `apps/backend/src/modules/wb/endpoints.ts` | реестр разрешённых чтений + валидатор |
| `apps/backend/src/modules/wb/transport.ts` | единственный сетевой вызов к WB |
| `apps/backend/src/modules/wb/token.ts` | разбор JWT: срок, тип, маска, `readOnly` со ссылкой |
| `apps/backend/src/modules/wb/sync.ts` | импорты, все через `wbRead` |
| `apps/backend/src/modules/wb/models/*.ts` | `wb_product`, `wb_price`, `wb_stock`, `wb_order`, `wb_feedback`, `wb_sync_run`, `wb_api_call` |
| `apps/backend/src/modules/wb/loaders/warn-on-writable-key.ts` | одно WARNING на старте, если бит 30 не стоит |
| `apps/backend/src/modules/wb/__tests__/*.unit.spec.ts` | гвард-сюита, тест «один вызывающий», тесты токена |
| `apps/backend/src/tenant-secrets/wildberries.ts` | ключ как секрет тенанта (механизм t03) |
| `apps/backend/src/api/tenants/wb/status/route.ts` | `GET /tenants/wb/status` |
| `apps/backend/src/scripts/wb-seed-key.ts`, `wb-sync.ts`, `wb-args.ts` | `wb:seed-key`, `wb:sync` |
| `apps/tenant-panel/src/routes/settings/wildberries/**` | карточка «Wildberries» в панели владельца |

Все зеркальные строки несут `tenant_id`, `source = 'wb'`, `fetched_at` и `raw` (ответ как пришёл).
Идентификаторы WB (`nm_id`, `imt_id`, `chrt_id`, `warehouse_id`) — текстовые колонки: номера доходят
до 4·10¹⁰ (пример из документации `filterNmID=44589768676`) и в 32-битное целое не влезают.

**Имена файлов отличаются от брифа:** тесты названы `*.unit.spec.ts`, а не `transport.spec.ts`,
иначе `pnpm test:unit` их не подберёт (`jest.config.js` матчит
`**/src/**/__tests__/**/*.unit.spec.[jt]s` для TEST_TYPE=unit).

## 4. Измерения на живом стенде

### 4.1 Гвард-тесты и тест «один вызывающий»

```
cd apps/backend && pnpm test:unit
Test Suites: 39 passed, 39 total
Tests:       423 passed, 423 total
```

Красный прогон с намеренно добавленным вторым вызывающим
(`fetch("https://content-api.wildberries.ru/ping")` в `src/scripts/wb-sync.ts`):

```
✓ finds the sources it claims to scan (26 ms)
✕ has no second call site (1334 ms)
    - Expected  - 1
    + Received  + 3
    +   "apps/backend/src/scripts/wb-sync.ts",
Tests: 1 failed, 1 passed, 2 total
```

После удаления строки:

```
✓ finds the sources it claims to scan (3 ms)
✓ has no second call site (494 ms)
Tests: 2 passed, 2 total
```

### 4.2 Импорт кабинета

```
WB_TENANT=cherkashino pnpm --filter backend wb:seed-key
wb:seed-key: stored the Wildberries key of cherkashino (ten_01M2KB5W7R2WRXFJX1F25KCJ8P).
wb:seed-key: key ends with c6Sg, seller 7b3bb9b2-d911-4b59-9c9b-1a780b11b91a, kind base,
             sandbox false, expires 2027-03-17T05:20:02.000Z, read_only true.

WB_TENANT=cherkashino WB_KIND=all pnpm --filter backend wb:sync
```

`select kind, status, rows, requests, started_at from wb_sync_run order by started_at`:

```
   kind    |  status   | rows  | requests |         started_at
-----------+-----------+-------+----------+----------------------------
 cards     | succeeded |   423 |        5 | 2026-09-16 04:12:36.582+08
 cards     | succeeded |   423 |        5 | 2026-09-16 04:13:06.49+08
 prices    | succeeded |   463 |        1 | 2026-09-16 04:13:20.212+08
 stocks    | succeeded | 11605 |       67 | 2026-09-16 04:13:22.844+08
 orders    | failed    |     0 |        1 | 2026-09-16 04:13:54.451+08
 feedbacks | failed    |   123 |        2 | 2026-09-16 04:28:26+08
```

Два прогона `cards` подряд дали по 423 строки, а в таблице так и осталось 423 — импорт
идемпотентен (ключ `(tenant_id, nm_id)`).

Счётчики зеркал:

```
      t      | count
-------------+-------
 wb_product  |   423
 wb_price    |   463
 wb_stock    | 11605
 wb_order    |     0
 wb_feedback |   123
```

Пример строк:

```
   nm_id    |     vendor_code     |                title                |             brand
------------+---------------------+-------------------------------------+-------------------------------
 101286835  | ОгневкаУльтра100    | Огневка Ультра от паразитов глистов | Фабрика Натуральных Продуктов
 1023462391 | Шампунь с женьшенем | Шампунь с женьшенем                 | Фабрика Натуральных Продуктов

 warehouse_id | warehouse_name |      sku      | amount
--------------+----------------+---------------+--------
 1314012      | Коледино       | 2042336288736 |    892
```

### 4.3 Что вышло из процесса — полный список

`select endpoint_id, method, count(*) from wb_api_call group by 1,2`:

```
      endpoint_id       | method | count
------------------------+--------+-------
 content.cards.list     | POST   |    10
 feedbacks.list         | GET    |     9
 marketplace.stocks     | POST   |    66
 marketplace.warehouses | GET    |     1
 prices.goods.filter    | GET    |     1
 statistics.orders      | GET    |     4
```

Шесть разных обращений, все шесть — записи реестра. Ни одной строки с чужим id, ни одного метода
кроме GET и двух задокументированных POST-чтений.

### 4.4 `GET /tenants/wb/status`

```
curl -H "Authorization: Bearer <owner token>" http://127.0.0.1:9401/tenants/wb/status   -> 200
```

Полный ответ — `tenants-wb-status.json` рядом. Главное:

```
key.last4: c6Sg | read_only: true
doc_url: https://dev.wildberries.ru/en/docs/openapi/api-information#tag/authorization/About-the-token
mirrors: {"products":423,"prices":463,"stocks":11605,"orders":0,"feedbacks":123}
```

Сам ключ не возвращается ни в каком виде — только `{set, last4}`.

### 4.5 Предупреждение на старте

Проверено подстановкой на стенд **поддельного** ключа с той же маской, но без бита 30 (`s = 190`),
и перезапуском бэкенда:

```
warn: [wb] WARNING: the stored Wildberries key's read-only bit (30) is NOT set. This client still
      cannot write to WB: src/modules/wb/transport.ts only sends registered reads.
      See https://dev.wildberries.ru/... (tenant ten_01M2KB5W7R2WRXFJX1F25KCJ8P)
```

Настоящий ключ после проверки возвращён на место, `read_only` снова `true` (см. 4.4).

### 4.6 Панель владельца

`http://localhost:5401/settings/wildberries`, вход `owner@cherkashino.example`.
Скриншот: `shots/panel-wildberries-card.png`. Видно: ключ (последние 4 знака), зелёный бейдж
«только чтение» со ссылкой на документацию, срок, идентификатор продавца, разделы ключа, таблица
последних загрузок, счётчики зеркал, полный список разрешённых обращений. Кнопки импорта нет —
импорт это скрипт.

### 4.7 Ключ не утёк

Проверка по значению ключа (а не по префиксу `eyJhbGci`, которого в репозитории и так хватает из
чужих артефактов):

```
tracked files scanned: 5629, containing the WB key: 0
untracked files scanned: 25, containing the WB key: 0
```

`git status` чист от `.env*`: `apps/backend/.env` стенда закрыт `apps/backend/.gitignore:2`.

### 4.8 Остальные ворота

```
npx tsc --noEmit                         -> rc=0
npx medusa lint                          -> 0 errors, 75 warnings (все 75 были до задачи)
pnpm check:backend-build                 -> Backend build completed successfully (11.88s)
pnpm check:backend-fixtures              -> rc=0
cd apps/tenant-panel && npx tsc --noEmit -> rc=0
npx medusa db:generate wb                -> Skipped. No changes detected in your models.  (ловушка b15)
npx medusa db:generate tenant            -> Skipped. No changes detected in your models.
```

## 5. Три дефекта, найденные измерением, и как починены

1. **429 приходил не по тому заголовку.** `Retry-After` WB не шлёт; замер по `feedbacks-api` дал
   `x-ratelimit-limit: 1`, `x-ratelimit-reset: 573`, `x-ratelimit-retry: 573`, а тело ответа прямо
   называет `X-RateLimit-Retry`. Транспорт теперь читает все три имени. Если WB просит ждать дольше
   30 с — не спим, а падаем с честным сообщением, называющим число секунд: прогон, спящий десять
   минут, неотличим от зависшего.
2. **Упавший прогон отчитывался о нуле строк.** Первый `feedbacks` записал 123 отзыва и упал на
   второй странице — строка прогона говорила «failed, 0 rows», а в `wb_feedback` лежало 123. Счётчик
   строк перенесён в общий объект прогона; повторный замер: `wb:sync: feedbacks failed, 123 rows,
   2 WB requests`.
3. **Карточка в панели падала.** `useQuery` возвращает собственное поле `status`
   (`"pending" | "error" | "success"`), и `{ status: data, ...rest }` затирало ответ строкой.
   В браузере: `TypeError: Cannot read properties of undefined (reading 'key')`. Хук возвращает `wb`.

Ни один из трёх не поймался бы typecheck'ом, lint'ом или curl'ом — только запуском против живого WB
и открытием экрана в браузере.

## 6. Чей это кабинет

Ключ принадлежит продавцу **«ФНП / Фабрика Натуральных Продуктов»**, ИНН 524900658999,
`sid = 7b3bb9b2-d911-4b59-9c9b-1a780b11b91a`. В штабном брифе это стояло как открытый вопрос к Ивану.
Ответ, похоже, уже записан в нашем же исследовании: `research/chrxnasdmds-digest.md` называет
«Фабрика Натуральных Продуктов» **поставщиком WB этого магазина** — у старого проекта лежит её полный
WB-архив (`docs/WB-data/`: 242 товара, 3 431 фото, 14 461 отзыв) и папка фотографий
`apps/storefront/public/products/wb-fabrika/`. Импортированные 423 карточки — тот же ассортимент
(«Огневка Ультра», «Шампунь с женьшенем», мумиё, БАДы), кабинет с августа вырос с 242 до 423 карточек.

**Решение всё равно за Иваном**, потому что от него зависит следующий шаг: связывать ли `wb_product`
с товарами тенанта автоматически. Ничего живого этой задачей не затронуто — импорт шёл только в
локальную БД `upready_store_w01`.

## 7. Что НЕ сделано и почему

- **`wb_order` пуст.** Таблица, импорт и реестровая запись готовы, но живьём заказы не забрались:
  токен категории `base`, а документация даёт такому токену **1 запрос в 3 часа** на статистику.
  Первый запрос в 04:14 WITA вернул заголовки 200, а тело не уложилось в дефолтные 15 с
  (строка журнала: `status 200, ms 15016`) — таймаут поднят до 120 с **для этого эндпоинта**
  (`timeoutMs` в реестре). Повторить замер можно не раньше чем через три часа после того запроса:
  WB на следующей попытке попросил подождать ещё 10 524 с. Приёмщику — команда на потом:
  `WB_TENANT=cherkashino WB_KIND=orders pnpm --filter backend wb:sync`.
- **`wb_feedback` неполон: 123 из двух половин.** `isAnswered` — обязательный параметр, поэтому
  импорт делает два прохода. Базовый токен даёт 5 запросов в час на отзывы, второй проход упирается
  в 429. 123 неотвеченных отзыва загружены; отвеченные придут следующим запуском.
  Правильное лечение — попросить у WB токен категории «Сервисный» или «С секретным ключом»
  (там лимиты на порядок выше), это решение Ивана.
- **Ничего не выкачено на живой хост.** Задача этого не предусматривает; ключ на проде не сохранён.
- **Связи `wb_product` ↔ товар тенанта нет.** Зеркало самостоятельно; сопоставление — отдельная задача.
- **Дизайн-система карточки — `@medusajs/ui`, а не Geist.** Панель целиком скопирована с Medusa
  Admin 2.19; второй дизайн-системой внутри одного экрана было бы хуже, чем расхождение с каноном.
  Записано здесь, а не замолчано (правило 27). Канон-файлы никуда не копировались, запись в
  `reuse-index.json` не требуется.
- **Названия разделов ключа показаны по-английски** — это дословные формулировки из таблицы WB.
  Перевод возможен, но тогда это будет уже не цитата.

## 8. Как приёмщику проверить за 10 минут

```bash
# 1. стенд
cd apps/backend
cp /Users/ivanprotsko/upready/projects/upready-store/apps/backend/.env .env
# в .env: DB_NAME=upready_store_w01, DATABASE_URL=...upready_store_w01, PORT=9401
npx medusa db:migrate
npx medusa exec ./scripts/fixtures/w01-seed-tenant.ts

# 2. ключ и импорт
set -a; source /Users/ivanprotsko/upready/projects/upready-store/.env.cherkashino; set +a
WB_TENANT=cherkashino npx medusa exec ./src/scripts/wb-seed-key.ts
WB_TENANT=cherkashino WB_KIND=cards npx medusa exec ./src/scripts/wb-sync.ts

# 3. что вышло из процесса
psql postgres://ivanprotsko@127.0.0.1:5433/upready_store_w01 \
  -c "select endpoint_id, method, count(*) from wb_api_call group by 1,2"

# 4. инвариант
pnpm test:unit          # 423 теста
# и руками: добавить в любой файл src/ вызов fetch("https://content-api.wildberries.ru/ping")
# -> transport-single-call-site.unit.spec.ts краснеет

# 5. ключ не утёк
git grep -n "c6Sg" -- .   # пусто (последние 4 знака ключа)
```
