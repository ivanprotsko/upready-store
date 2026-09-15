# w03-wb-sales-questions-mirror — WB зеркала, часть 2: продажи, вопросы покупателей, воронка

Ветка `feat/day16-wb-sales-questions-mirror`, стенд — локальный Postgres `127.0.0.1:5433/upready_store_w03`
(клон стенда w01, чтобы не выкачивать 423 карточки заново и не жечь лимиты), тенант `cherkashino`,
бэкенд на `:9403`, панель на `:5403`. Живой хост не затронут, деплоя нет.

Задача продолжает merged-модуль w01 (`apps/backend/src/modules/wb/`): реестр разрешённых чтений
`endpoints.ts`, единственная точка ввода-вывода `transport.ts` → `wbRead(endpointId, …)`, зеркала
`wb_*`, скрипт `wb:sync`. Инвариант Ивана «только чтение по конструкции» не ослаблен: добавлены
три записи реестра, каждая со ссылкой на страницу документации, POST — с цитатой из описания
метода и ручной записью в тесте.

## 1. Что добавлено

| Файл | Что это |
|---|---|
| `apps/backend/src/modules/wb/endpoints.ts` | три новых чтения: `statistics.sales`, `feedbacks.questions`, `analytics.funnel.history` |
| `apps/backend/src/modules/wb/models/wb-sale.ts` | зеркало продаж и возвратов |
| `apps/backend/src/modules/wb/models/wb-question.ts` | зеркало вопросов покупателей |
| `apps/backend/src/modules/wb/models/wb-analytics-daily.ts` | зеркало воронки по дням |
| `apps/backend/src/modules/wb/sync.ts` | виды импорта `sales`, `questions`, `analytics`; дедупликация батча |
| `apps/backend/src/modules/wb/models/wb-sync-run.ts` | `WB_SYNC_KINDS` = 8 видов, порядок `--kind all` задокументирован |
| `apps/backend/src/modules/wb/migrations/Migration20260915211047.ts`, `…211441.ts` | три таблицы и правка уникального ключа продаж |
| `apps/backend/src/modules/wb/__tests__/service-methods.unit.spec.ts` | новая сюита: имена методов сервиса существуют на самом деле |
| `apps/backend/src/modules/wb/__tests__/transport.unit.spec.ts` | новый POST вписан в ручную половину двойной бухгалтерии |
| `apps/backend/src/modules/wb/__tests__/upsert-batch.unit.spec.ts` | новая сюита: батч дедуплицируется сам с собой (дефект №2), победитель — более поздняя строка |
| `apps/backend/src/modules/wb/__tests__/rate-limit-status.unit.spec.ts` | новая сюита (раунд 2): 429 — это `rate_limited`, а 403 и своя ошибка записи остаются `failed` |
| `apps/backend/src/modules/wb/migrations/Migration20260916064500.ts` | статус `rate_limited` + `retry_at`, переклассификация накопленных строк по 429 в тексте ошибки |
| `apps/backend/src/api/tenants/wb/tables/route.ts` | `GET /tenants/wb/tables` — агрегаты трёх зеркал |
| `apps/backend/src/api/tenants/wb/status/route.ts` | счётчики зеркал: + продажи, вопросы, дни воронки |
| `apps/backend/src/scripts/wb-args.ts`, `wb-sync.ts` | `WB_ANALYTICS_CARDS`, `WB_NM_IDS`, `WB_QUESTIONS_ANSWERED` |
| `apps/tenant-panel/src/hooks/api/wb-tables.tsx` | хук на новый роут |
| `apps/tenant-panel/src/routes/settings/wildberries/components/wb-sales-table.tsx` | таблица продаж |
| `apps/tenant-panel/src/routes/settings/wildberries/components/wb-questions-table.tsx` | таблица вопросов |
| `apps/tenant-panel/src/routes/settings/wildberries/components/wb-funnel-table.tsx` | таблица воронки |
| `apps/tenant-panel/src/i18n/translations/{ru,en}.json` | подписи, по-человечески, без сырых enum |

## 2. Что документация WB реально говорит (правило 17a)

Портал `dev.wildberries.ru` за антиботом: `curl` отдаёт HTTP 498 (проверено ещё раз 2026-09-16). Страницы `analytics`, `customer-communication` и `documents-and-accounting` прочитаны через
headed Chrome по CDP, текст и ссылки лежат рядом: `docs/`.

### 2.1 Продажи — `GET /api/v1/supplier/sales`

Раздел «Main Reports», рядом с уже зарегистрированными заказами. Цитаты:

> The method returns sale and return information. The data updated every 30 minutes.
> 1 line means 1 sale/return and means 1 item. The srid field should be used to identify the order.
> Data storage is guaranteed for no more than 90 days from the date of sale.

Лимит для базового токена — **1 запрос в 2 часа** (у заказов в той же таблице — 1 запрос в 3 часа;
это разные корзины, а не одна «статистика»). Замер 2026-09-16 05:27 WITA после успешного запроса
в 05:12: заголовки 429 дали `x-ratelimit-limit: 1`, `x-ratelimit-retry: 6330` — ровно 2 часа от
первого запроса.

Документация прямо предупреждает, что это **не бухгалтерия**: `finishedPrice`, `priceWithDisc` и
`forPay` «may temporarily have the value 0: data is filled in asynchronously and updated within
24 hours», а точные деньги — в отчёте о реализации. Это вынесено в подпись таблицы в панели.

### 2.2 Вопросы покупателей — `GET /api/v1/questions`

Раздел «Questions». `isAnswered` — обязательный параметр, поэтому импорт делает два прохода,
как и отзывы. Лимит на **всю** категорию Feedbacks and Questions для базового токена — 5 запросов
в час (1 раз в 12 минут). `take + skip` не больше 10 000.

На том же пути `/api/v1/questions` стоит `PATCH` — «Working with Questions», то есть ответ
покупателю. Он **не зарегистрирован и не может быть**: валидатор реестра принимает только GET и
задокументированные POST-чтения. Это тот самый случай, ради которого w01 выбрал белый список пар
(метод, путь), а не запрет глаголов.

### 2.3 Воронка — `POST /api/analytics/v3/sales-funnel/products/history`

Брифинг называл её «nm-report». В текущей документации метода `nm-report/detail` нет: воронка живёт
в разделе «Sales Funnel» на хосте `seller-analytics-api.wildberries.ru`, а `/api/v2/nm-report/…`
остались только как выгрузки отчётов в файл. Взят метод «Listings Statistics per Days»:

> The method returns statistics for listings by day or by week.
> You can get data for a maximum of the last week.

Тело запроса — период, `nmIds` и уровень агрегации; это чтение, оформленное как POST, и именно так
оно записано в реестре (`readViaPost.reason` — цитата из описания метода).

Три ограничения WB, которые видны и в коде, и на экране:

- `nmIds` — «Array of integers <uint64> [ 1 .. 20 ] items»: **20 карточек за запрос**;
- окно — максимум последняя неделя;
- базовый токен — 2 запроса в час на категорию «Аналитика».

Поэтому по умолчанию один прогон берёт 20 карточек (`WB_ANALYTICS_CARDS` поднимает, `WB_NM_IDS`
задаёт поимённо), и лог прямо пишет, сколько карточек осталось за бортом. Выбор карточек — не
«как лягут строки»: сначала те, по которым в зеркале есть продажи, дальше по номеру WB.

### 2.4 Финансовый отчёт — 403, не зарегистрирован

`reportDetailByPeriod` из брифа в нынешней документации отсутствует: отчёт о реализации переехал на
`finance-api.wildberries.ru`, методы `POST /api/finance/v1/sales-reports/list` и
`POST /api/finance/v1/sales-reports/detailed` (раздел «Financial Reports», базовый токен —
2 запроса в 24 часа).

Проба **один раз**, 2026-09-16 05:18 WITA:

```
POST https://finance-api.wildberries.ru/api/finance/v1/sales-reports/detailed
  {"dateFrom":"2026-09-01","dateTo":"2026-09-15","limit":10}
-> http=403
{"status":403,"statusText":"Forbidden","title":"Forbidden",
 "detail":"scope is not allowed for this resource","origin":"ag-finance"}
```

Причина не гадательная, она в самом ключе: маска `s = 1073742014` = биты 1,2,3,4,5,7,30, а доступ к
финансам — это **бит 13** («Access to Finance», таблица «Bit values» в разделе «About the token»).
Бита нет — метода нет. **В реестр не добавлен** (правило брифа: регистрируем только при 200).
Чтобы он появился, Оксане нужно выпустить ключ с категорией «Финансы»; это решение владельца
кабинета, а не наше.

## 3. Измерения на стенде

### 3.1 Прогоны импорта

```
WB_TENANT=cherkashino WB_KIND=sales,questions,analytics npx medusa exec ./src/scripts/wb-sync.ts
WB_TENANT=cherkashino WB_KIND=questions WB_QUESTIONS_ANSWERED=true npx medusa exec ./src/scripts/wb-sync.ts
```

`select kind, status, rows, requests, started_at from wb_sync_run where kind in (…) order by started_at`:

```
┌───────────┬──────────────┬───────┬──────────┬──────────────────┬──────────┐
│   kind    │    status    │ rows  │ requests │     started      │ retry_at │
├───────────┼──────────────┼───────┼──────────┼──────────────────┼──────────┤
│ cards     │ succeeded    │   423 │        5 │ 2026-09-16 04:12 │          │
│ cards     │ succeeded    │   423 │        5 │ 2026-09-16 04:13 │          │
│ prices    │ succeeded    │   463 │        1 │ 2026-09-16 04:13 │          │
│ stocks    │ succeeded    │ 11605 │       67 │ 2026-09-16 04:13 │          │
│ orders    │ rate_limited │     0 │        1 │ 2026-09-16 04:13 │          │
│ feedbacks │ rate_limited │     0 │        2 │ 2026-09-16 04:14 │          │
│ feedbacks │ rate_limited │     0 │        1 │ 2026-09-16 04:18 │          │
│ orders    │ rate_limited │     0 │        1 │ 2026-09-16 04:18 │          │
│ feedbacks │ rate_limited │     0 │        1 │ 2026-09-16 04:22 │          │
│ feedbacks │ rate_limited │     0 │        1 │ 2026-09-16 04:24 │          │
│ feedbacks │ rate_limited │   123 │        2 │ 2026-09-16 04:28 │          │
│ sales     │ failed       │     0 │        1 │ 2026-09-16 05:12 │          │
│ questions │ rate_limited │     2 │        2 │ 2026-09-16 05:13 │          │
│ analytics │ succeeded    │   133 │        1 │ 2026-09-16 05:13 │          │
│ questions │ rate_limited │     0 │        1 │ 2026-09-16 05:20 │          │
│ questions │ rate_limited │  1000 │        2 │ 2026-09-16 05:24 │          │
│ sales     │ rate_limited │     0 │        1 │ 2026-09-16 06:39 │ 07:12    │
│ sales     │ rate_limited │ 21573 │        2 │ 2026-09-16 07:12 │ 09:12    │
└───────────┴──────────────┴───────┴──────────┴──────────────────┴──────────┘
(18 rows)
```

Перемерено 2026-09-16 07:18 WITA, раунд 2 приёмки. Строки 04:12–04:28 — прогоны зеркал w01, они здесь для фона.
Что показывает таблица:

- **`sales` 07:12 — 21 573 строки за 2 запроса.** Это тот прогон, которого не хватало раунду 1:
  ключ починен, окно лимита открылось, зеркало заполнено живым чтением. Статус `rate_limited` —
  упор во ВТОРУЮ страницу, а не потеря записанного: следующее окно 09:12.
- **`sales` 05:12 — единственная строка `failed` во всей таблице.** Это настоящий дефект №1 (ключ по
  одному `srid`), и он намеренно оставлен в журнале: прогон, которого не было, должен быть виден
  (правило 20a).
- **`sales` 06:39 — ранняя проба.** Она стоила ноль строк и доказала, что 429 окно НЕ сдвигает:
  `retry_at` = 07:12, ровно два часа от успешного запроса в 05:12, а не два часа от пробы.
- **десять строк `rate_limited`** — бывшие `failed`, переклассифицированные миграцией по их
  собственной улике (429 в тексте ошибки). Ни одна из них не была поломкой.
- `questions` 05:24 — 1000 строк и `rate_limited`: частичный успех, который в раунде 1 выглядел
  провалом.

Счётчики зеркал:

```
┌────────────────────┬───────┐
│       mirror       │ count │
├────────────────────┼───────┤
│ wb_analytics_daily │   133 │
│ wb_order           │     0 │
│ wb_product         │   423 │
│ wb_question        │  1002 │
│ wb_sale            │ 21573 │
└────────────────────┴───────┘
(5 rows)
```

Перемерено 2026-09-16 07:18 WITA. Три зеркала задачи заполнены живым чтением: продажи 21 573, вопросы 1002,
дни воронки 133. Оставшийся ноль — `wb_order`: это зеркало w01, его лимит (1 запрос в 3 часа) в
этой задаче не трогали и слот на него не тратили.

### 3.2 Журнал транспорта: из процесса вышли только зарегистрированные чтения

`select endpoint_id, method, status, count(*) from wb_api_call where fetched_at > '…' group by 1,2,3`:

```
┌──────────────────────────┬────────┬────────┬───────┐
│       endpoint_id        │ method │ status │ count │
├──────────────────────────┼────────┼────────┼───────┤
│ analytics.funnel.history │ POST   │    200 │     1 │
│ content.cards.list       │ POST   │    200 │    10 │
│ feedbacks.list           │ GET    │    200 │     2 │
│ feedbacks.list           │ GET    │    429 │     7 │
│ feedbacks.questions      │ GET    │    200 │     2 │
│ feedbacks.questions      │ GET    │    429 │     4 │
│ marketplace.stocks       │ POST   │    200 │    66 │
│ marketplace.warehouses   │ GET    │    200 │     1 │
│ prices.goods.filter      │ GET    │    200 │     1 │
│ statistics.orders        │ GET    │    200 │     1 │
│ statistics.orders        │ GET    │    429 │     3 │
│ statistics.sales         │ GET    │    200 │     2 │
│ statistics.sales         │ GET    │    429 │     2 │
└──────────────────────────┴────────┴────────┴───────┘
(13 rows)
```

Перемерено 2026-09-16 07:18 WITA, за всю жизнь стенда. Чужих `endpoint_id` нет; методов, кроме GET и трёх
задокументированных POST-чтений (`content.cards.list`, `marketplace.stocks`,
`analytics.funnel.history`), нет. 429-е — ответы WB на лимит, а не обращения мимо реестра.
Продажи: два ответа 200 (первый записал ноль из-за дефекта №1, второй — 21 573 строки) и два 429
(ранняя проба 06:39 и упор во вторую страницу 07:13).

### 3.3 Тесты и ворота

```
cd apps/backend
pnpm test:unit            -> Test Suites: 42 passed, Tests: 441 passed   (было 39 / 423 у w01)
npx medusa lint           -> 0 errors, 75 warnings (столько же, сколько у w01; ни одного в новых файлах)
npx tsc --noEmit          -> rc=0
cd apps/tenant-panel
npx tsc --noEmit          -> rc=0
npx eslint src            -> 0 errors, 24 warnings (ни одного в новых файлах)
```

Новые тесты (сюита `service-methods.unit.spec.ts`):

```
the mirror plurals name methods that exist
  ✓ knows every mirror the sync writes to
  ✓ WbProduct / WbPrice / WbStock / WbOrder / WbSale / WbFeedback / WbQuestion /
    WbAnalyticsDaily has list, create and update on the service
```

Гвард-сюита реестра осталась зелёной вместе с новой записью POST: `postReadEndpointIds()` теперь
равен `["analytics.funnel.history", "content.cards.list", "marketplace.stocks"]`, и тот же список
руками продублирован в тесте — добавить POST только в реестр по-прежнему значит уронить сюиту.

Ворота перемерены целиком 2026-09-16 06:09 WITA, на голове ветки:

```
apps/backend   pnpm test:unit    -> Test Suites: 42 passed, Tests: 441 passed   rc=0
apps/backend   npx tsc --noEmit  -> rc=0
apps/backend   npx medusa lint   -> 0 errors, 75 warnings                      rc=0
apps/tenant-panel  npx tsc --noEmit -> rc=0
apps/tenant-panel  npx eslint src   -> 0 errors, 24 warnings                   rc=0
```

42/441 против 40/432 выше по тексту — это две добавленные сюиты: `upsert-batch.unit.spec.ts`
(4 теста, дедупликация батча) и `rate-limit-status.unit.spec.ts` (5 тестов, 429 как ожидание).
Ни одного предупреждения линта в новых файлах. Перемерено 2026-09-16 07:19 WITA, раунд 2.

## 4. Дефекты, найденные измерением (а не чтением кода)

1. **`srid` не идентифицирует строку продажи.** Первый живой прогон умер на первой же странице:
   `Wb sale with tenant_id: …, srid: er.rfa69eccbd134437395a9c3017ccf1393.0.0, already exists` —
   0 строк записано. В одном ответе WB один и тот же `srid` пришёл дважды: лента отдаёт и продажу,
   и возврат, а возврат несёт `srid` той продажи, которую отменяет. Документация говорит «the srid
   field should be used to identify the **order**» — заказ, не строку. Ключ зеркала стал парой
   `(srid, sale_id)`, где `sale_id` — это `saleID`, собственный номер продажи или возврата.
   **Подтверждено живым прогоном 07:12 (раунд 2): 21 573 строки.** И масштаб дефекта теперь измерен
   на настоящих данных: в ленте 63 `srid` встречаются дважды, под ними 126 строк. Пример пары —
   `eAN.i1e39c66…`: продажа `S24472352926` на +1518,64 и её возврат `R621760953` на −1518,64.
   Под старым ключом эти 126 строк роняли весь батч из 21 573.
2. **Дубль внутри одного ответа не ловился вообще.** `upsertRows` сверял строки с базой, но не сам
   с собой: обе копии попадали в insert и весь батч падал на уникальном индексе, записав ноль.
   Теперь батч дедуплицируется и по себе (побеждает более поздняя строка), и это починка класса, а
   не места — правило действует для всех восьми зеркал, а не только для продаж.
3. **До отвеченных вопросов очередь не доходила.** Импорт делает два прохода, а базовый токен даёт
   5 запросов в час на всю категорию: первый проход (неотвеченные) всегда съедал бюджет, второй
   получал 429. Появился `WB_QUESTIONS_ANSWERED=true|false` — выбрать половину, на которую не жалко
   запроса. Замер: с ним за один прогон приехало 1000 отвеченных вопросов.
4. **`WbAnalyticsDaily` ломает наивную плюрализацию.** `MedusaService` строит методы от
   множественного числа модели, и это `listWbAnalyticsDailies`, а не `…Dailys`. Старый
   `list${entity}s` промахнулся бы мимо метода не при загрузке модуля, а на первой строке живого
   импорта. Карта имён вынесена в `MIRROR_PLURAL`, и её проверяет отдельная сюита.

Ни один из четырёх не ловится typecheck'ом, линтом или curl'ом.

## 4a. Пятый дефект — найден приёмкой, раунд 1 (не мной)

**429 записывался как ОШИБКА прогона.** Статусов было три (`running | succeeded | failed`), и
любой 429 ложился в `failed` с текстом лимита в `error`. На стенде так оказались помечены 10 строк
из 16, а на экране владелицы — четыре красных «с ошибкой» против Заказов, Продаж, Отзывов и
Вопросов, хотя три из четырёх всего лишь ждали окна WB. Хуже: прогон вопросов, записавший **1000
строк**, тоже выглядел провалом.

Это не буквоедство и не косметика. На базовом токене лимиты — штатный режим работы, а не сбой:
вопросы и отзывы делят 5 запросов в час, продажи получают 1 в два часа. Красная метка на штатном
режиме читается владелицей как сломанная интеграция.

Починка:

- в `WB_SYNC_STATUSES` добавлен `rate_limited`, в модель — `retry_at` (миграция
  `Migration20260916064500.ts`, она же переклассифицирует уже накопленные строки по их собственной
  улике — `error like '%429%'`);
- `WbApiError` несёт `retryAfterMs`, взятый из заголовка самого WB (`Retry-After` /
  `X-RateLimit-Retry`) — замеренное значение, а не наша оценка;
- классификация вынесена в `classifyRunFailure()` и закрыта сюитой `rate-limit-status.unit.spec.ts`
  (5 тестов): 429 с окном, 429 без окна, 403 и наша собственная ошибка записи — последние две
  остаются `failed`;
- в панели `rate_limited` рисуется нейтральным тоном и называет окно: «ждёт окна WB до 07:12»;
  строки, записанные до лимита, остаются в своей колонке — частичный успех перестал выглядеть
  провалом.

Проверено живьём, а не только сюитой: прогон продаж 06:39 упёрся в лимит и лёг в базу как
`rate_limited` с `retry_at = 07:12:17` — ровно через два часа после успешного запроса в 05:12.

## 5. Панель владельца

`http://localhost:5403/settings/wildberries`, вход `owner@cherkashino.example` / `supersecret`.

Снимки, переснятые 2026-09-16 07:19 WITA (раунд 2), после того как продажи заполнились:

- `shots/panel-wildberries-tables.png` — ключ, «Последняя загрузка», счётчики зеркал и начало
  таблицы продаж;
- `shots/panel-wildberries-tables-questions.png` — таблица вопросов;
- `shots/panel-wildberries-tables-funnel.png` — таблица воронки.

Три кадра, а не один: страница выросла до 11 091 px, и одна полоса такой высоты — это артефакт,
который никто не прокручивает. Резать пришлось и по другой причине: страница скроллится во
ВНУТРЕННЕМ контейнере, поэтому `fullPage` у Playwright снимал только первый экран и молча уносил
три таблицы за кадр — обрезанный кадр читается как полный (правило 20a).

Что доказывают кадры:

- **ни одной красной «с ошибкой»**: четыре вида, ждущие лимита, подписаны нейтральным «ждёт окна
  WB», а продажи — «ждёт окна WB до 09:12». Это то, чего требовал критерий приёмки;
- **частичный успех больше не выглядит провалом**: у «Вопросов покупателей» стоит «ждёт окна WB» и
  1000 строк в своей колонке, у продаж — 21 573;
- **таблица продаж заполнена настоящими данными**: 8110 строк за месяц, покупатель заплатил
  7 532 399,73, WB перечислит 6 077 331,75, из них возвратов 28; строки возвратов идут с
  отрицательной суммой красным (−551 / −452,12 в кадре);
- **колонка «Размер» = 0 во всех строках** — это собственное значение WB (`techSize` = «0» во всех
  21 573 строках, у магазина товары без размеров), а не потерянное поле;
- воронка подписана обоими числами потолка — «карточек в таблице 19 из 423 (WB отдаёт не больше
  20 карточек за запрос)», а не молча показывает девятнадцать строк;
- подпись таблицы продаж предупреждает, что деньги предварительные («точные деньги — в отчёте о
  реализации»), как того требует документация WB;
- сырых enum на экране нет: «успешно» / «ждёт окна WB», «ждёт ответа», человеческие подписи колонок.

Дизайн-система — `@medusajs/ui`, как и вся панель: она скопирована с Medusa Admin 2.19, и вторая
дизайн-система внутри одного экрана была бы хуже, чем расхождение с каноном Geist. Расхождение
записано здесь, а не замолчано (правило 27); канон прочитан, файлы канона никуда не копировались,
запись в `reuse-index.json` не требуется.

## 6. Аналоги в Ozon Seller API (Иван, 04:44 — «чтобы то же самое можно было проверить на Ozon»)

Только из `https://docs.ozon.ru/api/seller/`, снято 2026-09-16 через тот же headed Chrome
(curl отдаёт 307 и не пускает). Ничего не строилось — это карта на будущее.

| Наш набор данных (WB) | Метод Ozon | Ссылка |
|---|---|---|
| Продажи и возвраты (`statistics.sales`) | `POST /v3/posting/fbo/list` — «Возвращает список отправлений за указанный период времени» (схема FBO), и `POST /v3/posting/fbs/list` для FBS | `https://docs.ozon.ru/api/seller/#operation/PostingFboList`, `…#operation/PostingAPI_GetFbsPostingListV3` |
| — возвраты отдельно | `POST /v1/returns/list` — «Метод для получения информации о возвратах FBO и FBS» | `https://docs.ozon.ru/api/seller/#operation/returnsList` |
| — деньги по строке | `POST /v1/finance/accrual/postings` («Получить начисления по отправлениям»), плюс `/v1/finance/accrual/types` и `/v1/finance/accrual/by-day` | `https://docs.ozon.ru/api/seller/#operation/GetFinanceAccrualPostings` |
| Вопросы покупателей (`feedbacks.questions`) | `POST /v1/question/list` — «Список вопросов». **Доступно для продавцов с подпиской Premium Plus** | `https://docs.ozon.ru/api/seller/#operation/Question_List` |
| Воронка по карточкам (`analytics.funnel.history`) | `POST /v1/analytics/data` — «Укажите период и метрики… В ответе будет аналитика, сгруппированная по параметру dimensions». Не чаще 1 раза в минуту; без Premium Plus — только последние 3 месяца и ограниченный набор метрик | `https://docs.ozon.ru/api/seller/#operation/AnalyticsAPI_AnalyticsGetData` |

Два факта, которые стоит знать до того, как это начнут строить:

- «одной ленты продаж с деньгами», как `supplier/sales` у WB, у Ozon нет: отправления, возвраты и
  начисления — три разных метода;
- `POST /v3/finance/transaction/list`, самый очевидный аналог, в документации помечен как
  устаревающий: «Метод устаревает и будет отключён 8 сентября 2026 года. Переключитесь на
  `/v1/finance/accrual/postings`, `/v1/finance/accrual/types`, `/v1/finance/accrual/by-day`».
  Дата уже прошла, поэтому в таблице стоит замена, а не он.

## 7. Что НЕ сделано и почему

- **Финансовый отчёт не зарегистрирован** — 403 и отсутствующий бит 13 у ключа, см. 2.4. Нужен ключ
  с категорией «Финансы» от владельца кабинета.
- **Вопросы загружены не все: 1002 из 16 457.** WB считает 2 неотвеченных (обе у нас) и 16 455
  архивных; базовый токен даёт 5 запросов в час, страница — 1000 вопросов, значит полная выкачка
  архива — это около 3,5 часов непрерывных прогонов. Сверх того `take + skip` у метода упирается в
  10 000, то есть последние ~6 500 архивных вопросов вообще недостижимы страничным перебором —
  понадобятся окна по `dateFrom`/`dateTo`. Код на упор в 10 000 пишет предупреждение и
  останавливается, а не молча обрывает выборку. Отдельная задача; правильное лечение то же, что у
  отзывов в w01, — токен категории «Сервисный» или «С секретным ключом».
- **Воронка — 19 карточек из 423.** Это не выбор экономии, а потолок метода (20 номеров за запрос)
  плюс 2 запроса в час у базового токена. И лог, и подпись таблицы в панели называют оба числа.
- **`wb_order` по-прежнему пуст** — это зеркало w01, его лимит (1 запрос в 3 часа) в этой задаче не
  трогали и слот на него не тратили.
- **Продажи загружены не все: 21 573 строки за одно окно.** Прогон 07:12 взял две страницы и упёрся
  в лимит (1 запрос в 2 часа), следующее окно — 09:12. Это не пробел в коде, а расписание WB;
  сколько ещё осталось в ленте за 90 дней, узнает следующее окно.
- **Связи `wb_sale` ↔ заказ тенанта нет**, как и у остальных зеркал: сопоставление — отдельная задача.
- **Ничего не выкачено на живой хост**, деплоя нет, ключ на проде не сохранён.
- **Ozon ничего не построено** — только карта методов, как и просил Иван.

## 8. Как приёмщику проверить за 10 минут

```bash
# 1. стенд (клон стенда w01 — там уже лежат 423 карточки и ключ)
createdb -h 127.0.0.1 -p 5433 -U ivanprotsko -T upready_store_w01 upready_store_w03acc
cd apps/backend
cp /Users/ivanprotsko/upready/projects/upready-store/apps/backend/.env .env
# в .env: DB_NAME=upready_store_w03acc, DATABASE_URL=…/upready_store_w03acc, PORT=9403
npx medusa db:migrate

# 2. импорт (лимиты WB: продажи — 1 запрос в 2 часа, вопросы — 5 в час, воронка — 2 в час;
#    на стенде w03 продажи уже загружены — 21 573 строки прогоном 07:12, следующее окно 09:12)
WB_TENANT=cherkashino WB_KIND=analytics npx medusa exec ./src/scripts/wb-sync.ts
WB_TENANT=cherkashino WB_KIND=questions WB_QUESTIONS_ANSWERED=false npx medusa exec ./src/scripts/wb-sync.ts
WB_TENANT=cherkashino WB_KIND=sales npx medusa exec ./src/scripts/wb-sync.ts

# 3. что легло и что вышло из процесса
psql postgres://ivanprotsko@127.0.0.1:5433/upready_store_w03acc \
  -c "select 'sale' t, count(*) from wb_sale union all select 'question', count(*) from wb_question
      union all select 'funnel', count(*) from wb_analytics_daily" \
  -c "select kind, status, rows, requests from wb_sync_run order by started_at desc limit 8" \
  -c "select endpoint_id, method, status, count(*) from wb_api_call group by 1,2,3 order by 1"

# 4. инвариант
pnpm test:unit    # 441 тест; добавить PUT/PATCH/DELETE в endpoints.ts -> сюита краснеет
# и руками: дописать в любой файл src/ вызов fetch("https://feedbacks-api.wildberries.ru/ping")
# -> transport-single-call-site.unit.spec.ts краснеет

# 5. экран
cd ../tenant-panel && printf 'VITE_MEDUSA_BACKEND_URL=http://localhost:9403\n' > .env
npx vite --port 5403 --strictPort
# http://localhost:5403/settings/wildberries, owner@cherkashino.example / supersecret

# 6. ключ не утёк
git grep -n "c6Sg" -- .   # пусто
```
