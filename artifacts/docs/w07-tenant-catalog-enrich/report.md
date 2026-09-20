# w07-tenant-catalog-enrich — обогащение товаров тенанта `cherkashino` из зеркала Wildberries

Ветка `feat/day16-tenant-catalog-enrich`, база `dev`. Отчёт написан 2026-09-16 05:33 WITA.

Приказ Ивана (2026-09-16 04:44 WITA): «обнови на сайте тенанта информацию с товарами которые сейчас
там указаны (новые не добавляй), но заголовки, цены, характеристики и отзывы добавь, а также добавь
картинки, но сохрани наши картинки, с белым чистым фоном которые стоят первыми в качестве обложки».

## 1. Главный замер, который расходится с текстом задачи

Задача говорила: «SKU магазина — это `vendorCode` карточки WB, сопоставляй по нему». **Каталог
говорит другое, и выиграл каталог.** Каждый SKU мигрированного магазина — это `<nmID>-CHERKASHINO`:

```
sku 94372564-CHERKASHINO  ->  карточка nmID 94372564 «Мумие алтайское очищенное натуральное 100%»
                              её vendorCode — «Мумие банка», и он не совпадает ни с чем
```

Замер 2026-09-16 по 38 товарам против 423 зеркальных карточек: **20 совпали по номеру товара, 0 —
по артикулу продавца.** Правило по `vendorCode` оставлено первым в порядке (у другого магазина SKU
может быть артикулом), но каждая связь записывает, каким правилом она найдена — все 20 стоят как
`sku_nm_id`.

**По названию не сопоставляется ничего.** Совпадение по названию связало бы «Зубную пасту тайскую с
гвоздикой» с «Зубной пастой тайской от кариеса отбеливающей», и на страницу товара молча уехали бы
чужая цена, чужие характеристики и чужие отзывы. Несопоставленный товар попадает в отчёт.

## 2. Таблица сопоставления (локальный стенд)

| | Число |
|---|---|
| Товаров у тенанта `cherkashino` | 38 |
| Сопоставлено с карточкой WB | **20** (все по `sku_nm_id`) |
| Не сопоставлено товаров | 18 |
| Карточек кабинета, на которые не указывает ни один товар | 403 |
| Создано новых товаров | **0** (скрипт их не умеет) |
| Удалено чего-либо | **0** |

Несопоставленные 18 — три разные причины, все честные:

- **5 товаров с числовым SKU, которого в зеркале нет** — `1268099764`, `1650264976`, `3302187378`,
  `3266733589`, `3501688032`. Этих nmID нет ни в `wb_product` (423 карточки), ни в `wb_price` (463).
  Скорее всего карточки архивные или принадлежат другому кабинету — это вопрос к владельцу, не к коду.
- **11 товаров старого магазина** (`PL-09`…`PL-36`: шампуни, мёд, сеннол, ингалятор) — у них никогда
  не было карточки WB.
- **2 набора магазина** (`COURSE-OCHISHCHENIE-PECHENI`, `COURSE-BOX-…`) — существуют только у нас.

Полный список с названиями — `apply-3-report.json` → `unmatched_products`.

## 3. Что появилось в коде

| Файл | Что это |
|---|---|
| `apps/backend/src/modules/marketplace-link/` | модуль и таблица `product_marketplace_link` (tenant_id, product_id, variant_id, marketplace, external_id, vendor_code, matched_by, linked_at) + миграция `Migration20260915211002.ts`. Не внутри модуля `wb`: тот — зеркало одного маркетплейса, а связь принадлежит каталогу магазина и называет маркетплейс колонкой, чтобы второй не стоил новой таблицы |
| `apps/backend/src/catalog-enrich/match.ts` | сопоставление (чистое, без БД) |
| `apps/backend/src/catalog-enrich/wb-source.ts` | чтение карточки: характеристики, цена покупателя, фото, отзывы |
| `apps/backend/src/catalog-enrich/images.ts` | ключ фото `wb:<nmID>:<позиция>` и план галереи (чистый) |
| `apps/backend/src/catalog-enrich/attributes.ts` | ключ характеристики из русского названия через кодек репозитория |
| `apps/backend/src/catalog-enrich/dataset.ts` | формат датасета + проверка при импорте |
| `apps/backend/src/catalog-enrich/build.ts` | сборка датасета из зеркала (эта половина на живом хосте не работает и не нужна) |
| `apps/backend/src/catalog-enrich/apply.ts` | запись пяти разделов в каталог |
| `apps/backend/src/scripts/catalog-enrich-from-wb.ts` | CLI; `apps/backend/package.json` → `catalog:enrich-from-wb` |
| `apps/backend/src/modules/product-review/models/product-review.ts` | источник `wb` в `REVIEW_SOURCES` + миграция `Migration20260915211004.ts` |
| `apps/tenant-panel/src/hooks/api/reviews.tsx`, `routes/reviews/labels.ts` | тип `ReviewSource` и метка «С карточки Wildberries» (иначе `Record<ReviewSource, string>` не компилируется — правило 20, закрыт класс, а не место) |
| `apps/backend/src/product-attributes-fill/parse-characteristics.ts` | `readCharacteristics` научен форме WB: `value` — **массив** даже для одного значения |
| `apps/backend/src/product-csv/catalog.ts` | `readPrices` и `GraphPrice` экспортированы для переиспользования |

Переиспользовано, а не переписано: `parseCharacteristics`/`ensureDefaultSchema`/`ensureChoice`
(b04), `pricePayload` и `readPrices` (t14), `fetchImage` + `uploadFilesWorkflow` (CSV-импорт),
`transliterate` (`product-csv/slugify`), зеркала `wb_*` (w01).

## 4. Решения, которые стоит проверить приёмщику

**Цена = `discountedPrice`.** `GET /api/v2/list/goods/filter` даёт три числа на размер: `price` (до
скидки продавца), `discountedPrice` (что видит покупатель на карточке) и `clubDiscountedPrice`
(только подписчику WB Клуба). Взят `discountedPrice`: клубная цена подрезала бы магазин для всех, а
`price` покупатель WB не видит никогда. Замер по зеркалу: nmID 94372564 — `price` 1980, `discount`
50, `discountedPrice` 990. У карточки с разными ценами по размерам берётся минимум — то самое «от».

**Фото — размер `big`.** Замер 2026-09-16 по nmID 94372564: `big` — 200 и 101 528 байт,
`c516x688` — 60 992 байта, ключ `hq`, который несут некоторые карточки, отвечает **404**. URL берётся
из зеркала и никогда не конструируется из номера: хост корзины (`basket-05`, `basket-15`) — часть
ответа WB, собранный вручную адрес отдаёт 404 (проверено).

**Дедуп фото — по паре (карточка, позиция), не по байтам.** Миграция 2026-09-12 уже скачала часть
фото WB и сохранила как `<метка>-<nmID>__<n>.webp` — 25 товаров из 38 такие. По дороге их
перекодировали: nmID 219762882 фото 1 — 107 144 байта у WB и 90 614 байт в каталоге, SHA-256 разные,
**поэтому хэш содержимого не доказывает ничего**. Идентифицирует фото пара, которую имя файла уже
несёт: карточка и позиция в ней. Добавленные картинки пишут `metadata.wb_source_url` и
`metadata.wb_photo_key`, так что ключ переживёт имя файла, выбранное провайдером.

**Обложка не двигается.** `updateProductsWorkflow` заменяет список картинок целиком, поэтому в
payload идут существующие URL **в их текущем порядке**, а новые — после. `thumbnail` в апдейт не
входит вообще, поэтому выбранная владельцем обложка сдвинуться не может.

**Отзыв без текста не переносится; отзыв без оценки — тоже.** WB разрешает оценить, ничего не
написав: 44 из 123 зеркальных отзывов такие, а `product_review.body` — NOT NULL. Отдельно:
`Number(null)` — это 0, и наивный clamp записал бы отзыв без оценки **одной звездой** — худшим
значением шкалы, выдуманным кодом и навсегда попавшим в средний балл товара. Это поймал собственный
юнит-тест модуля **до первого прогона**; теперь такой отзыв не импортируется и считается отдельно
(правило 20a). В текущем зеркале отзывов без оценки нет (замер: 1→7, 2→3, 3→3, 4→9, 5→101).

**Характеристики.** Имена карточки сперва проходят через пресет магазина (b04), поэтому «Страна
производства» ложится в существующую характеристику `country`, а не во вторую такую же. Всё, чему в
пресете места нет («Форма выпуска», «Упаковка», «Объем чаши»), становится характеристикой магазина с
русским названием WB, транслитерированным ключом и типом `text`, показывается на странице товара и не
идёт в фильтры — свободный текст дал бы по одному чипу на товар. Выброшены пять регуляторных полей,
которые покупатель не читает: «Ставка НДС», «ТНВЭД», «Номер декларации соответствия» и две даты
сертификата.

**104 характеристики в датасете против 102 записанных — не потеря.** Две карточки
(`svechi-ot-varikoza-s-kashtanom`, `maz-ot-varikoza-s-kashtanom`) несут одновременно «Показания к
применению» и «Действие»; оба имени пресет отображает в `purpose`, и выигрывает лучше ранжированное —
это документированное поведение `parseCharacteristics`, а не отброшенное значение (счётчик «не
принято» = 0).

## 5. Замеры на локальном стенде

Стенд: нативный Postgres `127.0.0.1:5433`, база `upready_store_w07` (копия
`upready_store_cherkashina` — 38 товаров тенанта `cherkashino`), зеркало WB перенесено из
`upready_store_w01` (423 карточки / 463 цены / 123 отзыва, `fetched_at` 2026-09-15T20:13:20Z) с
перевешиванием `tenant_id`. Бэкенд `:9077`, витрина `:8077`, товар открывается на
`http://cherkashino.localhost:8077`. Живой хост не тронут; Docker не запускался.

**pg_dump до `--apply`:**
`file:///Users/ivanprotsko/upready/backups/w07-upready_store_w07-before-apply.dump` (2,3 МБ) и его
чистая копия бинарями PG16 `file:///Users/ivanprotsko/upready/backups/w07-upready_store_w07-before-apply-pg16.dump`
(первый снят pg_dump 17 против сервера 16 и восстанавливается с одной игнорируемой ошибкой
`transaction_timeout`).

### Dry-run

```
TENANT_HANDLE=cherkashino DRY_RUN=true npx medusa exec ./src/scripts/catalog-enrich-from-wb.ts

сопоставлено товаров 20, не сопоставлено 18, карточек без товара 403.
В датасете: заголовков 20, цен 20, характеристик 104, отзывов 6, фото 250.
1 отзывов WB несут только оценку без текста — они не переносятся.
связей создано 20, обновлено 0, без изменений 0.
заголовки 12 (без изменений 8, нет у WB 0); цены 20 (без изменений 0, нет у WB 0);
характеристики 102 (без изменений 0, новых характеристик магазина 35, не принято 0);
отзывы 6 (уже были 0); фото 162 (уже были 88, не скачались 0).
```

### `--apply` (первый)

```
TENANT_HANDLE=cherkashino APPLY=true EXPORT_PATH=artifacts/.../dataset.json \
  REPORT_PATH=artifacts/.../apply-1-report.json npx medusa exec ./src/scripts/catalog-enrich-from-wb.ts
rc=0

связей создано 20, обновлено 0, без изменений 0.
заголовки 12 (без изменений 8); цены 20; характеристики 102 (новых характеристик магазина 35,
не принято 0); отзывы 6; фото 162 (уже были 88, не скачались 0).
```

### `--apply` (второй и третий) — нули

```
связей создано 0, обновлено 0, без изменений 20.
заголовки 0 (без изменений 20); цены 0 (без изменений 20);
характеристики 0 (без изменений 102, новых 0, не принято 0);
отзывы 0 (уже были 6); фото 0 (уже были 250, не скачались 0).
```

Датасет, собранный третьим прогоном, побайтно совпадает с закоммиченным, кроме поля
`generated_at`.

### Обложка: сверка снимка «до» с состоянием «после»

Дамп до `--apply` восстановлен в отдельную базу `upready_store_w07_before` и сопоставлен построчно:

```
товаров сверено: 38
сменился thumbnail: 0
сменилась первая картинка (обложка): 0
товаров, где картинок стало меньше: 0
картинок добавлено всего: 162
заголовков изменилось: 12
```

### Состояние БД после

```
product_marketplace_link:     20 строк, все matched_by = sku_nm_id
product_review:               6 строк, source=wb, status=published, language=ru
tenant_product_attribute:     42 (было 0; 7 пресетных + 35 из карточек WB)
tenant_product_attribute_value: 102
image:                        505, из них 162 несут metadata.wb_source_url
цена RUB 94372564-CHERKASHINO: 2710 -> 990; валют у варианта: 2 (rub, usd — usd не тронут)
цена RUB 219762882-CHERKASHINO: 723 -> 1109.5 (WB discountedPrice 1109.5)
```

### Витрина: до / после, три товара

Снято headed Playwright на `http://cherkashino.localhost:8077/ru/products/<handle>`, полностраничные
PNG. `before-*` сняты с бэкендом, подключённым к `upready_store_w07_before`.

| Товар | Заголовок | Строк характеристик | Отзывов | Картинок галереи | Первая картинка (обложка) |
|---|---|---|---|---|---|
| `mumie-altayskoe-…` | не изменился | 0 → **7** | 0 → **2** | 53 → **95** | **не изменилась** |
| `multivarka-dlya-doma-i-avto-…` | «Мультиварка для дома и авто 12 Вт / 24 Вт / 220 Вт» → «Мультиварка для дома и авто 2 л 12 Вт/ 24 Вт/220 Вт» | 0 → **17** | 0 → **3** | 122 → **206** | **не изменилась** |
| `karandash-balzam-2-v-1-…` | «Карандаш-бальзам 2 в 1 от простуды» → «Карандаш бальзам 2 в 1 от простуды 2 шт» | 0 → **1** | 0 → **1** | 72 → 72 (все фото карточки уже были в каталоге — дедуп сработал) | **не изменилась** |

Файлы (вне git, PNG):

- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-tenant-catalog-enrich/artifacts/docs/w07-tenant-catalog-enrich/before-mumie-altayskoe-ochischennoe-naturalnoe-100-cherkashino.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-tenant-catalog-enrich/artifacts/docs/w07-tenant-catalog-enrich/after-mumie-altayskoe-ochischennoe-naturalnoe-100-cherkashino.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-tenant-catalog-enrich/artifacts/docs/w07-tenant-catalog-enrich/before-multivarka-dlya-doma-i-avto-2-l-12-vt-24-vt-220-vt-cherkashino.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-tenant-catalog-enrich/artifacts/docs/w07-tenant-catalog-enrich/after-multivarka-dlya-doma-i-avto-2-l-12-vt-24-vt-220-vt-cherkashino.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-tenant-catalog-enrich/artifacts/docs/w07-tenant-catalog-enrich/before-karandash-balzam-2-v-1-ot-prostudy-2-sht-cherkashino.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-tenant-catalog-enrich/artifacts/docs/w07-tenant-catalog-enrich/after-karandash-balzam-2-v-1-ot-prostudy-2-sht-cherkashino.png`

Плюс пара `before/after` по `zubnaya-pasta-tayskaya-s-gvozdikoy-cherkashino` — тот случай, когда
карточка WB не несёт **ни одной** нерегуляторной характеристики и ни одного отзыва: заголовок и фото
обновились, блок характеристик не отрисован. Это правильное поведение компонента (пустой заголовок
блока хуже отсутствия блока), а не пропажа.

Глазами проверены: блок «Характеристики» (7 строк, «Страна производства — Россия», то есть подпись
выбора, а не машинное `russia`), блок «Отзывы» (сводка «5 из 5 · 2 отзыва», автор, дата, текст;
безымянный покупатель подписан «Покупатель Wildberries»), верх страницы (цена 990,00 ₽ — цена WB,
обложка на месте, галерея WB-фото после неё).

## 6. Датасет для живого хоста (задача d07)

`artifacts/docs/w07-tenant-catalog-enrich/dataset.json` — 64 КБ, 20 товаров, поля:
`version, generated_at, tenant_handle, marketplace, source, products, unmatched_products, unmatched_cards`.
Товар адресуется по `product_handle` (идентификаторы у стендов разные, handle — общий).

Секретов нет: `grep -c eyJhbGci` = 0; поиск подстрок `api_key|token|secret|password|authorization`
не даёт ничего. `git grep -n "eyJhbGci" -- .` по репозиторию НЕ пуст, но все вхождения
предсуществующие и не мои: фейковый токен в `wb/__tests__/transport.unit.spec.ts`, артефакт
`artifacts/docs/2026-09-10-mt-vendors-acceptance.md` и упоминания самой проверки в промптах
(это же зафиксировала приёмка w01).

Живой хост обогащается без ключа WB:

```
TENANT_HANDLE=cherkashino APPLY=true IMPORT_PATH=<dataset.json> \
  node_modules/.bin/medusa exec ./src/scripts/catalog-enrich-from-wb.js
```

При импорте зеркало не читается вообще, а датасет для чужого магазина отвергается по
`tenant_handle` до первой записи. **Живой хост в этой задаче не тронут** — это d07.

## 7. Аналог Ozon — не найдено (замер, не догадка)

Задача просила назвать методы Ozon Seller API для тех же пяти наборов данных, со ссылками из
`https://docs.ozon.ru/api/seller/`. **Документация недоступна с этой машины**, тремя разными
транспортами:

```
curl https://docs.ozon.ru/api/seller/            -> 307 на .../?__rr=1 (петля, >10 переходов)
curl с User-Agent браузера и cookie-jar          -> 403, 8893 байта
Chromium (Playwright, networkidle)               -> 403, на экране «Похоже, нет соединения.
                                                    Инцидент: fab_chlg_20260915213330_01M2KFTGCDSSXWQHGRGHRK99F0»
https://api-seller.ozon.ru/swagger.json          -> 403
https://raw.githubusercontent.com/ozontech/seller-api/main/openapi.yaml -> 404
```

Писать названия методов по памяти нельзя (правило 17a: факты о чужом быстро меняющемся API берутся
из первоисточника). Поэтому здесь честно **«не найдено»**, а сам факт блокировки — вход для задачи
w10, которой предписано сохранять копии страниц документации: с этого адреса их не снять без обхода
антибота, и это надо решить до того, как кто-то начнёт писать спецификацию.

## 8. Проверки

| Проверка | Команда | Результат |
|---|---|---|
| Типы бэкенда | `cd apps/backend && npx tsc --noEmit` | rc=0 |
| Линт бэкенда | `cd apps/backend && npx medusa lint` | rc=0, 0 ошибок, 75 предупреждений — **ни одного** в `src/catalog-enrich`, `src/modules/marketplace-link`, `src/scripts/catalog-enrich-from-wb.ts` (проверено grep по логу) |
| Юнит-тесты | `cd apps/backend && npm run test:unit` | **Test Suites: 43 passed, 43 total; Tests: 477 passed, 477 total** (на базе было 42 сьюта / 471 тест; +1 сьют и +6 тестов дал `reviews.unit.spec.ts`, остальные три новых файла вошли в замер раньше) |
| Сборка как в образе | `cd apps/backend && npx medusa build --lint false` | rc=0, «Backend build completed successfully (9.14s)» |
| Фикстуры вне сборки | `cd apps/backend && npx tsc -p scripts/fixtures/tsconfig.json` | rc=0 |
| Типы панели | `cd apps/tenant-panel && npx tsc --noEmit` | rc=0 |
| Линт панели | `cd apps/tenant-panel && npx eslint src` | rc=0, 0 ошибок, 24 предупреждения (предсуществующие) |

Новые тесты (`src/catalog-enrich/__tests__/`): `match.unit.spec.ts` (сопоставление, в том числе
«по названию — никогда» и независимость от порядка страниц WB), `images.unit.spec.ts` (ключи фото,
идемпотентность плана, «план только добавляет»), `wb-source.unit.spec.ts` (форма характеристик,
цена покупателя, фото `big`, отзывы, ключ характеристики, проверка датасета),
`reviews.unit.spec.ts` (дедуп по `source_key`, правка владельца не затирается).

## 9. Что НЕ сделано и почему

- **Метка «С карточки Wildberries» в панели владельца не снята скриншотом.** Изменение — одна строка
  в `REVIEW_SOURCE_LABEL` плюс тип; покрыто `tsc --noEmit` панели. Поднимать Vite-стенд панели и
  заводить логин тенанта ради одной подписи я счёл несоразмерным; если приёмка хочет скриншот —
  скажите, сниму.
- **Английские переводы заголовков у 6 товаров устарели.** У шести товаров тенанта есть строки
  `translation` для локали `en`; базовый заголовок теперь из WB, а английский остался старым.
  Удалять переводы нельзя («ничего не удаляем»), переводить 12 новых заголовков — не эта задача.
  Русская витрина (дефолт магазина) показывает новый заголовок.
- **5 товаров с числовым SKU не обогащены** — их nmID нет в кабинете (см. §2). Это вопрос владельцу.
- **Живой хост не тронут** — по задаче это d07, датасет для него готов.
- **Ozon** — см. §7.

## 10. Как приёмщику проверить за 10 минут

```bash
cd /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-tenant-catalog-enrich

# 1. связи и результат в БД стенда
PSQL=/opt/homebrew/Cellar/postgresql@16/16.13/bin/psql
$PSQL -h 127.0.0.1 -p 5433 -U ivanprotsko -d upready_store_w07 -Atc \
  "select matched_by, count(*) from product_marketplace_link group by matched_by"
$PSQL -h 127.0.0.1 -p 5433 -U ivanprotsko -d upready_store_w07 -Atc \
  "select source, status, count(*) from product_review group by source, status"

# 2. повторный apply обязан дать нули
cd apps/backend
TENANT_HANDLE=cherkashino APPLY=true npx medusa exec ./src/scripts/catalog-enrich-from-wb.ts

# 3. тесты
npm run test:unit

# 4. витрина: поднять и открыть товар
( cd apps/backend && npx medusa develop & )
( cd apps/storefront && npx next dev -p 8077 & )
open http://cherkashino.localhost:8077/ru/products/mumie-altayskoe-ochischennoe-naturalnoe-100-cherkashino
```

`.env` бэкенда стенда указывает на `upready_store_w07`, порт 9077; витрина — 8077. Снимок «до»
лежит в базе `upready_store_w07_before`, её можно подключить тем же `.env`, чтобы увидеть, как
страница выглядела до обогащения.
