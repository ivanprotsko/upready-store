# d07-deploy-catalog-enrich — обогащение каталога Оксаны Черкашиной на ЖИВОМ сайте

Отчёт написан 2026-09-16 07:01 WITA. Часы хоста Contabo — CEST (UTC+2) = WITA минус 6 часов;
окно прогона на хосте 00:38…01:00 CEST = **06:38…07:00 WITA**. Логи Medusa внутри контейнера
пишутся в UTC (на два часа раньше CEST) — отсюда метки `22:4x` в `backend-boot.log`.

**Итог: задеплирован `017a2318` (11 продуктовых PR, включая w07), и на живом магазине
`cherkashino.shipshift.dev` 20 товаров получили заголовки, цены, характеристики, отзывы и фото
с карточек Wildberries. Обложка не сдвинулась НИ У ОДНОГО из 151 товара базы, новых товаров 0,
удалено 0. Повторный `--apply` на проде дал нули. Приказ Ивана от 04:44 WITA исполнен целиком.**

## 1. Что задеплировано

| | |
|---|---|
| Работало до деплоя (образы `:d06-new`, подняты 00:20 WITA) | `25bc1ec2` (отчёт `d06-deploy-mt-6/report.md`) |
| Задеплировано (`git rev-parse --short origin/dev` в 06:39 WITA) | **`017a2318`** |
| Коммитов между ними | 38 |
| Файлов изменено | 449 |
| Продуктовых PR | **11**: #64 b11, #65 b13, #66 b12, #67 b14, #68 b15, #69 b08, #70 b10, #71 w01, #72 w02, #73 w10, **#74 w07** |

**Находка о состоянии хоста ДО работы.** На хосте лежали образы `mt-*:latest`, собранные
2026-09-15 19:11…19:14 CEST (= 01:11…01:14 WITA) — то есть уже ПОСЛЕ отчёта d06. Но `docker inspect`
показал, что контейнеры работали на `:d06-new` (`1be11f635817` / `05ef4c8e7389` / `4e53775c7da0`,
старт 16:20 UTC): **та сборка была сделана и НЕ поднята**. Живой код до меня — `25bc1ec2`, а не то,
что несли теги `latest`. Поэтому «предыдущий sha» взят из отчёта d06 и подтверждён `docker inspect`,
а не по тегу.

Как и в волнах 3–6, на хост уехало дерево ровно `origin/dev`, выгруженное
`git archive origin/dev | tar -x` (5784 файла), а не рабочий каталог.

## 2. Дампы БД — до и после

| Когда | Путь | Размер |
|---|---|---|
| **ДО всего** (06:39 WITA) | `/opt/upready-store/backups/medusa_mt-pre-d07-20260916-003912.dump` | **5 726 364 байта** |
| ПОСЛЕ (06:59 WITA) | `/opt/upready-store/backups/medusa_mt-post-d07-20260916-005924.dump` | 5 759 249 байт |

Оба `docker exec mt-postgres pg_dump -U medusa -Fc medusa_mt`, оба rc=0. Роли `postgres` на хосте
нет — находка волны 3, соблюдена.

**Дамп «до» проверен на читаемость, а не только на размер.** `pg_restore -l` на самом хосте дал `0` —
но это не «дамп пуст», а отсутствие бинаря (`which pg_restore` → rc=1). Замер изнутри контейнера:

```
docker exec -i mt-postgres pg_restore -l < …pre-d07….dump   → rc=0, объектов 1193, stderr пуст
```

Прирост 32 885 байт — это ровно то, что записало обогащение (п. 5).

## 3. Датасет на хосте — md5 по всей цепочке

`artifacts/docs/w07-tenant-catalog-enrich/dataset.json`, 65 485 байт:

```
локально                                    a811bcfc6c033109aa570ebc68d6bb27
scp → /opt/upready-store/d07/dataset.json   a811bcfc6c033109aa570ebc68d6bb27
docker cp → mt-backend:/tmp/d07-dataset.json a811bcfc6c033109aa570ebc68d6bb27   (65485 байт)
```

Ключ WB на хост НЕ ставился и ни одного обращения к Wildberries с хоста не сделано: при `IMPORT_PATH`
скрипт зеркало не читает вовсе. Датасет несёт только публичные данные карточек (проверка w01/w07:
`eyJhbGci` — 0 вхождений).

## 4. Сборка и подъём

- Liveness-проба: `ssh rc=0` (и по алиасу, и по `root@84.46.251.149` с ключом `id_ed25519_contabo`).
- Env `/opt/upready-store/mt/deploy/mt/shipshift.env` **не тронут и явно исключён из rsync**;
  md5 `b788f1886315a512485e0515aeb8fb53` до и после — тот же, что в волнах 2–6.
- `rsync -az` без `--delete`: rc=0, 5784 файла, 151 205 249 байт передано.
- Сборка `docker compose -p mt build backend storefront panel`, лог на хосте
  `/opt/upready-store/mt-build-d07-20260916-004031.log`. Три образа `Built`, **`failed to solve` = 0**.
- **Гвард f17 отработал:** `verify-runtime-modules: 367 boot modules required, all imports resolve`
  (в d06 было 333 — эта волна добавила 34 boot-модуля).
- **Проверка `sharp` в новом образе ДО `up -d`:**
  `docker run --rm --entrypoint node mt-backend:latest -e 'require("sharp")'` → **`sharp OK 0.35.4`, rc=0**.
- Точка отката сохранена и не перетёрта: `:d06-new` = ровно те образы, что обслуживали платформу до
  деплоя. Новые помечены `:d07-new`. Ничего не удалял, не пруинил, `down`/`stop`/`rm` не делал.
- `docker compose up -d --no-build`: rc=0, `mt-backend Recreated → Healthy` **с первого раза**,
  откат не потребовался.

### Миграции

Впервые за день миграции реально применились — их принёс w07 и соседние пачки
(`backend-boot.log`, 316 строк):

```
● Migrating Migration20260915201055   ✔ Migrated
● Migrating Migration20260915211004   ✔ Migrated   ← источник отзывов wb (w07)
● Migrating Migration20260915201047   ✔ Migrated
● Migrating Migration20260915211002   ✔ Migrated   ← таблица product_marketplace_link (w07)
Migrations completed
```

Ошибок уровня `error` в логе старта — **0**. Дамп снят ДО подъёма.

### Что реально крутится

| Образ | ID | Контейнер (`docker inspect -f '{{.Image}}'`) |
|---|---|---|
| `mt-backend:d07-new` = `latest` | `8f9ac472a845` | mt-backend → `8f9ac472a845` ✓ |
| `mt-storefront:d07-new` = `latest` | `7866dbe16a91` | mt-storefront → `7866dbe16a91` ✓ |
| `mt-panel:d07-new` = `latest` | `e8288eb4d79d` | mt-panel → `e8288eb4d79d` ✓ |

Сверка по ID образа, не по тегу `latest` (тег — имя, а не версия; именно на этом в п. 1 и разошлись
собранное и работающее).

## 5. Маркер «отвечает именно код w07»

w07 не добавляет HTTP-маршрута и не пишет версию в ответ, поэтому «200 на /health» здесь не
доказывает ничего. Взяты три положительных маркера, каждый с контролем.

1. **Файлы w07 в РАБОТАЮЩЕМ контейнере — 5 из 5** (`src/catalog-enrich/{apply,dataset,match}.js`,
   `src/scripts/catalog-enrich-from-wb.js`, `src/modules/marketplace-link/index.js`).
   **Контроль:** в предыдущем образе `mt-backend:d06-new` — **0 из 3**.
2. **Схема БД изменилась ровно так, как объявил w07:** миграции `20260915211002` и `20260915211004`
   применены живьём (лог старта выше), таблица `product_marketplace_link` заполняется.
3. **Самый сильный маркер: бэкенд ВЫПОЛНИЛ код w07 на живой базе.** Холостой прогон
   `catalog:enrich-from-wb` внутри `mt-backend` вернул rc=0 и осмысленную сводку по живому каталогу —
   этот код физически не мог исполниться на образе d06-new (маркер 1).

## 6. Обогащение живого каталога

### Холостой прогон (ничего не пишет — проверено)

```
docker exec -e TENANT_HANDLE=cherkashino -e DRY_RUN=true -e IMPORT_PATH=/tmp/d07-dataset.json \
  mt-backend node_modules/.bin/medusa exec ./src/scripts/catalog-enrich-from-wb.js     → rc=0

сопоставлено товаров 20, не сопоставлено 18, карточек без товара 403.
В датасете: заголовков 20, цен 20, характеристик 104, отзывов 6, фото 250.
связей создано 20, обновлено 0, без изменений 0.
заголовки 12 (без изменений 8, нет у WB 0); цены 20 (без изменений 0, нет у WB 0);
характеристики 88 (без изменений 14, новых характеристик магазина 35, не принято 0);
отзывы 6 (уже были 0); фото 162 (уже были 88, не скачались 0).
```

**Проверка, что холостой прогон действительно холостой** (в d06 `DRY_RUN=1` записал в живую базу).
Замер счётчиков базы до и сразу после холостого прогона — побайтно одни и те же числа:

```
до холостого:    links 0 | reviews_wb 0 | attrs 7 | images 427
после холостого: links 0 | reviews_wb 0 | attrs 7 | images 427
```

Здесь форма `DRY_RUN=true` — та, которую принимает код w07 (`env.DRY_RUN === "true"`), и она же стоит
в шапке самого скрипта. Плюс дефолт скрипта безвреден: без `APPLY=true` он не пишет вообще.

### Применение (первый прогон)

```
docker exec -e TENANT_HANDLE=cherkashino -e APPLY=true -e IMPORT_PATH=/tmp/d07-dataset.json \
  -e REPORT_PATH=/tmp/d07-apply-1-report.json mt-backend \
  node_modules/.bin/medusa exec ./src/scripts/catalog-enrich-from-wb.js     → rc=0, error-строк 0

связей создано 20, обновлено 0, без изменений 0.
заголовки 12 (без изменений 8, нет у WB 0); цены 20 (без изменений 0, нет у WB 0);
характеристики 76 (без изменений 26, новых характеристик магазина 35, не принято 0);
отзывы 6 (уже были 0); фото 162 (уже были 88, не скачались 0).
```

### Применение (второй прогон) — нули, идемпотентность доказана НА ПРОДЕ

```
связей создано 0, обновлено 0, без изменений 20.
заголовки 0 (без изменений 20); цены 0 (без изменений 20);
характеристики 0 (без изменений 102, новых характеристик магазина 0, не принято 0);
отзывы 0 (уже были 6); фото 0 (уже были 250, не скачались 0).
строк «[enrich] …» об изменениях: 0     error-строк: 0
```

### Состояние живой базы до и после

| | до | после |
|---|---|---|
| `product_marketplace_link` | 0 | **20** (все `matched_by = sku_nm_id`) |
| `product_review` c `source='wb'` | 0 | **6** |
| `tenant_product_attribute` тенанта | 7 | **42** (7 пресетных b04 + 35 с карточек WB) |
| `tenant_product_attribute_value` тенанта | 115 | **187** |
| `image` всего в базе | 427 | **589** (+162) |
| из них с `metadata.wb_source_url` | 0 | **162** |
| товаров в базе (всех тенантов) | 151 | **151** |

Медиа тенанта на диске: 117 МБ / 338 файлов → **130 МБ / 500 файлов** (+162 — ровно столько, сколько
записал скрипт).

### Несопоставленные 18 товаров — в отчёт, а не под ковёр

Скрипт назвал каждый: 6 товаров с числовым SKU, которого нет в зеркале кабинета
(`1268099764`, `1650264976`, `3302187378`, `3266733589`, `3501688032` + «Свечи АСД с чесноком»),
10 товаров старого магазина (`PL-09`…`PL-36`) и 2 набора магазина (`COURSE-*`), которых на WB
не существует. Это вопрос к владелице (архивные карточки / другой кабинет), не к коду.
Полный список — `apply-1-report.json` → `unmatched_products`, и он же в `dryrun.log`.

## 7. Обложка не сдвинулась — сверка с дампом «до», а не обещание

Это главное условие приказа, поэтому проверено сравнением живого состояния с дампом, снятым
до записи. Без создания баз на проде: обе таблицы вынуты из дампа в текст
(`pg_restore --data-only -t product|-t image`) и разобраны скриптом.

```
products compared:          151 (pre 151 / post 151)
products only in pre:       0    only in post: 0      ← ни один товар не создан и не удалён
thumbnail changed:          0
first image changed:        0                          ← обложка не сдвинулась НИ У ОДНОГО товара
products with FEWER images: 0
images added in total:      162
```

Второй, независимый замер по живой базе — по всем 20 связанным товарам:

```
linked_products 20 | cover_is_wb 0 | cover_is_ours 20
```

То есть первая картинка (rank 0) у всех двадцати — наша, с белым фоном; фото WB встают ПОСЛЕ неё.

## 8. Живая витрина — три страницы

Замер Chromium (Playwright 1.62.1) по `https://cherkashino.shipshift.dev/ru/products/<handle>`,
viewport 1440×1000, `networkidle`. Все три — HTTP 200.

| Товар | Заголовок на странице | Цена | Характеристики | Отзывы | Картинок в `main` |
|---|---|---|---|---|---|
| `mumie-altayskoe-…` | «Мумие алтайское очищенное натуральное 100%» | **990,00 ₽** | 9 строк | 5 из 5 · 5 отзывов | 96 |
| `multivarka-…` | **«Мультиварка для дома и авто 2 л 12 Вт/ 24 Вт/220 Вт»** (был «…12 Вт / 24 Вт / 220 Вт») | **7 333,50 ₽** | 17+ строк | 4.9 из 5 · 34 отзыва | 207 |
| `karandash-balzam-…` | **«Карандаш бальзам 2 в 1 от простуды 2 шт»** (был «Карандаш-бальзам 2 в 1 от простуды») | **573,50 ₽** | 2 строки | 5 из 5 · 1 отзыв | 73 |

Цены — ровно те, что планировал холостой прогон (`discountedPrice` карточки WB).

**Глазами проверено на кадрах** (`shots/`):
- верх страницы мумиё: новая цена 990,00 ₽, рейтинг «5 из 5 · 5 отзывов», блок «Характеристики»
  с данными WB (Упаковка — стеклянная банка, Тип подарка — продукты, Форма выпуска — паста,
  Вид экстракта — мумиё), **первой в ленте галереи стоит наша обложка с белым фоном**, фото WB — за ней;
- «Страна производства — **Россия**» — подпись выбора, а не машинный ключ `russia`;
- блок отзывов мумиё: первым стоит новый WB-отзыв «**Нина**, 14 сентября 2026 г.» с текстом
  «Достоинства: Товар пришол, качественный…», ниже — старые.

**Честная оговорка о числе отзывов на странице.** Витрина `/ru` показывает 5 отзывов, а в базе у
мумиё их 8. Это не потеря: 6 старых отзывов (`source=imported`, ввезены раньше) лежат парами ru+en,
на русской витрине видны только 3 русских — плюс 2 новых WB = 5. Проверено запросом по
`language`. По тенанту: `imported` 304, `wb` **6** — мои шесть добавлены, ни один чужой не тронут.
Замечание на будущее (не дефект этой задачи): отзывы WB ввозятся только на `ru`, на `/en` их не будет.

### Картинки отдаются

```
1789512580814-168523959__1.webp   code=200 type=image/webp bytes=60668
1789416153297-147255286__1.webp   code=200 type=image/webp bytes=75650
1789416165562-147255286__10.webp  code=200 type=image/webp bytes=61362
КОНТРОЛЬ: выдуманный файл того же вида → 404
```

Контроль обязателен: без него «200» мог бы приходить от общего обработчика, а не от реального файла.

### Кадры (PNG, вне git)

- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-catalog-enrich/artifacts/docs/d07-deploy-catalog-enrich/shots/mumie-altayskoe-ochischennoe-naturalnoe-100-cherkashino--top.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-catalog-enrich/artifacts/docs/d07-deploy-catalog-enrich/shots/mumie-altayskoe-ochischennoe-naturalnoe-100-cherkashino--full.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-catalog-enrich/artifacts/docs/d07-deploy-catalog-enrich/shots/mumie-altayskoe-ochischennoe-naturalnoe-100-cherkashino--characteristics.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-catalog-enrich/artifacts/docs/d07-deploy-catalog-enrich/shots/mumie-altayskoe-ochischennoe-naturalnoe-100-cherkashino--reviews-list.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-catalog-enrich/artifacts/docs/d07-deploy-catalog-enrich/shots/multivarka-dlya-doma-i-avto-2-l-12-vt-24-vt-220-vt-cherkashino--top.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-catalog-enrich/artifacts/docs/d07-deploy-catalog-enrich/shots/multivarka-dlya-doma-i-avto-2-l-12-vt-24-vt-220-vt-cherkashino--full.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-catalog-enrich/artifacts/docs/d07-deploy-catalog-enrich/shots/multivarka-dlya-doma-i-avto-2-l-12-vt-24-vt-220-vt-cherkashino--characteristics.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-catalog-enrich/artifacts/docs/d07-deploy-catalog-enrich/shots/karandash-balzam-2-v-1-ot-prostudy-2-sht-cherkashino--top.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-catalog-enrich/artifacts/docs/d07-deploy-catalog-enrich/shots/karandash-balzam-2-v-1-ot-prostudy-2-sht-cherkashino--full.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-catalog-enrich/artifacts/docs/d07-deploy-catalog-enrich/shots/karandash-balzam-2-v-1-ot-prostudy-2-sht-cherkashino--characteristics.png`

## 9. Health-свип

Замер ДО деплоя (`health-pre.txt`, 06:38 WITA): те же пять URL уже отдавали 200 — платформа входила
в деплой здоровой. Финальные замеры — `health-final.txt` (06:59…07:00 WITA).

| URL | код |
|---|---|
| https://shipshift.dev/health | 200 |
| https://start.upready.dev/start/onboarding | 200 |
| https://panel-store.upready.dev/ | 200 |
| https://cherkashino.shipshift.dev/ru | 200 |
| https://zolotaya-nit-1057.shipshift.dev/ru | 200 |

Пять карточек магазина клиента (handle'ы взяты из HTML живого каталога — 12 ссылок, не угаданы):
`maz-balzam-zhivichnyy`, `zubnaya-pasta-tayskaya-otbelivayuschaya-cherkashino`,
`ingalyator-portativnyy-cherkashino`, `shampun-koncentrat-dlya-bleska-tayskiy-90-gr-cherkashino`,
`zubnaya-pasta-tayskaya-s-uglem-cherkashino` — **5/5 = 200**. Контроль: выдуманный handle того же
вида → **404**.

verify-команды реестра protected-infra (`upready-store-mt-platform`): 200 / 200 / 302 ssl=0 / 200.
Соседний защищённый сервис того же хоста (`agentcreatr-tribute-webhook`) не задет:
`/health` → **200**, `POST /webhook/tribute` с пустым телом → **401** (проверка подписи жива).

Контейнеры: `mt-backend` healthy, `mt-storefront` healthy, `mt-panel` healthy, `mt-postgres` healthy
(Up 4 days — не трогал), `mt-ingress-sync` Up, `upreadystore-bot` Up.
Диск хоста: 66 ГБ свободно из 193 (66 % занято; было 64 % — прирост дали образы и 162 фото).

## 10. Находка: холостой прогон ЗАВЫШАЕТ число записей для характеристик типа `select`

Холостой прогон обещал «характеристики 88 (без изменений 14)», применение сделало
«76 (без изменений 26)». Сумма в обоих случаях 102, и второй `--apply` подтвердил конечное
состояние («без изменений 102»), так что данные верны. Но расхождение ровно 12 — и причина в коде,
`apps/backend/src/catalog-enrich/apply.ts:467-471`:

```js
if (attribute.type === "select") {
  if (options.dryRun) {
    counters.characteristics_written += 1;
    continue;          // ← выходит ДО сверки sameTypedValue(stored, typed)
  }
```

В холостом режиме значение типа `select` засчитывается как запись, не доходя до сравнения с уже
стоящим. В боевом сравнение происходит, и 12 таких значений оказались уже равными → 88→76,
14→26. Ошибка безобидна по направлению (завышает, а не занижает), но означает: **сводка холостого
прогона — не точный предпросмотр записи**. Кандидат в задачу: считать `select` так же, как остальные
типы — через `ensureChoice` в «сухом» варианте либо через сравнение с текущим значением.

## 11. Что этот отчёт НЕ доказывает

- **Экранная приёмка владелицей** — не в этой задаче. Я проверил три страницы из двадцати
  обогащённых; остальные 17 проверены только счётчиками базы и идемпотентностью.
- **Качество данных WB** (насколько верны характеристики и цены в кабинете) — вопрос к владелице.
  Скрипт переносит то, что стоит в её карточках; выброшены только пять регуляторных полей
  (НДС, ТНВЭД, номер декларации, две даты сертификата).
- **Английская витрина**: 6 отзывов WB пришли только с `language=ru`, на `/en` их не будет.

## 12. Риски и что сказать Ивану

1. **РИСК №15 «Эксплуатация» вырос.** Медиа магазина — 130 МБ / 500 файлов на одном хосте, без S3 и
   без автоматических бэкапов. Сегодня я добавил туда 162 файла: `pg_dump` спасает ссылки, но не байты
   картинок. Потеря `/opt/upready-store/media-tenants` = магазин без фотографий, восстановить неоткуда.
2. **Сборка d06 «раунда 2» не была поднята** (п. 1). Кто-то собрал образы в 01:11 WITA и оставил их
   лежать; платформа три часа обслуживала предыдущую сборку под тегом, который выглядел свежим.
   Тег `latest` не является ответом на вопрос «что работает» — только `docker inspect` контейнера.
3. **18 товаров магазина не сопоставлены с WB** (п. 6) — 6 из них с числовым SKU, которого нет в
   кабинете. Стоит спросить владелицу: архив это или второй кабинет.
4. `SMTP_HOST`/`SMTP_USER`/`SMTP_FROM` в `shipshift.env` по-прежнему отсутствуют (тянется с d06).
   Env не правил, значений не выдумывал.

## 13. Артефакты

- `report.md` — этот отчёт; `report.json` — карточка UI (в `handoff/day-2026-09-16-oksana-store/artifacts/d07-deploy-catalog-enrich/`)
- `dryrun.log` / `apply-1.log` / `apply-2.log` — полные логи трёх прогонов на живой базе
- `apply-1-report.json` / `apply-2-report.json` — машинные отчёты скрипта (в т.ч. все 18 несопоставленных)
- `backend-boot.log` — лог старта бэкенда (4 миграции, entrypoint, 0 ошибок)
- `health-pre.txt` / `health-final.txt` — свипы до и после, включая контроли
- `shots/` — 12 PNG живых страниц (вне git)
