# Приёмка PR #33 · t13-customers-screen · раунд 1 — MERGED

Замеры приёмщика (не из тела PR). Стенд поднят мной: `npx medusa develop` в worktree
(порт 9213, БД `t13_customers_screen`), панель `vite --port 5186` с `VITE_MEDUSA_BACKEND_URL=http://localhost:9213`.
Прежний сервер worker-сессии на 9213 убит, сервер собран заново из коммита 6ab705b.

## 1. Изоляция тенантов (свои покупатели, не чужие)
Личности подтверждены у владельца перед замером (`GET /tenants/me`):
`admin@t13test.example` → t13test, `admin@t13other.example` → t13other.

    GET /tenants/customers?limit=200  (t13test)  → count=202, вернулось 200 (max limit), чужих строк 0
    GET /tenants/customers?limit=200  (t13other) → count=1, ['foreign.buyer@t13other.example']
    GET /tenants/customers?q=foreign.buyer (t13test) → count=0
    GET /tenants/customers/cus_t13foreignpog9nx (t13test) → 404 not_found
    GET /tenants/customers/cus_t13foreignpog9nx (t13other) → 200

Сверка с БД напрямую (независимо от API):
`select t.handle, count(distinct o.customer_id) ... join tenant_tenant_order_order` → t13test|202, t13other|1.

Поля строки ответа: id, first_name, last_name, email, phone, has_account, created_at,
orders_count, total_spent, currency_code, last_order_at. Ни хэша пароля, ни токенов, ни чужих полей.

## 2. Поиск
    q=guest.buyer   → count=1, guest.buyer@t13test.example (1 заказ, 990)
    q=karenina      → count=1, anna.karenina@t13test.example (2 заказа, 3500)
    q=synthetic-17@ → count=1, t13-synthetic-17@t13test.example
    order=-orders_count&limit=3 → [karenina 2, guest.buyer 1, synthetic-0 1]

## 3. CSV
    POST /tenants/customers/export (t13test) → {"count":202}
    заголовок: "first_name","last_name","email","phone","orders_count","total_spent","currency_code","has_account","created_at"
    data rows: 202, все строки одной ширины (9 колонок), чужих (t13other) строк: 0
    гость: "Гость","Покупатель","guest.buyer@t13test.example",...,"false"
    POST /tenants/customers/export (t13other) → count=1, ровно своя строка

Нит (не дефект этой ветки): `url` в ответе — `http://localhost:9000/static/...`, тогда как стенд
на 9213. Проверено: существующий `POST /tenants/orders/export` на том же стенде отдаёт ровно такой же
хост — это конфигурация локального file-провайдера (MEDUSA_BACKEND_URL), не регрессия PR.

## 4. Производительность (202 клиента у тенанта), критерий «< 3 с»
    limit=20                 0.020 / 0.019 / 0.020 s
    limit=50                 0.019 / 0.021 / 0.019 s
    limit=200                0.021 / 0.024 / 0.065 s
    limit=20&order=-orders_count  0.028 / 0.026 / 0.025 s
    limit=20&q=synthetic     0.020 / 0.021 / 0.019 s
Замер: `curl -w '%{http_code} %{time_total}'`, по 3 прогона. Экран целиком (Playwright,
логин → /customers → networkidle) — 2351 мс.

## 5. Экран (Playwright, 1440x900, скриншоты приложены)
- Навигация: «Обзор | Товары | Заказы | **Клиенты** | Категории | …» — сразу после «Заказы».
- Таблица: Название, Email, Телефон, бейдж «Гость»/«Зарегистрирован», Заказы, Сумма покупок, Дата.
- Пагинация серверная: запросы `GET /tenants/customers?limit=20&offset=0` → `offset=20`,
  футер «20 из 202 результатов / 1 из 11 страниц» → «40 из 202 / 2 из 11». Не выборка всего в память.
- Поиск в UI: «karenina» → одна строка, Анна Каренина, 2 заказа, ₽ 3,500.00 RUB.
- Кнопка «Экспорт» из UI → `POST /tenants/customers/export` 200, count=202.
- Карточка `/customers/cus_t13cards4u7utz7`: контакты, «У этого клиента нет сохранённых адресов.»,
  заказы #2 и #3 со статусами оплаты и сборки.
- Ошибок в консоли браузера: 0.

### Про ₽ 0.00 на карточке — проверено мной, это артефакт фикстуры, не дефект
    select ... order_item/order_line_item по заказам Анны → items=0, line_items=0, summary_total=1500 и 2000
    GET /tenants/orders?customer_id=cus_t13cards4u7utz7 (СУЩЕСТВУЮЩИЙ роут) → [(2, total 0), (3, total 0)]
То есть существующий экран заказов на тех же заказах показывает то же ₽ 0.00: у синтетических
заказов нет позиций, а `total` считается из позиций. Агрегат в списке (₽ 3,500.00) читает
`order_summary.totals` и верен. Поведение PR совпадает с уже живущим роутом заказов.

## 6. Суиты
    apps/backend: npx medusa lint      → rc=0, 0 errors, 21 warnings (все — вне файлов ветки)
    apps/backend: npx tsc --noEmit     → rc=0
    apps/backend: pnpm test:unit       → Test Suites: 1 failed, 8 passed, 9 total; Tests: 1 failed, 95 passed, 96 total
      упавший — src/migration-scripts/__tests__/profile-data.unit.spec.ts «i18n merge › leaves a locale
      the profile never translated identical to the base» (diff по `productOptions: {}` во французском
      сид-каталоге). `git diff --stat origin/dev...HEAD -- '*migration-scripts*'` = 0 строк: ветка этих
      файлов не касается. Не регрессия PR #33; дефект дня заводится отдельно.
    apps/tenant-panel: npx tsc --noEmit → rc=0
    apps/tenant-panel: npx eslint src   → rc=0, 0 errors, 23 warnings

Не запускались (как и заявлено в теле PR): `pnpm test:integration:http` — инфраструктурный пробел
окружения (`role "ivanprotsko" does not exist`), бьёт по всем 16 файлам набора одинаково;
`e2e/tenant-panel.e2e.mjs` — гоняет свою фикстуру на других портах и экран «Клиенты» не покрывает.
Вместо него экран принят собственным прогоном Playwright выше.

## 7. Риски, которых нет
- Миграций нет (`git diff --name-only` по migration — пусто).
- Удалений нет: единственные `-` строки — правка комментария в `[id]/route.ts` и переписанная
  шапка `hooks/api/customers.tsx`.
- Секретов в коде нет; `supersecret` живёт только в throwaway-скрипте `src/scripts/t13-seed-test-tenant.ts`,
  не подключённом ни к одному pnpm-скрипту (`grep t13 apps/backend/package.json` → пусто) — такие же
  скрипты уже лежат рядом (seed-tenants.ts, seed-mt-demo.ts).
- Расползания периметра нет: ни сегментации, ни тегов, ни рассылок.
- Защищённой инфраструктуры ветка не касается, деплоя не было.
- `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`; точка ветвления 2508708 — предок origin/dev.

## Помарки (в комментарий к PR, не повод отклонять)
1. Заголовок колонки-бейджа называется «Зарегистрирован», а значения в ней — «Гость»/«Зарегистрирован».
   Заголовок должен называть величину («Тип покупателя»), а не одно из её значений (правило 18e).
2. `validators.ts` в комментарии обещает сортировку по `total_spent`, но enum её не содержит
   (`created_at`/`-created_at`/`orders_count`/`-orders_count`). Либо добавить, либо поправить комментарий.
3. На карточке нет сводки «заказов / сумма покупок», которая уже посчитана для списка.
