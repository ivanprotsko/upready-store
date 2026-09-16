# w17-mp-price-stock-table — одна таблица цен и остатков: магазин и все площадки в одном экране

Ветка `feat/day16-mp-price-stock-table`, база `dev` (`75cf477f`). Строка 4 матрицы паритета
(`research/marketplace-spec.md`, раздел 1): InSales Combo обещает «цены и остатки всех площадок
правятся в одной таблице». В нашей read-only рамке это та же таблица без правки — числа магазина
стоят рядом с числами каждой площадки, расхождения подсвечены, возраст каждого числа назван.

## Что сделано

### Бэкенд

- `apps/backend/src/modules/marketplace/price-stock.ts` — все решения экрана, чистые: строка =
  АРТИКУЛ (нормализация одна на оба экрана — `articleKey` из `catalog.ts`), колонка на площадку,
  агрегат строк `mp_offer`, расхождения с порогами, три группы, свежесть, CSV.
- `apps/backend/src/api/tenants/marketplaces/price-stock/route.ts` — `GET` списка: строки вкладки,
  счётчики ВСЕЙ таблицы, пороги, порядок колонок из реестра адаптеров.
- `.../price-stock/lines/route.ts` — `GET` раскрытия одного артикула: все склады и размеры
  плюс `stock_check` (сумма, пересчитанная по возвращённым строкам).
- `.../price-stock/export/route.ts` — `GET` CSV ровно отфильтрованного набора, `X-Rows` в заголовке.
- `.../price-stock/price-stock-data.ts` — чтение: `mp_product`, `mp_offer`, `mp_sync_run` через
  сервис модуля, цена и остаток магазина — через `shopFacts` КАТАЛОГА (экспортирована из
  `catalog/catalog-data.ts`): два читателя = два ответа на «какая у товара цена в магазине» на двух
  экранах одной панели (правило 19b).
- Тесты: `__tests__/price-stock.unit.spec.ts` (46 проверок логики) и
  `__tests__/price-stock-read-only.unit.spec.ts` (27 проверок инварианта «только чтение»).

### Панель

- `apps/tenant-panel/src/routes/marketplaces/price-stock/` — экран, таблица с двухэтажной шапкой
  (группа «Магазин» / «Wildberries» / «Ozon» над своими колонками), раскрытие строки в склады и
  размеры, метка свежести.
- `apps/tenant-panel/src/hooks/api/marketplace-price-stock.tsx` — ТОЛЬКО чтение: ни одного
  `useMutation`, ни одного глагола кроме GET.
- Маршрут `/marketplaces/price-stock` в `app.tsx`, пункт «Цены и остатки» в разделе «Маркетплейсы»
  боковой навигации (`main-layout.tsx`), подписи в `i18n/translations/{en,ru}.json`.

## Решения, которые стоит прочитать

**Возраст числа берётся от СТАРШЕГО из двух фактов.** `mp_offer.measured_at` честен для остатка и
ОПТИМИСТИЧЕН для цены той же строки: нормализаторы WB и Ozon пишут в строку, несущую оба числа,
время загрузки ОСТАТКОВ (`modules/wb/normalize.ts:182`, `modules/ozon/normalize.ts:164`), потому что
цена приехала другим запросом, чьего времени строка не хранит. Поэтому рядом читается последний
успешный `mp_sync_run` того же семейства, и возраст считается от того из двух, который СТАРШЕ:
число не может быть свежее импорта, который его принёс. Порог протухания — интервал вида ×3
(`schedule.ts`): цены 1 ч → 3 ч, остатки 15 мин → 45 мин.

**«Расхождение выше порога» — не четвёртая группа, а наложение.** Расхождение требует обеих сторон,
поэтому каждая такая строка уже посчитана в «везде есть». Сделать её четвёртым членом разбиения
значило бы посчитать эти строки дважды и сломать ту самую арифметику, ради которой вкладки и
существуют. На экране это написано прямо: `2 + 33 + 463 = 498 из 498 артикулов · выше порога 1 (это
те же строки из «везде есть»)`.

**Свёрнутый остаток равен сумме развёрнутых ПО ПОСТРОЕНИЮ.** Оба числа выходят из одной функции
`aggregateLines`, а маршрут раскрытия дополнительно пересчитывает сумму по тем самым строкам,
которые отдаёт (`stock_check`), — экран показывает сходимость, а не обещает её.

**Артикул на нескольких товарах магазина называет себя.** Строка попадает в «везде есть», но цена и
остаток магазина остаются пустыми: выбрать один товар из нескольких значило бы выдумать число
(правило 20a). Пустая клетка подписана — «артикул несут 2 товара магазина», выбор делается на экране
«Каталог», который им и владеет.

**Артикул, известный только по строке `mp_offer`, в таблицу попадает.** Первая версия строила набор
артикулов из карточек и SKU магазина — тест поймал, что цена и остаток без импортированной карточки
молча исчезали из единственной таблицы, которая для них и сделана.

## Замеры (правило 18f)

Стенд: `upready_store_w17` (копия `upready_store_w14`, нативный Postgres `127.0.0.1:5433`), бэкенд
`medusa develop` на `:9047`, панель `vite` на `:5197`, тенант `cherkashino`, владелица
`owner@cherkashino.example`. Живой хост не трогался.

### 1. Тесты и сборка

```
$ cd apps/backend && corepack pnpm test:unit
Test Suites: 73 passed, 73 total
Tests:       1004 passed, 1004 total        → unit rc=0

$ cd apps/backend && corepack pnpm check:backend-build
Backend build completed successfully        → build rc=0

$ cd apps/backend && npx tsc --noEmit        → rc=0
$ cd apps/backend && npx medusa lint         → 0 errors, 98 warnings (все — чужие файлы,
                                               в файлах задачи findings: 0)
$ cd apps/tenant-panel && npx tsc --noEmit   → rc=0
$ cd apps/tenant-panel && npx eslint src/routes/marketplaces/price-stock \
    src/hooks/api/marketplace-price-stock.tsx → rc=0, 0 problems
```

Из них по задаче: `price-stock.unit.spec.ts` 46 проверок, `price-stock-read-only.unit.spec.ts`
27 проверок — обе зелёные целиком (`Tests: 73 passed` при прогоне двух файлов).

### 2. Четыре группы и сходимость — SQL против API

SQL (считает независимо от кода экрана, `mp_product ∪ mp_offer` против SKU магазина):

```sql
with t as (select id from tenant where handle = 'cherkashino'),
mp as (select distinct lower(trim(vendor_code)) as art from mp_product
        where tenant_id=(select id from t) and vendor_code is not null
       union
       select distinct lower(trim(vendor_code)) from mp_offer
        where tenant_id=(select id from t) and vendor_code is not null),
shop as (select distinct lower(trim(pv.sku)) as art from product_variant pv
          join product p on p.id=pv.product_id
          join tenant_tenant_product_product tp on tp.product_id=p.id
         where tp.tenant_id=(select id from t) and pv.deleted_at is null and pv.sku is not null)
select (select count(*) from mp join shop using (art))                       as both_sides,
       (select count(*) from shop where art not in (select art from mp))     as shop_only,
       (select count(*) from mp   where art not in (select art from shop))   as marketplace_only,
       (select count(*) from (select art from mp union select art from shop) u) as total;

 both_sides | shop_only | marketplace_only | total
------------+-----------+------------------+-------
          2 |        33 |              463 |   498
```

API того же стенда:

```
$ curl -s -H "authorization: Bearer <токен владелицы>" \
    http://localhost:9047/tenants/marketplaces/price-stock | jq .counts
{"both": 2, "shop_only": 33, "marketplace_only": 463, "total": 498,
 "accounted_for": 498, "over_threshold": 1, "stale_columns": 715}
```

2 + 33 + 463 = 498 = `total` = `accounted_for`. «Выше порога» — 1, и это строка из «везде есть».

### 3. Свёрнутый остаток = сумма развёрнутых, на конкретном артикуле

Артикул «Таблетки с АСД, 2 банки», Wildberries, 64 склада:

```
$ curl -s -G -H "authorization: Bearer <токен>" \
    http://localhost:9047/tenants/marketplaces/price-stock/lines \
    --data-urlencode "vendor_code=Таблетки с АСД, 2 банки"

marketplace : wb | строк: 64 | свёрнутый остаток: 6463 | цена: 3703 / 1851.5
stock_check : [{"marketplace": "wb", "collapsed": 6463, "sum_of_lines": 6463}]
   line: Архангельск | размер 1128315874 | остаток 100 | замер 2026-09-15T20:13:41.983Z
   line: Астрахань   | размер 1128315874 | остаток 100 | замер 2026-09-15T20:13:28.145Z
   line: Барнаул     | размер 1128315874 | остаток  97 | замер 2026-09-15T20:13:25.831Z
   ... всего строк: 64 | сумма остатков по строкам: 6463
```

Третья, независимая проверка — тот же SQL по базе:

```sql
select count(*) lines, sum(o.stock) from mp_offer o
  join mp_product p on p.external_id=o.external_id and p.marketplace=o.marketplace
 where p.vendor_code = 'Таблетки с АСД, 2 банки';
 lines | sum
-------+------
    64 | 6463
```

Свёрнутое 6 463 шт = сумма 64 строк 6 463 шт = сумма в базе 6 463. На экране эта строка стоит под
таблицей раскрытия (кадр `03-expanded-warehouses.png`).

### 4. Только чтение — вывод теста

`apps/backend/src/modules/marketplace/__tests__/price-stock-read-only.unit.spec.ts`, 27 проверок,
все зелёные. Что именно проверяется на КАЖДОМ файле экрана (5 файлов бэкенда, 6 файлов панели):

- три `route.ts` экспортируют `GET` и не экспортируют `POST` / `PUT` / `PATCH` / `DELETE`;
- ни один файл не называет НИ ОДНОГО зарегистрированного эндпоинта площадки
  (`MARKETPLACES[].endpoints[].id`) и ни одного пути из `mutationDenyList` обоих адаптеров;
- ни `adapter.read(`, ни `runSync`, ни `fetch(`/`axios` — сети у экрана нет вовсе;
- ни одного пишущего метода сервиса модуля (`createMp*`, `updateMp*`, `deleteMp*`, `upsertMp*`);
- панель: ни одного `useMutation`, ни одного `method: "POST|PUT|PATCH|DELETE"`, ни одного слова
  действия над числом площадки («Отправить на площадку», «Изменить цену», «Установить остаток»…);
- в самой ТАБЛИЦЕ нет ни одного поля ввода (`<Input`, `<input`, `contentEditable`) — поля порогов
  живут на экране, в таблице их нет.

Списки эндпоинтов и запретов берутся из `MARKETPLACES`, поэтому третий адаптер попадает под тест
фактом регистрации, а не правкой файла (правило 20).

### 5. Экспорт: строк в файле = строк на экране

```
$ for tab in both shop_only marketplace_only over_threshold; do … done
both:             экран 2   | X-Rows 2   | wc -l 3
shop_only:        экран 33  | X-Rows 33  | wc -l 34
marketplace_only: экран 463 | X-Rows 463 | wc -l 464
over_threshold:   экран 1   | X-Rows 1   | wc -l 2
```

`wc -l` = строки + 1 шапка, для каждой вкладки. Шапка называет единицу у каждого числа и зовёт
площадку так же, как экран:

```
Артикул,Группа,Товар магазина,"Цена в магазине, ₽","Остаток в магазине, шт",
"Цена на Wildberries, ₽ без скидки","Цена на Wildberries, ₽ с учётом скидки",
"Остаток на Wildberries, шт",Строк mp_offer на Wildberries,Замер цены на Wildberries,…
```

### 6. Свежесть: протухшее и свежее рядом

Данные WB на стенде загружены 2026-09-16 04:13, замер сделан в 11:43 — старше 3 ч для цены и 45 мин
для остатка, колонка помечена «протухло». Чтобы рядом стояла СВЕЖАЯ колонка, на стенде прогнан
импорт Ozon из записанных фикстур (сеть не открывалась, `is_fixture = true`):

```
$ OZON_TENANT=cherkashino OZON_KIND=all OZON_FIXTURES=1 npx medusa exec ./src/scripts/ozon-sync.ts
ozon:sync: prices succeeded (fixtures), 2 rows, 1 requests
ozon:sync: stocks succeeded (fixtures), 3 rows, 1 requests        → rc=0
$ MP_TENANT=cherkashino npx medusa exec ./src/scripts/mp-project.ts   → rc=0
```

После него (артикул `ognevka-ultra-60`):

```
ozon: цена 1690 / со скидкой 1290, остаток 60 шт по 2 строкам
  цена   — as_of 2026-09-16T03:43:37.560Z | stale=False |
           цены ozon: 2 строк mp_offer, замер площадки …:37.577Z, импорт …:37.560Z;
           возраст 0 мин при пороге 3 ч
  остаток— as_of 2026-09-16T03:43:37.577Z | stale=False | возраст 0 мин при пороге 45 мин

wb (Дегельминтик): цена as_of 2026-09-15T20:13:22.822Z | stale=True
                   остаток as_of 2026-09-15T20:13:53.595Z | stale=True
```

`stale_columns` во всей таблице: 719 до импорта Ozon → 715 после (ровно 4 колонки — 2 строки × 2
числа — перестали быть протухшими). Кадр `06-fresh-ozon.png` показывает обе колонки рядом.

### 7. Кадры экрана

Живая панель, вход владелицей, http://localhost:5197/marketplaces/price-stock:

- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-price-stock-table/artifacts/docs/w17-mp-price-stock-table/01-table-both.png`
  — таблица, вкладка «везде есть», пороги, строка сходимости, обе группы колонок
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-price-stock-table/artifacts/docs/w17-mp-price-stock-table/02-marketplace-only.png`
  — вкладка «есть на площадке, нет в магазине» (463 строки)
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-price-stock-table/artifacts/docs/w17-mp-price-stock-table/03-expanded-warehouses.png`
  — раскрытая строка: 64 склада и строка «Свёрнутый остаток 6 463 шт = сумма 64 строк 6 463 шт»
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-price-stock-table/artifacts/docs/w17-mp-price-stock-table/04-over-threshold.png`
  — вкладка «расхождение выше порога»
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-price-stock-table/artifacts/docs/w17-mp-price-stock-table/05-stale-mark.png`
  — метка «протухло» крупным планом
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-price-stock-table/artifacts/docs/w17-mp-price-stock-table/06-fresh-ozon.png`
  — свежая колонка Ozon рядом с протухшей Wildberries

## Чего НЕТ и почему

- **Обратной записи остатков и цен на площадки нет — это фаза 4 спеки.** Ключи этого магазина
  read-only, а сама запись (`PUT /api/v3/stocks/{warehouseId}` у WB, `POST /v1/product/import/prices`
  у Ozon) стоит за отдельным контуром подтверждений `w20-wb-write-core`. Оксана просила
  синхронизацию остатков (`research/gap-matrix.md`, сообщение #472253) — здесь сделана та половина,
  которая возможна сегодня: увидеть расхождение. Вторая половина — отправить число — это фаза 4.
- **Правки числа площадки на экране нет ни в каком виде** — инвариант Ивана 2026-09-16 02:46 WITA,
  и он проверен тестом, а не обещанием (раздел 4 замеров).
- **Резерв показан только в раскрытии.** Ozon отдаёт `reserved`, WB — нет; выносить в свёрнутую
  строку колонку, пустую у одной площадки из двух, значило бы обещать сравнение, которого нет.
- **Экран не учит, что делать с расхождением.** Кнопки «связать» и «выбрать товар» живут на экране
  «Каталог» (w14) и там же остаются: два экрана с одной кнопкой — это два места, где она сломается.
- **Живой хост не трогался**, деплой в задачу не входит.

## Как приёмщику проверить за 10 минут

```bash
cd /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-price-stock-table

# 1. Свой стенд (копия базы w14, чтобы не трогать чужую)
/opt/homebrew/bin/psql-17 -h localhost -p 5433 -U ivanprotsko -d postgres \
  -c "create database upready_store_acc17 template upready_store_w14"
sed -E 's#^DATABASE_URL=.*#DATABASE_URL=postgres://ivanprotsko@127.0.0.1:5433/upready_store_acc17#;
        s#^DB_NAME=.*#DB_NAME=upready_store_acc17#; s#^PORT=.*#PORT=9048#' \
  /Users/ivanprotsko/upready/projects/upready-store/apps/backend/.env > apps/backend/.env
printf 'VITE_MEDUSA_BACKEND_URL=http://localhost:9048\n' > apps/tenant-panel/.env

# 2. Поднять
(cd apps/backend && ./node_modules/.bin/medusa develop &)          # :9048
(cd apps/tenant-panel && ./node_modules/.bin/vite --port 5198 --strictPort &)

# 3. Пароль владелице стенда
cd apps/backend && W14_OWNER_EMAIL=owner@cherkashino.example \
  W14_OWNER_PASSWORD=<свой> npx medusa exec ./scripts/fixtures/w14-stand-owner-password.ts

# 4. http://localhost:5198 → войти → «Маркетплейсы» → «Цены и остатки».
#    Сложить три первых счётчика вкладок — должно совпасть со строкой «Сходимость вкладок».
# 5. Вкладка «есть на площадке, нет в магазине» → найти «Таблетки с АСД, 2 банки» →
#    «Склады и размеры (64)» → внизу строка «Свёрнутый остаток … = сумма 64 строк …».
# 6. «Скачать CSV (N строк)» на любой вкладке → wc -l файла = N + 1.
# 7. Свежесть: OZON_TENANT=cherkashino OZON_KIND=all OZON_FIXTURES=1 \
#      npx medusa exec ./src/scripts/ozon-sync.ts && MP_TENANT=cherkashino \
#      npx medusa exec ./src/scripts/mp-project.ts → колонка Ozon без «протухло», WB — с ним.
# 8. Только чтение: cd apps/backend && TEST_TYPE=unit npx jest --silent --runInBand --forceExit \
#      src/modules/marketplace/__tests__/price-stock-read-only.unit.spec.ts
# 9. Остановить свои серверы по порту:
#    /usr/sbin/lsof -t -nP -iTCP:9048 -sTCP:LISTEN | xargs -r kill -9
#    /usr/sbin/lsof -t -nP -iTCP:5198 -sTCP:LISTEN | xargs -r kill -9
```

Карточка для UI: `handoff/day-2026-09-16-oksana-store/artifacts/w17-mp-price-stock-table/report.json`
— `report-validate.mjs` → `OK …: 8 done / 6 results / 1 access` (rc 0).

## Дизайн-система

Панель — копия экранов Medusa Admin 2.19 на `@medusajs/ui`, и этот экран написан в её словаре, как
w01, w12 и w14. Расхождение с каноном Geist (`~/upready/packages/geist-kit/AGENTS.md`) то же самое и
той же природы: перенести панель на Geist — отдельная задача, а один экран в чужом словаре посреди
Admin-панели был бы хуже обоих вариантов.

## Экономия

- **Три чтения вместо одного экрана.** Цена и остаток магазина читаются функцией КАТАЛОГА
  (`shopFacts`), а не вторым SQL: один источник — один ответ на двух экранах, и правка агрегата
  чинит оба. Стоимость решения — одна строка экспорта в чужом файле.
- **Тест вместо раунда критика.** Дефект «артикул, известный только по строке `mp_offer`, пропадает
  из таблицы» нашёл ТЕСТ на этапе первого прогона, а не приёмщик: набор артикулов строился из двух
  источников вместо трёх. Цена находки — одна проверка на шесть строк; цена ненайденного — строки
  площадки, молча отсутствующие в единственной таблице, ради которой задача и делалась.
  Так же тестом закрыт инвариант «только чтение»: 27 проверок по 11 файлам вместо обещания в отчёте.
- **Один скрипт вместо кликанья.** Шесть кадров снимает один скрипт Playwright в скретчпаде сессии
  (логин + вкладки + раскрытие строки + прокрутка к нужной строке). Пересъёмка после двух правок
  экрана стоила по одной команде; вручную это шесть логинов и двадцать кликов на каждый раунд.
  Скрипт живёт ВНЕ дерева репозитория намеренно: `medusa develop` перезапускается на запись внутри
  `apps/backend` (правило 5d), и кадр, снятый во время перезапуска, — это кадр страницы ошибки.
- **Что автоматизировал бы дальше.** Проверку «свёрнутое = сумма развёрнутого» стоит поднять из
  теста на модуль в e2e-проверку по ЖИВОМУ стенду: сейчас сходимость на реальных 11 819 строках
  доказана одним артикулом руками, а могла бы — одним запросом по всем 498 (сравнить `counts` и сумму
  по `lines` каждого артикула). Это ~20 строк скрипта и полный ответ вместо выборочного.
- **Субагентов не звал** (правило 3b, брифом запрещены): вся работа — один контекст, скрипты и тесты.
