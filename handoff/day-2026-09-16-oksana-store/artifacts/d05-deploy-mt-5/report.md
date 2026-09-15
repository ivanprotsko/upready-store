# d05-deploy-mt-5 — деплой волны 5 (f12 + f18) на живой mt-хост

Время отчёта: 2026-09-15 22:46 WITA. Часы хоста Contabo — CEST (UTC+2) = WITA минус 6 часов;
окно этого прогона на хосте — 16:24…16:46 CEST = 22:24…22:46 WITA.

**Итог: задеплирован `1088507f`, 5/5 платформенных URL и 5/5 карточек магазина клиента отдают 200,
все три контейнера подняты на образах этой сборки, бэкенд стал healthy с первого раза, откат не потребовался.
#50/f12 — то, что не доехало волной 4 из-за несобираемого образа, — теперь живьём.**

## 1. Что задеплировано

| | |
|---|---|
| Предыдущий sha (волна 4, `d04-deploy-mt-4/report.md`) | `a530e50` |
| Задеплированный sha (`git rev-parse --short origin/dev`) | **`1088507f`** |
| Коммитов между ними | 27 (2 продуктовых PR + 25 штабных handoff-коммитов) |

### Продуктовое содержание волны 5

| # | Задача | Заголовок | mergedAt (UTC) |
|---|---|---|---|
| #50 | f12-owner-raw-keys | На экранах владелицы видны сырые ключи перевода и машинные значения | 2026-09-15T12:24:04Z |
| #55 | f18-f12-fixture-build | Образ бэкенда не собирается после #50: фикстура f12 в компилируемом `src/scripts` | 2026-09-15T14:20:50Z |

Зависимость задачи проверена у владельца до сборки: `gh pr list --search f18 --state merged` →
PR **#55 MERGED**, merge-коммит `1088507fab311c48a96573ecd7a1b72de595c000` (он же голова `origin/dev`).

Как и в волнах 3–4, локальный чекаут `dev` разошёлся с `origin/dev`, поэтому на хост уехало ровно дерево
`origin/dev`, выгруженное `git archive origin/dev | tar -x` (5191 файл), а не рабочий каталог.

**НЕ вошёл в эту волну: #57 b01-owner-numbers** (`mergedAt` 2026-09-15T14:39:41Z = 22:39 WITA). Снимок дерева
я снял в 22:26 WITA, PR смёржен на 13 минут позже — посреди моей сборки. Ровно тот же класс, что #50 в волне 4.
Живьём этой пачки нет; её доставка — за d06.

## 2. Все PR, смёрженные за сутки

Вывод команды из брифа (`merged:>=2026-09-15`, граница UTC) — `merged-prs.json`. **N = 25**
(13 волны 3 + 9 волны 4 + #50, #55, #57). По рабочему дню WITA к ним добавляются ещё три PR, смёрженные
до полуночи UTC (#31 t10-blog, #33 t13-customers-screen, #30 t09-reviews) — итого **28** за рабочий день.

| # | Ветка | mergedAt (UTC) | Заголовок |
|---|---|---|---|
| #29 | feat/day16-seo-redirects | 00:29:44Z | SEO магазина: мета-поля, sitemap тенанта, 301 со старых адресов (t11) |
| #34 | feat/day16-product-import | 01:17:04Z | Импорт и выгрузка каталога таблицей CSV или XLSX (t14) |
| #35 | feat/day16-product-attributes | 02:09:55Z | Произвольные характеристики товара и фильтры по ним (t15) |
| #36 | feat/day16-owner-branding | 02:24:08Z | Бренд владельца: логотип, цвета, фавикон, картинка для соцсетей (t16) |
| #38 | fix/day16-thankyou-brand | 02:51:37Z | Страница «Спасибо» показывает бренд UPREADY и чужую плашку (f01) |
| #37 | feat/day16-analytics | 02:51:53Z | Счётчики магазина и сводка продаж в панели (t17) |
| #39 | fix/day16-order-email | 02:58:34Z | Письмо о заказе не уходит, а магазин пишет «отправлено» (f02) |
| #40 | fix/day16-address-fields | 03:55:44Z | Заказ проходит без города и индекса (f04) |
| #41 | fix/day16-checkout-legal-links | 04:04:17Z | В чекауте ссылки на оферту и политику ведут на заглушки (f05) |
| #43 | fix/day16-page-markdown | 04:21:06Z | На страницах магазина таблицы выводятся сырым markdown (f07) |
| #32 | feat/day16-legal-requisites | 04:29:06Z | Реквизиты продавца подставляются в юридические тексты (t12) |
| #42 | fix/day16-guest-order-claim | 05:30:21Z | Заказ гостя не появляется в кабинете (f03) |
| #44 | fix/day16-backend-image-sharp | 06:05:16Z | Образ mt-backend не содержит sharp (f17) |
| #45 | fix/day16-shipping-names | 06:53:29Z | Способы доставки «Оксана Черкашина pickup» и «courier» (f06) |
| #46 | fix/day16-bottom-nav-mark | 06:55:16Z | В нижней навигации на телефоне логотип Medusa (f08) |
| #47 | fix/day16-new-product-404 | 07:59:50Z | Товар владелицы попадает в каталог, но его страница 404 (f11) |
| #48 | fix/day16-price-editor-currencies | 08:01:59Z | Цена в рублях: 89-я колонка, при создании поля нет (f09) |
| #49 | fix/day16-page-editor-english | 08:17:06Z | Редактор страниц магазина целиком на английском (f13) |
| #51 | fix/day16-price-save-silently-lost | 08:45:32Z | Сохранение цены молча теряет значение (f10) |
| #52 | fix/day16-no-password-reset | 08:51:05Z | На входе в панель нет восстановления пароля (f14) |
| #53 | fix/day16-overview-empty | 08:57:37Z | «Обзор» не говорит о магазине ничего (f15) |
| #54 | fix/day16-category-image-not-shown | 09:28:10Z | Картинка категории сохраняется, витрина её не показывает (f16) |
| #50 | fix/day16-owner-raw-keys | 12:24:04Z | **Сырые ключи перевода на экранах владелицы (f12)** — доставлен ЭТОЙ волной |
| #55 | fix/day16-f12-fixture-build | 14:20:50Z | **Фикстура f12 в компилируемом src/scripts (f18)** — доставлен ЭТОЙ волной |
| #57 | fix/day16-owner-numbers | 14:39:41Z | Пачка b01: двойной счёт заказов, выгрузка в USD, импорт CSV (b01) — **живьём НЕТ** |

## 3. Дампы БД — до и после

| Когда | Путь | Размер | Объектов (`pg_restore -l`) |
|---|---|---|---|
| ДО деплоя | `/opt/upready-store/backups/medusa_mt-pre-d05-20260915-162418.dump` | 5 678 771 байт | 1193 |
| ПОСЛЕ деплоя | `/opt/upready-store/backups/medusa_mt-post-d05-20260915-164600.dump` | 5 678 771 байт | 1193 |

Оба `pg_dump -U medusa -Fc` (не `-U postgres` из брифа: такой роли на хосте нет — находка волны 3), оба rc=0,
оба читаются `pg_restore -l`. Размеры совпали до байта — это согласуется с тем, что миграций в волне не было
и бэкфиллы не тронули ни одной строки (п. 5): схема и данные между двумя дампами не изменились.

## 4. Находка прогона: `rsync` без `--delete` не убирает файл, который f18 ПЕРЕНЁС

Это главное, что могло сорвать задачу, и оно не описано ни в одном предыдущем отчёте.

f18 чинит сборку **переносом** фикстур `f12-seed-test-order.ts`, `t13-seed-test-tenant.ts`,
`t17-seed-test-tenant.ts` из компилируемого `apps/backend/src/scripts/` в `apps/backend/scripts/fixtures/`.
Рецепт деплоя делает `rsync` **без `--delete`** (и правильно — `--delete` снёс бы с хоста медиа и `.env`,
см. ниже). Перенос для такого rsync — это только ПОЯВЛЕНИЕ файла на новом месте: старая копия в `src/scripts/`
на хосте остаётся, `medusa build` компилирует весь `src/`, и сборка упала бы ровно той же ошибкой TS2322,
несмотря на смёрженный f18.

Замер после rsync (до сборки):

```
ls /opt/upready-store/mt/apps/backend/src/scripts/ | grep -E "f12-seed|t13-seed|t17-seed"
f12-seed-test-order.ts
t13-seed-test-tenant.ts
t17-seed-test-tenant.ts
```

Восстановимость доказана ДО удаления (правило 9): md5 всех трёх копий на хосте бит-в-бит совпали с блобами
коммита `ba126e89` (`git show ba126e89:apps/backend/src/scripts/<файл>`):

```
3a6096a541ecc11f1a28b49b08bfa616  f12-seed-test-order.ts
1efdca09d944e11b2b368c2437c038a1  t13-seed-test-tenant.ts
555c0a77cb50f7e75f29433b186bf617  t17-seed-test-tenant.ts
```

После этого три файла удалены точечно (`rm -f` трёх имён, без `-r`, гвард правила 9 отработал и снят
`IVAN_APPROVED=1` с доказанной восстановимостью).

**Почему НЕ сделан общий `rsync --delete`.** Сухой прогон (`rsync -anv --delete`, лог `rsync-stale-dryrun.log`,
список `stale-on-host.txt`) показал **572** файла на хосте, которых нет в `origin/dev`. Среди них —
`apps/backend/static/store-profiles/supplements/*.webp` (18 картинок стартового каталога) и `apps/backend/.env`:
это ровно то, что памятка protected-infra называет невосстановимым («media never enter git»). Общий `--delete`
уничтожил бы их. В компилируемых деревьях из 572 оказалось 9 записей, из них опасны для сборки бэкенда были
только эти три `.ts`.

**Вывод для рецепта (кандидат в задачу):** перенос файла внутри компилируемого дерева не доезжает до хоста
этим рецептом никогда. Либо rsync с `--delete` и явным `--exclude` для media/`.env`/`static`, либо сверка
компилируемых деревьев сухим прогоном перед каждой сборкой. Сегодня закрыто руками.

Первая попытка этого замера дала «0 кандидатов» — потому что `rsync -an` **без `-v`** не печатает ничего
(правило 20a: ноль — это не «пусто», это отсутствие замера). Исправлено добавлением `-v`.

## 5. Сборка, подъём, миграции, бэкфиллы

- Liveness-проба хоста: `ssh rc=0` (одна дешёвая проба до всего остального).
- Env `/opt/upready-store/mt/deploy/mt/shipshift.env` не трогал и явно исключил из rsync;
  md5 `b788f1886315a512485e0515aeb8fb53` до и после — совпадает с волнами 2–4.
- rsync дерева `origin/dev` без `--delete`: rc=0, 5191 файл, 128 987 302 байта.
- Сборка `docker compose -p mt build backend storefront panel`, лог на хосте
  `/opt/upready-store/mt-build-d05-20260915-162712.log` (896 строк, хвост — `build-tail.txt`).
  Все три образа `Built`, `failed to solve` в логе нет.
- **Гвард из f17 отработал:** `verify-runtime-modules: 324 boot modules required, all imports resolve`
  (волна 4 — 326; минус два: фикстуры уехали из компилируемого дерева, это ожидаемый эффект f18).
- **Проверка `sharp` в новом образе ДО `up -d`:**
  `docker run --rm --entrypoint node mt-backend:latest -e 'require("sharp")'` → **`sharp OK 0.35.4`, rc=0**.
- Откатная точка на месте и не перетёрта — образы, обслуживавшие платформу до этого деплоя:
  `mt-backend:d04-new` `702ec8ad9302`, `mt-storefront:d04-new` `6e95da506370`, `mt-panel:d04-new` `d23650cb1c62`.
  Новые дополнительно помечены `:d05-new`. Ничего не удалял и не пруинил.
- `docker compose up -d --no-build`: rc=0, `mt-backend Recreated → Healthy` с первого раза, затем панель
  и витрина. Откат не понадобился.
- **Миграций нет.** `medusa db:migrate` на старте: все 28 модулей `Skipped. Database is up-to-date for module.`,
  ни одной применённой, ни одной ошибки. Дамп снят до подъёма. Полный лог старта — `backend-boot.log`.

Шаги entrypoint и бэкфиллы (все идемпотентны, правок не потребовалось):

| Шаг | Результат |
|---|---|
| `ensure-accounts` | admin `admin@upready.dev` — unchanged; demo customer `user@upready.dev` — unchanged |
| `rename-default-shipping-methods` | renamed **0** options across 14 tenants, 0 courier defaults repriced, 0 type rows |
| `backfill-hero-copy` | 14 home documents, **0 patched**, 14 left alone |
| `backfill-option-translations` | profile "sneakers", 5 options × 36 locales: 0 rewritten, 0 created, **1224 already right** |

Ошибок уровня `error` в логе старта нет.

### Образы и что реально крутится

| Образ | ID | CreatedAt (CEST) | `docker inspect` контейнера |
|---|---|---|---|
| `mt-backend:latest` = `:d05-new` | `f8a8f8c6e457` | 2026-09-15 16:31:34 | mt-backend → `f8a8f8c6e457` ✓ |
| `mt-storefront:latest` = `:d05-new` | `4120e90118a8` | 2026-09-15 16:32:54 | mt-storefront → `4120e90118a8` ✓ |
| `mt-panel:latest` = `:d05-new` | `07d614fa0bde` | 2026-09-15 14:36:34 | mt-panel → `07d614fa0bde` ✓ |

Сверка по `docker inspect -f '{{.Image}}'`, не по тегу `latest`.

**Про `CreatedAt` панели вне окна прогона — это не сбой, и вот замер.** `07d614fa0bde` — тот самый образ,
что волна 4 отложила под именем `mt-panel:d04b-f12-panel-only-DO-NOT-DEPLOY`: он собран из дерева `ba126e8`,
чей бэкенд не собирался. Docker в моей сборке получил байт-идентичный образ и переиспользовал тот же ID,
потому что **между `ba126e89` и `1088507f` в панели не изменено ни одного файла**
(`git diff --name-only ba126e89..1088507f -- apps/tenant-panel` → 0). То есть образ панели этой волны
и есть та сборка — «DO-NOT-DEPLOY» относилось к бэкенду того дерева, а не к панели.
Положительный маркер, что панель обслуживает НОВЫЙ код, взят отдельно (п. 7).

### Контейнеры

```
mt-backend       Up 7 minutes (healthy)
mt-storefront    Up 5 minutes (healthy)
mt-panel         Up 5 minutes (healthy)
mt-postgres      Up 4 days (healthy)
mt-ingress-sync  Up 3 days
upreadystore-bot Up 36 hours
```

## 6. Health-свип

Замер ДО деплоя (`health-pre.txt`, 22:24 WITA) — те же пять URL уже отдавали 200, то есть платформа
входила в деплой здоровой. Финальные замеры — `health-final.txt`.

### Пять платформенных URL

| URL | код |
|---|---|
| https://shipshift.dev/health | 200 |
| https://start.upready.dev/start/onboarding | 200 |
| https://panel-store.upready.dev/ | 200 |
| https://cherkashino.shipshift.dev/ru | 200 |
| https://zolotaya-nit-1057.shipshift.dev/ru | 200 |

### Пять карточек магазина клиента

Handle'ы взяты из HTML живого каталога `https://cherkashino.shipshift.dev/ru/store` (12 ссылок
вида `href="/products/…"`), выбор пяти — `sort -R`, не придуман.

| URL | код |
|---|---|
| /ru/products/tabletki-ot-varikoza-s-kashtanom-cherkashino | 200 |
| /ru/products/ingalyator-portativnyy-cherkashino | 200 |
| /ru/products/maz-ot-varikoza-s-kashtanom-cherkashino | 200 |
| /ru/products/propolis | 200 |
| /ru/products/zubnaya-pasta-tayskaya-s-gvozdikoy-cherkashino | 200 |

Первая попытка выбрать handle регуляркой `/ru/products/` дала ноль — на витрине ссылки вида
`/products/<handle>`, префикс локали добавляется роутером. Ноль был признан отсутствием замера, а не пустотой.

### verify-команды реестра protected-infra (`upready-store-mt-platform`)

```
start.upready.dev/start/onboarding                 200
panel-store.upready.dev/                           200
zolotaya-nit-1057.shipshift.dev/  (code ssl)       302 0   # редирект на /ru, TLS валиден
shipshift.dev/static/store-profiles/abstract/…webp 200
cherkashino.shipshift.dev/ru      (code ssl)       200 0
```

Соседний защищённый сервис того же хоста не задет: `https://hooks.svgnoon.upready.dev/health` → **200**.

## 7. Маркеры «отвечает именно код волны 5»

На хосте нет `.git`, поэтому кроме `CreatedAt` взяты ПОЛОЖИТЕЛЬНЫЕ маркеры, каждый с контролем.

1. **Бэкенд, #50/f12.** Строка «Опция по умолчанию» (та самая замена английского `Default option`
   в тенантском онбординге) найдена в трёх скомпилированных файлах РАБОТАЮЩЕГО контейнера:
   `/app/src/workflows/tenant/seed-tenant-dataset/index.js`, `/app/src/migration-scripts/lib/products.js`,
   `/app/src/migration-scripts/data/abstract-datasets.js` (`grep rc=0`).
   **Контроль:** в образе волны 4 `mt-backend:d04-new` той же строки НЕТ — `grep rc=1`, 0 файлов.
2. **Бэкенд, #55/f18.** В работающем образе фикстур в компилируемом дереве **0**
   (`ls /app/src/scripts/ | grep -cE "f12-seed|t13-seed|t17-seed"` → 0). **Контроль:** в образе волны 4 их **2**.
   Это и есть суть f18, видимая в живом образе.
3. **Панель, #50/f12.** Живой бандл сменил имя: волна 4 — `/assets/index-BRZl1Jht.js`, сейчас —
   `/assets/index-esiPz-of.js` (1 259 559 байт). В нём найдены строки русского словаря, добавленные #50:
   «Изменить фотографии варианта» — 1, «Сохранить и закрыть» — 1, «Ограничить использование по» — 1.
4. **Бэкенд жив и маршруты на месте.** `GET https://shipshift.dev/auth/tenant/mail-status` → **200**
   `{"configured":false,"contact_email":"hello@shipshift.dev"}`; контроль — соседний несуществующий путь
   `…/mail-status-nope` → 401, то есть 200 с этим телом означает существование маршрута, а не «отвечает что угодно».

## 8. Каталог клиента, медиа и риски

Каталог свой, не демо: `GET /store/products?limit=1` с публикуемым ключом тенанта
(`api_key.title = 'Оксана Черкашина storefront'`, `pk_8198573d6…`) → **`count = 32`**, первый товар —
«Свечи АСД с чесноком». Столько же, сколько в волне 4: за время деплоя ничего не потеряно.

| | |
|---|---|
| `/opt/upready-store/media-tenants` всего | **117 МБ**, 3 каталога тенантов |
| Каталог клиента `ten_01M2GQVGEN1204CN90C510DNRG` (= handle `cherkashino`, сверено по `select handle, id from tenant`) | **117 МБ, 338 файлов** |
| `ten_01M2EY6NESKPSDK0MT0P4NSKD7` | 96 КБ, 5 файлов |
| `ten_01M2EY8J0450YYQS29J04FFRGK` | 452 КБ, 2 файла |

**РИСК №15 «Эксплуатация»** (без изменений за день): медиа магазина лежат на одном хосте, без S3 и без
автоматических бэкапов — `S3_BUCKET` не задан, ночной per-tenant job и R2/restic существуют только спекой
`docs/multitenancy/backup-spec.md`. `pg_dump` спасает БД, но не байты картинок: потеря
`/opt/upready-store/media-tenants` = 338 файлов магазина клиента, восстановить неоткуда. Сегодня не чинится.

**Второй пункт Ивану (без изменений):** `SMTP_HOST`/`SMTP_USER`/`SMTP_FROM` в `shipshift.env` отсутствуют,
живой почты у магазина нет; код отвечает честно (`{"configured":false}`), а не врёт. Env не правил,
значений не выдумывал. Новых переменных волна 5 не потребовала.

Диск хоста: 83 ГБ свободно из 193 ГБ (58 % занято) — места под образы хватает.

## 9. Что удивило

1. **Перенос файла — невидимая для `rsync` операция** (п. 4). Смёрженный f18 сам по себе НЕ чинил сборку
   на хосте: старая копия фикстуры пережила бы rsync и уронила бы образ той же ошибкой. Класс шире одного
   файла: любой `git mv` внутри `apps/*/src` этим рецептом не доезжает.
2. **Образ панели байт-в-байт равен «DO-NOT-DEPLOY»-образу волны 4** — и это правильно, потому что между
   `ba126e8` и `1088507f` в панели ноль изменений. Поверил замером диффа, а не тегом.
3. **#57 смёржен на 13-й минуте моего прогона** — тот же класс, что #50 в волне 4: между снимком дерева и
   концом сборки в `dev` успевает приехать новый PR. Гнаться за ним вторым кругом не стал: бриф прямо
   запрещает начинать новую сборку после зелёного свипа — отчёт обязан описывать то, что реально обслуживает.
4. **Два дампа совпали по размеру до байта** (5 678 771). Проверено, что это не обрубок: `pg_restore -l`
   читает оба, по 1193 объекта — просто ни миграций, ни правок бэкфиллов в волне не было.

## 10. Артефакты

- `report.md` — этот отчёт
- `health-pre.txt` / `health-final.txt` — свипы до и после
- `merged-prs.json` — все 25 PR суток
- `backend-boot.log` — полный лог старта бэкенда (миграции, entrypoint, бэкфиллы)
- `build-tail.txt` — хвост лога сборки
- `rsync-stale-dryrun.log` / `stale-on-host.txt` — доказательство находки п. 4 (572 файла)
