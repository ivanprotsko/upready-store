# t03-tenant-secrets-robokassa — пер-тенантные секреты интеграций и приём оплат Robokassa (тестовый режим)

Отчёт записан 2026-09-15 04:06 WITA. Ветка `feat/day16-tenant-secrets-psp` от `dev`, замеры — локальный стенд
(бэкенд `:9047`, витрина `:8047`, панель `:5187`, БД `upready_store_t03` = дамп `upready_store_abstract` + миграция).

## Граница задачи, заявленная сразу

Магазин **не принимает реальные деньги**: модерация Robokassa не пройдена, вывод средств не активирован,
домен не идентифицирован по 569-ФЗ (`research/telegram-digest.md` §6, п. 1–2). Это вне репозитория и не
предмет PR. Здесь — способность платформы (секреты магазина + провайдер) и **измеренная оплата в тестовом
режиме** Robokassa. Боевой режим переключается тем же экраном, но включать его нельзя до модерации.

## Шаг 1. Развилка хранилища секретов — решена по коду

Вопрос: может ли ОДНА зарегистрированная интеграция `@gorgo/medusa-integration` (0.2.1, установлен в репозитории)
выдавать разные реквизиты по тенанту в момент вызова? **Нет.** Прочитано в `node_modules/@gorgo/medusa-integration/.medusa/server/src/`:

- `modules/integration/models/integration.js` — модель `integration` с индексом `{ on: ["provider_id"], unique: true }`:
  одна строка настроек на `provider_id`.
- `modules/integration/utils/provider-id.js` — `provider_id = int_<identifier>[_<instanceId>]`, где `instanceId` —
  это `id` регистрации в `medusa-config` (`options.providers`).
- `modules/integration/services/integration-module.js:229-240` (`getResolvedOptions`) — ключ берётся из
  `(identifier, instanceId)`, при неизвестном ключе бросает «Declare it in medusa-config under the integration
  plugin's options.providers». Никакого измерения «тенант/запрос» в API нет.

«Несколько экземпляров» модуля — это несколько записей в конфиге на этапе сборки, то есть жёсткий список
экземпляров по числу магазинов, что `AGENTS.md` запрещает («Leave the array empty»). Поэтому построена
первая форма из брифа: **своя tenant-scoped запись + провайдер, разрешающий реквизиты на каждый вызов**.
Схема шифрования взята той же, что у модуля интеграций (`services/crypto.js`: AES-256-GCM, ключ = SHA-256 от
`INTEGRATION_ENCRYPTION_KEY`, blob `iv‖tag‖ciphertext` base64) — одна платформенная переменная на всё.

## Что изменилось

**Бэкенд (`apps/backend`)**

- `src/modules/tenant/models/tenant-integration-secret.ts` + миграция `Migration20260914193724.ts` (снапшот
  перегенерирован): таблица `tenant_integration_secret(id, tenant_id, provider, payload, is_test, is_enabled)`,
  уникальность `(tenant_id, provider)` среди живых строк.
- `src/tenant-secrets/crypto.ts` — шифрование/маскирование; `src/tenant-secrets/robokassa.ts` — тип реквизитов,
  чтение строки через `__pg_connection__` (единый читатель для маршрутов и провайдера), подписи Robokassa,
  `InvId` из хэша id сессии.
- `src/modules/payment-robokassa/` — платёжный провайдер `pp_robokassa_robokassa` (`AbstractPaymentProvider`):
  `initiatePayment` строит подписанный URL по реквизитам тенанта из `data.tenant_id`; `authorizePayment`/`getPaymentStatus`
  отвечают CAPTURED только при `result_confirmed_at` на сессии; `updatePayment` пересобирает URL при смене суммы
  и сохраняет подтверждение; возвраты — только из кабинета Robokassa (NOT_ALLOWED).
- `medusa-config.ts` — модуль payment с этим провайдером (ручной `pp_system_default` фреймворк регистрирует сам).
- `src/api/middlewares.ts` + `src/api/store/tenant/robokassa.ts` — на `POST /store/payment-collections/:id/payment-sessions`
  для Robokassa сервер сам вычисляет тенанта из publishable key, сверяет корзину с его каналом продаж и
  **перезаписывает** `data.tenant_id`, выкидывая клиентские `result_*`; магазину без счёта — 404.
- `src/api/store/payment-providers/route.ts` — затеняет маршрут ядра (замерено: ядро больше не отвечает) и
  скрывает Robokassa, если у магазина за ключом нет включённого счёта.
- `src/api/tenants/payment-settings/` (`GET`/`PUT`/`DELETE`, `[id]` `GET`) — маскированный вид
  (`{ set, last4 }`), пароль никогда не в ответе; чужой id → 404.
- `src/api/robokassa/result/route.ts` — Result URL: подпись `OutSum:InvId:Password#2:Shp_SessionID=…` паролем
  тенанта, найденного по сессии; при валидной подписи штампует сессию и запускает `processPaymentWorkflow`
  (авторизация → захват → заказ); отвечает `OK<InvId>`; повтор идемпотентен.
- `src/scripts/link-robokassa-regions.ts` — привязывает провайдер ко всем RUB-регионам (идемпотентно).
  **На проде после деплоя:** `docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/link-robokassa-regions.js`.
- `README.md`, `.env.template`, `deploy/compose.mt.yml` — `BACKEND_PUBLIC_URL` (Result URL для кабинета Robokassa;
  за прокси панели хост запроса — панельный, вывести нельзя).
- Тесты: `integration-tests/http/tenants-payment-settings.spec.ts` (8 кейсов), `src/tenant-secrets/__tests__/crypto.unit.spec.ts` (9).

**Витрина (`apps/storefront`)**

- `src/lib/constants.tsx` — `pp_robokassa_robokassa` в карте методов, `isRobokassa`, builder данных сессии
  (`success_url`/`fail_url` → `/api/payment-return?provider=robokassa&cart_id=…`, `culture`, `email`).
- `payment-button/providers/robokassa.tsx` — кнопка «Оплатить» уводит на `session.data.payment_url`.
- `src/app/api/payment-return/route.ts` — ветка `provider=robokassa`: до 6 попыток завершить корзину
  (успешно только после вебхука), иначе `/cart?error=payment_pending`; `outcome=fail` → `payment_failed`.
- `order-error-banner` — причина `payment_pending`; `messages/*.json` — 3 ключа × 36 локалей (проверка паритета — 0 расхождений).

**Панель (`apps/tenant-panel`)**

- `src/routes/settings/payments/payments.tsx` — экран «Приём оплат»: сервис, MerchantLogin, пароли 1/2 и
  тестовые 1/2 (маска «задано ····XzML»), алгоритм, переключатели «Тестовый режим» и «Принимать оплату»,
  Result URL для кабинета. Правило 19h: контролы рендерятся сразу (disabled, пока `loaded === null`),
  `touchedRef` не даёт ответу сервера затереть набранное.
- `src/hooks/api/payment-settings.tsx`, маршрут `/settings/payments` в `app.tsx`, ссылка на «Обзоре», `i18n` ru/en.

## Как измерено

### Секрет в БД — шифротекст

```
PUT /tenants/payment-settings (Bearer владельца A) {provider:"robokassa", merchant_login:"OLAVKA", is_test:true, test_password1, test_password2}
→ http 200 {"settings":{"id":"tis_01M2GQDVECDPEAJTMXC7XHFFRZ","provider":"robokassa","is_test":true,"is_enabled":true,
   "merchant_login":"OLAVKA","hash_algorithm":"sha256","password1":{"set":false,"last4":null},"password2":{"set":false,"last4":null},
   "test_password1":{"set":true,"last4":"XzML"},"test_password2":{"set":true,"last4":"Cyrs"}},"result_url":"http://localhost:9047/robokassa/result",…}

psql -d upready_store_t03 -c "select id, tenant_id, provider, is_test, is_enabled, left(payload,48)||'…', length(payload) from tenant_integration_secret"
tis_01M2GQDVECDPEAJTMXC7XHFFRZ|ten_01M2GQCSVX9B1WMSW7050EH2GF|robokassa|t|t|e3e3OvWtQEkXPJdR7h9k5DXDkRuWBGBM2sNEUgZBA3YqdlNH…|256

grep -c <тестовый пароль> <ответ PUT>            → 0
select count(*) … where payload like '%<пароль>%' or payload like '%OLAVKA%'   → 0
```

### Изоляция

```
GET /tenants/payment-settings (Bearer владельца B)                     → 200 {"settings":null,…}
GET /tenants/payment-settings/tis_01M2GQDVECDPEAJTMXC7XHFFRZ (Bearer B) → 404 {"type":"not_found","message":"Payment settings tis_… were not found."}
GET /tenants/payment-settings/tis_01M2GQDVECDPEAJTMXC7XHFFRZ (Bearer A) → 200

GET /store/payment-providers?region_id=reg_01M29946T4AT01AYDTYKR458BM  x-publishable-api-key: <ключ A>
→ {"payment_providers":[{"id":"pp_system_default"},{"id":"pp_robokassa_robokassa"}],"count":2}
GET … x-publishable-api-key: <ключ B>
→ {"payment_providers":[{"id":"pp_system_default"}],"count":1}

POST /store/payment-collections/pay_col_01M2GQGYKYSR9YK26K0YE0TGNX/payment-sessions (ключ B) {provider_id:"pp_robokassa_robokassa"}
→ 404 {"type":"not_found","message":"Payment provider pp_robokassa_robokassa is not available for this shop."}
```

### Сессия A с подделанными клиентскими данными

```
POST /store/payment-collections/pay_col_01M2GQGXZ0GHQXYYN2RZN530ZK/payment-sessions (ключ A)
  {provider_id:"pp_robokassa_robokassa", data:{tenant_id:"ten_FORGED", result_confirmed_at:"2020-01-01T00:00:00Z", success_url:…, fail_url:…}}
→ 200; session.data: tenant_id=ten_01M2GQCSVX9B1WMSW7050EH2GF (сервера, не клиента), result_confirmed_at=null,
  invoice_id=15854083, out_sum="7980.00", is_test=true,
  payment_url=https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=OLAVKA&OutSum=7980.00&InvId=15854083
    &SignatureValue=<elided>&Shp_SessionID=payses_01M2GQGY03SPWF9N0HVQN3960N&SuccessUrl2=http%3A%2F%2Flocalhost%3A8047%2Fapi%2Fpayment-return%3F…
    &SuccessUrl2Method=GET&FailUrl2=…&FailUrl2Method=GET&IsTest=1
```

### Result-вебхук (источник истины «оплачено»)

Result URL мерчанта OLAVKA в кабинете Robokassa указывает на хост старого магазина, до локального стенда
Robokassa не дотягивается. Поэтому вызов сделан **точно как его делает Robokassa** (form-urlencoded,
`SignatureValue = sha256(OutSum:InvId:TestPassword2:Shp_SessionID=…)` в верхнем регистре), скриптом `result-hook.mjs`:

```
POST /robokassa/result (bad signature)  → http 400 body: ERROR bad_signature
POST /robokassa/result (good signature) → http 200 body: OK15854083
POST /robokassa/result (good signature) → http 200 body: OK15854083      # повтор, второй заказ не создан
GET /tenants/orders (Bearer A) → [{"id":"order_01M2GQHMQATWQ9HW3VV0WCHPPK","display_id":3,"status":"pending",
   "payment_status":"captured","total":7980,"currency":"rub","captured_at":"2026-09-14T19:50:45.138Z"}]
select order_id from order_cart where cart_id='cart_01M2GQGX7ZBNWS6JCDXHZTDQE5' → order_01M2GQHMQATWQ9HW3VV0WCHPPK
```

### Браузер: касса → страница Robokassa → тестовая оплата → «Спасибо» (Playwright, `browser-flow.mjs`)

```
19:57:35 checkout http://t03-shop-a.localhost:8047/ru/checkout — выбран метод «Robokassa», кнопка «Оплатить 7 980,00 ₽» активна
19:57:40 landed on https://auth.robokassa.ru/Merchant/Index/d6edb650-…   # демо-режим, «Магазин Оксаны Черкашиной», 7 980 ₽
19:57:40 session payses_01M2GQY2SJPK3CC8HF57EDJKCC invoice 1053813315 sum 7980.00
19:57:40 result webhook → 200 OK1053813315
19:57:49 robokassa page: карта 4111…, «Оплатить» → диалог «Как завершить тестовую операцию?» → «Успешно»
         → Robokassa сама редиректит на SuccessUrl2 → http://t03-shop-a.localhost:8047/ru/order/order_01M2GQYA2KQPW5AH2182SW0650/confirmed
```

На странице «Спасибо!»: заказ №9, бейджи «Не собран» / **«Оплачен»**, способ оплаты Robokassa,
«7 980,00 ₽ оплачено 15 сент. 2026 г., 03:57». В панели заказ №9: «Всего получено 7 980,00 RUB, Остаток к оплате 0,00 RUB».

Скриншоты (PNG вне git):

- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-tenant-secrets-psp/artifacts/docs/t03-tenant-secrets-robokassa/01-checkout-robokassa-selected.png
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-tenant-secrets-psp/artifacts/docs/t03-tenant-secrets-robokassa/02-robokassa-test-page.png
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-tenant-secrets-psp/artifacts/docs/t03-tenant-secrets-robokassa/02b-robokassa-card-form.png
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-tenant-secrets-psp/artifacts/docs/t03-tenant-secrets-robokassa/02c-robokassa-demo-outcome.png
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-tenant-secrets-psp/artifacts/docs/t03-tenant-secrets-robokassa/02d-robokassa-after-success.png
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-tenant-secrets-psp/artifacts/docs/t03-tenant-secrets-robokassa/03-order-confirmed.png
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-tenant-secrets-psp/artifacts/docs/t03-tenant-secrets-robokassa/04-panel-payment-settings.png
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-tenant-secrets-psp/artifacts/docs/t03-tenant-secrets-robokassa/05-panel-order-paid.png

## Проверки

```
cd apps/backend && npx medusa lint      → rc=0, ✖ 9 problems (0 errors, 9 warnings) — те же 9 предупреждений класса no-service-mutations, что уже есть в репозитории
cd apps/backend && npx tsc --noEmit     → rc=0
cd apps/backend && pnpm test:unit       → Test Suites: 1 failed, 6 passed, 7 total; Tests: 1 failed, 69 passed, 70 total
   падает src/migration-scripts/__tests__/profile-data.unit.spec.ts «i18n merge › leaves a locale…» — ПАДАЕТ И НА dev
   (прогнано в основном чекауте: Tests: 1 failed, 44 skipped, 45 total), к задаче не относится; новый crypto.unit.spec.ts — PASS
cd apps/backend && DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9199 INTEGRATION_ENCRYPTION_KEY=… pnpm test:integration:http -- tenants-payment-settings
   PASS integration-tests/http/tenants-payment-settings.spec.ts (28.719 s)
   Test Suites: 1 passed, 1 total;  Tests: 8 passed, 8 total   # весь файл, не только «свои» кейсы (jest, эквивалент строки ℹ fail = 0)
cd apps/tenant-panel && pnpm typecheck  → rc=0;  pnpm lint → rc=0 (предупреждения только в скопированных компонентах Admin)
cd apps/storefront && npx tsc --noEmit  → rc=0;  npx next lint → «No ESLint warnings or errors»;  npx next build → «Compiled successfully in 23.1s», rc=0
```

## Что НЕ сделано и почему

- **Боевой режим не включён и не проверен**: у клиента нет модерации/вывода/569-ФЗ; заявлять приём реальных денег нельзя.
  Переключатель «Тестовый режим» существует, боевые пароли сохраняются той же формой.
- **Result-вебхук на стенде отправлен скриптом**, а не самой Robokassa: Result URL мерчанта в кабинете указывает на
  olavka.ru, кабинет клиента не трогали. На проде владелец вставляет Result URL из панели (`https://shipshift.dev/robokassa/result`).
- **Чек 54-ФЗ (Receipt) не передаётся** — у клиента `useReceipt` выключен (`chrxnasdmds-digest.md` §1), в подпись не входит.
- **Возвраты через панель** не поддержаны (провайдер отвечает NOT_ALLOWED) — делаются в кабинете Robokassa.
- Реквизиты клиента (OLAVKA, тестовые пароли) использованы только на локальном стенде из старого проекта и
  ни в один файл ветки не попали (в отчёте — только последние 4 символа маски).

## Приёмка за 10 минут

1. `git fetch && superset ws` этой ветки, `corepack pnpm install`, БД: `createdb upready_store_t03`, `pg_dump <любой MT-стенд> | psql upready_store_t03`,
   `cd apps/backend && npx medusa db:migrate && npx medusa exec ./src/scripts/link-robokassa-regions.ts`, `npx medusa develop` (PORT из .env).
2. Зарегистрировать два магазина через `/auth/tenant/emailpass/register` → `POST /tenants` → `POST /tenants/seed {preset:"geist"}`
   (скрипт `handoff/…/logs` не нужен, три curl); сохранить реквизиты A: `PUT /tenants/payment-settings` с тестовыми паролями любого
   мерчанта Robokassa (или `OLAVKA` из `~/upready/memory/secrets/chrxnasdmds/olavka-prod.env`).
3. `psql -c "select left(payload,40) from tenant_integration_secret"` — base64, не пароль.
4. `GET /store/payment-providers?region_id=<RUB-регион>` с ключом A и с ключом B — Robokassa только у A.
5. Витрина `http://<handle-A>.localhost:8047/ru/checkout` → «Robokassa» → «Оплатить» → страница Robokassa в демо-режиме
   с суммой корзины. Вебхук: `node result-hook.mjs <session> <InvId> <OutSum> <test password 2> good` → `OK<InvId>`;
   на странице Robokassa «Оплатить картой» → любая карта → «Успешно» → возврат на `/order/<id>/confirmed` с бейджем «Оплачен».
6. Панель `/settings/payments` — маски и Result URL; `/orders/<id>` — «Остаток к оплате 0,00».
