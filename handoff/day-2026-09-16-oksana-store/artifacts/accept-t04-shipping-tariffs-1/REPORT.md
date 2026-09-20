# Приёмка t04-shipping-tariffs — PR #25, раунд 1 → MERGED

Отчёт составлен 2026-09-15 05:01 WITA. Акцептор: headless-прогон из основного чекаута (ветку не трогал, коммитов не делал).
PR https://github.com/ivanprotsko/upready-store/pull/25 · head `feat/day16-shipping-tariffs` · base `dev` · MERGEABLE/CLEAN.
Смержен squash: `mergedAt` 2026-09-14T21:00:52Z, merge commit `b2453fb2140ff8c8947d229e06cf9a13934a7da6` (состояние прочитано у владельца — `gh pr view 25`).

## Стенд
Все три процесса подтверждены как запущенные ИЗ worktree ветки (cwd по `lsof -d cwd`):
бэкенд :9051 (medusa, `apps/backend`), витрина :8051 (next-server, `apps/storefront`), панель :5181 (vite, `apps/tenant-panel`).
БД стенда `upready_store_t04` (localhost:5433). Записей в прод-БД не было, деплоя не было.

## Проверки (мои прогоны, строки результата)
| Проверка | Результат |
|---|---|
| `apps/backend: npx tsc --noEmit` | rc=0, без ошибок |
| `apps/backend: npx medusa lint` | rc=0, ✖ 12 problems (0 errors, 12 warnings) |
| `apps/backend: pnpm test:unit` | Tests: 1 failed, 71 passed, 72 total |
| то же на `dev` d58901d (основной чекаут), `pnpm test:unit -- profile-data` | Tests: 1 failed, 14 passed, 15 total — падение `i18n merge › leaves a locale the profile never translated identical to the base` ПРЕДСУЩЕСТВУЮЩЕЕ, не этой ветки |
| `DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9199 pnpm test:integration:http -- tenants-shipping-methods` | rc=0, Test Suites: 1 passed, Tests: 7 passed / 7 |
| `apps/tenant-panel: pnpm typecheck` | rc=0 |
| `apps/tenant-panel: pnpm lint` | rc=0, ✖ 23 problems (0 errors, 23 warnings) |
| `apps/storefront: npx tsc --noEmit` | rc=0 |
| `apps/storefront: npx next lint` | ✔ No ESLint warnings or errors |
| `apps/storefront: npx next build` | rc=0, ✓ Compiled successfully in 7.3s |

Имена прошедших seam-тестов (`integration-tests/http/tenants-shipping-methods.spec.ts`): имена дефолтов нового тенанта · одинаковая цена в quote/calculate/корзине · зона прячет метод от DE и от СПб · fallback веса по умолчанию и его настройка · free_above/flat/выключение/порядок · изоляция тенантов · удаление метода вместе со своей зоной.

## Критерии приёмки — замерено мной
Скрипты акцептора: `/tmp/accept-t04.mjs` (Store API), `/tmp/accept-t04-shots.mjs` (Playwright). Корзина — МОЯ, не корзина исполнителя.

1. **Тариф по весу и зона, экран панели.** Панель `/shipping` показывает 3 способа; строка «Почтой России, 1–2 кг / Россия, вся страна / 150 ₽ + 180 ₽/кг / По весу (за кг) / 5–10 дней / Показывать: Да» + блок «Вес товара по умолчанию» = 250 г. Скриншот `01-panel-shipping.png`.
2. **Цена от веса корзины.** Корзина RU: 2 × «Плед ox54z» 700 г + 1 × «Подушка ox54z» 1000 г = **2400 г**. Правило 150 + 180 × 2,4 = **582**.
   Замерено: `QUOTE amount 582, weight_g 2400, item_total 2500, explanation "2,4 кг × 180 ₽ + 150 ₽"` · `MEDUSA CALCULATE amount: 582` · `CART shipping_total: 582` — три пути сходятся.
   Чекаут в браузере: карточка «Почтой России, 1–2 кг / Отправляем в течение двух дней после оплаты / 5–10 дней / 582,00 ₽ / 2,4 кг × 180 ₽ + 150 ₽». Скриншот `03-checkout-shipping.png`.
3. **Регион исключает метод.** Корзина DE (2 × 700 г = 1400 г, Berlin): `OPTIONS: Самовывоз [flat/manual_manual/0] · Курьером [flat/manual_manual/10]`, `tariff method present: false`.
4. **Трек-номер end-to-end.** Заказ №6 (`order_01M2GSKEYX95FD7YWDQ9CQK8SA`): панель показывает «СДЭК» и «80112233445566» (`02-panel-order-tracking.png`); кабинет покупателя, блок «Доставка → Трек-номер»: `["СДЭК 80112233445566"]` (`04-account-order-tracking.png`). Строка совпадает с обеих сторон.
5. **Человеческие имена дефолтов.** БД стенда: способов вида `% pickup`/`% courier` — **0**; «Самовывоз» ×15, «Курьером» ×15 у тенантов (241 «Pickup»/«Courier delivery» — это опции базового сид-магазина, не тенантские). Store API для корзины RU отдаёт «Самовывоз» (flat, amount=0) и «Курьером» (flat, amount=10).

## Риски в дифе
91 файл, +3982 / −82. Удалённых файлов нет. Миграций нет. Секретов в коде нет (совпадения грепа — стендовый `supersecret` в integration-тесте, конвенция репозитория). Защищённой инфраструктуры диф не касается. Существующие плоские опции не удаляются — переименование идемпотентным скриптом.

## Ниты (в комментарии к PR, не блокировали приёмку)
1. Плоский тариф пишется одной суммой во все валюты регионов магазина — мультивалютный магазин цену по валютам задать не может.
2. Письмо об отгрузке живьём не отправлялось (на стенде нет SMTP) — проверено только кодом.
3. Существующие тенанты на живом хосте не переименованы: после деплоя нужен `npx medusa exec ./src/scripts/rename-default-shipping-methods.ts`.
