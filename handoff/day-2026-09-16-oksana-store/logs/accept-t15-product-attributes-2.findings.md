# Приёмка PR #35 · t15-product-attributes · раунд 2 — REJECTED

Приёмщик: headless `claude -p`, главный чекаут `dev` (`/Users/ivanprotsko/upready/projects/upready-store`).
Промпт приёмки пришёл 2026-09-15 09:29 WITA.
PR: https://github.com/ivanprotsko/upready-store/pull/35 · head `feat/day16-product-attributes` · base `dev` — совпадает с заданием.

Состояние PR (замер): `{"mergeable":"MERGEABLE","mergeStateStatus":"CLEAN"}` — находка раунда 1 закрыта,
ветка запушена, воркtree чист и стоит ровно на `origin/feat/day16-product-attributes` (`07c6b845`),
`git rev-list --left-right --count origin/dev...HEAD` → `0  13`.

## Что блокирует

### 1. Экран заполнения характеристик у товара падает — владелица не может ввести НИ ОДНОГО значения

Это ровно тот шаг, ради которого задача существует («заводит характеристику и **заполняет её у товара**»,
шаг 2 плана). Экран падает ВСЕГДА, а не на глубокой ссылке: замерен путь самой владелицы — клик по пункту
«Заполнить» в меню секции «Характеристики» на странице товара.

Замер (Playwright, системный Chrome, панель `http://localhost:5152`, вход `admin@t15shop.test`):

```
menu items: [ 'Заполнить' ]
url: http://localhost:5152/products/prod_01M2H6NYDRE0DG4HP1XDP230EF/custom-attributes
ERROR PAGE: true | useRouteModal: true
```

На экране вместо ящика заполнения:

```
Произошла ошибка
При отображении этой страницы произошла непредвиденная ошибка.
Error: useRouteModal must be used within a RouteModalProvider
    at useRouteModal (src/components/modals/route-modal-provider/use-route-modal.tsx:8:11)
    at ProductCustomAttributes (src/routes/products/product-custom-attributes/product-custom-attributes.tsx:35:29)
```

Скриншоты: `09-panel-values-drawer-crash.png` (по клику «Заполнить»), `07-panel-product-values-drawer.png`
(тот же экран по прямому адресу).

**Где в диффе.** `apps/tenant-panel/src/routes/products/product-custom-attributes/product-custom-attributes.tsx`:

```
export const ProductCustomAttributes = () => {
  const { id } = useParams()
  const { handleSuccess } = useRouteModal()      // ← вызов ВЫШЕ провайдера
  ...
  return (<RouteDrawer> ... </RouteDrawer>)      // ← провайдер живёт ВНУТРИ RouteDrawer
```

Провайдер создаётся внутри `RouteDrawer` (`src/components/modals/route-drawer/route-drawer.tsx:49`
`<RouteModalProvider prev={to}>`), поэтому `useRouteModal()` в теле компонента, который этот `RouteDrawer`
рендерит, не может увидеть контекст никогда. Соседний рабочий экран `routes/products/product-attributes`
хук на этом уровне не зовёт. Лечение — вынести тело формы во вложенный компонент (он рендерится уже
внутри `RouteDrawer.Body`) и звать `useRouteModal()` там.

**Почему это не поймали ни типы, ни сьюты.** `pnpm typecheck` панели — rc=0, `pnpm lint` — 0 errors:
ошибка рантаймовая. Шовная сьюта закрывает API, а не экран: свой прогон
`integration-tests/http/tenants-product-attributes.spec.ts` → `Test Suites: 1 passed, Tests: 10 passed, 10 total`,
rc=0. Тестов на панель в PR нет вовсе.

### 2. Отчёт PR выдаёт страницу ошибки за доказательство (правило 18f)

`artifacts/docs/t15-product-attributes/report.md` перечисляет `04-panel-product-values-drawer.png`
в ряду скриншотов приёмки («ящик заполнения … с контролом под каждый тип»). Файл
`artifacts/docs/t15-product-attributes/04-panel-product-values-drawer.png`, лежащий в этом же PR,
содержит ту самую страницу «Произошла ошибка / useRouteModal must be used within a RouteModalProvider» —
скриншот сделан и в отчёт вписан, но не прочитан. Критерий приёмки «Скриншоты панели» этим файлом
не закрыт. Перед следующим раундом — открыть каждый свой скриншот глазами.

## Что приёмщик замерил САМ и что зелено

Стенд ветки: бэкенд `:9152`, панель `:5152`, витрина `:8152`, база `upready_store_t15` (Postgres на
`127.0.0.1:5433`). Ни одно число ниже не взято из отчёта воркера.

| Критерий задачи | Мой замер | Итог |
|---|---|---|
| Блок «Характеристики» на карточке, ru | `/ru/products/cube-1-t15shop` → строки `Состав / Трава, витамин C`, `Объём / 100 мл`, `Страна / Россия`; `/ru/products/sphere-1-t15shop` → `Магний`, `250 мл`, `Россия`. Пустых строк и «не указано» нет | ✅ |
| То же на втором языке | `/en/products/cube-1-t15shop` → `Composition`, `Volume`, `Country / Russia` | ✅ |
| Диапазонный фильтр «Объём» отдаёт ровно те товары | маршрут `GET /store/tenant/product-attributes/facets?a_obem=100..500` → `count: 3`, ids `…RE0DG4HP1XDP230EF, …RQ1GNA2SMRJ6XV0HD, …RZZYYCFFM7144MXA0`. Мой собственный SQL по данным (не `verify.sql` воркера) → те же 3 товара: Cube No. 1 (100), Sphere No. 1 (250), Cube No. 2 (500); границы включаются. Витрина `/ru/store` → 10 карточек, `/ru/store?a_obem=100..500` → 3 карточки, ровно эти три названия | ✅ |
| «Не показывать» ≠ «не фильтровать» | `gipoallergenno` (`show_on_product=f`, `use_as_filter=t`): в фасетах есть, на карточке нет. `strana` (`show=t`, `filter=f`): на карточке есть, в фасетах нет | ✅ |
| Второй магазин не видит чужого | ключом t15other: `/store/tenant/product-attributes?product_id=<товар t15shop>` → `{"product_attributes":[],"count":0}` HTTP 200; `/facets` → `{"facets":[],"product_ids":null,"count":0}` | ✅ |
| Значение без совпадений погашено, а не спрятано | `?a_obem=100000..200000` на каталоге 3 000 товаров → все значения `count:0 [disabled]`, список не схлопнут | ✅ |
| Фасеты под секунду | свой прогон `measure.mjs` (10 вызовов на случай) на t15perf (3 000 товаров, 9 000 значений — счёт по базе мой): без выбора первый 89.9 мс, медиана 28.4; диапазон 25.8; выбор+диапазон 26.7; пусто 23.1. Запас ~11× по холодному и ~35× по медиане | ✅ |
| Числа фасетов сверены с данными | маршрут 1203 / 301 — мой SQL 1203 / 301 | ✅ |
| Владелица заводит характеристику в панели | создал «Срок годности» (`srok_godnosti`, текст) формой на `/product-attributes` — легла в базу под тенантом t15shop, видна в списке и в редакторе; экран редактора читаемый, подписи по-человечески (`06-panel-attribute-edit-new.png`). Данные стенда после проверки убраны за собой | ✅ |
| Владелица заполняет её у товара | **падает, находка 1** | ❌ |

Сьюты (свои прогоны, строки целого файла):

```
apps/backend       npx tsc --noEmit                → rc=0
apps/backend       pnpm test:unit                  → Test Suites: 1 failed, 16 passed, 17 total
                                                     Tests: 1 failed, 190 passed, 191 total, rc=1
apps/backend       шов t15 (tenants-product-attributes.spec.ts)
                                                   → Test Suites: 1 passed, Tests: 10 passed, 10 total, rc=0
apps/tenant-panel  pnpm typecheck                  → rc=0
apps/tenant-panel  pnpm lint                       → ✖ 24 problems (0 errors, 24 warnings), rc=0
apps/storefront    npx tsc --noEmit                → rc=0
apps/storefront    pnpm test                       → Test Files 14 passed (14), Tests 141 passed (141), rc=0
```

Единственное падение unit-сьюты — `i18n merge › leaves a locale the profile never translated identical to
the base` — НЕ от этой ветки, и это замерено: тот же тест прогнан в главном чекауте на `dev`
(`npx jest src/migration-scripts/__tests__/profile-data.unit.spec.ts` → `Tests: 1 failed, 14 passed, 15 total`),
а `git diff --name-only origin/dev...HEAD | grep -c migration-scripts` → `0`. Отдельная задача на `dev`.

Предупреждение гидрации в консоли витрины на страницах товара тоже не от ветки: тот же текст выдаёт
`http://localhost:8152/ru` (домашняя), характеристик не содержащая.

Прочее из списка «повод отклонить» — чисто: удалённых файлов 0; секретов в новом коде нет; миграция
`Migration20260915000453.ts` создаёт только три свои таблицы и в `down()` роняет только их; защищённой
инфраструктуры PR не касается; деплоя нет.

## Что сделать воркеру

1. Починить находку 1 — вынести тело формы во вложенный компонент внутри `RouteDrawer` и звать
   `useRouteModal()` оттуда; проверить КЛИКОМ по «Заполнить» на странице товара, что ящик открывается,
   значение сохраняется и появляется на карточке товара на витрине.
2. Перезаснять `04-panel-product-values-drawer.png` и открыть глазами каждый скриншот, который отчёт
   называет доказательством; поправить текст отчёта (находка 2).
3. Класс проверен мной (правило 20): из всех маршрутов панели ТОЛЬКО этот файл зовёт `useRouteModal()`
   в компоненте, который сам рендерит корневой `<RouteDrawer>`
   (`grep -rl "useRouteModal(" src/routes | xargs grep -l "<RouteDrawer>\|<RouteFocusModal>\|<RouteModal>"`
   → два файла, второй — `routes/orders/order-export/order-export.tsx`, и он сделан ПРАВИЛЬНО:
   `OrderExport` рендерит `<RouteDrawer>`, а хук зовёт вложенный `OrderExportContent`).
   Это готовый образец для починки в этом же репозитории.
4. Остальное возражений не вызвало — API, схема, фасеты, локализация и витрина замерены мной и зелены.
