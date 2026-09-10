# Приёмка среза shared-мультитенантности (рецепт Medusa marketplace/vendors) — 10.09.2026

Задача: `t-2026-09-10-mt-vendors`, ветка `feat/mt-vendors`, код среза — коммит `6018ef9`, фиксы стенда тестов — коммит этой приёмки.
Стенд: `medusa develop` на `http://localhost:9023`, PG `postgres://ivanprotsko@127.0.0.1:5433/upready_store_mt`, Medusa `2.19.0`, Node 26.

## Итог

| Критерий приёмки | Результат |
| --- | --- |
| Два тенанта на одном backend видят только свои товары и заказы через `/tenants/*` | ✅ живой сценарий: 18/18 проверок, jest: 10/10 |
| Заказ с витрины по publishable key тенанта A попадает в `GET /tenants/orders` только у A | ✅ `order_01M25VJJ64RWQ8P8NV7YP6968X` — у acme есть, у globex `[]` |
| jest/seam-тесты в том же коммите | ✅ тест в `6018ef9`, фиксы стенда — здесь; `10 passed, 10 total, 14.97 s` |
| Родная админка Medusa не тронута | ✅ в срезе нет правок `/admin`, staff-маршруты не менялись (`git show --stat 6018ef9`) |
| Замер: endpoint'ы против рецепта, что не легло на 2.19 | ✅ ниже |
| Приёмка на живом backend, вывод в отчёт | ✅ ниже, транскрипт целиком |

Гейт Ивана: открыть `http://localhost:9023` (сервер оставлен работать) и прогнать сценарий самому — команда в разделе «Как повторить».

## Endpoint'ы: 5, из них +1 к рецепту

| Маршрут | Рецепт | У нас |
| --- | --- | --- |
| `POST /tenants` (регистрация тенанта + первого админа, токен из `/auth/tenant/emailpass/register`) | `POST /vendors` | есть |
| `POST /tenants/products` | `POST /vendors/products` | есть; `sales_channels` из тела игнорируются в пользу канала тенанта |
| `GET /tenants/products` | `GET /vendors/products` | есть |
| `GET /tenants/orders` | `GET /vendors/orders` | есть; закрыта дыра рецепта (см. ниже) |
| `GET /tenants/me` | — | **добавлен**: кто стоит за токеном, его sales channel и id ключа |

Auth-маршруты `/auth/tenant/emailpass[/register]` — встроенные Medusa, ничего не добавлялось.

## Что из рецепта легло на 2.19.0 как есть, что менялось

Замеры по `node_modules/@medusajs/*@2.19.0`, подробнее — `~/upready/memory/medusa-2.19-mt-vendors-recipe-facts-2026-09-10.md`.

- **Легло как есть:** `model.define`, `defineLink(…, {isList: true})`, `authenticate("tenant", ["session","bearer"], {allowUnregistered})`, встроенные `/auth/:actor_type/:provider[/register]` без реестра actor types, `setAuthAppMetadataStep`, `useQueryGraphStep`, `createRemoteLinkStep`, `createProductsWorkflow.runAsStep`, `getOrdersListWorkflow`, `AdminCreateProduct` из `@medusajs/medusa/api/admin/products/validators` (фабрика, но `validateAndTransformBody` принимает фабрику).
- **Менялось 1 — привязка заказа.** Рецепт вешает хук `createOrderWorkflow.hooks.orderCreated`; в 2.19 `completeCartWorkflow` не вызывает `createOrdersWorkflow` (0 вхождений в `core-flows/dist/cart/workflows/complete-cart.js`), заказ создаётся через Order Module и эмитится `order.placed`. У нас — subscriber `order.placed` → `linkOrderToTenantWorkflow` (идемпотентный, по `sales_channel_id` заказа). На живом стенде заказ виден тенанту до первого опроса (≤500 мс после `/complete`).
- **Менялось 2 — дыра рецепта в `GET /vendors/orders`.** `filters: {id: vendor.orders?.map(o => o.id)}` без заказов даёт `id: undefined` = фильтра нет = вендор без заказов видит ВСЕ заказы. У нас ранний `return {orders: []}`; проверено живым сценарием (globex → `[]`) и jest.
- **Добавлено против рецепта:** sales channel + publishable key на тенанта (мятся в `createTenantWorkflow`), линк канала на все stock locations (без него у корзины нет shipping options), `handle` тенанта обязателен, `GET /tenants/me`.
- **Не делалось (вопросы дизайну в HANDOFF, `q-mt-*`):** склады общие или per-tenant; заказ не дробится по тенантам; хранение sales channel/key колонками tenant vs links; namespace `/tenants/*` при вариантах панели (b)/(c); где витрина хранит raw publishable key (отдаётся один раз в `POST /tenants`).

## Стенд тестов: что чинилось, чтобы jest вообще запустился

Ни одно падение не было в коде среза. Все четыре — стенд/раннер, замерено по исходникам `@medusajs/test-utils@2.19.0`:

1. **`DB_HOST=127.0.0.1` → зависание 180 с.** `medusa-test-runner-utils/config.js`: `clientUrl.includes("localhost") ? {} : {connection: {ssl: {rejectUnauthorized: false}}}` — для любого хоста, кроме строки `localhost`, раннер включает SSL, а локальный PG без SSL; knex маскирует это как «Timeout acquiring a connection. The pool is probably full» раз в 60 с. Лечение: `DB_HOST=localhost`. Пробник pg+knex на свежей БД — 5/27 мс, окружение исправно.
2. **`jest.config.js` стартера не транспилировал `.tsx`**, а подписчики импортируют React-Email-шаблоны `src/emails/*.tsx` → «Cannot find module '../emails/welcome'». Добавлен transform `^.+\.tsx$` (`tsx: true`, `react.runtime: "automatic"`) и `tsx` в `moduleFileExtensions`.
3. **`PORT=9023` из `.env` занят живым `medusa develop`** → `EADDRINUSE`. Раннер берёт `process.env.PORT`, иначе свободный порт; лечение — `PORT=9123` в команде теста.
4. **Раннер восстанавливает БД из снимка после `beforeAll` перед каждым тестом** (`beforeEach/afterEach` в `medusa-test-runner.js`), поэтому три теста, читавшие товары/заказ из соседних `it`, переписаны самодостаточными (`createProduct` внутри теста). Ожидания изоляции не менялись.

Циклы jest: №1 и №2 — зависание на SSL (183 с, 10 failed); №3 — `.tsx` (6 с, 10 failed); №4 — порт (6 с, 10 failed); №5 — 7 passed / 3 failed (снимок БД); №6 — **10 passed, 10 total, 14.97 s**. `tsc --noEmit` и `medusa lint` — чистые.

## Живой сценарий — результат проверок

Скрипт: `apps/backend/scripts/mt-live-scenario.mjs` (каждый запрос печатается эквивалентной строкой `curl`, статус и тело до 700 знаков).

```
# MT live scenario 2026-09-10T14:29:29.045Z against http://localhost:9023
OK   both tenant admins log in through /auth/tenant/emailpass
OK   GET /tenants/me names the tenant behind each token
region reg_01M25SZDQXXCYBDGQMYWN6J1HR Andorra eur ad
OK   POST /tenants/products → 201 for both tenants
OK   A's product sits only in A's sales channel
OK   B's product sits only in B's sales channel
OK   foreign sales_channels in the body are ignored
OK   GET /tenants/products for A: own product yes, B's no
OK   GET /tenants/products for B: own product yes, A's no
OK   no product id is shared between the two lists
OK   /store/products with key A: A's catalog only
OK   /store/products with key B: B's catalog only
store catalog sizes: A=4 B=2
OK   shipping options are available for a cart in tenant A's sales channel
OK   cart completes into an order (order_01M25VJJ64RWQ8P8NV7YP6968X)
store /complete response: order keys include sales_channel_id = false (store shape; the owner-side check follows below)
orders visible to A after 1 poll(s) × 500 ms
OK   GET /tenants/orders for A contains the storefront order
OK   the linked order carries tenant A's sales channel id (GET /tenants/orders)
OK   GET /tenants/orders for B is empty (got 0)
OK   GET /tenants/products without a token → 401
OK   GET /tenants/products with a customer token → 401
# result: all checks passed
```

Замечание к `store /complete`: ответ витринного `POST /store/carts/{id}/complete` не содержит поля `sales_channel_id` (форма store-ответа), принадлежность заказа проверяется по данным владельца — `GET /tenants/orders` у acme отдаёт `sales_channel_id = sc_01M25V2XR4ASDKRBNQJ20FXQ8H` (канал acme из сида).

## Как повторить

```bash
cd ~/upready/worktrees/upready-store/feat/mt-vendors/apps/backend
npx medusa develop                      # :9023, PORT из .env
npx medusa exec ./src/scripts/seed-tenants.ts   # печатает publishable keys acme/globex (идемпотентно)
PK_ACME=pk_… PK_GLOBEX=pk_… node scripts/mt-live-scenario.mjs
# jest seam-тест (DB_HOST именно localhost, PORT свободный):
PORT=9123 DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko TEST_TYPE=integration:http \
  NODE_OPTIONS=--experimental-vm-modules npx jest --runInBand --forceExit integration-tests/http/tenants.spec.ts
```

Логин тенанта: `POST /auth/tenant/emailpass` `{email: "admin@acme.test", password: "supersecret"}` (второй — `admin@globex.test`).

<details><summary>Полный транскрипт живого сценария (22:29 WITA)</summary>

```
# MT live scenario 2026-09-10T14:29:29.045Z against http://localhost:9023

$ curl -s -X POST http://localhost:9023/auth/tenant/emailpass \
    -H 'content-type: application/json' -d '{"email":"admin@acme.test","password":"supersecret"}'
→ 200 {"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY3Rvcl9pZCI6InRlbmFkbV8wMU0yNVYyWFY3UE5CQjRNMjZCUzQ5NjJaUyIsImFjdG9yX3R5cGUiOiJ0ZW5hbnQiLCJhdXRoX2lkZW50aXR5X2lkIjoiYXV0aGlkXzAxTTI1VjJYUFpEOFhZM01EOURKRzVQM0RYIiwiYXV0aF9wcm92aWRlciI6ImVtYWlscGFzcyIsImFwcF9tZXRhZGF0YSI6eyJ0ZW5hbnRfaWQiOiJ0ZW5hZG1fMDFNMjVWMlhWN1BOQkI0TTI2QlM0OTYyWlMifSwidXNlcl9tZXRhZGF0YSI6e30sImlhdCI6MTc4OTA1MDU2OSwiZXhwIjoxNzg5MTM2OTY5fQ.C6nXZCpyK_5xNmUtVJ3pb9AygFhN-HSqPR9FX8dY0mY"}

$ curl -s -X POST http://localhost:9023/auth/tenant/emailpass \
    -H 'content-type: application/json' -d '{"email":"admin@globex.test","password":"supersecret"}'
→ 200 {"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY3Rvcl9pZCI6InRlbmFkbV8wMU0yNVYyWTBCUk1YQTFSMUU3TjZYVEVGViIsImFjdG9yX3R5cGUiOiJ0ZW5hbnQiLCJhdXRoX2lkZW50aXR5X2lkIjoiYXV0aGlkXzAxTTI1VjJYWTEzUEFISlhTNzNCQUhFRk1FIiwiYXV0aF9wcm92aWRlciI6ImVtYWlscGFzcyIsImFwcF9tZXRhZGF0YSI6eyJ0ZW5hbnRfaWQiOiJ0ZW5hZG1fMDFNMjVWMlkwQlJNWEExUjFFN042WFRFRlYifSwidXNlcl9tZXRhZGF0YSI6e30sImlhdCI6MTc4OTA1MDU2OSwiZXhwIjoxNzg5MTM2OTY5fQ.Z3uC0ariqVlFQA8OYxQzBP1FrJD0_LUtaHBcu7b4MbQ"}
OK   both tenant admins log in through /auth/tenant/emailpass

$ curl -s -X GET http://localhost:9023/tenants/me \
    -H 'Authorization: Bearer <eyJhbGci…>'
→ 200 {"tenant_admin":{"id":"tenadm_01M25V2XV7PNBB4M26BS4962ZS","email":"admin@acme.test","first_name":"Ada","last_name":"Acme","tenant_id":"ten_01M25V2XV2F7T1ZGDYR4GMQHRH","tenant":{"id":"ten_01M25V2XV2F7T1ZGDYR4GMQHRH","handle":"acme","name":"Acme","sales_channel_id":"sc_01M25V2XR4ASDKRBNQJ20FXQ8H","publishable_api_key_id":"apk_01M25V2XR98B37AMARMQZRSCD9","metadata":null,"created_at":"2026-09-10T14:20:58.594Z","updated_at":"2026-09-10T14:20:58.594Z","deleted_at":null}}}

$ curl -s -X GET http://localhost:9023/tenants/me \
    -H 'Authorization: Bearer <eyJhbGci…>'
→ 200 {"tenant_admin":{"id":"tenadm_01M25V2Y0BRMXA1R1E7N6XTEFV","email":"admin@globex.test","first_name":"Gus","last_name":"Globex","tenant_id":"ten_01M25V2Y0512H5QJNG7BT9K1MG","tenant":{"id":"ten_01M25V2Y0512H5QJNG7BT9K1MG","handle":"globex","name":"Globex","sales_channel_id":"sc_01M25V2XYBJNSNXPH1RVKMWVFY","publishable_api_key_id":"apk_01M25V2XYETWMKBQNZ1QXP4WAT","metadata":null,"created_at":"2026-09-10T14:20:58.757Z","updated_at":"2026-09-10T14:20:58.757Z","deleted_at":null}}}
OK   GET /tenants/me names the tenant behind each token

$ curl -s -X GET http://localhost:9023/store/regions \
    -H 'x-publishable-api-key: pk_91071ed64…'
→ 200 {"regions":[{"id":"reg_01M25SZDQXXCYBDGQMYWN6J1HR","name":"Andorra","currency_code":"eur","created_at":"2026-09-10T14:01:35.472Z","updated_at":"2026-09-10T14:01:35.472Z","deleted_at":null,"metadata":null,"countries":[{"iso_2":"ad","iso_3":"and","num_code":"020","name":"ANDORRA","display_name":"Andorra","region_id":"reg_01M25SZDQXXCYBDGQMYWN6J1HR","metadata":null,"created_at":"2026-09-10T14:01:34.168Z","updated_at":"2026-09-10T14:01:35.474Z","deleted_at":null}]},{"id":"reg_01M25SZDQY0QS08ZN1YQ5PKPQE","name":"Barbados","currency_code":"usd","created_at":"2026-09-10T14:01:35.473Z","updated_at":"2026-09-10T14:01:35.473Z","deleted_at":null,"metadata":null,"countries":[{"iso_2":"bb","iso_3":"brb",…
region reg_01M25SZDQXXCYBDGQMYWN6J1HR Andorra eur ad

$ curl -s -X POST http://localhost:9023/tenants/products \
    -H 'Authorization: Bearer <eyJhbGci…>' \
    -H 'content-type: application/json' -d '{"title":"Acme shirt (live mtvmilw5)","status":"published","options":[{"title":"Color","values":["Blue"]}],"variants":[{"title":"Acme shirt (live mtvmilw5)","prices":[{"currency_code":"eur","amount":10}],"manage_inventory":false,"options":{"Color":"Blue"}}]}'
→ 201 {"product":{"id":"prod_01M25VJGMCKA88K1ZBTXEWJTAA","title":"Acme shirt (live mtvmilw5)","handle":"acme-shirt-live-mtvmilw5","subtitle":null,"description":null,"is_giftcard":false,"status":"published","thumbnail":null,"weight":null,"length":null,"height":null,"width":null,"origin_country":null,"hs_code":null,"mid_code":null,"material":null,"discountable":true,"external_id":null,"metadata":null,"type_id":null,"type":null,"collection_id":null,"collection":null,"created_at":"2026-09-10T14:29:29.357Z","updated_at":"2026-09-10T14:29:29.357Z","deleted_at":null,"variants":[{"id":"variant_01M25VJGP72VSC0K4PQ30AHQ87","title":"Acme shirt (live mtvmilw5)","sku":null,"barcode":null,"ean":null,"upc":null,…

$ curl -s -X POST http://localhost:9023/tenants/products \
    -H 'Authorization: Bearer <eyJhbGci…>' \
    -H 'content-type: application/json' -d '{"title":"Globex mug (live mtvmilw5)","status":"published","options":[{"title":"Color","values":["Blue"]}],"variants":[{"title":"Globex mug (live mtvmilw5)","prices":[{"currency_code":"eur","amount":10}],"manage_inventory":false,"options":{"Color":"Blue"}}]}'
→ 201 {"product":{"id":"prod_01M25VJGRJ85MTVSVP2RT31AAD","title":"Globex mug (live mtvmilw5)","handle":"globex-mug-live-mtvmilw5","subtitle":null,"description":null,"is_giftcard":false,"status":"published","thumbnail":null,"weight":null,"length":null,"height":null,"width":null,"origin_country":null,"hs_code":null,"mid_code":null,"material":null,"discountable":true,"external_id":null,"metadata":null,"type_id":null,"type":null,"collection_id":null,"collection":null,"created_at":"2026-09-10T14:29:29.490Z","updated_at":"2026-09-10T14:29:29.490Z","deleted_at":null,"variants":[{"id":"variant_01M25VJGSPQY06SG5HT0QK1D25","title":"Globex mug (live mtvmilw5)","sku":null,"barcode":null,"ean":null,"upc":null,…
OK   POST /tenants/products → 201 for both tenants
OK   A's product sits only in A's sales channel
OK   B's product sits only in B's sales channel

$ curl -s -X POST http://localhost:9023/tenants/products \
    -H 'Authorization: Bearer <eyJhbGci…>' \
    -H 'content-type: application/json' -d '{"title":"Acme smuggled (live mtvmilw5)","status":"published","options":[{"title":"Color","values":["Blue"]}],"variants":[{"title":"Acme smuggled (live mtvmilw5)","prices":[{"currency_code":"eur","amount":10}],"manage_inventory":false,"options":{"Color":"Blue"}}],"sales_channels":[{"id":"sc_01M25V2XYBJNSNXPH1RVKMWVFY"}]}'
→ 201 {"product":{"id":"prod_01M25VJGV1K0YCM3GMZ12P3AQ6","title":"Acme smuggled (live mtvmilw5)","handle":"acme-smuggled-live-mtvmilw5","subtitle":null,"description":null,"is_giftcard":false,"status":"published","thumbnail":null,"weight":null,"length":null,"height":null,"width":null,"origin_country":null,"hs_code":null,"mid_code":null,"material":null,"discountable":true,"external_id":null,"metadata":null,"type_id":null,"type":null,"collection_id":null,"collection":null,"created_at":"2026-09-10T14:29:29.570Z","updated_at":"2026-09-10T14:29:29.570Z","deleted_at":null,"variants":[{"id":"variant_01M25VJGVS1CQQGC1X9V23FDHK","title":"Acme smuggled (live mtvmilw5)","sku":null,"barcode":null,"ean":null,"u…
OK   foreign sales_channels in the body are ignored

$ curl -s -X GET http://localhost:9023/tenants/products \
    -H 'Authorization: Bearer <eyJhbGci…>'
→ 200 {"products":[{"id":"prod_01M25V5ADHY2EMGMREHM67VVCC","title":"Acme shirt (live)","handle":"acme-shirt-live","subtitle":null,"description":null,"is_giftcard":false,"status":"published","thumbnail":null,"weight":null,"length":null,"height":null,"width":null,"origin_country":null,"hs_code":null,"mid_code":null,"material":null,"discountable":true,"external_id":null,"metadata":null,"type_id":null,"type":null,"collection_id":null,"collection":null,"created_at":"2026-09-10T14:22:17.011Z","updated_at":"2026-09-10T14:22:17.011Z","deleted_at":null,"variants":[{"id":"variant_01M25V5AFFWYBABWDT4CFFF1Z2","title":"Acme shirt (live)","sku":null,"barcode":null,"ean":null,"upc":null,"allow_backorder":false,"…

$ curl -s -X GET http://localhost:9023/tenants/products \
    -H 'Authorization: Bearer <eyJhbGci…>'
→ 200 {"products":[{"id":"prod_01M25V5AHPWE8396MJS97H34WP","title":"Globex mug (live)","handle":"globex-mug-live","subtitle":null,"description":null,"is_giftcard":false,"status":"published","thumbnail":null,"weight":null,"length":null,"height":null,"width":null,"origin_country":null,"hs_code":null,"mid_code":null,"material":null,"discountable":true,"external_id":null,"metadata":null,"type_id":null,"type":null,"collection_id":null,"collection":null,"created_at":"2026-09-10T14:22:17.143Z","updated_at":"2026-09-10T14:22:17.143Z","deleted_at":null,"variants":[{"id":"variant_01M25V5AJCWR8C14DRRG8WEH1N","title":"Globex mug (live)","sku":null,"barcode":null,"ean":null,"upc":null,"allow_backorder":false,"…
OK   GET /tenants/products for A: own product yes, B's no
OK   GET /tenants/products for B: own product yes, A's no
OK   no product id is shared between the two lists

$ curl -s -X GET http://localhost:9023/store/products?limit=100 \
    -H 'x-publishable-api-key: pk_91071ed64…'
→ 200 {"products":[{"id":"prod_01M25V5ADHY2EMGMREHM67VVCC","title":"Acme shirt (live)","subtitle":null,"description":null,"handle":"acme-shirt-live","is_giftcard":false,"discountable":true,"thumbnail":null,"collection_id":null,"type_id":null,"weight":null,"length":null,"height":null,"width":null,"hs_code":null,"origin_country":null,"mid_code":null,"material":null,"created_at":"2026-09-10T14:22:17.011Z","updated_at":"2026-09-10T14:22:17.011Z","type":null,"collection":null,"options":[{"id":"opt_01M25V5ADJEZZ8KN39APWJXC5Q","title":"Color","is_exclusive":true,"metadata":null,"created_at":"2026-09-10T14:22:17.012Z","updated_at":"2026-09-10T14:22:17.012Z","deleted_at":null,"values":[{"id":"optval_01M25V…

$ curl -s -X GET http://localhost:9023/store/products?limit=100 \
    -H 'x-publishable-api-key: pk_96a76047e…'
→ 200 {"products":[{"id":"prod_01M25V5AHPWE8396MJS97H34WP","title":"Globex mug (live)","subtitle":null,"description":null,"handle":"globex-mug-live","is_giftcard":false,"discountable":true,"thumbnail":null,"collection_id":null,"type_id":null,"weight":null,"length":null,"height":null,"width":null,"hs_code":null,"origin_country":null,"mid_code":null,"material":null,"created_at":"2026-09-10T14:22:17.143Z","updated_at":"2026-09-10T14:22:17.143Z","type":null,"collection":null,"options":[{"id":"opt_01M25V5AHP29579VAPQZA3KKC5","title":"Color","is_exclusive":true,"metadata":null,"created_at":"2026-09-10T14:22:17.143Z","updated_at":"2026-09-10T14:22:17.143Z","deleted_at":null,"values":[{"id":"optval_01M25V…
OK   /store/products with key A: A's catalog only
OK   /store/products with key B: B's catalog only
store catalog sizes: A=4 B=2

$ curl -s -X POST http://localhost:9023/store/carts \
    -H 'x-publishable-api-key: pk_91071ed64…' \
    -H 'content-type: application/json' -d '{"region_id":"reg_01M25SZDQXXCYBDGQMYWN6J1HR"}'
→ 200 {"cart":{"id":"cart_01M25VJH291RWDP989KC9R5164","currency_code":"eur","email":null,"locale":null,"region_id":"reg_01M25SZDQXXCYBDGQMYWN6J1HR","created_at":"2026-09-10T14:29:29.801Z","updated_at":"2026-09-10T14:29:29.801Z","completed_at":null,"total":0,"subtotal":0,"tax_total":0,"discount_total":0,"discount_subtotal":0,"discount_tax_total":0,"original_total":0,"original_tax_total":0,"item_total":0,"item_subtotal":0,"item_tax_total":0,"item_discount_total":0,"original_item_total":0,"original_item_subtotal":0,"original_item_tax_total":0,"shipping_total":0,"shipping_subtotal":0,"shipping_tax_total":0,"shipping_discount_total":0,"original_shipping_tax_total":0,"original_shipping_subtotal":0,"orig…

$ curl -s -X POST http://localhost:9023/store/carts/cart_01M25VJH291RWDP989KC9R5164/line-items \
    -H 'x-publishable-api-key: pk_91071ed64…' \
    -H 'content-type: application/json' -d '{"variant_id":"variant_01M25VJGP72VSC0K4PQ30AHQ87","quantity":1}'
→ 200 {"cart":{"id":"cart_01M25VJH291RWDP989KC9R5164","currency_code":"eur","email":null,"locale":null,"region_id":"reg_01M25SZDQXXCYBDGQMYWN6J1HR","created_at":"2026-09-10T14:29:29.801Z","updated_at":"2026-09-10T14:29:29.801Z","completed_at":null,"total":10,"subtotal":10,"tax_total":0,"discount_total":0,"discount_subtotal":0,"discount_tax_total":0,"original_total":10,"original_tax_total":0,"item_total":10,"item_subtotal":10,"item_tax_total":0,"item_discount_total":0,"original_item_total":10,"original_item_subtotal":10,"original_item_tax_total":0,"shipping_total":0,"shipping_subtotal":0,"shipping_tax_total":0,"shipping_discount_total":0,"original_shipping_tax_total":0,"original_shipping_subtotal":…

$ curl -s -X POST http://localhost:9023/store/carts/cart_01M25VJH291RWDP989KC9R5164 \
    -H 'x-publishable-api-key: pk_91071ed64…' \
    -H 'content-type: application/json' -d '{"email":"shopper@example.com","shipping_address":{"first_name":"Test","last_name":"Shopper","address_1":"Main st 1","city":"Berlin","country_code":"ad","postal_code":"10115"},"billing_address":{"first_name":"Test","last_name":"Shopper","address_1":"Main st 1","city":"Berlin","country_code":"ad","postal_code":"10115"}}'
→ 200 {"cart":{"id":"cart_01M25VJH291RWDP989KC9R5164","currency_code":"eur","email":"shopper@example.com","locale":null,"region_id":"reg_01M25SZDQXXCYBDGQMYWN6J1HR","created_at":"2026-09-10T14:29:29.801Z","updated_at":"2026-09-10T14:29:30.149Z","completed_at":null,"total":10,"subtotal":10,"tax_total":0,"discount_total":0,"discount_subtotal":0,"discount_tax_total":0,"original_total":10,"original_tax_total":0,"item_total":10,"item_subtotal":10,"item_tax_total":0,"item_discount_total":0,"original_item_total":10,"original_item_subtotal":10,"original_item_tax_total":0,"shipping_total":0,"shipping_subtotal":0,"shipping_tax_total":0,"shipping_discount_total":0,"original_shipping_tax_total":0,"original_sh…

$ curl -s -X GET http://localhost:9023/store/shipping-options?cart_id=cart_01M25VJH291RWDP989KC9R5164 \
    -H 'x-publishable-api-key: pk_91071ed64…'
→ 200 {"shipping_options":[{"id":"so_01M25SZF437RSEC4GTY7TMT9VN","name":"Pickup","price_type":"flat","service_zone_id":"serzo_01M25SZF2QHS4PYN8H73R9911P","shipping_profile_id":"sp_01M25SZDJ5WFSJFWCWB0ENZBE6","provider_id":"manual_manual","data":null,"service_zone":{"fulfillment_set_id":"fuset_01M25SZF2Q5RDHENTPHTY3P58M","id":"serzo_01M25SZF2QHS4PYN8H73R9911P","fulfillment_set":{"type":"shipping","id":"fuset_01M25SZF2Q5RDHENTPHTY3P58M","location":{"id":"sloc_01M25SZE4Q0XY3MV4N0AYXYWQ0","address":{"id":"laddr_01M25SZE4Q5MV4F9CP2S4B0WM8","address_1":"Avinguda Meritxell 96","address_2":null,"company":null,"city":null,"country_code":"ad","phone":null,"province":null,"postal_code":null,"metadata":null,"…
OK   shipping options are available for a cart in tenant A's sales channel

$ curl -s -X POST http://localhost:9023/store/carts/cart_01M25VJH291RWDP989KC9R5164/shipping-methods \
    -H 'x-publishable-api-key: pk_91071ed64…' \
    -H 'content-type: application/json' -d '{"option_id":"so_01M25SZF437RSEC4GTY7TMT9VN"}'
→ 200 {"cart":{"id":"cart_01M25VJH291RWDP989KC9R5164","currency_code":"eur","email":"shopper@example.com","locale":null,"region_id":"reg_01M25SZDQXXCYBDGQMYWN6J1HR","created_at":"2026-09-10T14:29:29.801Z","updated_at":"2026-09-10T14:29:30.149Z","completed_at":null,"total":10,"subtotal":10,"tax_total":0,"discount_total":0,"discount_subtotal":0,"discount_tax_total":0,"original_total":10,"original_tax_total":0,"item_total":10,"item_subtotal":10,"item_tax_total":0,"item_discount_total":0,"original_item_total":10,"original_item_subtotal":10,"original_item_tax_total":0,"shipping_total":0,"shipping_subtotal":0,"shipping_tax_total":0,"shipping_discount_total":0,"original_shipping_tax_total":0,"original_sh…

$ curl -s -X POST http://localhost:9023/store/payment-collections \
    -H 'x-publishable-api-key: pk_91071ed64…' \
    -H 'content-type: application/json' -d '{"cart_id":"cart_01M25VJH291RWDP989KC9R5164"}'
→ 200 {"payment_collection":{"id":"pay_col_01M25VJJ3A1YNCTRPTANCJ55GK","currency_code":"eur","amount":10,"payment_sessions":[]}}

$ curl -s -X POST http://localhost:9023/store/payment-collections/pay_col_01M25VJJ3A1YNCTRPTANCJ55GK/payment-sessions \
    -H 'x-publishable-api-key: pk_91071ed64…' \
    -H 'content-type: application/json' -d '{"provider_id":"pp_system_default"}'
→ 200 {"payment_collection":{"id":"pay_col_01M25VJJ3A1YNCTRPTANCJ55GK","currency_code":"eur","amount":10,"payment_sessions":[{"id":"payses_01M25VJJ43PRFMW04363PCV9NV","currency_code":"eur","provider_id":"pp_system_default","data":{},"context":{},"status":"pending","authorized_at":null,"payment_collection_id":"pay_col_01M25VJJ3A1YNCTRPTANCJ55GK","payment":null,"metadata":{},"raw_amount":{"value":"10","precision":20},"created_at":"2026-09-10T14:29:30.883Z","updated_at":"2026-09-10T14:29:30.883Z","deleted_at":null,"amount":10}]}}

$ curl -s -X POST http://localhost:9023/store/carts/cart_01M25VJH291RWDP989KC9R5164/complete \
    -H 'x-publishable-api-key: pk_91071ed64…'
→ 200 {"type":"order","order":{"id":"order_01M25VJJ64RWQ8P8NV7YP6968X","status":"pending","summary":{"paid_total":0,"raw_paid_total":{"value":"0","precision":20},"refunded_total":0,"accounting_total":10,"credit_line_total":0,"transaction_total":0,"pending_difference":10,"raw_refunded_total":{"value":"0","precision":20},"current_order_total":10,"original_order_total":10,"raw_accounting_total":{"value":"10","precision":20},"raw_credit_line_total":{"value":"0","precision":20},"raw_transaction_total":{"value":"0","precision":20},"raw_pending_difference":{"value":"10","precision":20},"raw_current_order_total":{"value":"10","precision":20},"raw_original_order_total":{"value":"10","precision":20}},"curre…
OK   cart completes into an order (order_01M25VJJ64RWQ8P8NV7YP6968X)
store /complete response: order keys include sales_channel_id = false (store shape; the owner-side check follows below)

$ curl -s -X GET http://localhost:9023/tenants/orders \
    -H 'Authorization: Bearer <eyJhbGci…>'
→ 200 {"orders":[{"id":"order_01M25V5BT9074TTCAD6CTWHE90","display_id":1,"status":"pending","email":"shopper@example.com","currency_code":"eur","sales_channel_id":"sc_01M25V2XR4ASDKRBNQJ20FXQ8H","created_at":"2026-09-10T14:22:18.443Z","metadata":null,"total":10,"subtotal":10,"shipping_total":0,"tax_total":0,"shipping_methods":[{"id":"ordsm_01M25V5BT9J9E021E50WZZ6QTN","name":"Pickup","description":null,"is_tax_inclusive":false,"is_custom_amount":false,"shipping_option_id":"so_01M25SZF437RSEC4GTY7TMT9VN","data":{},"metadata":null,"raw_amount":{"value":"0","precision":20},"created_at":"2026-09-10T14:22:18.444Z","updated_at":"2026-09-10T14:22:18.444Z","deleted_at":null,"tax_lines":[],"adjustments":[],…
orders visible to A after 1 poll(s) × 500 ms

$ curl -s -X GET http://localhost:9023/tenants/orders \
    -H 'Authorization: Bearer <eyJhbGci…>'
→ 200 {"orders":[]}
OK   GET /tenants/orders for A contains the storefront order
OK   the linked order carries tenant A's sales channel id (GET /tenants/orders)
OK   GET /tenants/orders for B is empty (got 0)

$ curl -s -X GET http://localhost:9023/tenants/products
→ 401 {"message":"Unauthorized"}
OK   GET /tenants/products without a token → 401

$ curl -s -X POST http://localhost:9023/auth/customer/emailpass/register \
    -H 'content-type: application/json' -d '{"email":"shopper+1789050571673@example.com","password":"supersecret"}'
→ 200 {"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY3Rvcl9pZCI6IiIsImFjdG9yX3R5cGUiOiJjdXN0b21lciIsImF1dGhfaWRlbnRpdHlfaWQiOiJhdXRoaWRfMDFNMjVWSkpaRkFXMUU2WUFXVkFFNFM3MzYiLCJhdXRoX3Byb3ZpZGVyIjoiZW1haWxwYXNzIiwiYXBwX21ldGFkYXRhIjp7fSwidXNlcl9tZXRhZGF0YSI6e30sImlhdCI6MTc4OTA1MDU3MSwiZXhwIjoxNzg5MTM2OTcxfQ.n91CziPO36ipA88XhCjVPPs4HxU9PGgsxhP01vuxqu4"}

$ curl -s -X GET http://localhost:9023/tenants/products \
    -H 'Authorization: Bearer <eyJhbGci…>'
→ 401 {"message":"Unauthorized"}
OK   GET /tenants/products with a customer token → 401

# result: all checks passed
```

</details>
