# w21-wb-write-stocks-prices — запись в WB, классы «остатки» и «цены»

Отчёт исполнителя, 2026-09-16 07:39 WITA. Ветка `feat/day16-wb-write-stocks-prices`, база `dev`.
Живой записи нет: за смену ни один запрос не ушёл в Wildberries.

## Что сделано

**Диф-сервис** `apps/backend/src/wb-write-diff/` — отдельный каталог рядом с `catalog-enrich/`,
не примитив Medusa (правило AGENTS.md о семи каталогах-примитивах):

| файл | что держит |
|---|---|
| `types.ts` | словарь: строки дифа, действия `equal`/`update`/`skipped`, сопоставление складов |
| `diff.ts` | ЧИСТЫЕ правила — всё, что проверяется фикстурами без базы |
| `batches.ts` | сборка тел запросов по документированным лимитам WB |
| `read.ts` | чтения из контейнера: товары, остатки, цены, зеркала, связи w07 |
| `build.ts` | одна точка входа `buildWbDiff` — её зовут и панель, и скрипт |
| `push.ts` | ПЕРВЫЙ в репозитории вызыватель `wbWrite` |

**Правила дифа — что он отказывается угадывать.** Каждое из них закрыто тестом:

- товар без строки `product_marketplace_link` (w07) в диф не попадает вовсе — не с чем сравнивать;
- у карточки WB несколько штрихкодов → строка `skipped`, а не выбор наугад: наш вариант не называет
  ни один из них, и выбор положил бы остаток магазина на чужой размер;
- вариант, по которому магазин не ведёт учёт (`manage_inventory: false`) → `skipped`, а не `0`:
  ноль означает «кончилось», это ПРОТИВОПОЛОЖНОСТЬ «не считаем» (правило 20a);
- склад магазина без выбранного склада WB не даёт строк и попадает в `unmapped_locations`;
- штрихкод, которого нет в зеркале остатков, читается как `0`: w01 читает КАЖДЫЙ склад продавца
  целиком, поэтому отсутствие строки — это и есть «там ничего нет».

**Цены сравниваются по числу, которое видит ПОКУПАТЕЛЬ.** У нас — цена варианта, у WB —
`discountedPrice` (то же правило, по которому w07 импортирует цены). Скидка WB не трогается:
обнулить её значило бы молча убрать зачёркнутую цену, на которой построены её карточки — это
решение о её магазине, а не о наших данных. Вместо этого считается `price`, при котором
покупательская цена на WB станет равной нашей.

Арифметика WB **замерена, а не вспомнена**: по 463 строкам зеркала цен кабинета Черкашиной
`discountedPrice = price × (1 − discount/100)` выполняется 463 раза из 463, точно и без округления:

```sql
with s as (select (e->>'price')::numeric price, wp.discount, (e->>'discountedPrice')::numeric dp
           from wb_price wp, lateral jsonb_array_elements(wp.sizes::jsonb) e)
select 'rows='||count(*)||' exact_formula='||count(*) filter (where dp = price*(1-discount/100.0)) from s;
→ rows=463 exact_formula=463
```

Обратное преобразование даёт нецелое число рублей → строка `skipped` с причиной
`price_not_reachable_at_current_discount`, а не сдвиг на рубль молча.

**Скрипт** `pnpm --filter backend wb:push` (`src/scripts/wb-push.ts`). `--dry-run` принимается и
НИЧЕГО не делает намеренно: сухой ли прогон, решают ворота (e) внутри `execute.ts` по переменной
окружения; флаг здесь был бы шестыми воротами, которыми владеет скрипт, — ровно то устройство,
которое w20 и существует, чтобы исключить. Флаг принят, чтобы работала документированная строка
запуска, а прогон вслух говорит, какие ворота реально решили.

**API** `GET/PUT /tenants/wb/write-preview`. GET — чтение двух сторон плюс счётчики по ВСЕМ строкам
(не по странице) и состояние ворот. PUT меняет одно и это не мутация Wildberries: какому складу
продавца WB соответствует склад магазина (`stock_location.metadata.wb_warehouse_id`). Чужой
`stock_location_id` → `NOT_FOUND`, как и везде в `/tenants/*`.

**Панель** — раздел «Что изменится на WB» на странице Wildberries: переключатель «Остатки/Цены»,
счётчики, выбор склада WB для каждого склада магазина, таблица (товар, штрихкод/nmID, «В магазине»,
«На WB», для цен — «Цена WB после отправки»), выключенная кнопка «Отправить» и СПИСОК закрытых
ворот под ней — экран называет причину, а не просто серый.

## Чего в документации WB не оказалось (docs missing)

Задача требовала тела запросов «из документации, не по памяти». Сохранённые копии описывают
МАССИВ и его границы, но состав объекта внутри массива в них свёрнут (`{"stocks": [{}]}`,
`{"data": [{}]}`) — так его и сохранил w01:

- `PUT /api/v3/stocks/{warehouseId}`: «stocks, required, Array of objects [ 1 .. 1000 ] items,
  Array of size IDs and amounts» — `artifacts/docs/w01-wb-readonly-client/docs/dev-wildberries-ru-ru-docs-openapi-item-management.txt`, строки 4801–4807;
- `POST /api/v2/upload/task`: «data, required, Array of objects, Items, prices and discounts.
  Maximum 1,000 items. Both price and discount can not be empty» — тот же файл, строки 3079–3086.

Перечитать страницы в эту смену было нельзя: **приказ Ивана 2026-09-16 07:07 WITA** — антибот WB
забанил публичный IP этой машины (HTTP 498), `dev.wildberries.ru` с неё не открывать ни браузером,
ни curl. Три попытки (headless-контекст, персистентный профиль Chrome, WebFetch) сделаны ДО приказа
и все уперлись в 498; процессы сняты сразу после его получения.

```
docs missing: https://dev.wildberries.ru/ru/docs/openapi/item-management#tag/sellerWarehousesInventory
docs missing: https://dev.wildberries.ru/ru/docs/openapi/item-management#tag/pricesAndDiscounts
```

Что сделано вместо выдумывания полей:

1. **Схема реестра не расширена.** `bodySchema` в `wb-write/write-endpoints.ts` по-прежнему
   валидирует только то, что документация ДЕЙСТВИТЕЛЬНО утверждает — массив и его границы.
   Репозиторий нигде не утверждает, что форма элемента проверена.
2. **Имена полей взяты из ОТВЕТОВ самого WB**, которые этот репозиторий уже читал и зеркалил:
   `sku`/`amount` — из ответа `POST /api/v3/stocks/{warehouseId}` («Get Inventory»), который
   разбирает `modules/wb/sync.ts` (`line.sku`, `line.amount`) и которым заполнены 11 605 строк
   `wb_stock`; `nmID`, `price`, `discount` — из ответа `GET /api/v2/list/goods/filter`, зеркало
   `wb_price`. Провенанс каждого поля выписан в шапке `batches.ts`.
3. Цена ошибки сегодня нулевая: ворота (e) закрыты, тела доезжают только до строки аудита.

Когда бан снимут, страницы надо перечитать и либо подтвердить форму элемента, либо поправить
`batches.ts` — это одно место.

## Чем измерено

Локальный стенд: БД `upready_store_w21` (клон `upready_store_w07` — там 423 карточки, 463 цены и
20 связей w07), в неё долиты 11 605 строк `wb_stock` из `upready_store_w01` — тот же магазин
`cherkashino`, тот же кабинет, разные стенды, поэтому `tenant_id` строк переписан на здешний
(`UPDATE 11605`). Бэкенд :9042, панель :5192, Постгрес 127.0.0.1:5433.

**Проверки**

```
$ cd apps/backend && npx tsc --noEmit                    → rc=0
$ cd apps/backend && npx medusa lint                      → rc=0 (82 warning, 0 error — все предсуществующие)
$ cd apps/backend && pnpm run test:unit                   → rc=0, 52 сюиты, 573 теста
$ cd apps/tenant-panel && npx tsc --noEmit                → rc=0
$ cd apps/tenant-panel && npx eslint src                  → rc=0 (24 warning, 0 error — все предсуществующие)
$ pnpm check:backend-fixtures                             → rc=0
$ node scripts/check-locale-catalogs.mjs                  → OK — 3 catalogs, 36 codes each, all agree
```

Новые сюиты: `wb-write-diff/__tests__/diff.unit.spec.ts` (правила дифа и арифметика цен),
`batches.unit.spec.ts` (лимиты 1000, один склад — один запрос, в пакет едут только `update`),
`push.unit.spec.ts` (N строк аудита и НОЛЬ сокетов: `globalThis.fetch` подменён счётчиком).

**Диф на стенде, остатки** (`GET /tenants/wb/write-preview?kind=stocks`):

```
counts {"total":20,"equal":1,"update":5,"skipped":14}
push   {"batches":1,"rows":5,"endpoints":["wb.stocks.update"]}
```

| SKU | штрихкод | в магазине | на WB | что будет |
|---|---|---|---|---|
| 168523959-CHERKASHINO | 2038146772640 | 100 | 100 | совпадает |
| 219762882-CHERKASHINO | 2039724021594 | 6 | 0 | отличается |
| 71807904-CHERKASHINO | 2026873155621 | 100 | 93 | отличается |
| 94372564-CHERKASHINO | 2036722128546 | 46 | 38 | отличается |
| 254498035-CHERKASHINO | 2040983482316 | 387 | 378 | отличается |
| 341315642-CHERKASHINO | 2042992233231 | 10 | 0 | отличается |

14 строк `skipped`, все с причиной `store_does_not_count_this_variant`: в мигрированном каталоге
Черкашиной У ВСЕХ вариантов `manage_inventory: false` и нет inventory item (`linked_variants_with_inv_item=0`).
Это честный ответ дифа, но плохая демонстрация, поэтому 6 вариантам стенд выдал учёт фикстурой
`scripts/fixtures/w21-seed-stand-stock.ts` (первому — ровно столько, сколько на WB, чтобы в таблице
была и строка «совпадает»).

Пока склад не выбран, диф давал `counts total=0` и одну запись в `unmapped_locations` — ровно то
поведение, ради которого сопоставление вынесено на экран. Складов WB в зеркале 65, выбран
`985793 «Фабрика Натуральных Продуктов»`.

**Диф на стенде, цены** (`GET …?kind=prices`): изначально `equal=20` из 20 — потому что w07 уже
записал в магазин покупательскую цену WB; это и есть проверка, что сравнение верное (обратная
операция к импорту w07). Чтобы показать путь `update`, цена одного товара изменена ЧЕРЕЗ API
панели (владелица правит цену у себя):

```
$ curl -X POST …/tenants/products/prod_…XR/variants/variant_…9H -d '{"prices":[{"amount":999,"currency_code":"rub"}]}' → 200
$ curl …/tenants/wb/write-preview?kind=prices
counts {"total":20,"equal":19,"update":1,"skipped":0}
push   {"batches":1,"rows":1,"endpoints":["wb.prices.upload-task"]}
[{"nm":"219762882","store":999,"wb":1109.5,"wb_price":2219,"disc":50,"proposed":1998}]
```

999 при скидке 50 % → цена WB 1998; покупатель на WB увидит 999.

**Dry-run через настоящие ворота.** Сначала прогон при ЗАКРЫТЫХ воротах (так стенд и стоял):

```
$ WB_TENANT=cherkashino WB_KIND=stocks npx medusa exec ./src/scripts/wb-push.ts
wb:push wb.stocks.update {"warehouseId":"985793"} (5 rows) -> refused at gate credential:
  No wb WRITE credential is stored for this shop (slot wildberries_write). …
wb:push cherkashino stocks: 1 batch(es), 5 rows — 0 dry_run, 1 refused, 0 sent. WB_WRITE_LIVE=(unset).
```

Потом ворота (a)(b)(c)(d) открыты фикстурой `scripts/fixtures/w21-open-stand-gates.ts`
(СИНТЕТИЧЕСКИЙ ключ, подпись — литерал `w21-acceptance-scratch`; ворота (e) не трогаются):

```
$ WB_TENANT=cherkashino WB_KIND=stocks npx medusa exec ./src/scripts/wb-push.ts
[wb-write] DRY RUN PUT marketplace-api.wildberries.ru/api/v3/stocks/985793 (stocks, sha256 0af8d7360493…):
  nothing was sent, WB_WRITE_LIVE is not set.
1 batch(es), 5 rows — 1 dry_run, 0 refused, 0 sent. WB_WRITE_LIVE=(unset).

$ WB_TENANT=cherkashino WB_KIND=prices npx medusa exec ./src/scripts/wb-push.ts
[wb-write] DRY RUN POST discounts-prices-api.wildberries.ru/api/v2/upload/task (prices, sha256 58aa2ef2a0f6…)
1 batch(es), 1 rows — 1 dry_run, 0 refused, 0 sent. WB_WRITE_LIVE=(unset).
```

**Журнал аудита на стенде:**

```sql
select op_class, outcome, dry_run, method, path, gate from marketplace_write_audit order by created_at;
stocks | refused | t | PUT  /api/v3/stocks/985793 | credential
stocks | dry_run | t | PUT  /api/v3/stocks/985793 | -
prices | dry_run | t | POST /api/v2/upload/task   | -

select count(*) from marketplace_write_audit where outcome='sent';  → 0
select count(*) from wb_api_call where method not in ('GET','POST'); → 0
```

Тела, доехавшие до журнала (колонка `payload`):

```json
{"stocks": [{"sku":"2039724021594","amount":6},{"sku":"2026873155621","amount":100},
            {"sku":"2036722128546","amount":46},{"sku":"2040983482316","amount":387},
            {"sku":"2042992233231","amount":10}]}
{"data": [{"nmID":219762882,"price":1998,"discount":50}]}
```

**Скриншоты** (вне git, абсолютные пути):

- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-wb-write-stocks-prices/artifacts/docs/w21-wb-write-stocks-prices/panel-preview-stocks.png`
- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-wb-write-stocks-prices/artifacts/docs/w21-wb-write-stocks-prices/panel-preview-prices.png`
- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-wb-write-stocks-prices/artifacts/docs/w21-wb-write-stocks-prices/panel-preview-send-disabled.png`
- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-wb-write-stocks-prices/artifacts/docs/w21-wb-write-stocks-prices/panel-wildberries-fullpage.png`

## После слияния с dev (перемер)

PR #81 открылся `CONFLICTING`: пока шла смена, в `dev` уехал w03, который добавил соседние ключи
в те же два файла переводов панели. Слияние сделано в ветку (`git merge origin/dev`), конфликт
разрешён взятием версии `dev` целиком плюс повторной вставкой блока `wildberries.preview` —
своя строка не переписывалась поверх чужой. `HANDOFF.json` ветка не трогает вовсе.

Все замеры повторены на СЛИТОМ дереве, а не остались от прежнего:

```
$ cd apps/backend && npx tsc --noEmit                → rc=0
$ cd apps/backend && pnpm run test:unit              → rc=0, 59 сюит, 683 теста
$ cd apps/tenant-panel && npx tsc --noEmit           → rc=0
$ cd apps/tenant-panel && npx eslint src             → rc=0 (24 warning, 0 error)
$ node scripts/check-locale-catalogs.mjs             → OK — 3 catalogs, 36 codes each, all agree
$ npx medusa db:migrate                              → rc=0 (приехал модуль ozon из w11)
$ curl …/tenants/wb/write-preview?kind=stocks        → counts {"total":20,"equal":1,"update":5,"skipped":14}
$ curl …/tenants/wb/write-preview?kind=prices        → counts {"total":20,"equal":19,"update":1,"skipped":0}
```

Скриншоты в `artifacts/docs/w21-wb-write-stocks-prices/` сняты заново на слитом дереве.

## Раунд 2 приёмки: слияние с dev и переезд раздела панели (2026-09-16 11:56 WITA)

За время жизни ветки в `dev` влилось 16 коммитов, из них семь трогали те же файлы. Слияние сделано
в ветку, шесть файлов разрешены руками, и один из них вскрыл НАСТОЯЩИЙ дефект, которого не было
видно ни в типах, ни в тестах.

**Дефект: раздел панели стал недостижимым.** w12 превратил `/settings/wildberries` в редирект на
`/settings/marketplaces` (`routes/settings/wildberries/redirect.tsx`), а страница `wildberries.tsx`,
куда я вписал свою секцию, осталась в дереве, но её больше никто не рендерит. Типизация зелёная,
юниты зелёные, `eslint` зелёный — и ни один из них про это сказать не может: мёртвый импорт
компилируется. Нашлось живым прогоном (правило 18f): селектор
`[data-testid="wb-write-preview-section"]` не находился на странице 60 с, при том что соседний
`wb-write-section` находился.

Починка: секция переехала туда, где сейчас живёт поверхность WB, — в карточку Wildberries
(`routes/settings/marketplaces/components/mp-card.tsx`), рядом с разделом согласий, под тем же
условием `card.id === "wb"`. Мои две строки из мёртвой `wildberries.tsx` убраны, файл вернулся к
версии `dev` дословно.

Замер после починки:

```
old path /settings/wildberries lands on: /settings/marketplaces   <- редирект w12 цел
preview sections on page: 1
consent sections on page: 1
card that owns the section: Wildberries                            <- не Ozon
```

**Разрешение шести файлов — что в каждом.**

| файл | как разрешён |
|---|---|
| `apps/backend/package.json` | авто; `wb:push` и `mp:*` из dev стоят рядом |
| `apps/backend/src/api/middlewares.ts` | руками: оба импорта и оба маршрута (`write-preview` мой, `fbs-orders/actions` от w23) |
| `no-live-write-call-site.unit.spec.ts` | взята версия dev (у неё лучше самопроверка регулярки), в `REGISTERED_CALLERS` добавлена моя строка, сверху добавлена моя половина про КОНФИГИ |
| `i18n/ru.json`, `i18n/en.json` | версия dev целиком + повторная вставка блока `wildberries.preview`; выжили и `tabs`/`fbs` от dev, и мой `preview` |
| `routes/settings/wildberries/wildberries.tsx` | вернулась к версии dev дословно (см. дефект выше) |

`HANDOFF.json` в слиянии не участвовал вовсе.

**Общий страж «живой записи нет» теперь покрывает оба класса.** Раньше у меня был свой список
`ALLOWED_CALLERS`, у w23 — свой `REGISTERED_CALLERS`; после слияния список ОДИН:

```
const REGISTERED_CALLERS = [
  // w21-wb-write-stocks-prices: the store -> WB push, classes `stocks` and `prices`.
  path.join("apps", "backend", "src", "wb-write-diff", "push.ts"),
  // w23-wb-write-fbs-orders: the FBS desk, class `fbs_orders`.
  path.join("apps", "backend", "src", "api", "tenants", "wb", "fbs-orders", "actions", "route.ts"),
];
```

Сюита файла, 8 из 8 зелёных, включая обе половины живого гейта (исходники — от dev, конфиги — моя):

```
✓ has no caller of wbWrite or marketplaceWrite besides the registered ones
✓ finds every registered caller on disk
✓ has no source that turns the live gate on
✓ would catch such an assignment if one appeared
✓ has no config file that turns the live gate on
✓ would catch such a config line if one appeared
```

**Проверки на слитом дереве:**

```
$ cd apps/backend && npx tsc --noEmit            → rc=0
$ cd apps/backend && npx medusa lint             → rc=0 (98 warning, 0 error — все предсуществующие)
$ cd apps/backend && pnpm run test:unit          → rc=0, 74 сюиты, 961 тест (было 59/683 у меня, 71/931 в dev)
$ cd apps/tenant-panel && npx tsc --noEmit       → rc=0
$ cd apps/tenant-panel && npx eslint src         → rc=0 (24 warning, 0 error)
$ pnpm check:backend-fixtures                    → rc=0
$ node scripts/check-locale-catalogs.mjs         → OK — 3 catalogs, 36 codes each, all agree
$ npx medusa db:migrate                          → rc=0
$ curl …/tenants/wb/write-preview?kind=stocks    → counts {"total":20,"equal":1,"update":5,"skipped":14}
$ curl …/tenants/wb/write-preview?kind=prices    → counts {"total":20,"equal":19,"update":1,"skipped":0}
$ curl …/tenants/wb/fbs-orders                   → 200 (маршрут w23 не задет)
```

Скриншоты пересняты на слитом дереве с нового адреса `/settings/marketplaces`.

## Живой записи нет — это теперь проверка, а не фраза

У w20 не было ни одного вызывателя `wbWrite`, и инвариант держался тестом «вызывателей нет».
Я добавил вызывателя, поэтому инвариант перенесён туда, где он теперь и живёт
(`wb-write/__tests__/no-live-write-call-site.unit.spec.ts`):

1. к Wildberries по-прежнему могут обратиться ровно два файла (чтение w01 и запись w20);
2. вызыватели `wbWrite`/`marketplaceWrite` вне модулей записи перечислены СПИСКОМ
   (`ALLOWED_CALLERS = ["apps/backend/src/wb-write-diff/push.ts"]`), и отдельный тест проверяет,
   что каждый путь списка существует на диске — переименование не должно превращать проверку в пустую;
3. **новое:** `WB_WRITE_LIVE` не выставлена нигде в репозитории. В конфигах (`.env*`, YAML, `.sh`)
   ищется присваивание в начале строки, в исходниках — присваивание в `process.env`, а не упоминание
   имени: транспорт его объявляет, скрипт и панель его читают, и ни то ни другое ворота не открывает.

## Конкурент — ДА

InSales Combo, дословно из `handoff/day-2026-09-16-oksana-store/research/insales-combo-features.md`:

- строка 91: «Товарный учёт и остатки | Контроль остатков, редактирование и синхронизация с
  площадками» — Комбо, линейка, https://www.insales.ru/page/combo
- строка 197: «Единый остаток и таблица цен | Цены и остатки всех площадок правятся в одной
  таблице» — платформа, https://www.insales.ru/page/marketplace

То есть у конкурента это обычная функция тарифа: одна таблица на все площадки. Наше отличие — не в
наборе, а в том, что таблица показывает РАСХОЖДЕНИЕ с разбором каждой пропущенной строки, а отправка
стоит за пятью воротами и согласием на класс операций.

## Аналог Ozon

По сохранённой копии `artifacts/docs/w10-marketplace-spec/docs/ozon-methods-index.tsv` и якорям из
`docs.ozon.ru-api-seller-index.links.txt`; база URL — https://docs.ozon.ru/api/seller/

| класс | наш вызов WB | аналог Ozon |
|---|---|---|
| остатки | `PUT /api/v3/stocks/{warehouseId}` | `POST /v2/products/stocks` «Обновить количество товаров на складах» — https://docs.ozon.ru/api/seller/#operation/ProductAPI_ProductsStocksV2 (строка 433 индекса) |
| цены | `POST /api/v2/upload/task` | `POST /v1/product/import/prices` «Обновить цену» — https://docs.ozon.ru/api/seller/#operation/ProductAPI_ImportProductsPrices (строка 230 индекса) |

«Не найдено» нет ни по одному классу. Три отличия, которые меняют планирование адаптера `ozon-write`:

1. **Лимит частоты на ТОВАР, а не на запрос**: «Цену каждого товара можно обновлять не больше
   10 раз в час» — у WB лимит на аккаунт. Значит дифу для Ozon понадобится память о том, когда
   цена товара уходила в последний раз; у WB такой памяти не нужно.
2. **`old_price` сбрасывается нулём** («Чтобы сбросить old_price, поставьте 0 у этого параметра») —
   это ДРУГАЯ модель скидки: у WB зачёркнутая цена вычисляется из `discount`, у Ozon она отдельное
   поле. Наш расчёт `proposedWbPrice` — адаптерный, в общий слой его выносить нельзя.
3. **Остатки FBS у Ozon делятся по складам тем же способом** (`warehouse_id` в теле, а не в пути),
   поэтому сопоставление «склад магазина ↔ склад площадки», которое здесь лежит в
   `stock_location.metadata`, для Ozon переиспользуется как есть, только под своим ключом.

Ровно поэтому диф разделён на чистые правила (`diff.ts`) и сборку тел (`batches.ts`): для Ozon
меняется второе, первое — нет.

## Чего НЕ сделано

- **Живой записи нет и не проверялась.** Ни один запрос не ушёл в Wildberries: 0 строк `sent`,
  0 не-GET/POST вызовов в `wb_api_call`, в юнит-тесте 0 вызовов `fetch`.
- **Форма элемента тел запросов не подтверждена по документации** — см. «docs missing» выше.
- **Ozon не реализован**: здесь только разбор его методов, адаптер — отдельная фаза.
- **Кнопка «Отправить» не работает и не должна**: она выключена и перечисляет закрытые ворота.
  Включать её — отдельное решение Ивана, а не задача этой смены.
- **`manage_inventory` у товаров Черкашиной так и остаётся выключенным** в продуктовом каталоге:
  стенду учёт выдан фикстурой, в продакшене это её решение, не наше. Диф это честно показывает
  14 строками `skipped`.
- **Не проверено на живом хосте**: задача этого не требует, деплоя не было.
- `pnpm` на PATH этой машины — 8.12.0 при закреплённых 10.11.1, поэтому `pnpm install` переписал
  `pnpm-lock.yaml` на 11 052 вставки / 15 658 удалений. Изменение отменено (`git checkout --`), в
  PR локфайла нет.
