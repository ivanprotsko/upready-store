# w14-mp-catalog-link — один каталог: карточки площадок и товары магазина по артикулу

Ветка `feat/day16-mp-catalog-link`, база `dev`. Отчёт написан 2026-09-16 10:45 WITA.
Строка 3 матрицы паритета (`research/marketplace-spec.md`, §1): InSales Combo обещает «объединяйте
карточки с разных маркетплейсов» — здесь это один список, ключом которого служит артикул продавца.

Инвариант (Иван, 2026-09-16 02:46 WITA) соблюдён: ни одного вызова НА площадку не добавлено.
Всё, что делает задача, пишется только в нашу БД. Проектор и маршруты не отправляют ни одного
запроса — числа берутся из уже загруженных `wb_*`/`ozon_*` → `mp_*`.

## Что сделано

### 1. Экран «Маркетплейсы → Каталог» (`/marketplaces/catalog`)

- `apps/tenant-panel/src/routes/marketplaces/catalog/catalog.tsx` — страница: пороги выделения,
  кнопка «Связать всё по артикулу», сводка, арифметика вкладок, четыре вкладки со счётчиками.
- `.../components/catalog-table.tsx` — таблица: строка = АРТИКУЛ, по строке на каждую карточку
  этого артикула (`rowSpan` на колонках магазина), поэтому один товар на WB и на Ozon читается как
  одна вещь с двумя листингами.
- `.../components/catalog-diff.tsx` — ячейка расхождения: число + единица + подсказка об источнике.
- `.../components/catalog-link-dialog.tsx` — ручная привязка: для «требует выбора» предлагает
  кандидатов, для «не найдено в магазине» ищет по всему каталогу (`GET /tenants/product-variants`).
- `apps/tenant-panel/src/hooks/api/marketplace-catalog.tsx` — чтение и три записи.

Четыре вкладки РАЗБИВАЮТ множество артикулов: каждый различный артикул объединения
(карточки площадок + SKU магазина) попадает ровно в одну. Экран печатает саму арифметику строкой
«Сходимость вкладок», чтобы разошедшийся счёт был виден на экране, а не только в отчёте.

### 2. Связывание

- `apps/backend/src/modules/marketplace/catalog.ts` — ЧИСТЫЙ модуль: строки, счётчики, расхождения,
  сводка. Ввод от вызывающего, решения здесь, запись — дело маршрута (то же разделение, что в `link.ts`).
- `apps/backend/src/modules/marketplace/link.ts` — добавлен `planLinkWrites`: план записи автосвязки.
- `apps/backend/src/modules/marketplace/autolink.ts` — ЕДИНСТВЕННОЕ место записи `mp_link`.
- `apps/backend/src/modules/marketplace/project.ts` — проектор переключён на `autoLink` вместо
  собственного inline-upsert.
- Маршруты: `GET /tenants/marketplaces/catalog`, `POST .../catalog/auto-link`,
  `POST .../catalog/links` (ручная связь), `DELETE .../catalog/links/:id` (отвязка).

Исходы ровно по спеке 2.4: одно совпадение → `mp_link(matched_by='vendor_code')`; ноль → «не найдено»;
больше одного → **«требует выбора», автосвязки НЕТ**. Ручная связь и отвязка пишут `matched_by='manual'`.

**Найден и починен дефект ядра.** Проектор писал связи через `upsert`, ключом которого была
только карточка, — то есть РУЧНОЙ выбор владелицы перезаписывался следующим импортом молча, и
устаревшая связь `vendor_code` оставалась висеть, когда правило её больше не производит.
`planLinkWrites` закрывает обе дыры: ручная строка не переписывается и не удаляется никогда,
своя устаревшая — удаляется. Замер ниже (п. 4) показывает `kept_manual: 1, updated: 0`.

**Ноль — это не пусто.** Если карточки есть, а связей нет, экран пишет
«Сопоставление не сработало: 0 из N», перечисляет прочитанные таблицы и называет АБСОЛЮТНЫЙ путь
файла-правила, вычисленный в рантайме (`path.resolve(__dirname, …link.ts)`), а не набранный.

### 3. Расхождения

Считаются из `mp_offer` и собственных цены/остатка/фото магазина:

| Что | Магазин | Площадка | Порог по умолчанию |
|---|---|---|---|
| Цена | `price.amount` в валюте площадки (`price_list_id is null`) | наименьшая `discount_price`, иначе `price`, по строкам карточки | 10 % |
| Остаток | сумма `inventory_level.stocked_quantity` | сумма `mp_offer.stock` | 1 шт |
| Фото | `product.images` | длина `mp_product.photos` | 1 фото |

Пороги настраиваются на экране и приезжают в маршрут (`price_pct`, `stock_abs`, `photos_abs`).
Каждое число несёт единицу и однострочную подсказку об источнике (правило 18e), `null` рендерится
как «нет данных», а не как ноль. Цена сравнивается ВНУТРИ валюты площадки: в каталоге 241 регион,
поэтому «цена товара» без валюты — это выбор наугад; если рублёвой цены нет, подсказка так и пишет.

### 4. Два дефекта живой панели (Иван, 2026-09-16 09:11)

**Навигация.** Раздел «Маркетплейсы» добавлен в боковую навигацию
(`main-layout.tsx`), подпункты: «Каталог», «Подключение площадок» (`/settings/marketplaces`),
«Wildberries» (`/settings/wildberries`). Ozon получит свой пункт в тот день, когда у него появится
своя страница. Кадр: `07`/`01`–`05` — навигация видна на каждом.

**Состояние «ключ не сохранён».** Диагноз на реальности, а не по названию: `/settings/wildberries`
с w12 — это РЕДИРЕКТ на `/settings/marketplaces` (`routes/settings/wildberries/redirect.tsx`), и
строку «Права ключа» Иван видел на карточке площадки (`mp-card.tsx`). При отсутствующем ключе
`inspectCredentials(null)` честно отвечает `read_only: 'unknown'`, а бейдж рисовал это как
«не удалось определить» — то есть как СЛОМАННЫЙ ключ.

Починено: при `connection.key.set === false` строка рисует «—» и одну строку о том, КАК ключ
хранится у этого магазина. Строка принадлежит АДАПТЕРУ (`credentialHowTo` в контракте,
`ADAPTER_KEYS`, конформанс-тест), а не таблице в ядре: у WB один JWT, у Ozon пара
`Client-Id` + `Api-Key`, и второй список площадок в ядре разошёлся бы с первым (правило 20).
Текст взят из существующего механизма (`src/scripts/wb-seed-key.ts`, `src/scripts/ozon-seed-key.ts`)
и НЕ выдумывает кнопки в панели, которой нет. «Не удалось определить» осталось ровно для
сохранённого, но нечитаемого ключа. Тот же дефект починен в спящем близнеце
`routes/settings/wildberries/wildberries.tsx` (файл никем не импортируется — правило 20, чтобы
оживление страницы не оживило баг).

### 5. Чего эта задача НЕ делает, и связь с w07

Перенос фото и описаний из карточки площадки В товар магазина — это `w07-tenant-catalog-enrich`
(промпт `prompts/w07-tenant-catalog-enrich.md`). Второго импортёра здесь нет.

Состояние w07 на момент PR — **влит**, спрошено у владельца артефакта, а не у локального зеркала
(правило 17a):

```
$ gh pr list --state all --limit 100 --json number,title,state,headRefName
#74 MERGED  feat/day16-tenant-catalog-enrich  (w07-tenant-catalog-enrich)
#78 MERGED  feat/day16-deploy-catalog-enrich  (d07-deploy-catalog-enrich)
```

Поэтому, как и просит бриф, каталог ССЫЛАЕТСЯ на результат w07: строка «Товар магазина» несёт
«обновлено из WB <дата>», прочитанную из `product_marketplace_link` (`linked_at`, таблица w07).
Там, где обогащение не запускалось, строки нет — выдуманной даты не появляется. Кадр
`09-catalog-enriched-from-wb.png`, замер — п. 7 ниже.

## Замеры (правило 18f) — стенд `upready_store_w14`

Стенд: копия `upready_store_w12` (`createdb -T`), нативный Postgres `127.0.0.1:5433`,
бэкенд `medusa develop` на `:9044`, панель `vite` на `:5194`, тенант `cherkashino`
(`ten_01M2KB5W7R2WRXFJX1F25KCJ8P`). Докера и VM не запускалось (приказ 2026-09-15 22:05).

### 1. Юнит-тесты

```
$ cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules \
    ./node_modules/.bin/jest --silent --runInBand --forceExit
PASS src/modules/marketplace/__tests__/catalog.unit.spec.ts
PASS src/modules/marketplace/__tests__/link-plan.unit.spec.ts
Test Suites: 65 passed, 65 total
Tests:       799 passed, 799 total
rc=0
```

Из них новых: `catalog.unit.spec.ts` (17) и `link-plan.unit.spec.ts` (6). Три исхода связывания
покрыты в обоих файлах; в `link-plan` дополнительно — «ручную не переписываем», «свою устаревшую
удаляем», «ручную на ставшей неоднозначной карточке не трогаем».

Остальные ворота:

```
$ corepack pnpm check:backend-build   → Backend build completed successfully (10.85s), rc=0
$ corepack pnpm check:backend-fixtures → rc=0
$ cd apps/backend && ./node_modules/.bin/tsc --noEmit → rc=0, вывод пуст
$ cd apps/backend && ./node_modules/.bin/medusa lint  → ✖ 95 problems (0 errors, 95 warnings)
$ cd apps/tenant-panel && ./node_modules/.bin/tsc --noEmit → rc=0, вывод пуст
$ cd apps/tenant-panel && ./node_modules/.bin/eslint src   → 24 problems (0 errors, 24 warnings)
```
Из 95 предупреждений бэкенда ДВА принадлежат этой задаче — обе приёмочные фикстуры бросают
`Error` вместо `MedusaError` (`w14-ambiguous-article.ts:41`, `w14-stand-owner-password.ts:28`).
Это тот же класс, что у всех 13 фикстур в каталоге до них: правило `@medusajs/use-medusa-error-not-
generic-error` про HTTP-статусы маршрутов, а `medusa exec`-скрипт HTTP не отвечает. Ни одного
предупреждения в файлах модуля, маршрутов и панели (`grep` по выводу линтеров — 0 совпадений).

### 2. Четыре счётчика и их сумма

```
$ curl -s -H "authorization: Bearer <token владелицы>" \
    http://127.0.0.1:9044/tenants/marketplaces/catalog | jq '{counts, stored, summary}'
counts: {"linked":2,"needs_choice":0,"not_found_in_shop":423,"missing_on_marketplace":34,
         "total":459,"accounted_for":459}
stored: {"cards":425,"offers":11819,"links":2,"variants":36}
summary: Связано 2 из 459 артикулов. Требует выбора: 0, нет в магазине: 423, нет на площадке: 34.
```

**Арифметика: 2 + 0 + 423 + 34 = 459 = total.** Она же сходится со стороны данных:

```sql
-- различных артикулов у карточек
select count(distinct vendor_code) from mp_product;                          -- 425
-- SKU живых вариантов тенанта
select count(distinct lower(btrim(v.sku)))
from product_variant v
where v.deleted_at is null and v.sku is not null
  and v.product_id in (select product_id from tenant_tenant_product_product
                       where tenant_id='ten_01M2KB5W7R2WRXFJX1F25KCJ8P' and deleted_at is null); -- 36
-- пересечение (артикул есть и там и там)                                     -- 2
-- 425 + 36 − 2 = 459
```

### 3. Три исхода на живых строках

«Требует выбора» на живом каталоге недостижим наивно: `product_variant.sku` несёт уникальный индекс
по живым строкам (`CREATE UNIQUE INDEX "IDX_product_variant_sku_unique" ON product_variant (sku)
WHERE deleted_at IS NULL`, замерено на стенде) — это и записано в памяти w12 как «честный ноль».
**Это не так:** индекс регистро-ЗАВИСИМЫЙ, а сопоставитель складывает регистр (`link.ts`), поэтому
«Сбитень» и «сбитень» — две законные строки ОДНОГО артикула. Каталог приходит в это состояние сам в
день, когда кто-то наберёт артикул строчными. Фикстура стенда делает ровно это:

```
$ W14_TWIN_OF=Сбитень W14_VARIANT_SKU=HOODIE-M \
    npx medusa exec ./scripts/fixtures/w14-ambiguous-article.ts
w14-ambiguous-article: variant_01M2KB43X2E5V96SJXJ6WKZHKF (HOODIE-M) -> sku "сбитень",
  twin of "Сбитень". Undo: W14_UNDO=1 W14_VARIANT_ID=… W14_RESTORE_SKU=HOODIE-M

$ curl -s -X POST …/tenants/marketplaces/catalog/auto-link
wb:   {"cards":423,"linked":1,"not_found":421,"needs_choice":1,
       "created":0,"updated":1,"removed":1,"kept_manual":0}
ozon: {"cards":2,"linked":0,"not_found":2,"needs_choice":0,…}
```

`removed: 1` — это и есть починка: карточка 71853946 стала неоднозначной, и автосвязка СНЯЛА свою
устаревшую связь вместо того, чтобы оставить её висеть. После этого:

```
counts: {"linked":1,"needs_choice":1,"not_found_in_shop":423,"missing_on_marketplace":33,
         "total":458,"accounted_for":458}       (1 + 1 + 423 + 33 = 458)
Сбитень      -> needs_choice / ambiguous, кандидатов 2, связи нет
Дегельминтик -> linked, matched_by=vendor_code
```

Кадры: `01-catalog-linked.png` (авто), `03-catalog-not-found.png` (не найдено, 423),
`02-catalog-needs-choice.png` (неоднозначно), `04-catalog-missing-on-mp.png` (нет на площадке),
`08-manual-link-dialog.png` (диалог выбора товара).

**Ручная связь и её защита от импорта:**

```
$ curl -s -X POST …/catalog/links -d '{"marketplace":"wb","external_id":"71853946",
      "variant_id":"variant_01M2KB43X2E5V96SJXJ6WKZHKF"}'
HTTP 201  matched_by: manual, replaced: null

# привязываем вручную карточку, которую правило само связывает, к ДРУГОМУ товару:
$ curl -s -X POST …/catalog/links -d '{"marketplace":"wb","external_id":"71995339",
      "variant_id":"variant_01M2KB43X1BBZ8RX56RYZDRV0F"}'
HTTP 200  matched_by: manual, replaced: vendor_code

$ curl -s -X POST …/catalog/auto-link
wb: {"created":0,"updated":0,"removed":0,"kept_manual":1}

$ psql … -c "select external_id, matched_by, variant_id from mp_link where deleted_at is null"
71853946|manual|variant_01M2KB43X2E5V96SJXJ6WKZHKF
71995339|manual|variant_01M2KB43X1BBZ8RX56RYZDRV0F
```

Выбор человека пережил автосвязку: `updated: 0`, `kept_manual: 1`, обе строки на месте.

**Отвязка:**

```
$ curl -s -X DELETE …/catalog/links/mplink_01M2KR1RV464BSPN0NNDZMPJP6
{"id":"mplink_…","object":"mp_link","deleted":true,"matched_by":"manual"}   HTTP 200
```

### 4. Состояние «0 из N» (связи удалены, карточки на месте)

```
counts: {"linked":0,"needs_choice":2,"not_found_in_shop":423,"missing_on_marketplace":33,
         "total":458,"accounted_for":458}
stored: {"cards":425,"offers":11819,"links":0,"variants":36}
summary: Сопоставление не сработало: 0 из 425. Проверено: карточки — mp_product
  (tenant_id=ten_01M2KB5W7R2WRXFJX1F25KCJ8P); варианты магазина — product_variant через
  tenant_tenant_product_product (tenant_id=…); связи — mp_link (tenant_id=…).
  Правило сопоставления: /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/
  feat/day16-mp-catalog-link/apps/backend/src/modules/marketplace/link.ts.
```

Кадр `05-catalog-zero-of-n.png` — абсолютный путь виден в тексте на экране.

### 5. `matched_by` в БД

```sql
$ psql -h 127.0.0.1 -p 5433 -d upready_store_w14 \
    -c "select matched_by, count(*) from mp_link where deleted_at is null group by 1;"
 matched_by  | count
-------------+-------
 manual      |     1      -- в момент демонстрации ручного выбора
 vendor_code |     1
```

Финальное состояние стенда (после восстановительной автосвязки): `vendor_code | 1`.

### 6. Проектор после переключения на `autoLink`

```
$ MP_TENANT=cherkashino npx medusa exec ./src/scripts/mp-project.ts   → rc=0
[marketplace] projection wb / ten_…: 12363 rows. Связано 1 из 423. Не найдено: 421, требует выбора: 1.
mp:project: wb succeeded — products 423, offers 11816, …, links 1
mp:project: ozon succeeded — products 2, offers 3, …, links 0
```

### 7. Ссылка на результат w07 («обновлено из WB <дата>»)

w07 запущен на этом же стенде, чтобы строку было на чём показать:

```
$ TENANT_HANDLE=cherkashino DRY_RUN=true  npx medusa exec ./src/scripts/catalog-enrich-from-wb.ts
  → rc=0, «связей создано 3 … » — и НИ ОДНОЙ строки в БД (dry-run честный):
    select count(*) from product_marketplace_link where deleted_at is null;  → 0

$ TENANT_HANDLE=cherkashino APPLY=true ONLY=titles,prices     npx medusa exec ./src/scripts/catalog-enrich-from-wb.ts     → rc=0
  catalog:enrich-from-wb: связей создано 3, обновлено 0, без изменений 0.
  заголовки 3; цены 3; характеристики 0; отзывы 0; фото 0.
    select count(*), max(linked_at) from product_marketplace_link …  → 3 | 2026-09-16 10:51:00+08
```

После этого каталог показывает происхождение содержимого и нулевое расхождение цены:

```
stored: {"cards":425,"offers":11819,"links":1,"variants":36,"enriched":3}
строка «Дегельминтик»: товар «Антипаразитарный комплекс сбор от паразитов»,
  enriched: {"marketplace":"wb","external_id":"71995339","matched_by":"vendor_code",
             "linked_at":"2026-09-16T02:51:00.012Z"}
цена: {"shop":762.5,"mp":762.5,"abs":0,"pct":0,"highlighted":false}
```

Кадр `09-catalog-enriched-from-wb.png`: под названием товара стоит «обновлено из WB 16.09.2026»,
цена «762,5 RUB / 762,5 RUB · 0 RUB (0 %)» и НЕ подсвечена. Кадры `01`–`08` сняты ДО этого
прогона — там расхождение цены ещё было, и подсветка порога видна.

`ONLY=titles,prices` выбран сознательно: полный прогон качает 50 фотографий с CDN Wildberries, а
для проверки этой строки достаточно связей и цен. Фото магазина остались 3 против 30 у площадки —
это расхождение и видно в кадре.

### 8. Кадры экрана

Абсолютные пути (PNG вне git):

- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-catalog-link/artifacts/docs/w14-mp-catalog-link/01-catalog-linked.png`
- `…/02-catalog-needs-choice.png`
- `…/03-catalog-not-found.png`
- `…/04-catalog-missing-on-mp.png`
- `…/05-catalog-zero-of-n.png`
- `…/06-marketplaces-key-states.png` — карточка WB, ключ СОХРАНЁН: «только чтение»
- `…/06b-ozon-no-key.png` — карточка Ozon, ключа НЕТ: «Права ключа — —» и строка о хранении
- `…/08-manual-link-dialog.png`
- `…/09-catalog-enriched-from-wb.png` — «обновлено из WB 16.09.2026», расхождение цены 0

Боковая навигация с разделом «Маркетплейсы» и подпунктами видна на каждом кадре.

## Что НЕ сделано и почему

- **Ozon-карточек на стенде всего 2, и обе фикстурные.** Ключа Ozon у магазина нет (это записано
  ещё в w12), поэтому сторона Ozon на экране проверена структурно (строка на площадку, свои
  расхождения), но не на объёме живых данных. Появится ключ — экран заполнится без правок кода.
- **Остаток магазина на стенде — 241 000 000 шт** по каждому варианту: демо-сид кладёт 1 000 000 в
  каждую из 241 локации. Число честное (сумма по `inventory_level`), подсказка называет источник;
  на реальном каталоге владелицы оно будет осмысленным.
- **Geist не применён**: панель — копия Medusa Admin 2.19 на `@medusajs/ui`, Geist в зависимостях
  нет. Расхождение с каноном 27 зафиксировано ещё в отчётах w01 и w12; ввоз всей дизайн-системы
  ради одного экрана сделал бы его непохожим на двадцать соседних. Решено так же, как там.
- **Живой хост не трогался.** Деплой не входит в задачу.

## Как приёмщику проверить за 10 минут

```bash
cd /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-catalog-link

# 1. Свой стенд (копия базы w12, чтобы не трогать чужую)
/opt/homebrew/opt/libpq/bin/createdb -h 127.0.0.1 -p 5433 -T upready_store_w12 upready_store_acc14
sed -E 's#^DATABASE_URL=.*#DATABASE_URL=postgres://ivanprotsko@127.0.0.1:5433/upready_store_acc14#;
        s#^DB_NAME=.*#DB_NAME=upready_store_acc14#; s#^PORT=.*#PORT=9044#' \
  /Users/ivanprotsko/upready/projects/upready-store/apps/backend/.env > apps/backend/.env
printf 'VITE_MEDUSA_BACKEND_URL=http://localhost:9044\n' > apps/tenant-panel/.env

# 2. Поднять
(cd apps/backend && ./node_modules/.bin/medusa develop &)     # :9044
(cd apps/tenant-panel && ./node_modules/.bin/vite --port 5194 --strictPort &)

# 3. Пароль владелице стенда
cd apps/backend && W14_OWNER_EMAIL=owner@cherkashino.example \
  W14_OWNER_PASSWORD=<свой> npx medusa exec ./scripts/fixtures/w14-stand-owner-password.ts

# 4. Открыть http://localhost:5194 → войти → «Маркетплейсы» в боковой навигации → «Каталог».
#    Сложить четыре счётчика вкладок — должно совпасть со строкой «Сходимость вкладок».
# 5. «Подключение площадок» → карточка Ozon: «Права ключа — —» и строка о хранении ключа.
# 6. Третий исход: фикстура w14-ambiguous-article.ts (см. выше) → «Связать всё по артикулу»
#    → вкладка «требует выбора» → «Выбрать товар» → связать → повторная автосвязка не перезапишет.
# 7. Остановить свои серверы по порту: /usr/sbin/lsof -t -nP -iTCP:9044 -sTCP:LISTEN | xargs kill
```

## Экономия

- **Скрипт вместо раундов вручную.** Кадры экрана снимает один скрипт на Playwright
  (`shot.mjs` в скретчпаде сессии) с планом «имя кадра → маршрут + подготовка»: логин один раз,
  8 кадров, включая клики по вкладкам и открытие диалога. Ручного кликанья — ноль; пересъёмка
  после правки стоит одну команду. Playwright взят из `apps/storefront` через `createRequire`,
  ставить ничего не пришлось.
- **Тест вместо раунда критика.** Три исхода связывания и защита ручного выбора закрыты юнитами
  (21 тест), а не «посмотрите на экран». Дефект перезаписи ручной связи нашёлся при ЧТЕНИИ кода
  проектора и был бы невидим на экране: строка остаётся правильной формы, меняется только
  `product_id` (родня 20a). Тест `link-plan.unit.spec.ts` держит это навсегда.
- **Чистое ядро вместо экранной логики.** Вся арифметика вкладок и расхождений — чистые функции;
  экран их только рисует. Поэтому проверка «четыре счётчика дают total» стоит одного `expect`,
  а не запуска стенда.
- **Сабагентов не запускал** (соло-режим задачи), Workflow не использовал: работа не разбивалась
  на независимые ветки, а фан-аут на один экран + один модуль дороже, чем сделать самому.
- **Что автоматизировал бы в следующий раз.** Подъём стенда «копия базы + .env + два сервера +
  пароль владелицы + токен» повторялся в каждой задаче волны (w12, w15, w16, w18, w14) — это
  готовый скрипт `scripts/stand-up.mjs <db-template> <port>`, который печатает токен и адреса.
  Сейчас каждый воркер собирает это заново из `.env` главного чекаута и фикстуры паролей,
  причём фикстура w13 зашивает адрес владельца, которого на стенде w12 нет (я на этом потерял
  один круг: `success: false` и 401 на входе — поэтому и появилась
  `w14-stand-owner-password.ts` с адресом во входных данных).
