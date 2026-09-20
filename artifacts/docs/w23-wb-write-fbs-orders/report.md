# w23-wb-write-fbs-orders — заказы FBS: зеркало (чтение) + действия класса `fbs_orders` вхолостую

Ветка `feat/day16-wb-write-fbs-orders` от `dev`. Стенд: Postgres
`127.0.0.1:5433/upready_store_w23` (клон `upready_store_w20`), тенант `cherkashino`, бэкенд `:9423`,
панель `:5423`. Живой хост не затронут, деплоя не было. Отчёт закрыт 2026-09-16 07:34 WITA.

**Стенд намеренно погашен** перед пушем (свои серверы гасит тот, кто их поднял): на `:9423` и `:5423`
сейчас никто не слушает. Раздел 7 начинается с команд, которыми их поднять, — только после этого
адреса в нём живые.

**Живой записи нет.** За всю приёмку в `marketplace_write_audit` 0 строк `sent` и 0 строк с
`dry_run=false`; последнее обращение к WB в журнале чтения — импорт в 07:10, действия панели после
него не открыли ни одного сокета.

## 1. Что сделано

### Чтение (модуль `wb`)

| Файл | Что появилось |
|---|---|
| `apps/backend/src/modules/wb/endpoints.ts` | 5 записей FBS в реестре чтения: `marketplace.fbs.orders.new` (GET `/api/v3/orders/new`), `marketplace.fbs.orders` (GET `/api/v3/orders`), `marketplace.fbs.orders.status` (POST `/api/v3/orders/status`), `marketplace.fbs.supplies` (GET `/api/v3/supplies`), `marketplace.fbs.orders.stickers` (POST `/api/v3/orders/stickers`) |
| `apps/backend/src/modules/wb/models/wb-fbs-order.ts` | зеркало сборочных заданий, ключ `(tenant_id, order_id)` |
| `apps/backend/src/modules/wb/models/wb-supply.ts` | зеркало поставок, ключ `(tenant_id, supply_id)` |
| `apps/backend/src/modules/wb/sync.ts` | виды `supplies` и `fbs_orders`; `stripOrderPii`; `omitUndefined` |
| `apps/backend/src/modules/wb/migrations/Migration20260915230944.ts` | две таблицы + расширенный CHECK на `wb_sync_run.kind` |

**Стикеры зарегистрированы как ЧТЕНИЕ.** Формулировка страницы — «Returns a list of stickers for
assembly orders in the confirm — in assembly and complete — in delivery statuses», побочного эффекта
она не называет, поэтому запись легла в реестр чтения с обязательным `readViaPost.reason`. Оба новых
POST добавлены и в ручной список `POST_READ_ENDPOINT_IDS` сюиты — двойная бухгалтерия w01 сохранена.

### Запись (модули `wb-write` + `marketplace-write`)

| Файл | Что появилось |
|---|---|
| `apps/backend/src/modules/wb-write/write-endpoints.ts` | `wb.fbs.supply.create` (POST `/api/v3/supplies`) и `wb.fbs.supply.add-orders` (PATCH `/api/marketplace/v3/supplies/{supplyId}/orders`) в классе `fbs_orders`; рядом с уже бывшими `wb.fbs.order.cancel` и `wb.fbs.supply.deliver` |
| `apps/backend/src/modules/wb-write/fbs-orders.ts` | ШЕСТАЯ проверка — существует ли такой переход у WB — и планировщик вызовов |
| `apps/backend/src/api/tenants/wb/fbs-orders/route.ts` | `GET /tenants/wb/fbs-orders` — витрина из нашего зеркала |
| `apps/backend/src/api/tenants/wb/fbs-orders/actions/route.ts` | `POST …/actions` — первый боевой вызов `wbWrite` в репозитории |
| `apps/backend/src/api/middlewares.ts` | валидатор тела на `POST /tenants/wb/fbs-orders/actions` |

**У Wildberries нет метода «подтвердить заказ».** По таблице статусов сохранённой страницы в статус
`confirm` («в сборке») заказ переводит именно добавление в поставку. Поэтому «Собрать» без выбранной
поставки — это план из ДВУХ вызовов (создать поставку → добавить заказы), и это записано в коде, а
не додумано интерфейсом.

### Панель

`apps/tenant-panel/src/routes/settings/wildberries/` — страница Wildberries получила две вкладки:
«Подключение» (всё прежнее) и «Заказы FBS» (`wb-fbs-section.tsx` + `wb-fbs-result.tsx` +
`wb-fbs-status-cell.tsx`, хук `hooks/api/wb-fbs-orders.tsx`). Вкладки, а не второй маршрут: журнал
попыток, в котором проверяется «ничего не отправлено», живёт на первой вкладке — разносить
утверждение и его улику по разным URL было бы хуже.

Причина недоступности действия приходит с бэкенда (`assemble_refusal` / `cancel_refusal`) из того же
модуля, через который идёт само действие, — кнопка и отказ не могут разойтись (правило 20).

## 2. Чем измерено

### Проверки

```
apps/backend:  TEST_TYPE=unit … jest --silent --runInBand --forceExit
               → Test Suites: 51 passed, 51 total; Tests: 573 passed, 573 total   (было 484 у w20)
               после вливания origin/dev (пришёл w11-ozon-readonly-client, PR #79):
               → Test Suites: 55 passed, 55 total; Tests: 665 passed, 665 total
apps/backend:  npx tsc --noEmit        → rc=0
apps/backend:  npx medusa lint         → rc=0 (83 warning, все в чужих файлах, 0 errors)
apps/tenant-panel: pnpm typecheck      → rc=0
apps/tenant-panel: pnpm lint           → rc=0 (24 warning, все в чужих файлах, 0 errors)
```

Новые сюиты: `src/modules/wb-write/__tests__/fbs-orders.unit.spec.ts` (переходы + прогон плана через
НАСТОЯЩИЕ гейты, `fetch` — шпион, который бросает исключение) и
`src/modules/wb/__tests__/fbs-sync.unit.spec.ts` (зеркало на записанных фикстурах).

### Живой импорт из кабинета

```
WB_TENANT=cherkashino WB_KIND=supplies,fbs_orders npx medusa exec ./src/scripts/wb-sync.ts
wb:sync: supplies succeeded, 908 rows, 1 WB requests
wb:sync: fbs_orders succeeded, 16298 rows, 19 WB requests

select count(*) orders, count(supplier_status) with_status from wb_fbs_order;  -- 8074 | 8074
select count(*) supplies, count(*) filter (where done) closed from wb_supply;  -- 908  | 880
```

Разбивка по статусам (первые строки): `complete/sold` 4324, `complete/sorted` 1350,
`complete/ready_for_pickup` 961, `confirm/waiting` 419, `cancel/canceled` 183, `new/waiting` 150.
16298 записей против 8074 строк — счётчик прогона считает ЗАПИСИ, а заказ пишется дважды: телом и
статусом; ключ `(tenant_id, order_id)` уникален, вторая запись — обновление.

### `GET /tenants/wb/fbs-orders`

```
curl -s "http://127.0.0.1:9423/tenants/wb/fbs-orders?status=new" -H "Authorization: Bearer <токен>"
http=200
filter new   orders 100   supplies 28
counts {"cancel":183,"complete":7130,"confirm":425,"new":336}
gates  {"credential":{"usable":true},"enabled":true,"consent":null,"live":{"env_var":"WB_WRITE_LIVE","enabled":false}}
первый заказ: 5778628001 · new/waiting · «АСДВИТА 1 флакон» · 504 ₽ · fbs · assemble_refusal null
```

### `POST /tenants/wb/fbs-orders/actions` — девять случаев

| № | Запрос | Ответ |
|---|---|---|
| 1 | `cancel` заказа в `complete` | **409** `invalid_transition`, «статус «complete»: отменить можно только до передачи заказа в Wildberries», строки в журнале НЕТ |
| 2 | `cancel` нового заказа БЕЗ согласия | 200, шаг `refused`, `gate: "consent"`, строка `refused/consent` в журнале |
| 3 | `cancel` заказа, которого нет в зеркале | **404**, «действовать по идентификатору, которого мы не видели, эта панель не умеет» |
| 4 | `cancel` нового заказа, согласие выдано | 200, `PATCH /api/v3/orders/5778628001/cancel`, `dry_run: true`, sha256 `74234e98afe7…` |
| 5 | `assemble` двух заказов в открытую поставку | 200, один шаг `PATCH /api/marketplace/v3/supplies/WB-GI-278668129/orders`, `dry_run: true` |
| 6 | `assemble` без поставки | 200, ДВА шага: `POST /api/v3/supplies`, затем `PATCH …/supplies/dry-run-new-supply/orders` + пояснение, почему во втором шаге заполнитель |
| 7 | `deliver` поставки с заказом | 200, `PATCH /api/v3/supplies/WB-GI-278668129/deliver`, `dry_run: true` |
| 8 | `deliver` закрытой поставки | **409**, «Поставка WB-GI-202620607 уже закрыта» |
| 9 | `action: "ship"` | **400** от валидатора, «Expected: 'assemble, cancel, deliver'» |

Журнал записи после всех девяти (плюс действия через интерфейс):

```
select op_class, outcome, gate, count(*) from marketplace_write_audit group by 1,2,3;
 fbs_orders | dry_run |            | 8
 fbs_orders | refused | consent    | 1
 prices     | refused | consent    | 1      ← наследство приёмки w20
 prices     | refused | credential | 1
 stocks     | dry_run |            | 1
 stocks     | refused | credential | 1

select count(*) from marketplace_write_audit where outcome='sent' or dry_run=false;  -- 0
select max(fetched_at) from wb_api_call;  -- 2026-09-16 07:10:33+08 (импорт; действия сокетов не открывали)
```

### Интерфейс (скриншоты, PNG вне git)

- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-wb-write-fbs-orders/artifacts/docs/w23-wb-write-fbs-orders/panel-fbs-tab.png`
  — вкладка «Заказы FBS»: фильтры со счётчиками (Новые · 336, На сборке · 425, В доставке · 7130,
  Отменённые · 183), 100 строк, цены в ₽, статусы по-русски.
- `…/panel-fbs-selected.png` — две строки выбраны, кнопки «Собрать (2)» и «Отменить (2)» активны.
- `…/panel-fbs-confirm.png` — диалог подтверждения: что произойдёт, и прямым текстом «Сегодня наружу
  ничего не уйдёт — живой режим выключен, попытка попадёт в журнал как черновая».
- `…/panel-fbs-dry-run.png` — тост «Попытка записана в журнал. В Wildberries ничего не отправлено».
- `…/panel-fbs-cancel-result.png` — блок результата: «Вхолостую: из процесса ничего не вышло»,
  `PATCH /api/v3/orders/5778628001/cancel`, «записано в журнал, отпечаток тела 74234e98afe7…».
- `…/panel-fbs-complete-disabled.png` — фильтр «В доставке»: **100 строк, 100 из них невыбираемы**
  (замерено скриптом: `100 rows, 100 of them unselectable`).
- `…/panel-connection-tab.png` — вкладка «Подключение» с журналом: 13 строк, верхние четыре —
  сегодняшние попытки FBS, все «вхолостую, ничего не отправлено».

Ошибок в консоли браузера после входа — 1, и это доавторизационный 401 самой панели на старте
(проверка сессии на `/login`), не вкладки FBS.

## 3. Как проектировалось под Ozon

Гейты, журнал и согласия лежат в `marketplace-write/` и маркетплейса не знают; `wb-write/` — это
реестр и один `send`. Новое в этой задаче тоже разделено по этой линии: `fbs-orders.ts` (правила
переходов) знает только идентификаторы записей реестра, а маршрут — только классы операций. Адаптер
`ozon-write` будет вторым реестром и вторым `send`; гейты не копируются.

**Аналоги Ozon — НАЙДЕНЫ** (из сохранённого индекса `artifacts/docs/w10-marketplace-spec/docs/ozon-methods-index.tsv`,
469 строк, снят задачей w10 со страницы https://docs.ozon.ru/api/seller/):

| Наше действие | WB | Ozon |
|---|---|---|
| список новых | `GET /api/v3/orders/new` | `POST /v4/posting/fbs/unfulfilled/list` «Получить список необработанных отправлений» |
| список всех | `GET /api/v3/orders` | `POST /v4/posting/fbs/list` «Получить список отправлений» |
| статус одного | `POST /api/v3/orders/status` | `POST /v3/posting/fbs/get` «Получить информацию об отправлении по идентификатору» |
| собрать | добавление в поставку `PATCH /api/marketplace/v3/supplies/{id}/orders` | `POST /v4/posting/fbs/ship` «Собрать заказ (версия 4)» — прямой метод, поставка не нужна |
| отменить | `PATCH /api/v3/orders/{id}/cancel` | `POST /v2/posting/fbs/cancel` «Отменить отправление» + обязательная причина из `POST /v1/posting/fbs/cancel-reason` |
| этикетки | `POST /api/v3/orders/stickers` | `POST /v2/posting/fbs/package-label` / `POST /v2/posting/fbs/package-label/create` + `/v1/posting/fbs/package-label/get` |
| передать отгрузку | `PATCH /api/v3/supplies/{id}/deliver` | `POST /v1/carriage/create` + `POST /v1/carriage/approve` (старое `/v2/posting/fbs/act/create` **отключается 7 сентября 2026**) |

Две разницы, которые адаптер обязан будет учесть: у Ozon сборка — прямой метод по отправлению, а не
побочный эффект поставки; отмена требует кода причины, которого у WB нет вовсе.

## 4. Конкурент

InSales Combo: «Схемы FBS, FBO, DBS — поддержка всех трёх схем»
(`handoff/day-2026-09-16-oksana-store/research/insales-combo-features.md`, строка 194,
https://www.insales.ru/page/combo) и «единая лента заказов с печатью этикеток» (строка 327). Наша
вкладка закрывает ленту заказов FBS и действия по ней; печать этикеток — метод зарегистрирован в
реестре чтения, но кнопки в интерфейсе нет (см. «Чего НЕ сделано»).

## 5. Решения, которые стоит увидеть глазами

1. **ПДн покупателя в зеркало не попадают.** Сборочное задание приходит с `address` (адрес
   доставки), `comment` и `userId` — все три выбрасываются до записи строки (`stripOrderPii`), в
   `raw` их нет. Проверяется тестом: `expect(JSON.stringify(rows)).not.toContain("позвоните заранее")`.
2. **Имена полей измерены, а не взяты из документации.** Портал рендерит примеры ответов свёрнутыми
   (`{"orders": [{}]}`), поэтому имён полей в сохранённых копиях нет вовсе. Мэппинг снят пробой у
   живого кабинета (`apps/backend/scripts/fixtures/w23-probe-fbs.ts`, печатает только ключи и типы);
   выкладка — `artifacts/docs/w23-wb-write-fbs-orders/measurements.md`.
3. **Цена в копейках — это замер.** «Мумие банка» приходит как `price: 81600` при `currencyCode: 643`
   и продаётся за 816 ₽. Для заказа в чужой валюте `price` — минорные единицы валюты покупателя, а
   `convertedPrice` — то же в валюте продавца (BYN: `price` 946 при `converted_price` 26434), поэтому
   витрина показывает `converted_price/100`.
4. **`isCancellable: null` — это «не спрашивали», а не «нельзя».** Отдельная ветка и отдельный тест
   (правило 20a).
5. **Заполнитель `dry-run-new-supply`** во втором шаге «Собрать» без поставки называет себя сам:
   идентификатор поставки чеканит WB в ответе на создание, а вхолостую ответа нет. Значение,
   похожее на настоящий `WB-GI-…`, было бы хуже пустого.
6. **`list${entity}s` заменён на явное множественное число.** Medusa строит имена методов через
   `pluralize`, то есть `WbSupply` → `listWbSupplies`; шаблон со «s» собрал бы имя несуществующего
   метода, и падение пришло бы на первом импорте, а не на компиляции.
7. **Линт «живая запись» сужен.** Проверка «никто не включает `WB_WRITE_LIVE`» сначала ловила прозу
   в шапках файлов, где эта переменная описана. Теперь судится ПРИСВАИВАНИЕ в `process.env`, рядом
   стоит кейс, доказывающий, что регулярка умеет падать, а сам файл линта из сканирования исключён
   (иначе он ловит собственную улику).
8. **Дизайн-система — `@medusajs/ui`, а не Geist.** Панель целиком скопирована с Medusa Admin 2.19;
   вторая дизайн-система внутри одного экрана была бы хуже расхождения с каноном. Расхождение
   записано w01, новым не является (правило 27).

## 6. Чего НЕ сделано и почему

- **Живой записи нет и не проверялась.** Гейт `WB_WRITE_LIVE` не выставлен ни в одном развёртывании,
  отдельного боевого ключа записи у магазина нет (на стенде стоит синтетический ключ w20 с подписью
  `test-signature`). В журнале 0 строк `sent`.
- **Кнопки «Печать этикеток» нет.** Метод `marketplace.fbs.orders.stickers` зарегистрирован как
  чтение и доступен коду, но экран печати — отдельная задача: это файл (PNG/SVG/ZPL) в ответе, а не
  строка таблицы, и его надо куда-то класть. Планка InSales «печать этикеток» этой веткой не закрыта.
- **Адаптера `ozon-write` в ветке нет** — только разбор его методов выше (§3).
- **Мостика между `wb_fbs_order` и товарами тенанта нет** — зеркало самостоятельное, как и у w01.
- **Живые статусы страницами не докручиваются.** Импорт спрашивает статусы ВСЕХ строк зеркала
  (8074 = 9 запросов по 1000), а не только незавершённых. При росте зеркала это станет заметно;
  сужение до неконечных статусов — отдельная правка, она меняет смысл вида `fbs_orders` (перестанет
  замечать то, что WB поменял у старого заказа).
- **`git grep -n "eyJhbGci" -- .` НЕ пуст**, и это честнее, чем сказать «пусто»: 5 вхождений в
  `artifacts/docs/2026-09-10-mt-vendors-acceptance.md` (истёкшие сессионные токены чужой приёмки,
  старше этой ветки) и литералы в трёх сюитах, где токен собирается на месте и кончается на
  `test-signature`. Ключ кабинета (последние знаки `c6Sg`) в файлах ЭТОЙ ветки не встречается.
- **`dev.wildberries.ru` не открывался.** Приказ Ивана 2026-09-16 07:07 WITA: антибот забанил
  публичный IP машины. Все цитаты в коде — из сохранённых копий
  `artifacts/docs/w10-marketplace-spec/docs/dev.wildberries.ru-en-orders-fbs.txt` (4284 строки) и
  `artifacts/docs/w01-wb-readonly-client/docs/`. Вызовы шли только к `marketplace-api.wildberries.ru`
  — это Seller API, другой хост, и это обычные чтения через реестр w01. Страниц, которых не хватило
  бы, не было: `docs missing:` — нет.

## 7. Как приёмщику проверить за 10 минут

Стенд погашен: сперва подними процессы командами ниже, и только потом открывай адреса —
до `medusa develop` на `:9423` не слушает никто, до `vite` на `:5423` тоже.

```bash
cd /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-wb-write-fbs-orders

# 1. проверки (сервер не нужен)
cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest --silent --runInBand --forceExit
#    → 55 suites, 665 tests (51/573 до вливания dev с w11)
npx tsc --noEmit && npx medusa lint
cd ../tenant-panel && pnpm typecheck && pnpm lint

# 2. стенд (база уже собрана; пересоздать — так)
PSQL=/opt/homebrew/Cellar/postgresql@17/17.11/bin/psql
$PSQL postgres://ivanprotsko@127.0.0.1:5433/postgres -c "create database upready_store_w23 template upready_store_w20"
cd ../backend    # .env уже лежит: DB_NAME=upready_store_w23, PORT=9423
npx medusa db:migrate
WB_API_KEY="$(grep '^WB_API_KEY=' /Users/ivanprotsko/upready/projects/upready-store/.env.cherkashino | cut -d= -f2-)" \
  WB_TENANT=cherkashino npx medusa exec ./src/scripts/wb-seed-key.ts
WB_TENANT=cherkashino WB_KIND=supplies,fbs_orders npx medusa exec ./src/scripts/wb-sync.ts

# 3. ПОДНЯТЬ бэкенд, потом дёргать витрину и действие
npx medusa develop &                                    # после этого :9423 живой
until curl -sf -o /dev/null http://127.0.0.1:9423/health; do sleep 2; done
T=$(curl -s -X POST http://127.0.0.1:9423/auth/tenant/emailpass -H 'Content-Type: application/json' \
  -d '{"email":"owner-cherkashino@example.test","password":"w13-acceptance-scratch"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s "http://127.0.0.1:9423/tenants/wb/fbs-orders?status=new" -H "Authorization: Bearer $T" | head -c 400
curl -s -X POST http://127.0.0.1:9423/tenants/wb/fbs-orders/actions -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"action":"cancel","order_ids":["<id заказа в статусе new>"]}'
#    → "dry_run": true

# 4. главный инвариант
$PSQL postgres://ivanprotsko@127.0.0.1:5433/upready_store_w23 \
  -c "select outcome, count(*) from marketplace_write_audit group by 1"   # sent = 0

# 5. ПОДНЯТЬ панель, потом открывать
cd ../tenant-panel && VITE_MEDUSA_BACKEND_URL=http://127.0.0.1:9423 npx vite --port 5423 &
#    после старта: http://localhost:5423/settings/wildberries → вкладка «Заказы FBS»
#    вход: owner-cherkashino@example.test / w13-acceptance-scratch

# 6. погасить за собой
for P in 9423 5423; do /usr/sbin/lsof -t -nP -iTCP:$P -sTCP:LISTEN | xargs -r kill -9; done
```

Серверы, поднятые ЭТОЙ сессией, уже остановлены: `/usr/sbin/lsof -nP -iTCP:9423 -sTCP:LISTEN` и то
же для `:5423` пусты, процессов под worktree — 0.

---

## 8. Раунд 2 — сведение с `dev` (замер 2026-09-16 07:59 WITA)

Приёмка раунда 1 приняла существо целиком и отбила ветку по одной причине: пока она шла, в `dev`
сквошем `f62aeaf7` приехал w03 (PR #76), и девять файлов стали `changed in both`. Продуктовый код не
менялся — менялось только сведение.

**Было** (`B=$(git merge-base HEAD origin/dev); git merge-tree "$B" HEAD origin/dev`):
10 блоков «changed in both», 62 маркера конфликта, девять файлов.
**Стало:** `merge-base == origin/dev`, блоков «changed in both» — **0**, дерево чистое.

Что выжило с обеих сторон:

| Файл | Как сведён |
|---|---|
| `wb/endpoints.ts` | обе константы страниц и обе группы записей: `analytics.funnel.history` w03 и пять `marketplace.fbs.*` w23 |
| `wb/models/wb-sync-run.ts` | **десять** видов: `cards, prices, stocks, orders, sales, feedbacks, questions, analytics, supplies, fbs_orders`; статус `rate_limited` и `retry_at` от w03 сохранены |
| `wb/service.ts` | `WbSale`, `WbQuestion`, `WbAnalyticsDaily` w03 и `WbFbsOrder`, `WbSupply` w23 |
| `wb/sync.ts` | взята версия `dev` целиком, блок w23 (`syncSupplies`, `syncFbsOrders`, `fbsOrderRow`, `stripOrderPii`) приставлен к ней, оба вида в `IMPORTS` |
| `wb/__tests__/transport.unit.spec.ts` | все четыре POST-чтения в ручном списке |
| `translations/{ru,en}.json` | сведены программно: 143 ключа `wildberries` от `dev` + 64 моих = **207**, расхождений текста в общих ключах — **0** |
| `wildberries.tsx` | вкладки w23 и таблицы w03 на одной странице |
| `.snapshot-wb.json` | **не сводился руками** — взят из `dev` и перегенерирован |

### Дефект, который сведение вскрыло (и которого без него бы не заметили)

Моя миграция `Migration20260915230944` переписывала CHECK на `wb_sync_run.kind` СВОИМ списком, а по
имени файла она встаёт ПОСЛЕ `Migration20260915211441` w03. То есть на свежей базе виды `sales`,
`questions` и `analytics` перестали бы записываться вовсе — молча, потому что ни один тест базу не
создаёт. Миграция удалена и перегенерирована из объединённых моделей:

```
npx medusa db:generate wb   → Generated successfully (Migration20260915235342.ts)
grep "'cards'" …/Migration20260915235342.ts
  'cards', 'prices', 'stocks', 'orders', 'sales', 'feedbacks', 'questions', 'analytics', 'supplies', 'fbs_orders'
```

Проверено на ЧИСТОЙ базе (`drop database` → `create database … template upready_store_w20` →
`npx medusa db:migrate`, rc=0):

```
select pg_get_constraintdef(oid) from pg_constraint where conname='wb_sync_run_kind_check';
 CHECK ((kind = ANY (ARRAY['cards','prices','stocks','orders','sales','feedbacks','questions',
                           'analytics','supplies','fbs_orders'])))
таблицы: wb_analytics_daily, wb_fbs_order, wb_question, wb_sale, wb_supply — все пять
```

Второй прогон `npx medusa db:generate wb` на чистом дереве нового файла не даёт.

### Перепроверено после сведения

```
apps/backend:  TEST_TYPE=unit … jest   → Test Suites: 58 passed / 58; Tests: 685 passed / 685
apps/backend:  npx tsc --noEmit rc=0 · npx medusa lint rc=0 (86 warning, 0 errors)
apps/tenant-panel: pnpm typecheck rc=0 · pnpm lint rc=0 (0 errors)

WB_KIND=supplies,fbs_orders …/wb-sync.ts
  wb:sync: supplies succeeded, 908 rows, 1 WB requests
  wb:sync: fbs_orders succeeded, 16301 rows, 19 WB requests
  wb_fbs_order 8075 / со статусом 8075 ·  wb_supply 908 / закрытых 880

GET  /tenants/wb/fbs-orders?status=new        → 200, orders 100, supplies 28,
                                                 counts {cancel:183, complete:7130, confirm:425, new:337}
POST …/actions cancel (new 5778700739)        → dry_run: true,  PATCH /api/v3/orders/5778700739/cancel
POST …/actions cancel (complete 5768084344)   → 409 invalid_transition, строки в журнале нет
POST …/actions assemble → WB-GI-278668129     → dry_run: true,  PATCH /api/marketplace/v3/supplies/…/orders
POST …/actions deliver  → WB-GI-278668129     → dry_run: true,  PATCH /api/v3/supplies/…/deliver

select count(*) from marketplace_write_audit where outcome='sent' or dry_run=false;  → 0
```

Две правки в тестах, которые потребовало сведение, обе по существу w03:

1. `service-methods.unit.spec.ts` — в ручной список сущностей зеркала добавлены `WbFbsOrder` и
   `WbSupply`. Это та же двойная бухгалтерия, что у `POST_READ_ENDPOINT_IDS`: `WbSupply`
   множится в `WbSupplies`, и список существует ровно ради таких случаев.
2. `fbs-sync.unit.spec.ts` — случай с 429 теперь ждёт `rate_limited` и `retry_at`, а не `failed`.
   Семантика w03 лучше моей: 429 с названным окном — это ожидание, а не поломка. Проверка «строки,
   записанные до лимита, не теряются» осталась.

Скриншоты пересняты на объединённом коде: на вкладке «Подключение» в одной таблице стоят и виды w03
(«Продажи и возвраты», «Вопросы покупателей», «Воронка по карточкам»), и мои («Поставки FBS»,
«Сборочные задания FBS» — успешно, 908 и 16 301 строк).
