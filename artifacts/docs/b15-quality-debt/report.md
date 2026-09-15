# b15-quality-debt — краснота `dev`, снапшот модуля `tenant`, HTTP-сюит на отзывы

Ветка `fix/day16-quality-debt`, база `dev` (на момент старта ветка была ровно на `dev`: `git rev-list --left-right --count HEAD...origin/dev` → `0 0`).
Отчёт написан 2026-09-16 00:08 WITA, дополнен результатами полного прогона ниже.

## Что было замерено до правок

Прогон на чистой ветке, `apps/backend`:

```
$ corepack pnpm test:unit
Test Suites: 1 failed, 27 passed, 28 total
Tests:       1 failed, 305 passed, 306 total
```
(`artifacts/docs/b15-quality-debt/unit-before-fix.log`)

```
$ TEST_TYPE=integration:http npx jest integration-tests/http/tenants.spec.ts
✕ resolves shipping options only from the tenant's own warehouse (1440 ms)
✕ keeps two tenants' warehouses apart even in the same city (3442 ms)
Tests:       2 failed, 32 passed, 34 total
```
(`artifacts/docs/b15-quality-debt/http-tenants-before-fix.log`)

`pnpm` на `PATH` — 8.12.0, а репозиторий пинит `pnpm@10.11.1` (`packageManager`), поэтому
`pnpm install` падает на `ERR_PNPM_LOCKFILE_BREAKING_CHANGE`. Всё ставилось и запускалось через
`corepack pnpm …` (AGENTS.md, раздел Package Manager).

## Четыре красных теста: причина каждого

**1. `profile-data.unit.spec.ts › i18n merge › leaves a locale the profile never translated identical to the base` — сломан КОД, правился код.**

`src/migration-scripts/data/i18n/index.ts` нормализовал локали только на ветке «профиль выбран»:
`mergeLocales` подмешивает `emptyTranslations()` (все восемь групп, `productOptions` в том числе), а
ветка без профиля отдавала сырой JSON базовых каталогов, где группы `productOptions` нет ни в одном
из 36 файлов. Diff падения — ровно одна строка: `+ "productOptions": Object {}`.

Тип `SeedTranslations` объявляет `productOptions` обязательной группой, то есть без профиля тип врал:
`SEED_TRANSLATIONS[locale].productOptions` был `undefined`. Потребители спасались опциональной
цепочкой (`lib/translations.ts`: `t.productOptions?.[…]`, `Object.values(t.productOptions ?? {})`).
Правка: базовые локали нормализуются тем же `emptyTranslations()`, что и смешанные, — форма
`SEED_TRANSLATIONS` теперь одна на обеих ветках, а тест перестал видеть разницу. Содержимое сидовых
переводов не менялось: добавляется только пустая группа, которая для всех потребителей ведёт себя как
прежнее `undefined`.

**2. `tenants-domains.spec.ts › resolves a custom host as soon as the tenant adds it` — устарел ТЕСТ, правился тест.**

`GET /tenants/domains` отдаёт строки доменов с полем `is_primary` — это осознанное расширение задачи
адресов (`specs/tenant-address/CANONICAL.md`): панель обязана показывать, какой адрес главный.
Поле читается в самом маршруте (`src/api/tenants/domains/route.ts` → `primary_host`) и приезжает из
`getTenantWithDomains` (`helpers.ts`). Тест же сравнивал строку строго: `toEqual([{ id, host }])`.
Правка: ожидание дополнено `is_primary: false` — именно это и есть правда про только что добавленный
домен (`model.boolean().default(false)` в `models/tenant-domain.ts`; главным строку делает отдельный
вызов панели, а не создание).

**3–4. `tenants.spec.ts › resolves shipping options only from the tenant's own warehouse` и `› keeps two tenants' warehouses apart even in the same city` — устарели ТЕСТЫ, правились тесты.**

Оба проверяли изоляцию складов по ИМЕНИ способа доставки: `name.startsWith("Acme")`. PR #25
(t04-shipping-tariffs) осознанно убрал имя магазина из способов доставки — `src/shipping-tariffs/default-method-names.ts`
прямо пишет, почему: раньше воркфлоу штамповал `<Shop> pickup` / `<Shop> courier`, и это доезжало до
чека покупателя как есть («Оксана Черкашина courier · 10,00 ₽», замер на `cherkashino.shipshift.dev`
2026-09-15). Теперь у каждого тенанта одни и те же человеческие имена, написанные на
`STOREFRONT_DEFAULT_LOCALE` («Самовывоз»/«Курьером» для ru, «Pickup»/«Courier» для en). Значит имя
больше НЕ говорит, из чьего склада опция, и вдобавок зависит от env — как признак изоляции оно
негодно в обе стороны.

Правка: изоляция проверяется по тому же пути, который проходит сам резолвер, —
`sales_channel → stock_location → fulfillment_set → service_zone → shipping_option.id`
(хелпер `shippingOptionIdsOf`). Утверждается: опции корзины непусты, все входят в набор опций своего
склада, ни одна не входит в набор чужого, и наборы двух тенантов не пересекаются вовсе. Во второй
тест (оба склада переименованы в «Москва») добавлено то же сравнение по id — там имя не различает
склады уже и по замыслу теста. Плюс новая проверка ровно того дефекта, из-за которого имена и
поменяли: в имени опции покупателя нет названия магазина.

## Снапшот модуля `tenant` — долг уже закрыт на `dev`, замер приложен

Приёмка t12 писала, что `.snapshot-tenant.json` не знает `tenant_requisites`. На текущем `dev` это
не так — снапшот догнан (кем именно, из ветки не видно; рукописная миграция `Migration20260915063900`
и снапшот сейчас согласованы). Замер по критерию задачи, на свежей базе `upready_store_b15`
(нативный Postgres `localhost:5433`):

```
$ npx medusa db:migrate     → rc=0, «Migration scripts completed»
$ npx medusa build          → rc=0, «Backend build completed successfully»
$ npx medusa db:generate tenant
MODULE: tenant
Skipped. No changes detected in your models.
$ git status --short
(пусто)
```
(`db-generate-tenant.log`; вывод `git status` — пустой, новых миграций не создано)

Проверено и то, чего критерий не требовал, но что и есть ловушка из памятки: сходится ли снапшот с
РЕАЛЬНОЙ схемой после рукописной миграции. Сравнение 16 таблиц модуля и всех их колонок между
`.snapshot-tenant.json` и `information_schema.columns` живой базы: **дрейф 0**
(`db-columns-tenant.txt`, скрипт сравнения — в теле PR). То есть следующая задача, которая тронет
модуль `tenant`, дубля миграции не получит. Кода я здесь не менял — менять нечего.

## HTTP-сюит на отзывы: `integration-tests/http/tenants-reviews.spec.ts` (новый)

Четыре теста, ровно по критерию:

1. **Счастливый путь модерации.** Покупатель, залогиненный под ключом магазина A, оставляет отзыв
   через `POST /store/tenant/reviews` → 201 и `status: "pending"` (статус не поле запроса);
   витрина его не показывает (`reviews: []`, `summary: {count: 0, average: null}` — ноль не
   превращается в оценку, правило 20a); владелец видит его в `GET /tenants/reviews` вместе с
   карточкой товара; `POST /tenants/reviews/:id {status, reply}` публикует и отвечает (ответ
   обрезается по краям, `replied_at` ставит сервер); витрина показывает отзыв и среднее 5;
   `status: "hidden"` снимает его с товара, но строка остаётся в списке владельца.
2. **401 без токена владельца** — `GET /tenants/reviews`, `POST /tenants/reviews/:id`,
   `DELETE /tenants/reviews/:id` без авторизации, и отдельно с токеном ПОКУПАТЕЛЯ этого же магазина;
   после всех четырёх отзыв всё ещё `pending` (ничего не записалось).
3. **401 анонима на `POST /store/tenant/reviews`** — с валидным publishable key, но без покупателя
   (`authenticate("customer")` без `allowUnauthenticated` в `src/api/middlewares.ts`); чтение при
   этом остаётся публичным, и запись действительно не произошла.
4. **Изоляция двух тенантов по одному `product_id`** — B спрашивает товар A: `GET /tenants/reviews?product_id=<A>`
   отдаёт пустую страницу (фильтр сужает, а не расширяет), `POST`/`DELETE` чужого отзыва — 404
   (чужая строка не подтверждается как существующая), `GET /store/tenant/reviews?product_id=<A>` под
   ключом B — ноль и `average: null`, покупатель A не может написать на товар B (404). Взгляд A на
   свой товар после всего этого не изменился.


## Ещё три причины красноты, найденные по ходу (без них «0 failed» недостижим)

**5. `tenants-payment-settings.spec.ts` — все восемь тестов, причина не в коде фичи.**
`POST /tenants/seed` отвечал 500: «Neither STORE_PROFILES_MEDIA_BASE_URL nor STORE_MEDIA_BASE_URL is
set» (`data/abstract-datasets.ts`, `resolveMediaBaseUrl`). Переменной не было ни в
`apps/backend/.env.template`, ни в `apps/backend/README.md`, то есть любой стенд, собранный по
шаблону, получал этот файл красным целиком. Приёмка t10-blog записала дырку словами «обеих нет в
`.env.template`». Переменная описана в обоих местах; после этого 7 из 8 стали зелёными.

**6. Оба файла, завершающие корзину, посылали адрес без `province`.**
Восьмой тест платежей падал на `order_cart` пустом после корректно подписанного вебхука Robokassa, а
три теста `tenants-notifications.spec.ts` — на 400 от `POST /store/carts/:id/complete`. Причина одна
и она в логе приложения: «The shipping address is missing province. A parcel cannot be posted
without them.» — хук `workflows/hooks/validate-cart-shipping-address.ts` (b03-shipping-zones-weight,
живой инцидент с заказом #5 на `cherkashino.shipshift.dev`) требует `province` для каждой страны, для
которой тарифный модуль везёт список регионов (`REGIONS_BY_COUNTRY`, сегодня Россия). В вебхуке это
выглядело как «платёж отменён» (`Error was thrown trying to cancel payment …`), то есть симптом
уводил в сторону Robokassa. Обе спеки теперь несут `province: "г Москва"` — значение берётся полем
`province` из `shipping-tariffs/ru-regions.ts`, потому что зона, ограниченная регионами, сравнивает
именно эту строку («г Москва», не «Москва»).

**7. `tenants-notifications.spec.ts` — рейс в тесте, а не дефект.**
После `province` остался один красный: `settings.email.last.status` читался `null`. Замер по логу:
письмо ушло (`[smtp] Email sent` 00:38:04, `[order-placed-email] Sent to buyer@acme.test` 00:38:05),
а штамп доставки на строке тенанта пишет подписчик ПОСЛЕ отправки. Тест ждал письма в SMTP-раковине
(`until`), но раковина доказывает отправку, а не запись о ней, и одно чтение
`/tenants/notification-settings` попадало между. Добавлен `untilAsync` — то же ожидание для значения,
которое надо запросить. Файл стал зелёным целиком.

**`tenant-branding.spec.ts` — НЕ дефект.** В полном прогоне он падал с
`Exceeded timeout of 180000 ms for a hook`, в изоляции зелёный целиком. Это следствие OOM-деградации
процесса (см. «Результат»), и хвостовые файлы длинного прогона надо перепроверять в изоляции прежде,
чем называть их красными.

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
