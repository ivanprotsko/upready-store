## Что это

Пачка долгов качества, которые приёмки назвали замером и отложили: четыре красных теста на `dev`,
снапшот модуля `tenant` и отсутствующий HTTP-сюит на отзывы. По ходу нашлись ещё три причины
красноты того же рода — они тоже починены, иначе критерий «0 failed» недостижим.

Разбор по причинам, все замеры и полные логи: `artifacts/docs/b15-quality-debt/report.md`.

## Что изменилось

**Код (одна правка).** `apps/backend/src/migration-scripts/data/i18n/index.ts` — сид-локали
нормализуются одинаково на обеих ветках загрузчика. Без профиля модуль отдавал сырой JSON базовых
каталогов, где группы `productOptions` нет ни в одном из 36 файлов, тогда как под профилем
`mergeLocales` подмешивает все восемь групп. Тип `SeedTranslations` объявляет группу обязательной —
то есть без профиля тип врал, а `SEED_TRANSLATIONS[locale].productOptions` был `undefined`
(потребители в `lib/translations.ts` спасались `?.`). Содержимое переводов не изменилось.

**Тесты.**
- `integration-tests/http/tenants.spec.ts` — изоляция складов проверяется по `shipping_option.id`
  вдоль пути `sales_channel → stock_location → fulfillment_set → service_zone` (хелпер
  `shippingOptionIdsOf`), а не по имени опции. PR #25 осознанно убрал название магазина из имён
  способов доставки (`src/shipping-tariffs/default-method-names.ts`: раньше `<Shop> courier`
  доезжал до чека покупателя), и имена стали одинаковыми у всех тенантов и зависимыми от
  `STOREFRONT_DEFAULT_LOCALE`. Добавлена проверка ровно того дефекта: в имени опции нет названия
  магазина.
- `integration-tests/http/tenants-domains.spec.ts` — ожидание строки домена дополнено
  `is_primary: false` (поле пришло из задачи адресов, `specs/tenant-address/CANONICAL.md`; дефолт
  модели — `false`).
- `integration-tests/http/tenants-reviews.spec.ts` — **новый** сюит на отзывы: счастливый путь
  модерации, 401 без токена владельца, 401 анонима на `POST /store/tenant/reviews`, изоляция двух
  тенантов по одному `product_id`.
- `integration-tests/http/tenants-payment-settings.spec.ts`, `tenants-notifications.spec.ts` —
  адрес корзины несёт `province`: `completeCartWorkflow` отказывает в заказе без него для стран из
  `REGIONS_BY_COUNTRY` (`workflows/hooks/validate-cart-shipping-address.ts`,
  b03-shipping-zones-weight). Из-за этого вебхук Robokassa отменял платёж вместо оплаты заказа, а
  письма/телеграм-тесты падали на 400. Плюс в `tenants-notifications.spec.ts` снят рейс: штампы
  доставки пишет подписчик ПОСЛЕ отправки, а письмо в SMTP-раковине доказывает отправку, но ещё не
  запись о ней — чтение обёрнуто в `untilAsync`.

**Документация.** `apps/backend/.env.template` и `apps/backend/README.md` — описана
`STORE_PROFILES_MEDIA_BASE_URL` (и `STORE_MEDIA_BASE_URL` в таблице README). Без неё
`POST /tenants/seed` отвечает 500 «Neither STORE_PROFILES_MEDIA_BASE_URL nor STORE_MEDIA_BASE_URL is
set», то есть стенд, собранный по шаблону, имеет красный `tenants-payment-settings` целиком. Дырка
была записана приёмкой t10-blog как «обеих нет в `.env.template`» — теперь есть.

**Снапшот модуля `tenant` — изменений не потребовалось, и это замер, а не пропуск.** См. ниже.

## Как это измерено

Стенд: нативный Postgres `localhost:5433` (роль `ivanprotsko`), база `upready_store_b15`,
`PORT=9095`. Всё через `corepack pnpm` — `pnpm` на PATH машины 8.12.0, репозиторий пинит
`pnpm@10.11.1`, и `pnpm install` иначе падает на `ERR_PNPM_LOCKFILE_BREAKING_CHANGE`.

### Юнит

```
$ cd apps/backend && corepack pnpm test:unit     # ДО правок
Test Suites: 1 failed, 27 passed, 28 total
Tests:       1 failed, 305 passed, 306 total

$ cd apps/backend && corepack pnpm test:unit     # ПОСЛЕ
Test Suites: 28 passed, 28 total
Tests:       306 passed, 306 total
```
Логи целиком: `artifacts/docs/b15-quality-debt/unit-before-fix.log`, `unit.log`.

### Снапшот модуля `tenant`

```
$ npx medusa db:migrate            → rc=0, «Migration scripts completed»
$ npx medusa build                 → rc=0, «Backend build completed successfully»
$ npx medusa db:generate tenant
MODULE: tenant
Skipped. No changes detected in your models.
$ git status --short                (пусто)
```

Долг из приёмки t12 («снапшот не знает `tenant_requisites`») на текущем `dev` уже закрыт: в
снапшоте стоят все 16 таблиц модуля, включая `tenant_requisites` со всеми её колонками и
`seo_title`/`seo_description` у `tenant_page`. Дополнительно сверена РЕАЛЬНАЯ схема после рукописной
миграции `Migration20260915063900` — та самая ловушка из памятки: 16 таблиц и все их колонки между
`.snapshot-tenant.json` и `information_schema.columns` живой базы, **дрейф 0**
(`db-generate-tenant.log`, `db-columns-tenant.txt`).

### Типы и линт

```
$ npx tsc --noEmit    → rc=0
$ npx medusa lint     → rc=0, 67 warning(s), 0 errors (все предсуществующие)
```

## Что НЕ сделано и почему

- `pnpm test:integration:modules` не гонялся: правки не касаются `src/modules/*/__tests__`.
- Кода фичи отзывов я не менял — задача просила сюит, а не переделку; ни одна проверка не
  потребовала правки маршрута.
- Полный `pnpm test:integration:http` в первый раз оборвался не на тестах, а на
  `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of
  memory` на девятнадцатом файле: `--runInBand` держит все загрузки приложения в одном процессе, и
  результирующей строки `Tests:` в логе нет вообще, а последние файлы падают по таймауту
  `beforeAll` и выглядят дефектами (`tenant-branding.spec.ts` именно так — в изоляции он зелёный
  целиком). Скрипт пакета флага heap не ставит; это отдельная нитка для диспетчера — либо
  `--max-old-space-size` в `package.json`, либо прогон пачками. Я её не менял, чтобы не трогать
  общий скрипт из задачи про тесты.

## Результат (замер 2026-09-16 01:02 WITA)

`pnpm test:integration:http` в один процесс не доходит до конца: на девятнадцатом файле
`--runInBand` упирается в heap — `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation
failed - JavaScript heap out of memory`, и результирующей строки `Tests:` в логе нет вообще. Поэтому
все 25 spec-файлов каталога прогнаны тремя пачками с поднятым heap, каждая со своей результирующей
строкой; ни одна не содержит `FAIL`:

```
$ cd apps/backend
$ TEST_TYPE=integration:http NODE_OPTIONS="--experimental-vm-modules --max-old-space-size=8192" \
    npx jest --silent=false --runInBand --forceExit <11 файлов>      # пачка 1
Test Suites: 11 passed, 11 total
Tests:       93 passed, 93 total

$ ... <11 файлов>                                                    # пачка 2
Test Suites: 11 passed, 11 total
Tests:       89 passed, 89 total

$ ... tenants.spec.ts tenants-domains.spec.ts tenants-reviews.spec.ts   # пачка 3
Test Suites: 3 passed, 3 total
Tests:       50 passed, 50 total
```

Итого 25 файлов, 232 теста, `0 failed`. Логи целиком: `integration-http-batch1.log`,
`integration-http-batch3.log`, `integration-http-batch2.log` в этом же каталоге.

Юнит:

```
$ cd apps/backend && corepack pnpm test:unit
Test Suites: 28 passed, 28 total
Tests:       306 passed, 306 total
```

## Как приёмщику проверить за 10 минут

1. `corepack pnpm install --frozen-lockfile` в корне (именно `corepack` — PATH-pnpm 8.12.0 против
   пина 10.11.1).
2. `apps/backend/.env`: `DB_HOST=localhost`, `DB_PORT=5433`, `DB_USERNAME=<своя роль>`, свободный
   `PORT`, и `STORE_PROFILES_MEDIA_BASE_URL=http://localhost:<PORT>/static/store-profiles` — теперь
   она есть в `.env.template`, откуда `.env` и собирается.
3. `cd apps/backend && corepack pnpm test:unit` → ждать `Tests: 306 passed`, `0 failed`.
4. Четыре названных в задаче теста — одной командой:
   `TEST_TYPE=integration:http NODE_OPTIONS="--experimental-vm-modules --max-old-space-size=8192" npx jest --runInBand --forceExit integration-tests/http/tenants.spec.ts integration-tests/http/tenants-domains.spec.ts integration-tests/http/tenants-reviews.spec.ts`
   → `Tests: 50 passed, 50 total`.
5. Снапшот: `npx medusa db:migrate && npx medusa build && npx medusa db:generate tenant` на чистой
   базе → «Skipped. No changes detected in your models», затем `git status --short` пуст.
6. Полный сюит — только пачками (см. выше); один процесс на все 25 файлов умирает на OOM, и это
   отдельная нитка для диспетчера, а не дефект тестов.
