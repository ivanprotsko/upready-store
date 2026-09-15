# w11-ozon-readonly-client — Ozon Seller API: клиент только на чтение по конструкции

Снято 2026-09-16 07:17 WITA. Ветка `feat/day16-ozon-readonly-client`, стенд
`postgres://127.0.0.1:5433/upready_store_w11`, бэкенд `127.0.0.1:9411`, тенант `cherkashino`.
Живой хост не затронут.

## 0. Режим: ключа нет

**Живого импорта не было: `OZON_CLIENT_ID`/`OZON_API_KEY` не заданы.** В
`/Users/ivanprotsko/upready/projects/upready-store/.env.cherkashino` на момент работы стоят только
`WB_API_KEY`, `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`, `YANDEX_ID_LOGIN`, `YANDEX_ID_PASSWORD`.
Всё ниже принято на ЗАПИСАННЫХ ФИКСТУРАХ, снятых по форме сохранённой документации.

Одно исключение, названное прямо: транспорт один раз сходил к `api-seller.ozon.ru` с **заведомо
недействительной парой** (`Client-Id: 0`), чтобы проверить, что запрос вообще уходит и что провал
честно превращается в `unknown`. Ozon ответил

```
HTTP 400 {"code":3,"message":"Client-Id header value should be positive integer"}
```

Это не импорт и не «живой прогон». Настоящего кабинета этот запрос не касался.

## 1. Главное про Ozon, из-за чего архитектура именно такая

Из 467 методов сохранённого справочника **461 POST и 6 GET**
(`artifacts/docs/w10-marketplace-spec/docs/ozon-methods-index.tsv`). Глагол не различает ничего:

| метод | что делает (заголовок Ozon) |
|---|---|
| `POST /v3/product/list` | «Метод для получения списка всех товаров.» — чтение |
| `POST /v3/product/import` | «Создать или обновить товар» — запись |
| `POST /v2/products/stocks` | «Обновить количество товаров на складах» — перезапись остатков |
| `POST /v1/review/comment/create` | «Оставить комментарий на отзыв» — публикация текста под отзывом покупателя |

Отсюда: **allow-list точных пар (метод, путь)**, default deny, и `readViaPost` с дословной цитатой
документации ОБЯЗАТЕЛЕН на КАЖДОЙ записи (у Ozon это значит — на всех девятнадцати), плюс тот же
список id продублирован руками в тесте.

### Ошибка в исходном deny-list задачи, найденная при сверке

Бриф называл `/v1/product/import`. **Такого пути в документации нет вовсе.** Настоящий —
`/v3/product/import` («Создать или обновить товар»). Это ровно тот баг, от которого бриф и
предостерегал, на этаж выше. В код ушёл проверенный путь; все 38 записей deny-list сверены по
сохранённой странице поштучно и несут заголовок метода из неё.

## 2. Что сделано (файлы)

| файл | что в нём |
|---|---|
| `apps/backend/src/modules/ozon/endpoints.ts` | реестр 19 чтений с `docUrl` + дословной цитатой; `OZON_WRITE_PATHS` (38 мутаций с заголовками Ozon); сегментное правило-растяжка; `validateRegistry()` на загрузке модуля; `resolveEndpoint` бросает `OzonWriteForbiddenError` |
| `apps/backend/src/modules/ozon/transport.ts` | ЕДИНСТВЕННОЕ место сетевого I/O. `ozonRead(endpointId, …)`; ни метода, ни хоста, ни URL, ни заголовков вызывающий не передаёт; 429 с ограниченным backoff; `Client-Id`/`Api-Key` затёрты в каждой строке лога; 50 запросов/с на Client-Id и 1 раз в минуту на `/v1/analytics/data` |
| `apps/backend/src/modules/ozon/credentials.ts` | `inspectCredentials` — спрашивает у Ozon `POST /v1/roles`; `readOnly` = `true` только если ни один выданный метод не покрывает путь из deny-list |
| `apps/backend/src/modules/ozon/fixtures.ts` | записанные ответы по форме примеров сохранённой страницы, с номером строки у каждого |
| `apps/backend/src/modules/ozon/sync.ts` | импорты `products / prices / stocks / postings / reviews / questions`, все через `ozonRead` либо через фикстуры, но всегда через `resolveEndpoint` и всегда с журналом |
| `apps/backend/src/modules/ozon/models/*.ts` | `ozon_product`, `ozon_price`, `ozon_stock`, `ozon_posting`, `ozon_review`, `ozon_question`, `ozon_sync_run`, `ozon_api_call` |
| `apps/backend/src/tenant-secrets/ozon.ts` | пара `{ client_id, api_key }` под AES-256-GCM, как у Robokassa и WB |
| `apps/backend/src/api/tenants/ozon/status/route.ts` | `GET /tenants/ozon/status` — факты, реестр, deny-list, прогоны; ключ не возвращается |
| `apps/backend/src/scripts/ozon-seed-key.ts`, `ozon-sync.ts`, `ozon-args.ts` | `pnpm --filter backend ozon:seed-key` и `ozon:sync` |
| `apps/backend/src/modules/ozon/__tests__/*` | guard-suite, repo-линт, тесты прав ключа и фикстур |
| `apps/backend/scripts/fixtures/w11-seed-tenant.ts` | тенант стенда (вне сборки образа) |

Изменены: `medusa-config.ts` (регистрация модуля), `package.json` (два скрипта),
`tenant_integration_secret` (провайдер `ozon` + миграция).

## 3. Замеры

Полные выводы: `artifacts/docs/w11-ozon-readonly-client/measurements.txt` и `status-curl.txt`.

Строка проверки схемы карточки UI:
```
$ node .../ui/report-validate.mjs .../artifacts/w11-ozon-readonly-client/report.json
OK …/report.json: 9 done / 6 results / 1 access
```

### 3.1 Юнит-суита целиком

```
$ cd apps/backend && pnpm test:unit
PASS src/modules/ozon/__tests__/transport.unit.spec.ts
PASS src/modules/ozon/__tests__/transport-single-call-site.unit.spec.ts
PASS src/modules/ozon/__tests__/credentials.unit.spec.ts (6.126 s)
PASS src/modules/ozon/__tests__/fixtures.unit.spec.ts
Test Suites: 46 passed, 46 total
Tests:       548 passed, 548 total
```

### 3.2 Repo-линт: КРАСНЫЙ со вторым местом вызова, ЗЕЛЁНЫЙ после

Во временный `src/scripts/__second-ozon-call-site.probe.ts` добавлен
`fetch("https://api-seller.ozon.ru/v1/seller/info", { method: "POST" })`:

```
FAIL src/modules/ozon/__tests__/transport-single-call-site.unit.spec.ts
  ● Ozon is reachable from exactly one file › has no second call site
    + Array [
    +   "apps/backend/src/scripts/__second-ozon-call-site.probe.ts",
Tests:       1 failed, 1 passed, 2 total
```

Файл удалён:

```
PASS src/modules/ozon/__tests__/transport-single-call-site.unit.spec.ts
Tests:       2 passed, 2 total
```

### 3.3 Импорт на фикстурах, локальный стенд

```
$ OZON_TENANT=cherkashino OZON_KIND=all OZON_FIXTURES=1 npx medusa exec ./src/scripts/ozon-sync.ts
ozon:sync: products  succeeded (fixtures), 2 rows, 5 requests
ozon:sync: prices    succeeded (fixtures), 2 rows, 1 requests
ozon:sync: stocks    succeeded (fixtures), 3 rows, 1 requests
ozon:sync: postings  succeeded (fixtures), 2 rows, 2 requests
ozon:sync: reviews   succeeded (fixtures), 2 rows, 2 requests
ozon:sync: questions succeeded (fixtures), 1 rows, 1 requests

$ psql -c "select kind, status, is_fixture, rows, requests from ozon_sync_run order by started_at"
   kind    |  status   | is_fixture | rows | requests
-----------+-----------+------------+------+----------
 products  | succeeded | t          |    2 |        5
 prices    | succeeded | t          |    2 |        1
 stocks    | succeeded | t          |    3 |        1
 postings  | succeeded | t          |    2 |        2
 reviews   | succeeded | t          |    2 |        2
 questions | succeeded | t          |    1 |        1

$ psql -c "count(*) по зеркалам"
 ozon_posting 2 | ozon_price 2 | ozon_product 2 | ozon_question 1 | ozon_review 2 | ozon_stock 3
```

Повторный прогон не удвоил ни одной таблицы (те же 2/2/3/2/2/1) — upsert по собственному
идентификатору Ozon.

### 3.4 Что покинуло процесс

```
$ psql -c "select endpoint_id, method, is_fixture, count(*) from ozon_api_call group by 1,2,3 order by 1"
       endpoint_id        | method | is_fixture | count
--------------------------+--------+------------+-------
 posting.fbo.list         | POST   | t          |     1
 posting.fbs.list         | POST   | t          |     1
 product.info.attributes  | POST   | t          |     1
 product.info.description | POST   | t          |     2
 product.info.list        | POST   | t          |     1
 product.list             | POST   | t          |     1
 product.prices           | POST   | t          |     1
 product.stocks           | POST   | t          |     1
 question.list            | POST   | t          |     1
 review.count             | POST   | t          |     1
 review.list              | POST   | t          |     1
```

**Каждая строка называет зарегистрированное чтение** — запрос «endpoint_id не из реестра» вернул
`(нет)`. И каждая строка говорит POST: на Ozon колонка method не доказывает ничего, доказывает
колонка endpoint_id. Столбец `is_fixture` отличает записанный ответ от настоящего: живой вызов
`access.roles` лежит в журнале с `is_fixture = f`, `status 400`.

### 3.5 `GET /tenants/ozon/status`

```
$ curl -s -H "Authorization: Bearer <owner token>" http://127.0.0.1:9411/tenants/ozon/status   -> 200
"credentials": {
  "roles": [],
  "read_only": "unknown",
  "read_only_source": "Не определено: ключ не ответил на https://docs.ozon.ru/api/seller/#operation/AccessAPI_RolesByToken. «unknown» — это честный ответ; выдумывать «только чтение» нельзя (правило 17a).",
  "write_methods": [],
  "error": "Ozon не ответил на POST /v1/roles: Ozon access.roles answered 400: {\"code\":3,\"message\":\"Client-Id header value should be positive integer\"}"
}
endpoints[19] · denied[38] · mirrors: products 2, prices 2, stocks 3, postings 2, reviews 2, questions 1
```

Ключа в ответе нет — только `{ set, last4 }` и `client_id`.

### 3.6 Сборка, типы, линт, миграции

```
$ npx tsc --noEmit                    rc=0
$ npx medusa lint                     rc=0 (78 warning, 0 error; из них в файлах ozon — 2, у обоих в коде написана причина)
$ pnpm check:backend-build            rc=0  Backend build completed successfully (10.48s)
$ pnpm check:backend-fixtures         rc=0
$ npx medusa db:generate ozon tenant  -> Migration20260915230611.ts (ozon), Migration20260915230613.ts (tenant)
$ npx medusa db:generate ozon tenant  -> "Skipped. No changes detected in your models." ×2, дерево чисто
```

Ловушка снапшота b15 не сработала: второй `db:generate` на чистом дереве не породил ничего.

### 3.7 Секреты

```
$ git grep -n -E "OZON_API_KEY=[^\"'\`<)]|Client-Id: [0-9]|eyJhbGci" -- <файлы этой задачи>
rc=1, совпадений 0
```

`apps/backend/.env` стенда — под `.gitignore`, в индекс не попадал. Пара в базе стенда лежит
зашифрованной (`payload` начинается с `cVKYp+0ZAcS9FV0DMknGrhw1…`).

## 4. Дефект, найденный замером и починенный в этой же ветке

Первый прогон показал: живой `POST /v1/roles` **уходил, но в `ozon_api_call` не попадал** —
`inspectCredentials` вызывался без журнала во всех трёх местах (`ozon:seed-key`, `ozon:sync`,
роут статуса). Таблица-улика при этом отвечала «из процесса ничего не выходило», хотя вышло два
запроса. Это ровно та ложь умолчанием, против которой таблица и заведена.

Починено в трёх местах сразу и закрыто **классовым гвардом**, а не тремя правками: тест сканирует
все вызовы `inspectCredentials(` в `src` и требует `journal` в аргументах самого вызова (скобки
считаются по балансу, чтобы `journal:` из следующего оператора не поручился за этот). Гвард
показан красным: при снятом `journal` он называет `api/tenants/ozon/status/route.ts`.

## 5. Чего НЕ сделано и почему

- **Живого импорта из кабинета нет** — ключа не существует. Всё готово к нему: при появлении
  `OZON_CLIENT_ID`/`OZON_API_KEY` достаточно
  `OZON_TENANT=cherkashino pnpm --filter backend ozon:seed-key`, затем `ozon:sync` без
  `OZON_FIXTURES`.
- **Песочницы у Ozon нет** — на всей странице Seller API тестового контура не описано, слово
  «песочница» встречается один раз и относится к редактору rich-контента. Поэтому фикстуры.
- **`readOnly` для настоящего ключа не измерен** — измерять нечего. Механизм проверен на
  записанном ответе и на живом отказе; на настоящем ключе даст `true`/`false` со списком методов.
- **Проверка заголовка `Api-Key` живьём не делалась.** Ozon отбил запрос раньше, на `Client-Id`.
  Подбирать реальный Client-Id чужого кабинета ради второй ошибки я не стал. Что оба заголовка
  уходят — доказано юнит-тестом с fetch-шпионом, не живым ответом; так и записано.
- **Панели для Ozon нет** — задача её не предусматривает; `GET /tenants/ozon/status` отдаёт всё,
  что панели понадобится.
- **Связи `ozon_product` ↔ товар магазина нет.** Зеркало самостоятельно. Ключ к связи известен:
  `offer_id` у Ozon = `vendorCode` у WB = SKU магазина; сопоставление — отдельная задача.
- **`returns.list`, `analytics.*`, `rating.summary`, `seller.info`, `warehouse.list` в реестре
  есть, но ни один вид импорта их пока не зовёт.** Они нужны панели и следующим задачам; фикстуры
  для них записаны, тест реестра их покрывает, зеркал под них эта задача не заводит.
- **Описания товаров ограничены 500 карточками за прогон** — `/v1/product/info/description`
  отвечает по ОДНОЙ карточке, значит N карточек = N запросов. Предел не молчаливый: при
  превышении в лог уходит строка с числами.

## 6. Как приёмщику проверить за 10 минут

```bash
cd /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-ozon-readonly-client
corepack pnpm install --frozen-lockfile

# 1. стенд
cd apps/backend
cp /Users/ivanprotsko/upready/projects/upready-store/apps/backend/.env .env
# в .env: DB_NAME=upready_store_w11, DATABASE_URL=…/upready_store_w11, PORT=9411
createdb -h 127.0.0.1 -p 5433 -U ivanprotsko upready_store_w11   # если её ещё нет
npx medusa db:migrate
npx medusa exec ./scripts/fixtures/w11-seed-tenant.ts

# 2. импорт на фикстурах и что вышло из процесса
OZON_TENANT=cherkashino OZON_KIND=all OZON_FIXTURES=1 npx medusa exec ./src/scripts/ozon-sync.ts
psql postgres://ivanprotsko@127.0.0.1:5433/upready_store_w11 \
  -c "select endpoint_id, method, is_fixture, count(*) from ozon_api_call group by 1,2,3 order by 1"

# 3. инвариант
pnpm test:unit    # 548 тестов
# и руками: добавить в любой файл src/ вызов fetch("https://api-seller.ozon.ru/v1/seller/info")
#           -> transport-single-call-site.unit.spec.ts краснеет и называет файл
# и руками: добавить в OZON_READ_ENDPOINTS путь "/v2/products/stocks"
#           -> модуль не грузится: "Обновить количество товаров на складах — a mutation"

# 4. статус
npx medusa develop &   # 127.0.0.1:9411
TOK=$(curl -s -X POST http://127.0.0.1:9411/auth/tenant/emailpass -H 'Content-Type: application/json' \
  -d '{"email":"owner@cherkashino.example","password":"supersecret"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s -H "Authorization: Bearer $TOK" http://127.0.0.1:9411/tenants/ozon/status | head -c 2000
/usr/sbin/lsof -t -nP -iTCP:9411 -sTCP:LISTEN | xargs -r kill -9   # погасить по ПОРТУ
```

Если на стенде уже стоит заведомо недействительная пара (`Client-Id: 0`), которую оставил этот
прогон, `read_only` вернётся `unknown` с текстом ошибки Ozon — это и есть ожидаемое поведение
без ключа.
