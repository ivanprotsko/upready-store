# b07-store-api-isolation — Store API больше не отдаёт чужие заказы

Отчёт написан 2026-09-15 23:31 WITA. Ветка `fix/day16-store-api-isolation`, база `dev`.
Стенд: БД `upready_store_b07` (клон `upready_store_cherkashina` + `medusa db:migrate`) на
`127.0.0.1:5433`, бэкенд `http://localhost:9107`, витрина `http://cherkashino.localhost:8107`.
Живой `cherkashino.shipshift.dev` не трогался.

В базе стенда живут 12 тенантов, из них в замерах участвуют два: `cherkashino`
(`sc_01M29Q4KENS10GXFX9WTGGSD5D`) и `acme` (`sc_01M25V2XR4ASDKRBNQJ20FXQ8H`). Это и есть
«два магазина», без которых межтенантную дырку не увидеть.

## Коротко

Medusa 2.19 отдаёт `GET /store/orders/:id` **без какой-либо авторизации** — в исходнике ядра
(`@medusajs/medusa/dist/api/store/orders/[id]/route.js`) на этом месте стоит комментарий
«TODO: Do we want to apply some sort of authentication here? My suggestion is that we do».
Для одномагазинной установки это осознанный размен ради гостевой страницы «Спасибо».
На нашей мультитенантной инсталляции это означало: кто угодно с ЛЮБЫМ publishable-ключом
читает ЛЮБОЙ заказ ЛЮБОГО магазина вместе с почтой, телефоном и адресом доставки.

Правка закрывает класс, а не место: тот же доступ к тем же данным шёл ещё через три двери —
список заказов, запрос трансфера заказа и корзину.

## Решения, которые пришлось принять

**404, а не 401 — везде.** Задача разрешала выбрать. Выбран 404 и для анонима, и для чужого
покупателя, и для чужого тенанта. Причина: на маршруте, адресуемом по id, разница между
«401 для существующего заказа» и «404 для несуществующего» сама по себе оракул — она
подтверждает, что такой id в этом магазине есть, а это ровно половина того, за чем пришли.
`GET /store/orders` отвечает в том же духе — пустым списком, а не ошибкой.
Единственное исключение — `POST /store/returns`: там 401 отдаёт сам `authenticate` до того,
как кто-либо посмотрел на `order_id`, и это честно: отказ не про конкретный заказ, а про
отсутствие покупателя за вызовом.

**Гостевого одноразового механизма в ядре не было — пришлось сделать свой.** Говорю прямо,
как просила задача: в Medusa 2.19 нет ни токена, ни ссылки с подписью для гостевого заказа.
Секретом был сам id заказа. Поэтому просто закрыть маршрут было нельзя: страница «Спасибо»
(задача f01) и ссылка в письме «заказ оформлен» сломались бы у того самого покупателя,
который только что заплатил.

Сделан **токен доступа к заказу** (`apps/backend/src/store-order-access/token.ts`):
HMAC-SHA256 от id заказа на `ORDER_ACCESS_SECRET || JWT_SECRET`. Ничего не хранится, письмо
вычисляет то же значение спустя часы. Токен — это capability ровно того же уровня, что и сама
ссылка: у кого ссылка, у того и заказ, как у любой «order status URL».

Он попадает к покупателю двумя путями и больше ниоткуда:

1. ответ `POST /store/carts/:id/complete` получает поле `order_token` (middleware
   `attachOrderAccessToken` оборачивает `res.json`; сам платёжный маршрут ядра не тронут),
   витрина кладёт его в редирект `/{locale}/order/{id}/confirmed?token=…`;
2. письмо `order-placed` собирает ту же ссылку с `?token=…`.

Токен едет на бэкенд **заголовком `x-order-token`, а не query-параметром**. Это не вкусовщина:
`validateAndTransformQuery(StoreGetOrderParams, …)` строгий и на `?token=` ответил
`400 … Unrecognized fields: 'token'` (замерено на стенде). В браузерном URL параметр остаётся —
его должна пережить ссылка в письме и копипаста, — витрина читает его оттуда и перекладывает в
заголовок.

**Реализация — middleware, а не свои копии маршрутов.** Первой версией были shadow-маршруты
(как `store/payment-providers/route.ts`), но они требуют прямой зависимости
`@medusajs/core-flows`, которой у `apps/backend` нет, и означают, что мы владеем каждым будущим
изменением ядрового обработчика. Проверено на стенде, что проектные middleware выполняются
ПОСЛЕ ядровых для того же пути (валидатор тела ядра ответил 400 раньше, чем сработал наш
`authenticate`), — значит `req.queryConfig`, `req.filterableFields`, `req.validatedBody` и
`req.auth_context` уже заполнены, а `throw` останавливает обработчик.

## Что изменено

| Файл | Что делает |
|---|---|
| `apps/backend/src/store-order-access/token.ts` | новый: токен доступа к заказу (HMAC), общий для API и письма |
| `apps/backend/src/api/store/order-access.ts` | новый: `assertOrderAccess` + 4 middleware (заказ, список, трансфер, возврат) |
| `apps/backend/src/api/store/cart-scope.ts` | новый: скоуп корзины по магазину + выдача токена в ответе `complete` |
| `apps/backend/src/api/middlewares.ts` | регистрация шести matcher'ов |
| `apps/backend/src/emails/order-placed.tsx` | ссылка на заказ теперь с `?token=…` |
| `apps/storefront/src/lib/data/orders.ts` | `retrieveOrder(id, token?)` шлёт `x-order-token` |
| `apps/storefront/src/lib/data/cart.ts` | `placeOrder` кладёт `order_token` в редирект |
| `apps/storefront/src/app/[locale]/(main)/order/[id]/confirmed/page.tsx` | читает `?token=` и передаёт дальше |
| `apps/backend/integration-tests/http/store-order-isolation.spec.ts` | новый seam-тест, 10 негативов |
| `apps/backend/scripts/fixtures/b07-seed-isolation-orders.ts` | фикстура стенда: три заказа |
| `apps/backend/scripts/fixtures/b07-emit-order-placed.ts` | фикстура: эмит `order.placed`, чтобы прочитать ссылку в письме |

## Пункт 3 задачи: аудит всех `/store/*`

Колонка «кто может позвать» — кто получает содержательный ответ ПОСЛЕ правки.
Публичный ключ магазина (`x-publishable-api-key`) обязателен везде: глобальный гейт
`ensurePublishableApiKeyMiddleware` стоит на всём неймспейсе `/store`.

### Маршруты с персональными данными

| Маршрут | Метод | ДО | ПОСЛЕ | Что отдаёт |
|---|---|---|---|---|
| `/store/orders/:id` | GET | **аноним с любым ключом** | владелец заказа ИЛИ держатель `x-order-token`, и только в своём магазине | заказ целиком: почта, телефон, адрес, состав |
| `/store/orders` | GET | покупатель, БЕЗ скоупа магазина | покупатель, только заказы этого магазина | список своих заказов |
| `/store/orders/:id/transfer/request` | POST | любой залогиненный, ответ — заказ целиком | только заказ этого магазина, ответ — `id` + `email` | подтверждение запроса трансфера |
| `/store/orders/:id/transfer/accept` | POST | аноним + токен из письма владельцу | без изменений (механизм ядра, токен одноразовый) | заказ |
| `/store/orders/:id/transfer/decline` | POST | аноним + токен из письма владельцу | без изменений | заказ |
| `/store/orders/:id/transfer/cancel` | POST | автор запроса | без изменений | заказ |
| `/store/returns` | POST | **аноним**, `order_id` из тела | владелец заказа в этом магазине | созданный возврат |
| `/store/carts/:id` и все `/store/carts/:id/*` | GET/POST/DELETE | **любой ключ любого магазина** | только корзина этого магазина | корзина: почта, телефон, адрес |
| `/store/customers/me*` | ALL | покупатель (гейт ядра `ALL /store/customers/me*`) | без изменений | профиль, адреса |
| `/store/customers/me/claim-orders` | POST | покупатель (f03) | без изменений | перенос своих гостевых заказов |
| `/store/customers` | POST | регистрация (`allowUnregistered`) | без изменений | созданный покупатель |

### Маршруты без персональных данных (проверены, не менялись)

| Маршрут | Кто может позвать | Что отдаёт |
|---|---|---|
| `/store/custom` GET | любой с ключом | 200, пустое тело (заглушка стартера) |
| `/store/payment-providers` GET | любой с ключом | провайдеры оплаты магазина (свой маршрут, t03) |
| `/store/pickup-points` GET | любой с ключом | публичные ПВЗ профиля |
| `/store/storefront-settings` GET / PUT | GET — любой с ключом; PUT — `x-storefront-settings-secret` | композиция витрины |
| `/store/shipping-methods/quote` POST | любой с ключом | расчёт стоимости доставки |
| `/store/shipping-methods/regions` GET | любой с ключом | зоны доставки магазина |
| `/store/tenant/me` GET | любой с ключом | `{id, handle, name}` магазина |
| `/store/tenant/home`, `/pages`, `/pages/:key`, `/pages/sitemap` GET | любой с ключом | публичный контент магазина |
| `/store/tenant/articles`, `/articles/:slug` GET | любой с ключом | публичные статьи |
| `/store/tenant/product-categories`, `/product-attributes`, `/product-attributes/facets` GET | любой с ключом | каталожные справочники |
| `/store/tenant/redirects` GET | любой с ключом | таблица редиректов магазина |
| `/store/tenant/reviews` GET | любой с ключом | опубликованные отзывы: `author_name`, оценка, текст — без почты и `customer_id` (`toReviewDto`) |
| `/store/tenant/reviews` POST | залогиненный покупатель | созданный отзыв |
| `/store/products`, `/product-variants`, `/product-categories`, `/collections`, `/product-tags`, `/product-types`, `/regions`, `/currencies`, `/locales`, `/return-reasons`, `/shipping-options`, `/payment-collections` | ядро, любой с ключом | каталог и справочники, персональных данных нет |

Единственный маршрут, где после правки аноним всё ещё видит персональные данные, — это
`/store/carts/:id`: внутри одного магазина id корзины остаётся единственным credential'ом.
Убрать это нельзя, не сломав гостевой чекаут (авторизовывать там некого), и это тот же размен,
что делает апстрим. Id корзины живёт в httpOnly-куке и нигде не печатается. Скоуп магазина
теперь стоит и здесь, так что чужой магазин корзину не прочитает.

## Замеры

### `GET /store/orders/:id`

Заказы стенда: `order_b07s4l7skm3` (владелец `b07-owner@upready.test`, магазин cherkashino),
`order_b07t7nvgoal` (гостевой, cherkashino), `order_b07xn6jbaz9` (тот же покупатель, магазин acme).

Команда (различаются только заголовки):

```
curl -s -o /dev/null -w '%{http_code}' \
  "http://localhost:9107/store/orders/<id>?fields=id,email,*shipping_address,*items" \
  -H "x-publishable-api-key: <pk>" [-H "authorization: Bearer <token>"]
```

| Вызов | ДО | ПОСЛЕ |
|---|---|---|
| гостевой заказ, аноним, ключ своего магазина | `200` `email=b07-guest@upready.test phone=+79990000077 city=Санкт-Петербург` | `404 {"type":"not_found",…}` |
| гостевой заказ, ЧУЖОЙ покупатель | `200` те же данные | `404` |
| заказ владельца, аноним | `200` `email=b07-owner@upready.test phone=+79990000007 city=Москва` | `404` |
| заказ владельца, ЧУЖОЙ покупатель | `200` те же данные | `404` |
| заказ владельца, САМ ВЛАДЕЛЕЦ | `200` | `200` `email=b07-owner@upready.test phone=+79990000007 city=Москва` |
| заказ магазина acme, аноним, ключ **cherkashino** | `200` `email=b07-owner@upready.test phone=+79990000007 city=Казань` | `404` |
| заказ магазина acme, его владелец, ключ **cherkashino** | `200` | `404` |
| заказ магазина acme, его владелец, ключ acme | `200` | `200` |

Гостевой токен (замер после правки, тот же маршрут, заголовок `x-order-token`):

| Вызов | Код |
|---|---|
| аноним + ВЕРНЫЙ токен заказа | `200`, `email=b07-guest@upready.test phone=+79990000077` |
| аноним + токен ДРУГОГО заказа | `404` |
| аноним + мусорный токен | `404` |
| ВЕРНЫЙ токен + ключ ЧУЖОГО магазина | `404` |
| `?token=` вместо заголовка | `400 Invalid request: Unrecognized fields: 'token'` (валидатор ядра строгий) |

### `GET /store/orders`

```
curl -s "http://localhost:9107/store/orders?fields=id,email&limit=50" \
  -H "x-publishable-api-key: <pk>" -H "authorization: Bearer <token покупателя>"
```

Покупатель `b07-owner@upready.test` имеет по одному заказу в двух магазинах.

| Вызов | ДО | ПОСЛЕ |
|---|---|---|
| ключ cherkashino | `orders=2 count=2 ids=order_b07s4l7skm3,order_b07xn6jbaz9` | `orders=1 count=1 ids=order_b07s4l7skm3` |
| ключ acme | `orders=2 count=2` (те же два) | `orders=1 count=1 ids=order_b07xn6jbaz9` |
| чужой покупатель, ключ cherkashino | `orders=0` | `orders=0` |
| аноним | `401 Unauthorized` | `401 Unauthorized` |
| попытка расширить: `&sales_channel_id=<чужой канал>` | — | `400 … 'sales_channel_id'` (параметр строгий валидатор не пропускает вовсе) |

### `POST /store/orders/:id/transfer/request`

| Вызов | ДО | ПОСЛЕ |
|---|---|---|
| залогиненный незнакомец на чужой ГОСТЕВОЙ заказ, `fields=id,email,*shipping_address,*items` | `200` `email=b07-guest@upready.test phone=+79990000077 items=1` | `200`, в ответе только `{"id":…,"email":…,"status","version","payment_collections":[],"fulfillments":[]}` — ни адреса, ни телефона, ни состава |
| тот же вызов на заказ ЧУЖОГО магазина | `200` | `404` |

### `POST /store/returns`

| Вызов | ДО | ПОСЛЕ |
|---|---|---|
| аноним, валидное по форме тело с чужим `order_id` | `400 … Field 'return_shipping' is required` — то есть до валидатора тела дошёл, гейта авторизации не было | `401 Unauthorized` |
| залогиненный незнакомец, чужой `order_id` | — | `404` |

### `GET /store/carts/:id` и мутации корзины

Корзина `cart_01M2JRYS6HVZQTDF8VPW353CZY` создана ключом acme.

| Вызов | ДО | ПОСЛЕ |
|---|---|---|
| `GET` ключом **cherkashino** | `200 {"id":…,"email":"b07-cart-acme@upready.test","sales_channel_id":"sc_01M25V2XR4…"}` | `404` |
| `GET` ключом acme (свой) | `200` | `200` `email=b07-cart-acme@upready.test` |
| `POST …/line-items` ключом **cherkashino** | (мутация чужой корзины была открыта) | `404` |

### Гостевой чекаут целиком (страница «Спасибо», задача f01)

Настоящий чекаут через Store API в магазине cherkashino: корзина → товар → адрес →
способ доставки → payment collection → `pp_system_default` → `complete`.

```
complete http=200
type=order order=order_01M2JSZ8T6960S9GKSNCQZH83R order_token=bplbFI5-pfGZFhd6MaJ8v3tVc9KIhaqauwDoQKVCszI
```

| Вызов | Код |
|---|---|
| `GET /store/orders/<этот заказ>` + `x-order-token` из ответа `complete` | `200`, `email=b07-live-guest@upready.test phone=+79995550007` |
| тот же вызов без токена | `404` |

Витрина, браузер 1280×900:

| Страница | Результат |
|---|---|
| `/ru/order/<id>/confirmed?token=<токен>` | http=200, «Спасибо! Ваш заказ успешно оформлен. Заказ оформлен на адрес b07-live-guest@upready.test. Номер заказа: 20» |
| `/ru/order/<id>/confirmed` без токена | http=200, «Страница не найдена» |

Замечание по честности: страница «не найдено» на витрине отдаётся с HTTP **200** и заголовком
«Заказ подтверждён» — так ведёт себя `notFound()` на этом маршруте и до правки (метаданные
считаются до загрузки заказа). На содержимое это не влияет: заказа на странице нет. Отдельной
задачей это можно поправить, в состав b07 не входит.

### Ссылка в письме «заказ оформлен»

Письмо перехвачено локальным SMTP-стоком (`127.0.0.1:21588`), событие `order.placed`
эмитировано фикстурой `b07-emit-order-placed.ts`:

```
[smtp] Email sent: <4d424355-721f-b8e9-42f9-352e940fd277@localhost>
[order-placed-email] Sent to b07-guest@upready.test for order order_b07t7nvgoal
```

В письме ровно одна ссылка на заказ:

```
http://cherkashino.localhost:8107/order/order_b07t7nvgoal/confirmed?token=kXXZadRo_3-n-KJrBkU0CAtr-6611tNtFL-cVy2msCc
```

Токен в ней совпадает с тем, который на этом же заказе даёт `200` на `GET /store/orders/:id`.

## Скриншоты

Все 1280×900, каталог
`/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-store-api-isolation/artifacts/docs/b07-store-api-isolation/`:

| Файл | Что на нём |
|---|---|
| `01-guest-thankyou-with-token-1280x900.png` | гость по ссылке с токеном: «Спасибо!», номер заказа 20 |
| `02-guest-thankyou-no-token-1280x900.png` | та же ссылка без токена: «Страница не найдена» |
| `03-stranger-direct-order-url-1280x900.png` | **чужой аккаунт по прямой ссылке `/ru/account/orders/details/order_b07s4l7skm3`: «Страница не найдена»** |
| `04-owner-own-order-1280x900.png` | владелец на том же URL: «Заказ №17», состав, итог |
| `05-owner-orders-list-1280x900.png` | список заказов владельца под ключом cherkashino: одна карточка (до правки было бы две) |

## Проверки

| Проверка | Результат |
|---|---|
| `apps/backend && npx tsc --noEmit` | rc=0, 0 ошибок |
| `apps/backend && npx medusa lint` | rc=0, `✖ 66 problems (0 errors, 66 warnings)`; ни одного предупреждения в изменённых файлах `src/`. Одно — в фикстуре `scripts/fixtures/b07-seed-isolation-orders.ts` (`use-medusa-error-not-generic-error`), ровно как в трёх существующих фикстурах f12/t13/t17 |
| `apps/storefront && npx tsc --noEmit` | rc=0 |
| `apps/storefront && npx next lint` | rc=0 |
| `pnpm check:backend-build` | rc=0, «Backend build completed successfully», «Frontend build completed successfully» |
| `apps/storefront && npx next build` | rc=0 |
| `pnpm check:backend-fixtures` | rc=0 |
| seam `integration-tests/http/store-order-isolation.spec.ts` | `Tests: 10 passed, 10 total` |
| seam `integration-tests/http/guest-order-claim.spec.ts` (регрессия f03) | `Tests: 6 passed, 6 total` |
| `apps/backend && pnpm test:unit` | `Tests: 1 failed, 250 passed, 251 total`. Упавший — `src/migration-scripts/__tests__/profile-data.unit.spec.ts › i18n merge › leaves a locale the profile never translated identical to the base`. Предсуществующий: `git diff --name-only origin/dev...HEAD -- apps/backend/src/migration-scripts` пуст, и та же строка стоит в приёмке f03 (PR #42) |

## Что НЕ сделано и почему

1. **Почта владельца заказа всё ещё видна в ответе на `transfer/request`.** Это механика ядра:
   запросивший должен увидеть, на какой адрес ушло подтверждение, и витрина это показывает
   («письмо отправлено на …»). Адрес, телефон и состав из ответа убраны, почта осталась.
   Маскирование (`i***@e***.ru`) — отдельная правка, она меняет текст на экране и просится в
   задачу про UX переноса заказа.
2. **`/store/carts/:id` внутри одного магазина остаётся доступной по id.** См. конец раздела
   аудита: авторизовать гостевой чекаут некого. Скоуп магазина добавлен, дальше — только
   подписанная кука на корзину, что стоит отдельной задачи и своей приёмки.
3. **Токен заказа не истекает.** Он равносилен ссылке, которая лежит в почтовом ящике
   покупателя; TTL сломал бы ровно то, ради чего ссылка в письме существует. Если понадобится
   отзыв — есть `ORDER_ACCESS_SECRET`: смена секрета обнуляет все выданные токены разом.
4. **Деплой не делался** — задача этого не предписывает. `ORDER_ACCESS_SECRET` на стендах
   выставлять не нужно: по умолчанию берётся `JWT_SECRET`, который уже есть в каждом окружении.
   Но если `JWT_SECRET` на живом хосте когда-нибудь поменяют, ранее разосланные ссылки на
   заказы перестанут открываться — это стоит помнить деплой-задаче.
5. **Локальный docker/VM не запускались** (приказ Ивана 2026-09-15 22:05 WITA). Сборка образа
   не проверялась контейнером; вместо этого прогнан `pnpm check:backend-build` — тот же шаг,
   что делает Dockerfile.

## Как принять за 10 минут

```bash
# 1. Стенд
createdb -h 127.0.0.1 -p 5433 -U ivanprotsko -T upready_store_cherkashina upready_store_b07acc
# apps/backend/.env: DATABASE_URL=…/upready_store_b07acc, PORT=9107
cd apps/backend && npx medusa db:migrate && npx medusa develop

# 2. Данные: зарегистрировать двух покупателей и засеять три заказа
#    (пароль и шаги — в фикстуре, B07_OWNER_CUSTOMER_ID = id зарегистрированного покупателя)
B07_OWNER_CUSTOMER_ID=cus_… npx medusa exec ./scripts/fixtures/b07-seed-isolation-orders.ts

# 3. Главный замер: любой из трёх отказов обязан быть 404
curl -s -o /dev/null -w '%{http_code}\n' \
  "http://localhost:9107/store/orders/<любой заказ>" \
  -H "x-publishable-api-key: <ключ cherkashino>"                      # ждём 404

# 4. Владелец обязан пройти
curl -s -o /dev/null -w '%{http_code}\n' \
  "http://localhost:9107/store/orders/<его заказ>" \
  -H "x-publishable-api-key: <ключ cherkashino>" \
  -H "authorization: Bearer <его токен>"                              # ждём 200

# 5. Гость обязан пройти по своему токену
#    (токен приходит в ответе POST /store/carts/:id/complete полем order_token)
curl -s -o /dev/null -w '%{http_code}\n' \
  "http://localhost:9107/store/orders/<гостевой заказ>" \
  -H "x-publishable-api-key: <ключ cherkashino>" \
  -H "x-order-token: <order_token>"                                   # ждём 200
```

Или короче — один прогон seam-теста, он содержит все десять негативов:

```bash
cd apps/backend
DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9109 \
  pnpm test:integration:http -- integration-tests/http/store-order-isolation.spec.ts
```

После приёмки стендовую базу удалить: `dropdb -h 127.0.0.1 -p 5433 -U ivanprotsko upready_store_b07acc`
(на машине уже ~38 клонов `upready_store_*`, и на приёмке f03 диск из-за них уходил в ноль).
