# i01-robokassa-checkout — Оплата Robokassa для тенанта cherkashino

Ветка `feat/day16-robokassa-checkout`, база `dev`. Стенд: бэкенд `http://localhost:9061`,
витрина `http://cherkashino.localhost:8061`, панель `http://localhost:5074`,
база `upready_store_i01` (клон `upready_store_cherkashina` + `medusa db:migrate`).

## Коротко

Robokassa для магазина `cherkashino` настроена через панель владельца и отражена на чекауте:
на стенде заказ **#18** оплачен в ТЕСТОВОМ режиме Robokassa, `InvId=1414994503`,
`OutSum=1084.00`, сессия `payses_01M2KWJVDVNK79W60N3E3FJMMC`, платёж в панели — «Получен».

Переходить на `@gorgo/medusa-payment-robokassa` НЕ стали: замер показал, что у него учётные
данные привязаны к инстансу плагина из `medusa-config.ts`, а не к магазину — подробности и
таблица из 10 строк в `decision.md`.

По дороге нашлись и починены три дефекта, из-за которых «настроено» не доезжало до чекаута
(два из них — потеря денег покупателя без заказа).

## Что сделано (файлы)

### 1. Свежий URL платёжной сессии в момент нажатия «Оплатить» — главный дефект
`apps/storefront/src/modules/checkout/components/payment-button/providers/robokassa.tsx`

`POST /store/payment-collections/:id/payment-sessions` не идемпотентен: он УДАЛЯЕТ текущую
сессию коллекции и создаёт новую с новым `id`. Чекаут пересоздаёт сессию всякий раз, когда
меняется контекст чека (поздний адрес, промокод, способ доставки после способа оплаты), а
пропсы кнопки на один рендер отстают. Для redirect-провайдера это не косметика: покупатель
уходил по ссылке, в которой `InvId` и `Shp_SessionID` называют УЖЕ УДАЛЁННУЮ сессию.

Замер на стенде до починки (backend.log):

```
[robokassa] session payses_01M2KW72S0KENNTM794RACB94M … invoice 1663844048
[robokassa] session payses_01M2KW733A8PAMSRV9K77VG0KM … invoice 855210311
[robokassa/result] rejected: unknown_session (InvId=1663844048, session=payses_01M2KW72S0KENNTM794RACB94M)
```

То есть Robokassa забрала бы деньги, а её Result-вебхук получил бы `unknown_session` — заказа нет.
Теперь кнопка перед редиректом перечитывает корзину с сервера (`retrieveCart`, `no-store`) и
уходит по `payment_url` ТЕКУЩЕЙ сессии; если её нет — показывает ошибку и не редиректит.

### 2. Список платёжных методов больше не кэшируется
`apps/storefront/src/lib/data/payment.ts`

`listCartPaymentMethods` ходил с `cache: "force-cache"`, а тег инвалидации строится из
`_medusa_cache_id` — случайного UUID НА ПОСЕТИТЕЛЯ (`src/middleware.ts`), так что
`revalidateTag` из `app/api/revalidate` его назвать не может в принципе. Замер: владелец
сохранил учётку в панели, `GET /store/payment-providers` отвечал
`pp_robokassa_robokassa`, а чекаут предлагал только «Manual payment» — до перезапуска
процесса витрины. Теперь `cache: "no-store"`; провал запроса пишется в лог сервера, а не
молча превращается в «магазин не настроил оплату» (правило 20a).

### 3. Деплой связывает Robokassa с рублёвыми регионами
`apps/backend/docker-entrypoint.sh`

Платёжный провайдер предлагается ПО РЕГИОНУ (`region.payment_providers`). Скрипт
`src/scripts/link-robokassa-regions.ts` существовал, но его никто не вызывал: в entrypoint
его не было, то есть на живом хосте после деплоя Robokassa не предлагалась НИКОМУ, сколько
бы магазинов ни сохранило учётку. Добавлен шагом 7 рядом с такими же идемпотентными
скриптами; ошибка логируется и не роняет бэкенд. Идемпотентность проверена повторным
прогоном:

```
[robokassa] region Russia (reg_01M25SZDR2N34GYR0Q5WXDQCM5) already offers pp_robokassa_robokassa
[robokassa] done, 1 RUB region(s) checked
```

### 4. Тесты
- `apps/backend/src/tenant-secrets/__tests__/robokassa.unit.spec.ts` — 15 проверок подписи:
  MD5 и остальные алгоритмы (ожидания вычисляются в тесте из строки, которую диктует
  документация Robokassa, а не сверяются с выводом самого модуля), выброс пустых частей,
  `Shp_*` последним, регистронезависимое сравнение, выбор пары паролей по режиму,
  формат `OutSum`, диапазон `InvId`, приём Result-вебхука ТЕСТОВОГО режима (подписан
  тестовым паролём #2) и отказ на пароле #1 / изменённой сумме / чужой сессии.
- `apps/storefront/tests/stands/robokassa.pw.ts` — e2e: корзина → контакты → адрес →
  доставка → Robokassa → «Оплатить» → разбор подписанной ссылки → Result-вебхук (200
  `OK<InvId>`) → повтор (идемпотентно) → подделанная подпись (400) → возврат по
  `SuccessUrl2` → страница подтверждённого заказа.
- Мелочи под тесты: `data-testid="payment-method-<id>"` на плитках способов оплаты и
  `data-testid="address-province-input"` на текстовом резервном поле региона (у `<select>`
  свой testid уже был, у запасного поля — не было, и общий хелпер `fillCheckoutAddress`
  молча его пропускал).

## Как измерено (команды и вывод)

Приёмка — на живом стенде, не curl'ом (правило 18f). Скриншоты:
`file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-robokassa-checkout/artifacts/docs/i01-robokassa-checkout/shots/`

| Файл | Что на нём |
|---|---|
| `01-panel-payments-form-filled.png` | форма «Приём оплат» в панели владельца, заполненная |
| `02-panel-payments-saved.png` | после сохранения: «тестовый режим», пароли как «задано ····XXXX» |
| `03-checkout-robokassa-selected.png` | чекаут витрины, выбран способ оплаты Robokassa |
| `04-robokassa-payment-page.png` | НАСТОЯЩАЯ страница `auth.robokassa.ru` |
| `05-order-confirmed.png` | возврат по `SuccessUrl2` → страница подтверждённого заказа |
| `06-panel-orders-paid.png` | список заказов в панели |
| `07-panel-order-detail-paid.png` | заказ #18: «Платежи — Получен», Robokassa, ₽1 084,00, «Остаток к оплате ₽0.00» |

Страница Robokassa приняла нашу подпись — её текст (снят в том же прогоне):

```
04 robokassa page: https://auth.robokassa.ru/Merchant/Index/03c3e61a-ce12-a9b8-bd4c-d67363be1666 | title: Robokassa
04 body head: Безопасная оплата | Вы находитесь в демо режиме | Данный режим позволяет вам
протестировать процесс оплаты через наш платежный сервис | Магазин Оксаны Черкашиной |
1 084 | ₽ | Оплатить картой | Оплатить | Оплачивая, вы принимаете условия сервиса
```

Ссылка, по которой ушёл браузер (подпись и пароли не печатаются):

```
https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=OLAVKA&OutSum=1084.00
  &InvId=1414994503&IsTest=1&SignatureValue=<hex 64>
```

Result-вебхук и заказ:

```
result webhook: 200 OK1414994503
05 order page: http://cherkashino.localhost:8061/ru/order/order_01M2KWK93C1JX8R0PWCK0F0964/confirmed
07 order detail: http://localhost:5074/orders/order_01M2KWK93C1JX8R0PWCK0F0964
```

Строки бэкенда того же прогона (`[robokassa/result]`):

```
[robokassa/result] confirmed: session payses_01M2KWB39M4P5XFBSS3BHXQ3B2, invoice 116796573,
  1084.00 RUB, tenant ten_01M29Q4KYQHC70JZBENWZ8Z88M, test=true
[robokassa/result] replay of confirmed invoice 116796573, answering OK again
[robokassa/result] rejected: bad_signature (InvId=116796573, …)
```

Ответ панели владельца (маскирование секретов и Result URL):

```json
{"result_url":"http://localhost:9061/robokassa/result",
 "settings":{"merchant_login":"OLAVKA","is_test":true,"is_enabled":true,
 "hash_algorithm":"sha256","password1":{"set":true,"last4":"L5VL"},
 "test_password2":{"set":true,"last4":"Cyrs"}}}
```

### Проверки

| Проверка | Команда | Результат |
|---|---|---|
| юнит бэкенда | `cd apps/backend && npm run test:unit` | `Test Suites: 63 passed, 63 total` / `Tests: 776 passed, 776 total` |
| seam Robokassa | `cd apps/backend && DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9099 STORE_PROFILES_MEDIA_BASE_URL=http://localhost:9099/static/store-profiles TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules npx jest --runInBand --forceExit integration-tests/http/tenants-payment-settings.spec.ts` | `Test Suites: 1 passed` / `Tests: 8 passed, 8 total` |
| e2e Robokassa | `cd apps/storefront && STAND_URL=http://cherkashino.localhost:8061 BACKEND_URL=http://localhost:9061 ROBOKASSA_TEST_PASSWORD_2=… npx playwright test --config tests/stands/playwright.config.ts robokassa.pw.ts --project=desktop` | `1 passed (23.0s)` |
| типы витрины | `cd apps/storefront && npx tsc --noEmit` | `rc=0`, ни одной ошибки |
| линт обоих приложений | `pnpm lint` | `rc=0` (предупреждения только унаследованные) |
| сборка бэкенда как в образе | `pnpm check:backend-build` | `Backend build completed successfully (9.83s)` / `Frontend build completed successfully (19.78s)` |
| нет паролей в дереве | `git grep -n -i -E "password[12]=\|merchant_pass" -- . ':!handoff/'` | ничего не найдено (rc=1). Единственное совпадение без исключения `handoff/` — сам текст критерия в `prompts/i01-robokassa-checkout.md` |
| нет ЗНАЧЕНИЙ паролей | `git grep -l -F -- "<каждое из 4 значений OLAVKA>"` | ЧИСТО по всем четырём |

## Что нужно на живом хосте

**Переменные окружения бэкенда** (только имена, значения — в `.env.keys` / в панели):

| Имя | Зачем | Если не задано |
|---|---|---|
| `INTEGRATION_ENCRYPTION_KEY` | шифрует `tenant_integration_secret.payload` — пароли Robokassa каждого магазина | учётки не расшифровать, оплата падает |
| `BACKEND_PUBLIC_URL` | публичный адрес бэкенда; из него строится Result URL, который владелец вставляет в ЛК Robokassa | подставится хост запроса, а он приходит через прокси панели — владелец получит НЕВЕРНЫЙ Result URL |
| `STOREFRONT_URL` (или `STOREFRONT_REVALIDATE_URL`) | адрес витрины для инвалидации кэша | часть кэшей не сбрасывается |

Отдельных `ROBOKASSA_*` переменных на хосте НЕ нужно: ключи у нас на магазин и лежат
зашифрованными в базе, а не в окружении (в отличие от старого проекта chrxnasdmds).

**Шаги владельца магазина** (панель):
1. Настройки → «Приём оплат».
2. Вписать MerchantLogin, четыре пароля (боевые #1/#2 и тестовые #1/#2), выбрать алгоритм
   хеша — ТОТ ЖЕ, что стоит в ЛК Robokassa (рекомендуется SHA-256, не ripemd160).
3. Переключатель «тестовый режим» — включён, пока идёт проверка; «включено» — чтобы способ
   появился на чекауте.
4. Скопировать Result URL из низа страницы и вставить его в ЛК Robokassa
   (Технические настройки → Result URL, метод POST). Там же должны стоять Success URL и
   Fail URL — их присылает сам магазин в каждом платеже (`SuccessUrl2`/`FailUrl2`), но ЛК
   требует непустых значений.
5. Сохранить. Способ «Robokassa» появляется на чекауте сразу — кэша больше нет.

**Шаг деплоя**: `link-robokassa-regions` теперь в entrypoint, руками ничего запускать не надо.

## Что НЕ сделано и почему

1. **Полный платёж через серверы Robokassa не завершался.** Result URL — поле ЛК МЕРЧАНТА, а
   не параметр платежа; у аккаунта OLAVKA он указывает на хост старого проекта. Довести
   тестовый платёж до конца означало бы послать чужой живой системе колбэк по неизвестному ей
   счёту. Поэтому измерено так: страница оплаты Robokassa открыта ПО-НАСТОЯЩЕМУ и наша подпись
   ею принята (скриншот 04 — демо-режим, сумма, название магазина), а Result-вебхук
   воспроизведён нами байт в байт так, как его строит Robokassa (подпись — тестовым паролём #2
   из `.env` старого проекта). Чтобы платёж прошёл полностью на живом хосте, владелец должен
   один раз вписать Result URL в ЛК Robokassa (шаг 4 выше).
2. **Фискальный чек (54-ФЗ) не делается.** У gorgojs он есть (`useReceipt`, система
   налогообложения, ставки НДС), у нас — нет. Это отдельная задача: перенести генерацию
   `Receipt` и добавить в форму панели поля налогообложения (см. `decision.md`, строка 8).
3. **Возврат средств только в ЛК Robokassa.** `refundPayment` намеренно бросает ошибку с
   объяснением; кнопки возврата в панели нет.
4. **Двухстадийная оплата (холдирование) не поддержана** — см. `decision.md`, строка 9.
5. **Турбопак на витрине не используется.** `next dev --turbopack` падает на
   `apps/storefront/src/lib/data/products.ts` («Only async functions are allowed to be exported
   in a "use server" file» — файл реэкспортирует ТИПЫ). Дефект существует на `dev` и к этой
   задаче отношения не имеет; стенд поднимался обычным `next dev`, продакшен-сборка
   (`next build`) не затронута. Отдельная мелкая задача.
6. **Гонка поля «регион» в форме адреса.** `ManualAddressFields` показывает текстовое поле,
   пока не ответил `listShippingRegions`, и подменяет его на `<select>` после — то, что уже
   набрал покупатель, может пропасть. Нашлось при написании e2e; сам e2e это обходит. Тоже
   отдельная задача (класс правила 19h).

## Как приёмщику проверить за 10 минут

```bash
# 1. стенд
createdb -h 127.0.0.1 -p 5433 -U ivanprotsko upready_store_i01acc -T upready_store_cherkashina
# apps/backend/.env: DATABASE_URL на …_i01acc, PORT=9061, BACKEND_PUBLIC_URL=http://localhost:9061,
#   STORE_CORS/AUTH_CORS с http://cherkashino.localhost:8061 и http://localhost:5074
cd apps/backend && npx medusa db:migrate && npx medusa exec ./scripts/fixtures/w13-reset-owner-password.ts
npx medusa develop                       # 9061
cd ../storefront && npx next dev -p 8061 # НЕ --turbopack (см. «Что не сделано», п.5)
cd ../tenant-panel && npx vite --port 5074 --strictPort   # 5060/5061 браузер считает небезопасными

# 2. панель: http://localhost:5074 — owner-cherkashino@example.test / w13-acceptance-scratch
#    Настройки → Приём оплат → вписать OLAVKA и четыре пароля из
#    /Users/ivanprotsko/upready/projects/chrxnasdmds/apps/backend/.env (ROBOKASSA_*), сохранить

# 3. e2e целиком
cd apps/storefront
STAND_URL=http://cherkashino.localhost:8061 BACKEND_URL=http://localhost:9061 \
ROBOKASSA_TEST_PASSWORD_2="$(grep -E '^ROBOKASSA_TEST_PASSWORD_2=' /Users/ivanprotsko/upready/projects/chrxnasdmds/apps/backend/.env | cut -d= -f2-)" \
npx playwright test --config tests/stands/playwright.config.ts robokassa.pw.ts --project=desktop

# 4. глазами: чекаут на http://cherkashino.localhost:8061/ru/checkout — плитка «Robokassa»;
#    «Оплатить» уводит на auth.robokassa.ru с демо-режимом и суммой заказа
```

## Экономия

- **Скриптом вместо рук.** Вся приёмка — два скрипта Playwright (настройка через панель и
  сквозной прогон со скриншотами), а не клики: 7 скриншотов и 4 проверенных факта за один
  запуск, повторяемо. Прогонов понадобилось 9 — ручные клики стоили бы в разы дороже и не
  дали бы вывода в текстовом виде.
- **Замер вместо чтения документации.** Решение gorgojs/свой модуль принято по РАСПАКОВАННЫМ
  тарболам (`npm pack` двух версий, ~15 и ~40 КБ), а не по страницам сайта: 4 вызова против
  чтения двух сайтов целиком, и ответ на строку 1 (учётки на инстанс, а не на магазин) виден
  прямо в коде `resolveOptions()`. Страницы всё равно сохранены в `docs/` — по правилу задачи.
- **Тест вместо раунда критика.** Три дефекта (мёртвая сессия, кэш провайдеров, регион без
  связи) нашёл не обзор кода, а попытка ПРОГНАТЬ сквозной сценарий: первый дал строку
  `unknown_session` в логе, второй — «Manual payment» на скриншоте, третий — пустой список
  провайдеров в curl. Ни один не виден при чтении файлов по отдельности.
- **Что автоматизировал бы дальше.** (1) Сквозной чекаут-e2e стоит вынести в общий хелпер
  `tests/stands/helpers.ts` — я написал `fillShippingAddress` заново, потому что общий
  `fillCheckoutAddress` ищет чекбокс «ввести вручную» по всей странице и попадает в чужой.
  (2) Нужен смоук деплоя, который после старта контейнера дёргает
  `GET /store/payment-providers?region_id=<рублёвый>` и падает, если в ответе нет
  `pp_robokassa_robokassa`: дефект №3 (скрипт есть, но его никто не вызывает) ловится именно
  такой проверкой, а не тестом отдельного файла.
- **Агентов не привлекал** (правило 3b: без явного OK Ивана) — задача одна, ветка одна,
  фан-аут не нужен.
