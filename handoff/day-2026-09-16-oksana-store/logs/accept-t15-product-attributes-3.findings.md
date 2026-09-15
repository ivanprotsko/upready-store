# Приёмка PR #35 · t15-product-attributes · раунд 3 — MERGED

Приёмщик: headless `claude -p`, главный чекаут `dev`. Отчёт составлен 2026-09-15 10:09 WITA.
PR: https://github.com/ivanprotsko/upready-store/pull/35 · head `feat/day16-product-attributes` · base `dev` — совпадает с заданием.
Состояние: `{"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","headRefOid":"8aeaacde"}`.
Воркtree чист, стоит ровно на `origin/feat/day16-product-attributes`, `git rev-list --left-right --count origin/dev...HEAD` → `0  17`.

Блокирующих находок нет. Обе находки раунда 2 закрыты — замерено мной, не по отчёту воркера.

## Находка 1 раунда 2 (падение экрана заполнения) — ЗАКРЫТА

Путь владелицы КЛИКОМ (Playwright, системный Chrome, панель `:5152`, вход `admin@t15shop.test`),
товар → секция «Характеристики» → меню → «Заполнить»:

```
menu items: ["Заполнить"]
url after click: http://localhost:5152/products/prod_01M2H6NYDRE0DG4HP1XDP230EF/custom-attributes
ERROR PAGE: false
Объём до: 100 → сохранено 480
секция после сохранения содержит новое значение: true
PDP блок: Характеристики | Состав | Трава, витамин C | Объём | 480 мл | Страна | Россия
```

Ящик открылся и показывает контрол под каждый тип: «Состав» — текст, «Объём, мл» — число,
«Страна» — список со значением «Россия», «Гипоаллергенно» — да/нет. Скриншот прочитан глазами:
`02-panel-values-drawer.png`.

Правка доехала до витрины без перезапуска — `/ru/products/cube-1-t15shop` отдал «Объём 480 мл».
Это вторая правка PR: ревалидация `tenant.product-attributes` стоит во ВСЕХ четырёх пишущих
маршрутах — `product-attributes/route.ts:119`, `product-attributes/[id]/route.ts:172,216`,
`products/[id]/attributes/route.ts:156` (класс проверен, правило 20).

Второй прогон, возвращающий данные стенда к прежнему объёму 100, тоже зелёный: `ERROR PAGE: false`,
`PDP содержит 100: true`. Данные стенда оставлены как были; скриншот `05-pdp-cube-1-after-save.png`
снят этим вторым прогоном и показывает уже 100 — доказательство самой правки лежит в логах
`owner-path-run1-100to480.log` и `owner-path-run2-480to100.log`.

## Находка 2 раунда 2 (страница ошибки выдана за доказательство) — ЗАКРЫТА

`artifacts/docs/t15-product-attributes/04-panel-product-values-drawer.png` переснят и прочитан мной
глазами: на нём настоящий ящик заполнения с четырьмя контролами, а не «useRouteModal must be used
within a RouteModalProvider». Копия — `06-pr-screenshot-04-reshot.png`.

## Что приёмщик замерил сам

Стенд ветки: бэкенд `:9152`, панель `:5152`, витрина `:8152`, база `upready_store_t15`
(Postgres на `127.0.0.1:5433`). Все три процесса подняты из этого воркtree (`lsof -d cwd`).

| Критерий задачи | Мой замер | Итог |
|---|---|---|
| Владелица заводит характеристику и ЗАПОЛНЯЕТ её у товара | путь кликом, выше | OK |
| Блок «Характеристики» на карточке | `GET /store/tenant/product-attributes?product_id=<cube-1>` → `sostav=Трава, витамин C \| obem=480 мл \| strana=Россия`; пустых строк и «не указано» нет | OK |
| Диапазонный фильтр отдаёт ровно те товары | `GET /store/tenant/product-attributes/facets?a_obem=100..500` → `count: 3`, ids `…DP230EF, …6XV0HD, …144MXA0`. Мой собственный SQL по базе → те же три товара (объёмы 480, 250, 500), границы включаются | OK |
| Витрина под тем же фильтром | `/ru/store` → 10 карточек, `/ru/store?a_obem=100..500` → 3, `?a_obem=1000..2000` → 0 | OK |
| «Не показывать» ≠ «не фильтровать» | схема: `strana` (show=t, filter=f) — на карточке есть, в фасетах (`sostav, obem, gipoallergenno`) нет; `gipoallergenno` (show=f, filter=t) — в фасетах есть, на карточке нет | OK |
| Второй магазин не видит чужого | ключом t15other: `/product-attributes?product_id=<товар t15shop>` → `{"product_attributes":[],"count":0}` HTTP 200; `/facets` → `{"facets":[],"product_ids":null,"count":0}` | OK |
| Значение без совпадений погашено, а не спрятано | `?a_obem=100000..200000` → `count: 0`, все значения `count:0 [disabled]`, список не схлопнут | OK |
| Счётчики фасетов сверены с данными | t15perf: маршрут `gipoallergenno false:2000, true:1000`, `sostav` по 750 на каждое из четырёх значений, `obem` `{min:10,max:1000,count:3000}` — мой SQL даёт ровно те же числа | OK |
| Фасеты под секунду на большом каталоге | t15perf (3 000 товаров, 9 000 значений — счёт по базе мой), 10 вызовов: без выбора холодный 69.2 мс, медиана 28.6, max 30.8; выбор списка 27.9; диапазон 27.0. Запас ~14× по холодному | OK |

Сьюты (свои прогоны, строки целого файла):

```
apps/backend       npx tsc --noEmit            → rc=0
apps/backend       pnpm test:unit              → Test Suites: 1 failed, 16 passed, 17 total
                                                 Tests: 1 failed, 190 passed, 191 total, rc=1
apps/backend       шов t15 (tenants-product-attributes.spec.ts, DB_HOST=localhost PORT=9199)
                                               → Test Suites: 1 passed, Tests: 10 passed, 10 total, rc=0
apps/tenant-panel  pnpm typecheck              → rc=0
apps/tenant-panel  pnpm lint                   → 24 problems (0 errors, 24 warnings), rc=0
apps/storefront    npx tsc --noEmit            → rc=0
apps/storefront    pnpm test                   → Test Files 14 passed (14), Tests 141 passed (141), rc=0
```

Единственное падение unit-сьюты — `i18n merge › leaves a locale the profile never translated identical
to the base` — НЕ от этой ветки, и это мой собственный замер: тот же файл прогнан в главном чекауте на
`dev` (`npx jest src/migration-scripts/__tests__/profile-data.unit.spec.ts` → `Test Suites: 1 failed, 1 total`,
`Tests: 1 failed, 14 passed, 15 total`, rc=1), а `git diff --name-only origin/dev...HEAD | grep -c
migration-scripts` → `0`. Отдельная задача на `dev`.

`npx next build` витрины НЕ запускался намеренно: на `:8152` из этого же дерева живёт `next dev`,
и сборка переписала бы его `.next` под живыми замерами (правило 5d).

Прочее из списка «повод отклонить» — чисто: удалённых файлов относительно `dev` — 0; секретов в новом
коде нет; миграция `Migration20260915000453.ts` раундом 3 не менялась и создаёт только три свои таблицы;
защищённой инфраструктуры PR не касается; деплоя нет; расширения объёма за рамки задачи не видно.

## Нит (не повод отклонять, вынесен в комментарий к PR)

Поля ящика заполнения подписаны не элементом `<label>` — `page.locator("label")` на этом экране даёт
пустой список, хотя подписи «Состав», «Объём, мл», «Страна», «Гипоаллергенно» на экране видны.
Для скринридера связь подписи с полем при этом не выражена. Мелочь для следующей задачи по панели.
