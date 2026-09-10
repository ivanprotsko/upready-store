READY

# Ночная волна панели тенанта 2026-09-11 — отчёт оркестратора (06:36 WITA)

Задача `t-2026-09-11-mt-tenant-panel`. Оркестратор — session_01KustDWwx6wKgao7kqUhHPm (после `/clear` 05:50 продолжил в том же worktree). Первая строка файла — сигнал приёмщику (протокол 22i, только через диск).

## Что открыть утром

- Панель тенанта: http://localhost:5180 — вход `admin@acme.test` / `supersecret` (второй тенант `admin@globex.test`, третий `admin@initech.test`, пароль тот же).
- Родная админка для сравнения: http://localhost:9023/app — `admin@upready.dev` / `supersecret`.
- Пары скриншотов «панель ↔ админка» (1440×900, светлая тема, одно и то же состояние данных, сняты 06:31):
  `artifacts/docs/tenant-panel-shots/{admin,panel}-login.png`, `…-after-login.png`, `…-products.png`, `…-product-create.png`, `…-orders.png`
  (`file:///Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-vendors/artifacts/docs/tenant-panel-shots/`; пересъёмка: `node scripts/tenant-panel-shots.mjs admin|panel` из этого worktree).
- Код: ветка `feat/mt-panel`, HEAD `0d43329`, worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-panel`; приложение `apps/tenant-panel` (Vite, `corepack pnpm exec vite --port 5180 --strictPort`), бэкенд `apps/backend` (`medusa develop` на :9023, лог `/tmp/mt-backend-9023.log`; панель — лог `/tmp/mt-panel-5180.log`). Push не делался (21b).

## Что построено

Четыре экрана — файлы дашборда `@medusajs/dashboard` 2.19.0, скопированные как есть по тем же относительным путям; заменён только слой данных (`src/hooks/api/*` → `/tenants/*`) и вход (`sdk.auth.login("tenant", …)`). Каждое отклонение от upstream помечено комментарием `// tenant-panel:` (перечень — `apps/tenant-panel/README.md`, раздел «Deviations»).

| Экран | Маршрут панели | Источник в дашборде | Кусок / коммит |
|---|---|---|---|
| Вход (emailpass) | `/login` | `routes/login` | 1 — 50ad4e4 |
| Обзор (имя магазина, канал, publishable key) | `/` | своя страница (в дашборде обзора нет) | 1 — 50ad4e4 |
| Товары: список | `/products` | `routes/products/product-list` (+ data-table, table hooks) | 3 — ef81181 |
| Товары: создание | `/products/create` | `routes/products/product-create` (+ data-grid, forms, modals) | 3 — ef81181 |
| Заказы: список | `/orders` | `routes/orders/order-list` | 4 — 648aeea |
| Backend `/tenants/*` в форме админки | 20 маршрутов | реэкспорт валидаторов/query-config админки | 2 — a2697bd, + 7ff802d |

`/products/:id`, `/orders/:id`, `/orders/export` — страница «не собрано» (в объём ночи не входили). Feature-flags панели статически `false` (список товаров = `ProductListTable`, не configurable). Сайдбар — три пункта (Обзор / Товары / Заказы).

## Проверено живьём (мои прогоны, не слова воркеров)

- `apps/tenant-panel`: `tsc --noEmit` rc=0, `vite build` rc=0 (объединённое дерево), `eslint src` rc=0 — 0 ошибок, 7 предупреждений `react-hooks/exhaustive-deps`, все в скопированных файлах админки (upstream-код, по правилу копии не правится). Lint-скрипт куска 1 был незапускаем (ESLint 9 без конфига + флаг `--ext`) — починен коммитом 0d43329.
- `apps/backend`: `tsc --noEmit` rc=0, `medusa lint` rc=0, seam-suite `integration-tests/http/tenants.spec.ts` 35/35 (rc=0; окружение запуска — как в промпте куска 2: `DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9031`; с `DB_HOST=127.0.0.1` без `DB_USERNAME` раннер не подключается к БД и красит все 35).
- e2e `PANEL_URL=http://localhost:5180 node apps/tenant-panel/e2e/tenant-panel.e2e.mjs` (из `apps/tenant-panel` в feat/mt-panel) — 41/41 PASS, rc=0, 06:31 (лог `/tmp/mt-panel-e2e.log`):
  - Acme видит 8 своих товаров и 6 заказов, Globex — 3 товара и 0 заказов; ни одной чужой строки в обе стороны, ни одного заказа Acme (#1–#6) у Globex; имя магазина в оболочке.
  - Создание товара из панели Acme через форму (опция Size=M, вариант 49.99 EUR, Publish) → возврат на `/products`, товар в списке и в API со статусом `published`; у Globex через API его нет.
  - Витрины после `POST /api/revalidate` на каждой: :8000 (Acme) показывает `E2E panel product 2231`, :8001 (Globex) и :8002 (Initech) — нет. Без ревалидации витрина ничего не показывает (кэш `force-cache`), поэтому e2e ревалидирует все три перед сверкой.
- Скриншоты сняты после исчезновения скелетонов (`.animate-pulse`), дефект приёмщика №1 закрыт ещё в 05:32; список дефектов на 06:36 пуст.

## Числа товаров: почему 8/3, а не 4/2

Acceptance писался при 4 товарах Acme / 2 Globex. Сценарий `apps/backend/scripts/mt-live-scenario.mjs` заводит новую пару при каждом прогоне и после цифр Ивана прогонялся дважды (серии `(live mtvmilw5)`, `(live mtvwemqw)`): к 05:27 стало 6/3. Ночью добавились два товара, созданные из панели: `Night wave test 2213` (`prod_01M26P7XBBS8WEZBQP441XBWD2`, проверка воркера куска 3) и `E2E panel product 2231` (`prod_01M26Q4PKAR44P5WK3R62J6XK4`, e2e) — оба оставлены нарочно, чтобы утром было что посмотреть на :8000. Итого Acme 8 / Globex 3 / Initech 1, чужих 0. Приёмка сверяет владельца строк, число в тексте acceptance правит Иван (22j).

## Замеры, снимающие вопросы

- «Экран создания смонтирован дважды» (гипотеза воркера куска 3 про `app.tsx`): на родной админке `/app/products/create` тоже 2 `[role="dialog"]` и 2 поля title — это устройство RouteFocusModal + вложенного Radix-диалога в upstream, не баг панели; править нечего.
- Комбобокс категорий в форме создания читал `GET /tenants/product-categories`, которого в контракте куска 2 не было (пробел нашёл воркер куска 3): маршрут добавлен реэкспортом GET админки + строка seam-теста (7ff802d), живьём 200/401/404 (с токеном / без / POST).
- Ловушка Mercur «`allowed` со звёздами вырезает связи» на наш `/tenants/*` не перенеслась — набор ключей строки `/tenants/products` и `/tenants/orders` совпадает с `/admin/*` (замер приёмщика 05:36–05:46, `…-morning.md`).

## Что не сделано / решения Ивану

- Детали товара и заказа, экспорт заказов — «не собрано» (объёма ночи не было).
- Прямой режим панели к бэкенду (`VITE_MEDUSA_BACKEND_DIRECT=true`) требует CORS-middleware на `/tenants/*` — не делалось, панель ходит через dev-proxy Vite.
- Панель не задеплоена и не собрана в prod-режим никуда, кроме `vite build` для проверки; ветка `feat/mt-panel` не пушилась.
- Витрина не узнаёт о новых товарах сама (нет событий Medusa → `/api/revalidate`); для стенда это правило приёмки, для продукта — отдельная задача.

## Хронология ночи (по коммитам и mtime логов)

04:25 план и ветка · 04:47 воркеры 1 (каркас, Sonnet) и 2 (backend, Opus) · 05:09 кусок 2 принят · 05:27 кусок 1 принят, :9023 перезапущен из feat/mt-panel, воркеры 3 (products) и 4 (orders) · 05:39–05:41 кусок 4 принят (648aeea, 01d0500) · 05:50 `/clear` оркестратора, продолжение · 06:20 кусок 3 сдан · 06:23 приём и merge (ef81181, 5f3d27d) · 06:31 e2e 41/41 и скриншоты · 06:32 seam 35/35, product-categories (7ff802d) · 06:35 lint починен (0d43329) · 06:36 READY.
