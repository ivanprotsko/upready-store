# w15-mp-orders-desk — единая лента заказов «магазин + WB + Ozon»

Ветка `feat/day16-mp-orders-desk`, отчёт написан 2026-09-16 10:30 WITA.
Строки 2, 6, 7 и 21 матрицы паритета (`research/marketplace-spec.md`, раздел 1). Словами Оксаны —
«единая панель заказов WB + Ozon + магазин» (`research/gap-matrix.md`, сообщение #468851).

## Что сделано

### 1. Импорт заказов площадок в `mp_order` / `mp_order_line`

Ядро w12 уже умело проецировать заказы, но у Wildberries читало ТОЛЬКО статистический метод
(`wb_order`), а сборочные задания FBS (`wb_fbs_order`, 8075 живых строк магазина, зеркало w23) не
доходили до ленты вовсе — при пустом `wb_order` на стенде проектор честно давал `orders 0`.

- `modules/wb/adapter.ts` — `loadMirror('orders')` читает ОБА зеркала и помечает каждую строку
  источником (`statistics` / `fbs`). Метка нужна, чтобы нормализатор оставался чистой функцией и не
  угадывал зеркало по набору полей.
- `modules/wb/normalize.ts` — сборочное задание превращается в `mp_order` со СХЕМОЙ из
  `deliveryType` и ОБОИМИ статусами WB; цена переводится из копеек (замер w23), числовой код валюты
  (`643`) — в буквенный.
- `modules/marketplace/scheme.ts` — канон схемы живёт в ЯДРЕ, оба адаптера зовут его. До этого WB
  писал `FBS`, а Ozon `fbo`, и один фильтр раскалывал схему надвое.
- `mp_order.status_detail` (новая колонка) — второе слово площадки: WB `wbStatus`, Ozon `substatus`.
  Сырые строки не подменяются никогда.
- `mp_order_status_event` (новая таблица) — история статусов. Ни WB, ни Ozon журнала статусов не
  отдают, поэтому история — ЭТО НАШИ НАБЛЮДЕНИЯ: строка пишется при первом появлении заказа и дальше
  только когда пара статусов изменилась. Экран так её и подписывает.
- Дедупликация двух зеркал WB — соединением ПО ЗНАЧЕНИЯМ (`wb_order.srid` = `wb_fbs_order.rid`), без
  утверждения о равенстве идентификаторов, которого нет в сохранённых копиях документации.

### 2. Экран «Заказы маркетплейсов» (панель)

`/marketplace-orders` — одна таблица: заказы магазина и заказы площадок рядом, колонка «Откуда»,
фильтры площадка · схема · статус · период, сортировка по дате. **Все фильтры в URL** — вид можно
переслать. Период по умолчанию — последние 30 дней, и экран это ГОВОРИТ. Пустой результат называет
период. Пункт меню — под «Заказами».

### 3. Карточка заказа

`/marketplace-orders/:id` — состав заказа (`mp_order_line`) со ссылкой на товар магазина через
`mp_link`, склад, регион, суммы, валюта, оба статуса площадки сырыми и история наблюдений. Строка,
чей артикул не найден в магазине, показывает «нет в магазине» и название карточки площадки — чтобы
было видно, КАКОГО товара нет.

### 4. Экспорт CSV

`GET /tenants/marketplace-orders/export` с тем же query string и тем же загрузчиком, что и таблица —
поэтому файл и экран не могут разойтись. Отдаётся телом `text/csv` с BOM и CRLF (Excel).

### 5. Доказательство read-only

`modules/marketplace/__tests__/order-feed-read-only.unit.spec.ts` — три пояса:
обработчики экспортируют только `GET`; ни один файл экрана не может позвать площадку (`.read(`,
`runSync`, `fetch`, ни одного зарегистрированного `endpoint_id`, ни одного пути из deny-list
площадок — списки берутся из `MARKETPLACES`, поэтому третий адаптер покрывается регистрацией);
экран панели не отправляет мутаций и не содержит кнопки действия над заказом.

**Тест проверен на отрицательном примере**: временно добавленные `export const POST` в роут и кнопка
«Печать этикетки» в экран дали 2 падения, после отката — снова зелено.

## Стенд и как проверить за 10 минут

```
БД     upready_store_w15 (клон upready_store_w23 — 8075 живых сборочных заданий WB магазина)
бэкенд http://localhost:9015   (apps/backend/.env: PORT=9015, DATABASE_URL=…/upready_store_w15)
панель http://localhost:5195   (apps/tenant-panel/.env: VITE_MEDUSA_BACKEND_URL=http://localhost:9015)
вход   owner-cherkashino@example.test / w13-acceptance-scratch  (фикстура w13, только этот стенд)
экран  http://localhost:5195/marketplace-orders
```

Оба сервера на момент отчёта ОСТАНОВЛЕНЫ (см. «Серверы» ниже). Поднять заново:
`cd apps/backend && npx medusa develop`, `cd apps/tenant-panel && npx vite --port 5195 --strictPort`.

## Замеры (правило 18f)

Полный вывод — `artifacts/docs/w15-mp-orders-desk/measurements.txt`.

### 1. Тесты и сборка

```
cd apps/backend && pnpm test:unit
  Test Suites: 65 passed, 65 total
  Tests:       845 passed, 845 total      (было 833 до задачи; +12 новых)
cd apps/backend && npx tsc --noEmit        → rc=0
cd apps/backend && npx medusa lint         → 0 errors, 91 warnings (все — старые, не мои файлы)
pnpm check:backend-build                   → Backend build completed successfully (9.97s)
pnpm check:backend-fixtures                → rc=0
cd apps/tenant-panel && npx tsc --noEmit    → rc=0
cd apps/tenant-panel && npx eslint src      → 0 errors, 24 warnings (старые)
```

### 2. Импорт и проекция на стенде

```
WB_TENANT=cherkashino WB_KIND=orders npx medusa exec ./src/scripts/wb-sync.ts
  wb:sync: orders rate_limited, 25869 rows, 2 WB requests,
  error: WB statistics.orders answered 429 … [WB asks to retry in 10757 s]
WB_TENANT=cherkashino WB_KIND=cards  npx medusa exec ./src/scripts/wb-sync.ts
  wb:sync: cards succeeded, 423 rows, 5 WB requests
OZON_TENANT=cherkashino OZON_KIND=all OZON_FIXTURES=1 …/ozon-sync.ts
  postings succeeded (fixtures), 2 rows, 2 requests

MP_TENANT=cherkashino npx medusa exec ./src/scripts/mp-project.ts     (прогон 1)
  wb   succeeded — products 423, orders 26812, order_lines 26812, status_events 0, links 1
  ozon succeeded — products 2, offers 3, orders 2, order_lines 2, status_events 0
… тот же вызов ещё раз                                                (прогон 2, идемпотентность)
  ровно те же числа
```

```sql
select marketplace, scheme, count(*) from mp_order group by 1,2 order by 1,2;
 marketplace | scheme | count
-------------+--------+-------
 ozon        | FBO    |     1
 ozon        | FBS    |     1
 wb          | FBS    |  8075
 wb          |        | 18737     -- статистический метод WB схему не сообщает: null, а не догадка
```

**Дедупликация двух зеркал WB — замер, а не допущение:**

```sql
statistics_rows | fbs_rows | matched (srid = rid) | mp_order (wb)
          25869 |     8075 |                 7132 |         26812     -- 8075 + (25869 − 7132)
```

То есть `srid` статистики и `rid` сборочного задания на живых данных магазина — один и тот же
идентификатор в 7132 случаях, и ни один заказ не попал в ленту дважды.

### 3. Журнал прогонов и транспорт

```sql
select marketplace, kind, status, rows, requests from mp_sync_run order by started_at desc limit 10;
 ozon | projection | succeeded |    12 | 0
 wb   | projection | succeeded | 54048 | 0        -- проекция не тратит ни одного запроса
 wb   | cards      | succeeded |   423 | 5
 …

select endpoint_id, method, count(*) from mp_api_call where marketplace in ('wb','ozon') group by 1,2;
 content.cards.list            | POST |  5      posting.fbo.list         | POST | 1
 marketplace.fbs.orders        | GET  |  9      posting.fbs.list         | POST | 1
 marketplace.fbs.orders.new    | GET  |  1      product.info.attributes  | POST | 1
 marketplace.fbs.orders.status | POST |  9      product.info.description | POST | 2
 marketplace.fbs.supplies      | GET  |  1      product.info.list        | POST | 1
 statistics.orders             | GET  |  2      product.list/prices/stocks, question.list,
                                                review.count, review.list | POST | по 1
```

Все 17 — зарегистрированные ЧТЕНИЯ из реестров адаптеров; `POST` там, где так документирует сама
площадка (`readViaPost`). Ни одного вызова вне реестра, ни одной записи.

### 4. Лента через API

```
GET /tenants/marketplace-orders?limit=1      → http=200, time=1.83 s
count: 9591 | undated: 1
period: 2026-08-18 — 2026-09-16 | days: 30 | is_default: true
facets.sources:  Магазин 2, Wildberries 9588, Ozon 1
facets.schemes:  FBO 1, FBS 7773
facets.statuses: Новый 153, В сборке 419, В доставке 2315, Доставлен 4090, Отменён 991,
                 «Статус площадка не присылает» 1623
connection: Wildberries connected=true  notice=rate_limited  last_run=orders/rate_limited
connection: Ozon        connected=false notice=missing       last_run=postings/succeeded(fixtures)
```

`«Другой статус площадки»` — ноль: каждое слово, которое WB и Ozon прислали на этих данных,
сопоставлено. 1623 заказа — это те, у кого статуса НЕТ (так устроен статистический метод WB), и это
отдельный ответ, а не «прочее».

Фильтры (каждый — отдельный запрос, count в ответе):

```
?source=ozon                            → 1
?source=shop                            → 2
?source=wb&scheme=FBS&status=delivered  → 4089
?from=2020-01-01&to=2020-01-31          → 0, period 2020-01-01 — 2020-01-31, is_default=false
```

### 5. CSV = ровно то, что на экране

```
фильтр ?source=wb&scheme=FBS&status=delivered
на экране (count):                              4089
строк данных в файле (wc -l минус заголовок):   4089
заголовки ответа: Content-Type: text/csv; charset=utf-8 · X-Rows: 4089
```

Сам файл в git НЕ кладу: это 4089 реальных заказов магазина — номера, склады, регионы и суммы.
Он лежит на диске приёмщика:
file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-orders-desk/artifacts/docs/w15-mp-orders-desk/export-wb-fbs-delivered.csv

Кнопка в панели тоже нажата живьём (Playwright, `download.mjs`): для `?source=ozon` экран показывал
«Показано 1 из 1», кнопка — «Скачать CSV (1)», скачанный файл — 2 строки (заголовок + 1).

### 6. Экран — снимки

Полные страницы, 1440×1000, панель на живых данных магазина:

- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-orders-desk/artifacts/docs/w15-mp-orders-desk/01-feed-default.png — лента, период по умолчанию, оба баннера, фильтры со счётчиками, строки магазина и WB рядом
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-orders-desk/artifacts/docs/w15-mp-orders-desk/02-feed-filtered.png — применены площадка + схема + статус
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-orders-desk/artifacts/docs/w15-mp-orders-desk/03-feed-empty-period.png — пустой период, подпись «За выбранный период (1 января 2020 г. — 31 января 2020 г.) заказов нет.»
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-orders-desk/artifacts/docs/w15-mp-orders-desk/04-order-card.png — карточка со СВЯЗАННЫМ товаром магазина
- file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-orders-desk/artifacts/docs/w15-mp-orders-desk/05-order-card-unlinked.png — карточка со строкой «нет в магазине»

Read-only в отрисованной разметке, замерено на карточке заказа:

```
buttons in the card: []      forms in the card: 0
```

Единственная ошибка в консоли за весь прогон — `GET /tenants/store ← http://localhost:5195/login (401)`
на странице ВХОДА, до авторизации; к этим экранам отношения не имеет (видно в логе бэкенда).

## Дефекты, найденные приёмкой и починенные здесь же

1. **Цена WB в копейках.** `convertedPrice` сборочного задания — минорные единицы (замер w23: 81600
   при 816 ₽). Экран показывал «156 700 ₽» вместо 1567 ₽. Теперь `/100`, закрыто тестом.
2. **Деньги Ozon приходят ОБЪЕКТОМ** `{"amount":"1290.00","currency":"RUB"}`, а `modules/ozon/normalize.ts`
   читал их голым `Number()` → `null` → сумма всего отправления `0`. Заказ на 2×1290 ₽ показывался
   как «0,00» без валюты. Починено в нормализаторе Ozon (`amount()` + валюта из строки), отправление
   без цен теперь даёт `null`, а не бесплатный заказ (правило 20a). Два теста.
3. **Подпись периода уезжала на день.** Верхняя граница — 23:59:59.999Z, в поясе магазина (UTC+8)
   это уже следующее утро: «последние 30 дней» читались «по 17 сентября» при периоде по 16-е. Бэкенд
   теперь отдаёт `from_day`/`to_day` календарными днями, экран печатает их.
4. **Календарь переписывал URL по кругу.** `new Date("2020-01-31")` — полночь UTC, пикер отдаёт
   полночь ЛОКАЛЬНУЮ, `toISOString()` от неё — предыдущий день: `?to=2020-01-31` за несколько
   перерисовок превращался в `to=2020-01-28`, а экран висел на «Загрузка…», потому что каждый
   перезапис URL стартовал новый запрос. Обе стороны теперь работают в локальных компонентах даты,
   и `onChange` не трогает URL, если день не изменился.
5. **«Статус площадка не присылает»** — отдельный ответ вместо «прочего». 1623 заказа за период.
6. **Лимит запросов площадки** — отдельная жёлтая строка вместо «сбоя» или молчания.

## Чего НЕ сделано и почему

- **Ozon живьём не подключён.** Ключа у магазина нет: `connected=false`, баннер «Ozon: нет
  подключения — ключ не сохранён, поэтому заказов этой площадки в ленте нет вовсе», в ленте только
  2 заказа из записанных фикстур (помечены `is_fixture`). Ozon-колонки НЕ нули — их нет, и экран
  говорит почему.
- **Статистические заказы WB загружены не полностью.** WB ответил 429 после 25869 строк и попросил
  подождать 10757 с. Это видно на экране как жёлтая строка «площадка временно отказалась отдавать
  заказы», а не как отсутствие заказов. Полный период доедет следующим прогоном импорта.
- **Сопоставление с каталогом почти пустое: `mp_link` = 1 из 423 карточек.** У тенанта на стенде 38
  товаров, и их SKU не равны артикулам WB — честный ноль. Чтобы показать СВЯЗАННУЮ строку живьём, я
  приёмочной фикстурой выставил одному варианту стенда SKU `Мазь 15% с АСД 100 мл` (прямой SQL по
  скратч-БД `upready_store_w15`, в код не входит). Это единственная правка данных стенда, сделанная
  руками; всё остальное — импорты и проектор.
- **Постраничность простая**: «Показать ещё» по 50, слияние двух половин ленты в памяти. На данных
  магазина (9591 строка за 30 дней) весь экран отвечает за 1.8 с. Когда магазин это перерастёт,
  лечится постраничным запросом на источник и слиянием, а не join'ом через границу модулей.
- **Карточка заказа МАГАЗИНА своей не заводится**: строка магазина ведёт на существующий экран
  `/orders/:id` со всей оплатой, отгрузками и таймлайном. Второй, более бедный экран того же
  разошёлся бы с первым (правило 20).
- **`docs missing`: полная таблица статусов отправления Ozon.** В сохранённых копиях
  (`docs.ozon.ru-api-seller-index.txt`) статусы описаны прозой, таблицы нет; на площадку за ней я не
  ходил (приказ штаба 07:10 после бана IP). Сопоставлены те, что документированы прозой, остальные
  честно падают в «Другой статус площадки» со своим словом на экране.
- **Geist не применялся**: `apps/tenant-panel` — форк Medusa Admin 2.19 на `@medusajs/ui`, Geist в
  зависимостях нет. Расхождение с каноном 27 зафиксировано ещё в отчётах w01 и w12, повторяю его.
- Ни одного нового метода площадки я не регистрировал: все чтения уже стояли в реестрах w01/w11/w23.
  Устаревших методов (`/v3/posting/fbs/list`, `/v2/posting/fbo/list`) в реестре нет.

## После слияния с `dev`

Ветка слита с `origin/dev` (`git merge origin/dev`, 3 коммита базы — планировщик синхронизации,
раздел отзывов, экран журнала). Проверено ПОСЛЕ слияния, не до:

```
npx tsc --noEmit                    → rc=0
pnpm test:unit                      → Test Suites: 69 passed, Tests: 908 passed
npx medusa db:migrate               → rc=0 (миграция базы 20260916014707 и моя 20260916015254 встали подряд)
npx medusa db:generate marketplace  → «Skipped. No changes detected in your models»
                                      (снимок схемы после слияния совпадает с моделями — лишней миграции нет)
mp:project                          → те же числа: wb 26812 заказов, ozon 2
GET /tenants/marketplace-orders     → count 9591, notices rate_limited / missing
снимки экрана пересняты на слитом коде: в карточке по-прежнему 0 кнопок и 0 форм
```

## Серверы и карточка задачи

Подняты и остановлены мной: `medusa develop` (:9015) и `vite` (:5195).

```
/usr/sbin/lsof -t -nP -iTCP:9015 -iTCP:5195 -sTCP:LISTEN | xargs -r kill -9
ps -axo pid=,command= | grep '<worktree>/' | grep -vc shell-snapshots   → 0
/usr/sbin/lsof -nP -iTCP:9015 -iTCP:5195 -sTCP:LISTEN | wc -l           → 0
```

Отчёт для карточки задачи проверен схемой:

```
node handoff/day-2026-09-16-oksana-store/ui/report-validate.mjs      handoff/day-2026-09-16-oksana-store/artifacts/w15-mp-orders-desk/report.json
OK …/artifacts/w15-mp-orders-desk/report.json: 9 done / 7 results / 1 access
```

## Экономия

- **Скриптом вместо руками.** Все снимки, проверка «в карточке ноль кнопок» и нажатие кнопки
  экспорта — два маленьких скрипта Playwright в скретчпаде (`shots.mjs`, `download.mjs`), запуск
  ~40 с, повторяемы. Руками это 5 проходов по панели на каждый круг правок, а кругов было три.
- **Тестом вместо раунда критика.** Правило «сбой импорта — красная строка, а не пустая таблица»
  вынесено в чистую функцию `connectionNotice()` и закрыто шестью юнит-тестами. Породить живой
  `failed` прогон на стенде нечем (Ozon без ключа прогона не пишет, WB отвечает), а обещание в
  комментарии проверить нельзя.
- **Тест поймал то, что ревью не поймало бы.** Отрицательный прогон read-only-теста (временный
  `POST` + кнопка «Печать этикетки») — 2 минуты, и он доказал, что зелёный тест не пустой.
- **Живая приёмка поймала 4 дефекта из 6** (копейки, объект денег Ozon, сдвиг подписи на день,
  петля календаря). Ни один из них не виден ни в типах, ни в юнитах, ни в ревью диффа — только на
  экране с настоящими 8075 заказами. Стенд-клон живой БД (`createdb -T upready_store_w23`, 3 с)
  окупился многократно.
- **Ноль сабагентов**, ноль Workflow: задача одного контекста.
- **В следующий раз автоматизировал бы**: проверку «каждое слово статуса площадки сопоставлено» —
  сейчас это ручной взгляд на фасет `other`; напрашивается тест, который берёт distinct-статусы из
  зеркал стенда и падает, если хоть один уходит в `other`.
