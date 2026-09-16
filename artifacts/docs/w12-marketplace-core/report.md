# w12-marketplace-core — ядро marketplace

Ветка `feat/day16-marketplace-core`, отчёт написан 2026-09-16 08:23 WITA.
Автор — воркер дня (Claude Opus 5). Стенд: нативный Postgres `127.0.0.1:5433`, база `upready_store_w12`,
бэкенд `http://127.0.0.1:9112`, панель `http://localhost:5412`, магазин `cherkashino`.

## 1. Что сделано

Было: два независимых модуля `wb` (PR #71) и `ozon` (PR #79), у каждого свой реестр чтений, свой валидатор,
свой репо-линт, свой маршрут статуса, а у WB ещё и своя страница в панели. Один и тот же инвариант «только
чтение» стоял **дважды**, и третья площадка не унаследовала бы ни одного пояса (правило 20).

Стало: одно ядро `modules/marketplace`, к которому обе площадки подключены адаптерами, и один набор правил,
который применяется к КАЖДОМУ адаптеру автоматически.

| Файл | Что это |
|---|---|
| `apps/backend/src/modules/marketplace/contract.ts` | тип `MarketplaceAdapter` и типы `Read*`, `CredentialFacts`, `Mp*Draft`. Типы, без I/O. В контракте **нет** члена `write`, нет параметра метода и нет параметра URL — записи негде взяться |
| `apps/backend/src/modules/marketplace/registry.ts` | `MARKETPLACES` — единственное место, где адаптеры перечислены. Отсюда их берут конформанс-тест, репо-линт, оба маршрута, панель и проектор |
| `apps/backend/src/modules/marketplace/guards.ts` | `validateEndpointRegistry` + `validateAdapterShape`: write-глагол не регистрируется, хост обязан оканчиваться на суффиксы адаптера, `docUrl` обязателен, у POST обязательны `readViaPost.docUrl` и `reason`, путь абсолютный, id уникальны, путь из deny-list валит загрузку модуля, а лишний член у адаптера («сырой хелпер») — тоже |
| `apps/backend/src/modules/wb/adapter.ts` | WB под контрактом. `endpoints.ts`, `transport.ts`, `sync.ts`, `token.ts`, модели `wb_*` **не переписаны и не переименованы**, `wbRead` остался единственной точкой I/O |
| `apps/backend/src/modules/wb/normalize.ts`, `mutations.ts` | чистые нормализаторы и deny-list WB, снятый из `artifacts/docs/w10-marketplace-spec/docs/wb-methods-index.tsv` (56 записей: все PUT/PATCH/DELETE прод-хостов + POST'ы, которые документация называет записью) |
| `apps/backend/src/modules/ozon/adapter.ts`, `normalize.ts` | то же для Ozon. Deny-list **выведен** из `OZON_WRITE_PATHS` в `ozon/endpoints.ts`, а не переписан — второй копии списка нет |
| `apps/backend/src/modules/marketplace/models/mp-*.ts` | `mp_product`, `mp_offer`, `mp_order`, `mp_order_line`, `mp_review`, `mp_question`, `mp_link`, `mp_sync_run`, `mp_api_call` |
| `apps/backend/src/modules/marketplace/migrations/Migration20260915235331.ts` | создание таблиц |
| `apps/backend/src/modules/marketplace/migrations/Migration20260916000100.ts` | перенос `wb_sync_run`/`wb_api_call`/`ozon_*` в общие таблицы с `marketplace = '…'`. Ничего не удаляется, id производный (`mprun_<id>`), повторный прогон ничего не вставит |
| `apps/backend/src/modules/marketplace/project.ts` | `projectFromMirrors(tenantId, marketplace)` — пересчёт `mp_*` из сырых зеркал, идемпотентный |
| `apps/backend/src/modules/marketplace/link.ts` | сопоставление по артикулу, три исхода |
| `apps/backend/src/scripts/mp-project.ts` + `pnpm --filter backend mp:project` | запуск проектора |
| `apps/backend/src/api/tenants/marketplaces/**` | `GET /tenants/marketplaces` и `GET /tenants/marketplaces/:marketplace/status` |
| `apps/tenant-panel/src/routes/settings/marketplaces/**` | раздел «Маркетплейсы»: карточка на площадку из общих `mp-*` компонентов |
| `apps/tenant-panel/src/routes/settings/wildberries/redirect.tsx` | старый путь редиректит на новый раздел |

## 2. Замеры (правило 18f) — команды и их вывод

### 2.1 Юнит-тесты целиком

```
$ cd apps/backend && pnpm test:unit
Test Suites: 57 passed, 57 total
Tests:       711 passed, 711 total
```

### 2.2 Конформанс-тест КУСАЕТСЯ: RED со сломанным адаптером, GREEN без него

В реестр на один прогон добавлен заведомо сломанный адаптер (write-глагол, чужой хост, `rawRequest`).
Полные логи: `conformance-RED-with-broken-adapter.log`, `conformance-GREEN.log`.

```
RED  (в MARKETPLACES добавлен brokenAdapter)
    ✕ registers at least the two this repository has
      ✕ passes the shared validator over its real registry
      ✕ registers no write verb
      ✕ registers no host outside its own suffixes
      ✕ cites documentation on every entry, and a reason on every POST
      ✕ refuses an unregistered endpoint id before opening a socket
      ✕ has no way to express a PUT, and trying opens no socket
      ✕ has no way to express a PATCH, and trying opens no socket
      ✕ has no way to express a DELETE, and trying opens no socket
      ✕ refuses a foreign host before opening a socket
      ✕ exposes no fetch, no base URL and no raw helper
      ✕ names every normalized kind with a pure function
      ✕ declares its sync kinds and its deny-list
      ✕ rejects an entry whose path the documentation calls a mutation
Tests:       14 failed, 59 passed, 73 total

GREEN (brokenAdapter убран, ничего больше не менялось)
Tests:       50 passed, 50 total
```

Один адаптер, появившийся в реестре, валит 14 проверок. Ровно это и покупает задача: новый адаптер либо
проходит набор, либо краснеет самим фактом регистрации.

### 2.3 Репо-линт покрывает новый хост БЕЗ правки теста

Диф — только реестр (`lint-generalisation.diff`), в `single-call-site.unit.spec.ts` не тронуто ни строки:

```diff
-export const MARKETPLACES: readonly MarketplaceAdapter[] = [wbAdapter, ozonAdapter];
+export const MARKETPLACES: readonly MarketplaceAdapter[] = [wbAdapter, ozonAdapter, demoAdapter];
```

`demoAdapter` — валидный адаптер с `hostSuffixes: ["api.telegram.org"]`. Прогон (`lint-RED-third-host-registered.log`):

```
    ✓ wb has no second call site
    ✓ ozon has no second call site
    ✕ demo has no second call site
    +   "apps/backend/src/tenant-notifications/telegram.ts",
Tests:       2 failed, 4 passed, 6 total
```

Появился НОВЫЙ случай `demo has no second call site`, которого в файле теста нет: он порождается
`it.each(MARKETPLACES…)`. После отката (`lint-GREEN.log`): `Tests: 5 passed, 5 total`.

### 2.4 Проектор на стенде: два прогона, счётчики совпали

```
$ MP_TENANT=cherkashino pnpm --filter backend mp:project
mp:project: wb succeeded — products 423, offers 11816, orders 0, reviews 123, questions 0,
                           order_lines 0, links 2, journal_runs 0, journal_calls 0
mp:project: ozon succeeded — products 2, offers 3, orders 2, reviews 2, questions 1,
                             order_lines 2, links 0, journal_runs 0, journal_calls 0
```

Счётчики строк ДО и ПОСЛЕ второго прогона (`psql` по базе `upready_store_w12`), diff пустой:

```
mp_api_call|ozon|12      mp_offer|wb|11816     mp_product|wb|423
mp_api_call|wb|91        mp_order|ozon|2       mp_question|ozon|1
mp_link|wb|2             mp_order_line|ozon|2  mp_review|ozon|2
mp_offer|ozon|3          mp_product|ozon|2     mp_review|wb|123

$ diff run-1 run-2 && echo IDENTICAL
IDENTICAL after a second projection
```

`mp_sync_run` в это сравнение не входит осознанно: каждый прогон проектора законно добавляет туда СВОЮ
строку `kind = 'projection'`. Это журнал запусков, а не производные данные.

### 2.5 Числа сопоставления, и их сумма равна целому

```
wb:   Связано 2 из 423. Не найдено: 421, требует выбора: 0.     2 + 421 + 0 = 423 ✓
ozon: Сопоставление не сработало: 0 из 2. Не найдено: 2, требует выбора: 0.  0 + 2 + 0 = 2 ✓
```

`accounted_for` в ответе API — это та же сумма, посчитанная кодом; скрипт `mp:project` валит прогон,
если она разошлась с `total`.

### 2.6 `mp_sync_run` — импорты обеих площадок в одной таблице

```
$ psql … -c "select marketplace, kind, status, is_fixture, rows, requests
             from mp_sync_run where kind <> 'projection' order by started_at desc limit 12"
 marketplace |   kind    |  status   | is_fixture | rows | requests
-------------+-----------+-----------+------------+------+----------
 ozon        | questions | succeeded | t          |    1 |        1
 ozon        | reviews   | succeeded | t          |    2 |        2
 ozon        | postings  | succeeded | t          |    2 |        2
 ozon        | stocks    | succeeded | t          |    3 |        1
 ozon        | prices    | succeeded | t          |    2 |        1
 ozon        | products  | succeeded | t          |    2 |        5
 wb          | feedbacks | failed    | f          |  123 |        2
 wb          | orders    | failed    | f          |    0 |        1
 …
```

Строки WB — настоящая история задачи w01 (включая `failed` с текстом 429 от WB), перенесённая миграцией.
Строки Ozon — фикстурный прогон, помеченный `is_fixture = t`.

Общий журнал вызовов, и в нём НЕТ ни одного незарегистрированного id:

```
$ psql … -c "select marketplace, method, count(*) from mp_api_call group by 1,2"
 ozon | POST |  12
 wb   | GET  |  15
 wb   | POST |  76

endpoint_id: ozon → posting.fbo.list, posting.fbs.list, product.info.attributes,
             product.info.description, product.info.list, product.list, product.prices,
             product.stocks, question.list, review.count, review.list
             wb → content.cards.list, feedbacks.list, marketplace.stocks,
             marketplace.warehouses, prices.goods.filter, statistics.orders
```

Все 17 — id из реестров `wb/endpoints.ts` и `ozon/endpoints.ts`. Последняя строка журнала датирована
07:54 (фикстурный прогон Ozon), а замеры маршрутов шли в 08:15 — то есть **ни один запрос к площадкам во
время приёмки не ушёл**.

### 2.7 Новые маршруты

```
$ curl -s -H "Authorization: Bearer $TOK" http://127.0.0.1:9112/tenants/marketplaces
count: 2
- wb (Wildberries): key.set=True enabled=True endpoints=9 denied=56 credentials=None
   normalized: {'products': 423, 'offers': 11816, 'orders': 0, 'reviews': 123, 'questions': 0}
   linking: {'total': 423, 'linked': 2, 'not_found': 421, 'needs_choice': 0,
             'accounted_for': 423, 'stored': 2}
- ozon (Ozon): key.set=False enabled=False endpoints=19 denied=38 credentials=None
   normalized: {'products': 2, 'offers': 3, 'orders': 2, 'reviews': 2, 'questions': 1}

$ curl … /tenants/marketplaces/wb/status        → http=200
  read_only: True | expires_at: 2027-03-17T05:20:02.000Z | expires_in_days: 182 | expiring_soon: False
  read_only_source: Бит 30 маски «s» ключа, таблица полей токена: https://dev.wildberries.ru/…
  scopes granted/total: 6 / 13 | endpoints: 9 denied: 56

$ curl … /tenants/marketplaces/ozon/status      → http=200
  read_only: unknown | read_only_source: Не спрошено: https://docs.ozon.ru/api/seller/#operation/…
  error: Для этого магазина не сохранена пара Client-Id + Api-Key.

$ curl … /tenants/marketplaces/yandex/status    → http=404
$ curl    /tenants/marketplaces  (без токена)   → http=401
```

`credentials: None` в списке — не «неизвестно», а «не спрошено»: спрашивать ключ Ozon значит послать
Ozon запрос, и список экранов не тратит его на каждую отрисовку. Спрашивает маршрут карточки.

### 2.8 Старая поверхность не сломана

```
$ curl -s -H "Authorization: Bearer $TOK" http://127.0.0.1:9112/tenants/wb/status  → http=200
  top-level keys: ['connection', 'endpoints', 'mirrors', 'sync', 'token']
  connection: {'key': {'set': True, 'last4': 'c6Sg'}, 'is_enabled': True}
  token.read_only: True | expires_at: 2027-03-17T05:20:02.000Z
  endpoints: 9 | sync kinds: ['cards', 'prices', 'stocks', 'orders', 'feedbacks']
  mirrors: {'products': 423, 'prices': 463, 'stocks': 11605, 'orders': 0, 'feedbacks': 123}
```

Тело то же, маршрут не тронут этой задачей.

### 2.9 Панель

Скриншоты (2880×2200, 2x) лежат ВНЕ git, по конвенции репозитория для каталогов `shots/` — абсолютные пути:
`/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-marketplace-core/artifacts/docs/w12-marketplace-core/shots/`

- `marketplaces-01-top.png` — карточка Wildberries: ключ, права (бит 30 + ссылка на документ), срок,
  13 категорий ключа, «Связано 2 из 423…», таблица последних загрузок с красной ошибкой 429 от WB;
- `marketplaces-02-wb-endpoints.png` — реестр из 9 разрешённых чтений WB;
- `marketplaces-03-ozon-card.png` — карточка Ozon: 19 разрешённых чтений, бейдж «на записанных ответах»
  у фикстурных прогонов, строка «Пересчёт общего слоя»;
- `marketplaces-04-ozon-tables.png`, `marketplaces-05-denied-open.png` — раскрытый список того, что
  документация площадки называет записью (WB: 56 записей).

Редирект со старого пути проверен в браузере:

```
asked for /settings/wildberries, landed on: http://localhost:5412/settings/marketplaces
heading on screen: Маркетплейсы
```

Скриншот — `old-path-redirect.png`.

### 2.10 Сборки и линт

```
$ pnpm check:backend-build
Backend build completed successfully (21.25s)
Frontend build completed successfully (45.40s)
rc=0

$ cd apps/tenant-panel && pnpm build     # tsc --noEmit && vite build
✓ built in 14.79s
rc=0

$ cd apps/backend && npx medusa lint
✖ 90 problems (0 errors, 90 warnings)
```

Ноль ошибок. 90 предупреждений — это ровно тот же класс `use-medusa-error-not-generic-error`, который в
репозитории уже стоял; мои пять новых относятся к программным ошибкам (неизвестный адаптер, чужая форма
учётных данных), которые в HTTP-статус не отображаются, как и соседние в `wb/endpoints.ts`.

## 3. Что найдено по дороге и починено

**Вопрос к ключу уходил в сеть мимо журнала.** Первый вариант маршрута карточки звал
`adapter.inspectCredentials(credentials)` без журнала, и это поймал ЧУЖОЙ, уже стоявший гвард —
`modules/ozon/__tests__/credentials.unit.spec.ts` («every inspectCredentials call site in src passes a
journal»). У Ozon этот вопрос — настоящий `POST /v1/roles`, и запрос, ушедший без строки журнала, делает
`mp_api_call` ложью через умолчание (правило 20a). Починено: `inspectCredentials` в контракте принимает
`InspectOptions` с журналом, Ozon его прокидывает, WB честно ничего не пишет (он декодирует свой JWT
локально, и лишняя строка была бы записью о вызове, которого не было). Коммит `fc5bee13`.

**Общий журнал был бы разовым снимком.** Миграция переносит то, что есть на момент её запуска, а импорты
продолжают писать в `wb_sync_run` / `ozon_sync_run` — переписывать их задача прямо запрещает. Значит на
следующий день общая таблица врала бы приёмщику. Починено без правки импортов: у адаптера появился
`loadJournal`, и проектор на КАЖДОМ прогоне доносит недостающие строки по производному id
(`mprun_<id>`), так что второй копии возникнуть не может. Измерено: первый прогон после фикстурного
импорта Ozon перенёс `journal_runs 6, journal_calls 12`, второй — `0, 0`. Коммит `9f391d71`.

**Гонка входа в скрипте скриншотов** (моя, не продукта): `waitForURL(/\/(?!login)/)` совпадает с `//`
в `http://` и возвращается мгновенно, поэтому следующий `goto` обгонял логин и приземлялся обратно на
`/login` (родня правила 19h). Ждать надо ПОЛОЖИТЕЛЬНЫЙ признак — ответ 200 от `/tenants/me`.

## 4. Где я отступил от брифа и почему

1. **`MUTATION_DENY_LIST` живёт у адаптера, а в ядре — его ИНДЕКС.** Бриф просит держать списки в
   `guards.ts`. Но список мутаций Ozon уже существует — это `OZON_WRITE_PATHS` в `ozon/endpoints.ts`, и
   по нему же `credentials.ts` решает `readOnly`. Копия в ядре была бы вторым списком, который разойдётся
   с первым, то есть ровно тем дефектом, ради устранения которого задача и написана. Поэтому список — член
   контракта (`adapter.mutationDenyList`), `guards.ts` его ПРИМЕНЯЕТ, а `registry.ts` отдаёт
   `MUTATION_DENY_LIST` как производный индекс. Ozon'овский выведен из `OZON_WRITE_PATHS`; WB'шный написан
   заново в `wb/mutations.ts`, потому что у WB такого списка не было вовсе.
2. **`normalize/from-wb.ts` и `from-ozon.ts` лежат у адаптеров, а не в ядре.** Спека (2.1) кладёт их в
   `marketplace/normalize/`, бриф — в адаптеры («`normalize.*` are new pure functions» в `wb/adapter.ts`).
   Взял вариант брифа: знание о полях `nmID`/`chrtID`/`offer_id` — это знание площадки, и держать его в
   ядре значит заставлять ядро расти на каждую новую площадку.
3. **`mp_offer` получила две колонки сверх спеки: `sku_external` и `storage_type`.** Ozon отдаёт остаток
   не по складу, а по паре (`stock_type`, `shipment_type`) — это схема FBO/FBS. Назвать её складом было бы
   ложной подписью, поэтому у неё своя колонка, а `warehouse_id` у Ozon честно `null`. Идентичность строки
   несёт производный `offer_key` (`external_id|size|склад-или-схема`): составной уникальный индекс по
   nullable-колонкам в Postgres не дедуплицирует, а подставить в отсутствующее измерение заглушку — это
   значение вместо отсутствия (правило 20a).
4. **Панель на `@medusajs/ui`, не на Geist.** `apps/tenant-panel` — копия Medusa Admin 2.19, Geist в её
   зависимостях нет (`package.json`: `@medusajs/ui 4.2.1`, `@medusajs/ui-preset 2.19.0`). Один экран на
   другой дизайн-системе стоял бы чужим среди двадцати соседних. Расхождение с каноном 27 — то же самое,
   что уже записано в отчёте w01, не новое; повторяю его здесь, а не умалчиваю.
5. **Контракт шире, чем в брифе, на три члена:** `readCredentials` (где у этой площадки лежит ключ
   магазина — знание площадки, а не ядра), `loadMirror` (какие сырые строки нужны нормализатору) и
   `loadJournal` (см. раздел 3). Без них ядру пришлось бы держать таблицу «id площадки → её внутренности»,
   то есть второе место, где площадки перечислены.

## 5. Чего НЕ сделано и почему

- **Исход «требует выбора» на живом стенде показать нельзя.** В схеме стоит
  `CREATE UNIQUE INDEX "IDX_product_variant_sku_unique" ON product_variant (sku) WHERE deleted_at IS NULL`,
  то есть SKU уникален глобально среди живых вариантов, и попытка выдать двум вариантам один артикул
  падает на этом индексе (замерено: `ERROR: duplicate key value violates unique constraint`). Поэтому на
  живом каталоге ветка недостижима, и она закрыта юнит-тестом
  (`link.unit.spec.ts` → «does NOT link a card whose article matches several variants»), а в коде остаётся
  как защита от будущего изменения правила уникальности. В числах приёмки `требует выбора: 0` — это факт,
  а не пропуск.
- **Планировщик (`jobs/marketplace-sync.ts`, спека 2.6) не написан** — он не входит в список
  deliverables этой задачи.
- **Старые таблицы `wb_sync_run` / `wb_api_call` не удалены** — бриф прямо говорит, что удаление это
  отдельный шаг после приёмки.
- **Вопросы WB не зеркалируются**: метод вопросов WB не зарегистрирован в `wb/endpoints.ts`, поэтому
  `normalize.questions` у WB возвращает пустой список, а на экране это видимый ноль, а не пустота.
- **Живой хост не тронут**, деплоя не было — задача этого не предписывает.
- **`docs missing:`** ничего. Документация читалась только из сохранённых копий
  (`artifacts/docs/w01-wb-readonly-client/docs/`, `artifacts/docs/w10-marketplace-spec/docs/`); ни
  `dev.wildberries.ru`, ни `docs.ozon.ru` с этой машины не открывались.

## 6. Как приёмщику проверить за 10 минут

```bash
cd /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-marketplace-core

# 1. всё зелено
cd apps/backend && pnpm test:unit            # Tests: 711 passed

# 2. суита кусается: добавить в MARKETPLACES любой адаптер с write-глаголом → 14 падений
#    (готовый сломанный адаптер — в artifacts/docs/w12-marketplace-core/conformance-RED-*.log)

# 3. стенд уже поднят однажды; поднять заново:
cat > apps/backend/.env <<'ENV'
DATABASE_URL=postgres://ivanprotsko@127.0.0.1:5433/upready_store_w12
JWT_SECRET=supersecret
COOKIE_SECRET=supersecret
INTEGRATION_ENCRYPTION_KEY=supersecret
PORT=9112
ENV
cd apps/backend && npx medusa develop        # http://127.0.0.1:9112

# 4. проектор дважды — счётчики совпадут
MP_TENANT=cherkashino npx medusa exec ./src/scripts/mp-project.ts

# 5. панель
printf 'VITE_MEDUSA_BACKEND_URL=http://127.0.0.1:9112\n' > apps/tenant-panel/.env
cd apps/tenant-panel && npx vite --port 5412 --strictPort
# http://localhost:5412/settings/marketplaces   (owner@cherkashino.example / supersecret)
# http://localhost:5412/settings/wildberries    → редиректит на раздел выше
```
