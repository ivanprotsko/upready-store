# t04-shipping-tariffs — Доставка тенанта: зоны, тарифы по весу, экран в панели, трек вручную

Отчёт составлен 2026-09-15 04:46 WITA. Ветка `feat/day16-shipping-tariffs` от `dev`. Все замеры — на локальном МТ-стенде этой ветки
(бэкенд `:9051`, витрина `:8051`, панель `:5181`, БД `upready_store_t04` = копия `upready_store_abstract` через pg_dump).

## Что сделано

**Модель.** Способ доставки тенанта = Medusa `shipping_option` в service zone склада тенанта; всё «своё» лежит в
`shipping_option.data` по схеме `upready.shipping-method/v1` (`apps/backend/src/shipping-tariffs/tariff.ts`):
тариф (`flat` | `per_kg` {base, per_kg, min_weight_g} | `free_above` {amount, threshold}), описание, срок,
порядок, вес по умолчанию, зона (страна + список регионов или вся страна; `null` = базовая зона склада — все
страны магазина). Отдельной таблицы не понадобилось. Зона с регионами = Medusa geo zones типа `province`, где
`province_code` = строка региона в форме DaData `region_with_type` («г Москва», «Московская обл») — ровно то, что
витрина пишет в `shipping_address.province` (`ru-regions.ts`, 85 субъектов). Вес — `variant.weight` (граммы),
fallback `product.weight`, затем вес тенанта по умолчанию (`tenant.metadata.shipping_default_weight_g`, копируется в
`data` каждого способа, потому что провайдер тенанта не знает).

**Расчёт на бэкенде.** Новый fulfillment-провайдер `tariff_tariff` (`src/modules/tariff-fulfillment`, зарегистрирован в
`medusa-config.ts` рядом с `manual`): `calculatePrice` считает из `optionData.tariff` и контекста корзины Medusa
(веса вариантов, валюта, локаль). Та же чистая функция `quoteTariff` отдаёт цену + пояснение через
`POST /store/shipping-methods/quote` («2,4 кг × 180 ₽ + 150 ₽»). Витрина ничего не считает: для `tariff_tariff`
она зовёт quote, для остальных calculated — штатный `/calculate`.

**API панели** `/tenants/shipping-methods` (GET список + настройки, POST создать, `/:id` GET/POST/DELETE,
`/reorder`, `/settings`, `/regions`). Скоуп — только service zones склада тенанта (tenant → sales channel → stock
location → fulfillment set); чужой id = 404 и на чтение, и на запись. Воркфлоу
`src/workflows/tenant/shipping-methods/*` (создание/правка/удаление с компенсациями; своя зона создаётся, переезжает
в базовую и удаляется вместе со способом).

**Панель** `/shipping` (`apps/tenant-panel/src/routes/shipping/**`, пункт «Доставка» в меню): таблица способов в
порядке показа, стрелки порядка, переключатель «Показывать», создание/правка в focus-modal (название, описание, срок,
зона: все страны / страна / регионы страны с чеклистом, тариф трёх видов), удаление, блок «Вес товара по умолчанию».
Все ярлыки — русский текст, сырых enum на экране нет (`labels.ts`).

**Checkout** (`checkout-shipping-section`): карточки в порядке владельца, описание и срок из `data`, цена и строка
пояснения из quote; пустой список — понятная фраза (ru/en: «Доставка по этому адресу пока не настроена. Проверьте
страну и регион или напишите нам…»). Ручной ввод адреса для страны со списком регионов (RU) — селект регионов из
`GET /store/shipping-methods/regions`, чтобы province совпадал с зоной.

**Трек-номер.** Форма отгрузки в панели уже имела поле трек-номера (копия Admin); добавлено поле «Перевозчик»
(свободный текст) → `fulfillment.metadata.carrier` (тенантский shipments-роут дописывает metadata после
`createOrderShipmentWorkflow`, который сам пишет только labels). Панель показывает перевозчика над номером в карточке
фулфилмента; покупатель видит «СДЭК 80112233445566» в блоке «Доставка → Трек-номер» на странице заказа в кабинете и в
таймлайне самовывоза; письмо об отгрузке (`order-shipment-created.tsx`) ставит перевозчика перед номером.

**Дефолты.** `provisionTenantWarehouseWorkflow` называет два стартовых способа в дефолтной локали магазина
(`STOREFRONT_DEFAULT_LOCALE=ru` → «Самовывоз» / «Курьером», иначе Pickup / Courier) и сразу пишет им `data` схемы
способа. Существующие тенанты: скрипт `src/scripts/rename-default-shipping-methods.ts` (идемпотентный, ничего не
удаляет и не переоценивает). На стенде прогнан: «renamed 22 options across 15 tenants», машинных имён осталось 0.

**Попутно исправлено.** `POST /tenants/products` без `shipping_profile_id` теперь получает дефолтный профиль:
без профиля Medusa выкидывает строки корзины из расчёта доставки (`filterCartItemsByShippingProfile`), и вес 2,4 кг
считался как 0 кг (замерено: calculate дал 150 вместо 582).

## Файлы

- backend: `medusa-config.ts`, `src/shipping-tariffs/{tariff,ru-regions,default-method-names}.ts` + `__tests__/tariff.unit.spec.ts`,
  `src/modules/tariff-fulfillment/{index,service}.ts`, `src/api/tenants/shipping-methods/**`, `src/api/store/shipping-methods/{quote,regions}/route.ts`,
  `src/api/middlewares.ts`, `src/workflows/tenant/shipping-methods/**`, `src/workflows/tenant/provision-tenant-warehouse/index.ts`,
  `src/workflows/tenant/create-tenant-product/index.ts`, `src/api/tenants/orders/[id]/fulfillments/[fulfillment_id]/shipments/route.ts`,
  `src/emails/order-shipment-created.tsx`, `src/subscribers/order-shipment-created-email.ts`, `src/scripts/rename-default-shipping-methods.ts`,
  `integration-tests/http/tenants-shipping-methods.spec.ts`.
- tenant-panel: `src/hooks/api/shipping-methods.tsx`, `src/routes/shipping/**`, `src/app.tsx`, `components/layout/main-layout/main-layout.tsx`,
  `i18n/translations/{ru,en}.json`, `routes/orders/order-create-shipment/**` (поле carrier), `routes/orders/order-detail/.../order-fulfillment-section.tsx`.
- storefront: `src/lib/data/{fulfillment,orders}.ts`, `src/lib/util/fulfillment.ts`, `modules/checkout/components/{checkout-shipping-section,checkout-address-sheet}`,
  `modules/common/components/address-autocomplete/{types.ts,manual-address-fields.tsx}`, `modules/order/components/shipping-details`,
  `modules/account/components/order-timeline`, `messages/*.json` (36 каталогов: новый ключ `OrderTimeline.trackingNumber`; `shippingUnavailable` переписан в ru/en).

## Проверки (строки результата)

```
apps/backend:  npx tsc --noEmit            → без ошибок
apps/backend:  npx medusa lint             → 0 errors, 12 warnings (5 новых — generic Error в чистой библиотеке tariff.ts без Medusa-импортов; роут оборачивает в MedusaError)
apps/backend:  pnpm test:unit -- src/shipping-tariffs   → Tests: 10 passed, 10 total
apps/backend:  pnpm test:unit (всё)        → Tests: 1 failed, 71 passed, 72 total — падение profile-data.unit.spec.ts «i18n merge › leaves a locale…» воспроизводится на dev 3d18af1 в основном чекауте (1 failed, 14 passed) — не этой ветки
apps/backend:  DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9199 pnpm test:integration:http -- tenants-shipping-methods
               → Test Suites: 1 passed, 1 total / Tests: 7 passed, 7 total (28.3 s)
apps/tenant-panel: pnpm typecheck → без ошибок; pnpm lint → 0 errors (23 warnings, все в скопированных файлах Admin, в новых файлах 0)
apps/storefront: npx tsc --noEmit → без ошибок; npx next lint → ✔ No ESLint warnings or errors; npx next build → ✓ Compiled successfully, BUILD_ID 2Nc4mwmN4NanXiuLd91Ev
каталоги витрины: checked 36 catalogs against 435 keys (паритет)
```

## Приёмка (замерено на стенде, скрипт `scenario.mjs` — все числа из вывода)

1. **Новый тенант получает человеческие имена.** `POST /tenants` → `GET /tenants/shipping-methods`:
   `Самовывоз [flat amount 0, zone=null]`, `Курьером [flat amount 10, zone=null]`; через Store API для корзины RU:
   `RU OPTIONS: Самовывоз (flat, manual_manual, amount=0) · Курьером (flat, manual_manual, amount=10) · Почтой России, 1–2 кг (calculated, tariff_tariff)`.
2. **Владелец создаёт «Почтой России, 1–2 кг»** (per_kg: base 150, 180 ₽/кг, зона Россия): `CREATED so_01M2GSDDYXGKZ6QC6TSR2T7QW1 … calculated tariff_tariff {"kind":"per_kg","base_amount":150,"per_kg_amount":180} {"country_code":"ru","provinces":[]}`.
   Скриншот панели: `01-panel-shipping-list.png`, форма правки: `02-panel-shipping-edit.png`.
3. **Корзина RU, 2 × Плед 700 г + 1 × Подушка 1000 г = 2400 г.** Правило: 150 + 180 × 2,4 = 582.
   `QUOTE: amount 582, weight_g 2400, item_total 2500, explanation "2,4 кг × 180 ₽ + 150 ₽"` · `MEDUSA CALCULATE amount: 582` ·
   `CART SHIPPING METHOD amount=582, shipping_total 582`. В браузере карточка: «Почтой России, 1–2 кг / Отправляем в течение двух дней после
   оплаты / 5–10 дней / 582,00 ₽ / 2,4 кг × 180 ₽ + 150 ₽» — `04-storefront-checkout-shipping.png`.
4. **Корзина DE (2 × 700 г, Berlin):** `DE OPTIONS: [Самовывоз, Курьером] tariff method present: false`.
   Зона по регионам: после ограничения «г Москва, Московская обл» — `Moscow sees it: true | St Petersburg sees it: false`.
5. **Вес по умолчанию:** seam-тест: вариант без веса × 2 → 1000 г / 100 ₽ при дефолте 500 г; после `POST /settings {250}` → 500 г / 50 ₽ и в quote, и в Medusa calculate.
6. **Трек-номер** (`order-scenario.mjs`): заказ №6 (`order_01M2GSKEYX95FD7YWDQ9CQK8SA`, доставка 582 ₽), владелец: fulfillment + shipment
   `labels [80112233445566], metadata {"carrier":"СДЭК"}`; покупатель `GET /store/orders/:id`: `labels [80112233445566] carrier СДЭК status shipped`.
   Скриншоты: панель `03-panel-order-tracking.png` (Отслеживание: СДЭК / 80112233445566), форма отгрузки с полем «Перевозчик» `06-panel-shipment-form-carrier.png`,
   кабинет покупателя `05-storefront-account-order-tracking.png` (Трек-номер: СДЭК 80112233445566).

Скриншоты (PNG вне git): `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-shipping-tariffs/artifacts/docs/t04-shipping-tariffs/0{1,2,3,4,5,6}-*.png`.
Скрипты замеров: `/private/tmp/claude-502/-Users-ivanprotsko-upready-worktrees-b29f7dd2-d35c-442d-9636-3c55da1eccf7-feat-day16-shipping-tariffs/d5991758-cb62-43e7-9e63-0a5e19d700f5/scratchpad/{scenario,order-scenario,shots}.mjs` (+ `*-out.txt`).

## Что НЕ сделано и почему

- Интеграций перевозчиков (ApiShip/СДЭК/Почта) нет — вне задачи по ТЗ.
- Плоский тариф пишется одной суммой во ВСЕ валюты регионов магазина (так же делает провижнинг); для магазина с одной
  валютой это верно, мультивалютные цены владелец задать не может (панель показывает валюту домашней страны магазина, для `ru` — RUB).
- Список регионов есть только для России; для другой страны зона — «страна целиком».
- Название service zone Medusa требует уникальным по всей базе, поэтому зона способа именуется `<название> · <хвост id набора> · <метка времени>`; покупатель его не видит.
- Письмо об отгрузке проверено кодом (subscriber читает `fulfillments.metadata`), живьём не отправлялось: на стенде SMTP нет.
- Скриншот пустого списка методов не снимался; факт «метод не показывается для DE» замерен через Store API (п. 4).
- Существующие тенанты на живом хосте не переименованы: скрипт готов, деплоя по ТЗ нет. После деплоя: `npx medusa exec ./src/scripts/rename-default-shipping-methods.ts`.

## Как проверить за 10 минут

1. `cd apps/backend && DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9199 pnpm test:integration:http -- tenants-shipping-methods` → 7 passed.
2. Поднять бэкенд ветки (`medusa develop`, свой PORT/БД), панель (`VITE_MEDUSA_BACKEND_URL=<бэкенд> npx vite --port 5181`), витрину (`NEXT_PUBLIC_MEDUSA_BACKEND_URL=<бэкенд> DEMO_HOSTS=localhost npx next dev -p 8051`).
3. В панели: «Доставка» → «Добавить способ» → «Почтой России, 1–2 кг», зона «В одну страну целиком» Россия, тариф «По весу» 150 + 180 → сохранить; строка появилась с ценой «150 ₽ + 180 ₽/кг».
4. На витрине `http://<handle>.localhost:8051/ru`: положить товары с весом, адрес RU → карточка с ценой и строкой «N кг × 180 ₽ + 150 ₽»; переключить страну на Германию → способа нет.
5. В панели: заказ → «Отметить отправленным» → трек-номер + «Перевозчик» → у покупателя в заказе «Трек-номер: <перевозчик> <номер>».
