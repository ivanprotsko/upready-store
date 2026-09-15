# b06-order-tracking — трек-номер и путь заказа «собрать → отгрузить → трек»

Ветка `feat/day16-order-tracking`, стенд с клоном базы Оксаны, замеры 2026-09-15 вечером (WITA).
Источник задачи: `artifacts/q03-gap-recheck/gap-recheck.md`, «Осталось критичного», пункт 5 —
«код есть, живьём не проверено: все шесть заказов магазина отменены, отгрузку создавать не на чем,
на карточке заказа поля трека нет».

Код действительно был. Путь не работал: на нём нашлись **четыре дефекта**, каждый из которых
в одиночку ломал либо шаг владелицы, либо то, что видит покупатель.

## Стенд

Нативный Postgres `127.0.0.1:5433`, без докера (приказ Ивана 2026-09-15 22:05).

| Что | Адрес / значение |
|---|---|
| БД | `upready_store_b06` — `createdb -T upready_store_cherkashina` (клон миграции магазина Оксаны от 2026-09-12), затем `npx medusa db:migrate` |
| Бэкенд | `http://localhost:9066` |
| Панель владелицы | `http://localhost:5166`, вход `owner-cherkashino@example.test` / `supersecret1` |
| Витрина | `http://cherkashino.localhost:8066` (тенант узнаётся по `Host`, как на живом хосте) |
| Покупатель | `pokupatel-b06@example.test` / `supersecret1` |
| Почта | локальный SMTP-приёмник на `127.0.0.1:1026` (`SMTP_HOST`/`SMTP_PORT` в `apps/backend/.env`), письма складываются в `.eml` — иначе провайдера канала `email` нет и письмо просто не уходит |
| Тенант | `ten_01M29Q4KYQHC70JZBENWZ8Z88M` / `cherkashino` / «Оксана Черкашина», 38 товаров |

Заказ приёмки — **№21** `order_01M2JV58J43HR0FX89X4T2HHGT`, оформлен настоящим checkout-ом через Store API
(регистрация покупателя → корзина → адрес → способ доставки «courier» → оплата → complete), не вставкой в базу.

## Что было сломано и что починено

### 1. Владелица не может собрать заказ: в списке складов 253 чужих склада

`GET /tenants/stock-locations` был реэкспортом админского обработчика с комментарием
«на стендах один склад на тенанта плюс общий по умолчанию». На настоящей базе платформы это неправда:
сид заводит склад на каждый регион.

```
# было (замер до правки)
curl -s -H "authorization: Bearer $TOKEN" "http://localhost:9066/tenants/stock-locations?limit=1000"
→ count: 253   own: sloc_01M29Q4KK69EGJ3R9EQFEF399J Оксана Черкашина warehouse
```

В форме «Собрать заказ» комбобокс «Местоположение» отдавал первую страницу чужих складов, склада Оксаны
там не было, выбрать было нечего, кнопка «Создать фулфилмент» оставалась **disabled** — путь обрывался
на первом шаге (playwright: `element is not enabled`, 30 с ретраев). Заодно это утечка: названия и адреса
складов других магазинов платформы.

Починено: `apps/backend/src/api/tenants/stock-locations/route.ts` — свой обработчик по образцу
`tenants/sales-channels`: набор берётся из связи sales-channel ↔ stock-location, которую
`provisionTenantWarehouseWorkflow` пишет каждому новому магазину; параметр запроса может только **сузить**
набор (`scopeIdFilter`). Retrieve `[id]` тоже заскоуплен: чужой id — 404, а не чужое название с адресом.

```
# стало
GET /tenants/stock-locations?limit=1000            → count: 1  «Оксана Черкашина warehouse»
GET /tenants/stock-locations/sloc_01M29Q4KK69…     → 200   (свой)
GET /tenants/stock-locations/sloc_01M25SZE4Q0X…    → 404   (чужой)
# в панели, финальный прогон:
склады в списке: [ 'Оксана Черкашина warehouse' ]
```

### 2. Письмо «заказ отправлен» не уходило вообще: бесконечная рекурсия

`apps/backend/src/emails/order-shipment-created.tsx:67` собирал строку трека так:

```js
const trackingText = (label) =>
  carrier ? `${carrier} ${trackingText(label)}` : `${trackingText(label)}`;
```

Функция звала саму себя вместо `label.tracking_number` — стек кончался, и падало это **внутри обработчика
`shipment.created`**, то есть ни один покупатель платформы никогда не получал письма с треком:

```
error: An error occurred while processing shipment.created:
    at trackingText (apps/backend/src/emails/order-shipment-created.tsx:67:5)
    at trackingText (…:67:56)   ← ×10
```

Починено: номер берётся с этикетки. Строка сборки вынесена в `apps/backend/src/emails/lib/tracking.ts`
и используется и шаблоном, и текстовой версией письма (раньше это были две отдельные копии одного правила).

### 3. Перевозчик не доезжал до письма: метаданные писались после события

Маршрут `POST /tenants/orders/:id/fulfillments/:fid/shipments` сначала запускал
`createOrderShipmentWorkflow` (он и поднимает `shipment.created`), и только потом писал
`metadata.carrier`. Подписчик читал фулфилмент раньше записи и каждый раз проигрывал гонку:

```
# в базе:   "metadata": { "carrier": "СДЭК" }
# в письме: Трек-номер: 1005248796431        ← без «СДЭК»
```

Починено: `updateFulfillmentWorkflow` с метаданными идёт **перед** созданием отгрузки.

```
# после правки, письмо заказа №21:
Subject: Заказ №21 отправлен
Заказ №21 передан в службу доставки.
Трек-номер: СДЭК 1005248796431
```

### 4. Надписи владелицы и покупателя

- Карточка заказа писала «Фулфилмент #1», «Ожидает фулфилмента», «Товары для фулфилмента»,
  «Отметить фулфилмент как отправленный» — транслитерация, а не русский язык. Заменено на
  «Отправление №1», «Ожидает сборки», «Товары к сборке», «Отметить заказ как отправленный»
  (26 строк `ru.json`, включая экраны складов и вариантов доставки — чинится класс, а не одно место).
- В блоке платежей стояла зашитая английская строка `Total pending` → ключ `orders.payment.totalPending`
  («Осталось получить»), добавлен в `ru.json` и `en.json`.
- «Провайдер: **Manual**» (машинное значение `manual_manual` через `formatProvider`) →
  `getFulfillmentProviderLabel` рядом с уже существующим `getPaymentProviderLabel`:
  «Вручную, без службы доставки».
- В истории статусов строка «Товары отправлены» заканчивалась голым словом **«От»** без имени:
  `marked_shipped_by` — это id админа тенанта (`tenadm_…`), а компонент `By` умел только `user_`/`cus_`
  и возвращал `null`, оставляя подпись висеть. Теперь `useActor` решает, есть ли кого назвать, а `ByLine`
  рисует подпись и человека одним куском (или ничего). Владелица подписана: «От Оксана Черкашина».
  Заменены все 10 мест вызова в `order-timeline.tsx`, `By` больше нигде не зовут напрямую.

## Путь на стенде, шаг за шагом (заказ №21)

| Шаг | Что на экране | Скриншот |
|---|---|---|
| 1. Карточка до | «Авторизован», «Не собрано», «Несобранные товары / Ожидает сборки» | `01-order-before.png` |
| 2. Форма сборки | «Местоположение: Оксана Черкашина warehouse» — единственная строка в списке; «Способ доставки: Оксана Черкашина courier» (тот же, что выбрал клиент); «Товары к сборке» | `02-fulfill-form.png` |
| 3. После сборки | «Отправление №1 / Ожидает отправки», «Отправка из: Оксана Черкашина warehouse» | `03-order-fulfilled.png` |
| 4. Форма отправки | «Отметить заказ как отправленный», «Перевозчик: СДЭК», «Номер отслеживания: 1005248796431», ссылка отслеживания | `04-shipment-form.png` |
| 5. После отправки | «Отправление №1 / **Отправлено**», «Провайдер: Вручную, без службы доставки», «Отслеживание: **СДЭК 1005248796431**»; история: «Товары отправлены — От Оксана Черкашина», «Товары собраны», «Платеж получен», «Заказ размещен» | `05-order-shipped-tracking.png` |
| 6. Список заказов покупателя | «1 365,00 ₽», «Оксана Черкашина courier · 10,00 ₽» | `06-buyer-orders-list.png` |
| 7. Страница заказа покупателя | «**Отправлен**», «**Оплачен**», «Трек-номер: **СДЭК 1005248796431**», цены в ₽ | `07-buyer-order-tracking.png` |

JSON заказа до и после — `order-21-before.json` / `order-21-after.json`:

```json
// до
{ "status": "pending", "fulfillment_status": "not_fulfilled", "payment_status": "authorized", "fulfillments": [] }

// после
{ "fulfillments": [ {
    "provider_id": "manual_manual",
    "location_id": "sloc_01M29Q4KK69EGJ3R9EQFEF399J",
    "packed_at": "…", "shipped_at": "…", "delivered_at": null,
    "metadata": { "carrier": "СДЭК" },
    "labels": [ { "tracking_number": "1005248796431",
                  "tracking_url": "https://www.cdek.ru/ru/tracking?order_id=1005248796431" } ] } ] }
```

Письма покупателю по ходу пути (локальный SMTP-приёмник, все четыре пришли, все по-русски):
«Заказ №21 создан», «Заказ №21 оплачен», «Заказ №21 собран», «Заказ №21 отправлен».
Полный текст последнего — `email-21-shipped.txt`.

## Тесты

Логика трека и переходов статусов была продублирована в четырёх местах (таймлайн кабинета, блок доставки,
шаблон письма, текстовая версия письма) — ровно поэтому перевозчик мог пропасть на одной поверхности и
остаться на другой. Сведено в две функции с тестами:

- `apps/storefront/src/lib/util/order-tracking.ts` — `trackingLines()` и `timelineProgress()`,
  тест `order-tracking.test.ts` (переходы `not_fulfilled → fulfilled → shipped → delivered`, даты шагов,
  отсутствие трека, несколько отправлений, мусорный `carrier`).
- `apps/storefront/src/lib/util/order-status.ts` — каталоги статусов и их цвета вынесены из компонента,
  тест `order-status.test.ts` держит их против `messages/ru.json` и `en.json`: у каждого статуса,
  который витрина умеет нарисовать, есть перевод, и ни одна русская подпись не является латинским enum.
- `apps/backend/src/emails/lib/tracking.ts` + `src/emails/__tests__/tracking.unit.spec.ts` —
  сборка «перевозчик + номер», отдельным тестом закрыт сам класс рекурсии.

Попутно тест поймал ещё один переход: `timelineProgress` считал заказ дошедшим до пункта выдачи только при
`fulfillment_status === "fulfilled"`, а после ввода трека Medusa переводит заказ в `shipped` — шаг таймлайна
откатывался назад. Теперь `shipped` тоже считается пройденным шагом.

### Прогоны (ветка после влития `dev`, `0edef406`)

```
apps/backend   npm run test:unit        → Test Suites: 1 failed, 28 passed, 29 total
                                          Tests: 1 failed, 314 passed, 315 total
apps/backend   npx tsc --noEmit         → rc=0
pnpm check:backend-build                → rc=0  (Backend build completed successfully)
pnpm check:backend-fixtures             → rc=0
apps/storefront npm run test:unit       → Test Files 22 passed (22), Tests 218 passed (218)
apps/storefront npx tsc --noEmit        → rc=0
apps/storefront npx next lint           → rc=0  (только прежние warning-и)
apps/tenant-panel npx tsc --noEmit      → rc=0
apps/tenant-panel npx eslint src        → rc=0  (24 warning-а, все прежние)
```

Единственный красный тест — `src/migration-scripts/__tests__/profile-data.unit.spec.ts`
(«leaves a locale the profile never translated identical to the base», лишний `productOptions: {}`
в `SEED_TRANSLATIONS.fr`). **Он красный на самом `dev`, не от этой ветки**: `git diff origin/dev HEAD --name-only`
даёт 22 файла, ни одного под `migration-scripts`, `store-profile` или `/data/` (замер: `| grep -E … | wc -l` → 0).
Заводить как отдельный дефект — на приёмщике.

## Что НЕ сделано и почему

1. **Telegram-уведомление покупателю о треке** — его нет и не было: подписчик `order-placed-telegram`
   существует только для нового заказа и адресован владелице. Задача просила «в письме/Telegram —
   там, где уведомления уже есть»; на отгрузке уведомления есть только по почте, их и проверил.
2. **Кто собрал заказ** в истории статусов не подписан: `createOrderFulfillmentWorkflow` не получает
   `created_by` — так же и в родной админке Medusa. Строка «Товары собраны» теперь просто без подписи
   (а не с висящим «От»). Чинить — значит расходиться с апстримом; вынес в отчёт, а не в код.
3. **Реальная служба доставки** (СДЭК/Почта/ApiShip) не подключена — это t04/b03 и внешние кабинеты
   клиента. Проверен ровно тот сценарий, на который Оксана согласилась: трек вводится руками.
4. **Машинные названия способов доставки** — «Оксана Черкашина courier» видно и владелице, и покупателю
   («Метод: Оксана Черкашина courier · 10,00 ₽»). Это f06/b03, в этой пачке не трогал.
5. **Локаль витрины для не-русского браузера.** Все внутренние ссылки витрины без префикса локали,
   и middleware выбирает язык по `Accept-Language` на каждом переходе. Замер:
   `curl -H 'Accept-Language: en-US,en' …/account/orders/details/<id>` → `302 → /en/account/…`,
   причём и при полном отсутствии `Accept-Language` тоже `/en`, потому что у тенанта `cherkashino`
   нет строки в `tenant_locale_settings` (`default_locale` пуст), а сборка витрины падает на
   `NEXT_PUBLIC_DEFAULT_LOCALE`. Для покупателя с русским браузером всё по-русски (скриншот 7),
   но магазин на русском домене, открытый из английского браузера, уедет на `/en`. Это отдельная
   задача про локали тенанта — здесь только замер.
6. **Живой хост не трогал** — деплой по правилу 21c только по команде, и docker-сборка запрещена
   на этой машине; проверка образа сделана через `pnpm check:backend-build`.

## Как приёмщику проверить за 10 минут

```bash
cd <worktree ветки>
createdb -h localhost -p 5433 -U ivanprotsko -T upready_store_cherkashina upready_store_b06check
# apps/backend/.env: DATABASE_URL=…/upready_store_b06check, PORT=9066,
#   STORE_CORS/AUTH_CORS с http://cherkashino.localhost:8066, TENANT_BASE_DOMAINS=upready.dev,localhost
# apps/storefront/.env: NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9066,
#   NEXT_PUBLIC_BASE_URL=http://cherkashino.localhost:8066, NEXT_PUBLIC_DEFAULT_LOCALE=ru
# apps/tenant-panel/.env: VITE_MEDUSA_BACKEND_URL=http://localhost:9066
cd apps/backend && npx medusa db:migrate && npx medusa develop
```

1. Склад один, а не 253 — самый быстрый признак правки:
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:9066/auth/tenant/emailpass -H 'content-type: application/json' \
     -d '{"email":"owner-cherkashino@example.test","password":"supersecret1"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
   curl -s -H "authorization: Bearer $TOKEN" 'http://localhost:9066/tenants/stock-locations?limit=1000' \
     | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["count"],[l["name"] for l in d["stock_locations"]])'
   # ожидается: 1 ['Оксана Черкашина warehouse']
   ```
2. Панель `http://localhost:5166` → «Заказы» → непогашенный заказ → «Получить платеж» → «Собрать заказ»
   (склад выбирается из одной строки) → «Отметить как отправленный» → «Перевозчик» + «Номер отслеживания»
   → «Сохранить». На карточке: «Отправление №1 / Отправлено», «Отслеживание: <перевозчик> <номер>»,
   в истории «Товары отправлены — От Оксана Черкашина». Ни одного слова «фулфилмент» и ни одного
   `Total pending`.
3. Витрина `http://cherkashino.localhost:8066/ru/account/orders` под покупателем → заказ:
   «Отправлен», «Оплачен», «Трек-номер: <перевозчик> <номер>».
4. Письмо: поднять любой SMTP-приёмник на 1026 и прописать `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1026`,
   `SMTP_SECURE=false`, `SMTP_FROM=…` в `apps/backend/.env` — после «Сохранить» приходит
   «Заказ №N отправлен» со строкой «Трек-номер: <перевозчик> <номер>».
5. Тесты: `cd apps/backend && npm run test:unit` (красный только `profile-data`, он красный и на `dev`),
   `cd apps/storefront && npm run test:unit` (22/22, 218 тестов).
