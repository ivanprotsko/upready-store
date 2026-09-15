# d04-deploy-mt-4 — деплой волны 4 (фиксы владелицы f09–f16) на живой mt-хост

Время отчёта: 2026-09-15 20:33 WITA. Часы хоста Contabo — CEST (UTC+2) = WITA минус 6 часов;
окно этого прогона на хосте — 14:09…14:31 CEST = 20:09…20:31 WITA.

**Итог: задеплирован `a530e50` (9 PR волны 4), 5/5 платформенных URL и 5/5 карточек магазина клиента
отдают 200, все три контейнера подняты на образах этой сборки, откат не потребовался.
Десятый PR волны — #50/f12 — доставить НЕ удалось: его бэкенд-образ не собирается (раздел 10).**

## 1. Что задеплировано

| | |
|---|---|
| Предыдущий sha (волна 3, `d03-deploy-mt-3/report.md`) | `2286d43` |
| Задеплированный sha (`git rev-parse --short origin/dev`) | **`a530e50`** |
| Коммитов между ними | 9 (ровно 9 продуктовых PR, служебных коммитов в диапазоне нет) |
| Файлов изменено | 158 |

Как и в волне 3, локальный чекаут `dev` **разошёлся** с `origin/dev` (15 своих handoff-коммитов впереди,
16 позади). На хост уехало дерево ровно `origin/dev`, выгруженное `git archive origin/dev | tar -x`,
а не рабочий каталог — иначе rsync отправил бы устаревший продуктовый код.

### Продуктовые PR волны 4 (`2286d43..origin/dev`)

| # | Задача | Заголовок |
|---|---|---|
| #45 | f06-shipping-method-names | Способы доставки назывались «Оксана Черкашина pickup» и «courier» |
| #46 | f08-medusa-mark-bottom-nav | В нижней навигации на телефоне стоял логотип Medusa |
| #47 | f11-new-product-404 | Товар, созданный владелицей, попадал в каталог, но его страница — 404 |
| #48 | f09-price-editor-currencies | Цена в рублях: 89-я колонка таблицы, а при создании товара поля не было |
| #49 | f13-page-editor-english | Редактор страниц магазина был целиком на английском |
| #51 | f10-price-save-silently-lost | Сохранение цены молча теряло введённое значение |
| #52 | f14-no-password-reset | На входе в панель не было восстановления пароля |
| #53 | f15-overview-empty | «Обзор» не говорил о магазине ничего |
| #54 | f16-category-image-not-shown | Картинка категории сохранялась, но витрина её не показывала |

**Не вошёл в волну: #50 f12-owner-raw-keys** («на экранах владелицы видны сырые ключи перевода»).
На момент снимка дерева (20:08 WITA) PR был **OPEN**; он был смёржен в 20:24 WITA (`mergedAt`
2026-09-15T12:24:04Z, merge-коммит `ba126e8`), то есть уже посреди моей сборки. Я попробовал доставить
и его отдельным вторым кругом — **сборка бэкенда из `ba126e8` падает**, см. раздел 10. Живьём этой
правки нет.

## 2. Все PR, смёрженные за сутки (`merged:>=2026-09-15`, граница UTC)

Вывод команды — `merged-prs.json`. **N = 22** (13 волны 3 + 9 волны 4).
По рабочему дню WITA к ним добавляются ещё три PR волны 3, смёрженные до полуночи UTC
(#31 t10-blog, #33 t13-customers-screen, #30 t09-reviews) — итого **25** за рабочий день.

## 3. Дампы БД — до и после

| Когда | Путь | Размер |
|---|---|---|
| ДО деплоя | `/opt/upready-store/backups/medusa_mt-pre-d04-20260915-140959.dump` | 5 595 036 байт |
| ПОСЛЕ деплоя | `/opt/upready-store/backups/medusa_mt-post-d04-20260915-143059.dump` | 5 678 771 байт |

Форма `pg_dump -U medusa` (не `-U postgres` из брифа: такой роли на хосте нет, находка волны 3), оба rc=0.

## 4. Сборка и подъём

- Liveness-проба хоста: `ssh rc=0`.
- Env `/opt/upready-store/mt/deploy/mt/shipshift.env` не трогал; md5 `b788f1886315a512485e0515aeb8fb53`
  до и после rsync — совпадает с волнами 2 и 3. Файл исключён из rsync явно.
- rsync дерева `origin/dev` без `--delete`: rc=0, 4291 файл.
- Сборка `docker compose build backend storefront panel`, лог на хосте
  `/opt/upready-store/mt-build-d04-20260915-141107.log` (733 строки, хвост — `build-tail.txt`).
  Все три образа `Built`, ошибок сборки нет.
- **Гвард из f17 отработал:** `verify-runtime-modules: 326 boot modules required, all imports resolve`
  (в волне 3 было 324 — волна 4 добавила два boot-модуля).
- **Проверка `sharp` в новом образе ДО `up -d`:**
  `docker run --rm --entrypoint node mt-backend:latest -e 'require("sharp")'` → **`sharp OK 0.35.4`, rc=0**.
- Откатная точка сохранена ДО подъёма и не перетёрта: `mt-backend:d03-final` `173289c08c2c`,
  `mt-storefront:d03-final` `31f64bd7031f`, `mt-panel:d03-final` `7ee9d8e5f3d5` — это ровно те образы,
  что обслуживали платформу до этого деплоя. Новые дополнительно помечены `:d04-new`.
  Ничего не удалял и не пруинил; образы волны 2 и сломанный `d03-new-broken-sharp` тоже на месте.
- `docker compose up -d --no-build`: rc=0, `mt-backend Recreated → Healthy`, затем `mt-panel` и
  `mt-storefront`. Бэкенд стал healthy с первого раза, откат не понадобился.

### Образы (`CreatedAt` — внутри окна прогона 14:09…14:31 CEST) и что реально крутится

| Образ | ID | CreatedAt | Контейнер запущен с ID |
|---|---|---|---|
| `mt-backend:latest` = `:d04-new` | `702ec8ad9302` | 2026-09-15 14:15:15 +0200 | mt-backend → `702ec8ad9302` ✓ |
| `mt-storefront:latest` = `:d04-new` | `6e95da506370` | 2026-09-15 14:16:35 +0200 | mt-storefront → `6e95da506370` ✓ |
| `mt-panel:latest` = `:d04-new` | `d23650cb1c62` | 2026-09-15 14:12:29 +0200 | mt-panel → `d23650cb1c62` ✓ |

Сверка `docker inspect -f '{{.Image}}'` по каждому контейнеру — не по тегу `latest`, который мог бы
указывать куда угодно: все три контейнера подняты именно на образах этой сборки.

### Контейнеры

```
mt-backend       Up 7 minutes (healthy)   mt-backend:latest
mt-storefront    Up 4 minutes (healthy)   mt-storefront:latest
mt-panel         Up 4 minutes (healthy)   mt-panel:latest
mt-postgres      Up 3 days (healthy)      postgres:16-alpine
mt-ingress-sync  Up 3 days                postgres:16-alpine
upreadystore-bot Up 34 hours              upreadystore-bot:local
```

## 5. Миграции, бэкфиллы и переменные окружения

**Миграций в волне 4 нет.** `git diff --name-status 2286d43..origin/dev -- '*migrations*'` — пусто;
`medusa db:migrate` на старте прошёл по всем 28 модулям с `Skipped. Database is up-to-date for module.`,
ни одной применённой миграции, ни одной ошибки. Дамп при этом снят ДО подъёма.

Бэкфиллы (полный лог шагов entrypoint — `backend-boot-entrypoint.txt`):

| Скрипт | Результат |
|---|---|
| `rename-default-shipping-methods` (новый шаг entrypoint из #45/f06, гоняется на каждом старте) | **renamed 24 options across 14 tenants, 12 courier defaults repriced from the 10 placeholder, 0 type rows brought in step** |
| `backfill-hero-copy` | 14 home documents, 0 patched, 14 left alone |
| `backfill-option-translations` | profile "sneakers", 5 options × 36 locales: 0 rewritten, 0 created, 1224 already right |
| `initial-data-seed`, `seed-storefront-settings`, `ensure-accounts` | отработали штатно, ошибок в логе старта нет |

Переменные окружения. Ничего не выдумывал и env не правил. Имена, которые нужны смёрженным задачам:

- **`PANEL_PUBLIC_URL`** (ссылка в письме восстановления пароля, #52/f14) — в `shipshift.env` ОТСУТСТВУЕТ,
  но потребитель её получает: `deploy/compose.mt.yml` строит её сам — `PANEL_PUBLIC_URL: https://${PANEL_DOMAIN}`,
  а `PANEL_DOMAIN` в env задан. Дырки нет (проверено по коду compose, а не по наличию переменной в файле).
- **`SMTP_HOST`/`SMTP_USER`/`SMTP_FROM`** — ОТСУТСТВУЮТ. Это то, о чём брифы d02/d03 говорят «фича, которая
  осталась выключенной, — корректный исход»: бэкенд поднимается нормально, а код честно отвечает
  `{"configured":false}`. Заполнить их может только Иван — см. риск ниже.
- `S3_BUCKET` — отсутствует (риск медиа, п. 8).

## 6. Финальный health-свип

Сырые замеры — `health-final.txt`.

### Пять платформенных URL

| URL | код |
|---|---|
| https://shipshift.dev/health | 200 |
| https://start.upready.dev/start/onboarding | 200 |
| https://panel-store.upready.dev/ | 200 |
| https://cherkashino.shipshift.dev/ru | 200 |
| https://zolotaya-nit-1057.shipshift.dev/ru | 200 |

### Пять карточек магазина клиента

Handle'ы взяты из HTML каталога `https://cherkashino.shipshift.dev/ru/store` (`href="/products/…"`,
12 карточек на странице), не придуманы:

| URL | код |
|---|---|
| /ru/products/gepachisty-cherkashino | 200 |
| /ru/products/kapli-v-nos-asd-i-serebro-cherkashino | 200 |
| /ru/products/maz-ot-varikoza-s-kashtanom-cherkashino | 200 |
| /ru/products/sila-razdelnogo-pitaniya-250-retseptov-poleznyh-blyud-cherkashino | 200 |
| /ru/products/tabletki-ot-varikoza-s-kashtanom-cherkashino | 200 |

### Проверки реестра protected-infra (`upready-store-mt-platform`)

```
start.upready.dev/start/onboarding                 200
panel-store.upready.dev/                           200
zolotaya-nit-1057.shipshift.dev/  (code ssl)       302 0   # редирект на /ru, TLS валиден
shipshift.dev/static/store-profiles/abstract/…webp 200
cherkashino.shipshift.dev/ru      (code ssl)       200 0
```

## 7. Маркеры «отвечает именно код волны 4»

На хосте нет `.git`, поэтому кроме `CreatedAt` взяты ПОЛОЖИТЕЛЬНЫЕ маркеры в самих ответах:

1. **Бэкенд (#52/f14).** Новый маршрут `GET https://shipshift.dev/auth/tenant/mail-status` отвечает
   **200** телом `{"configured":false,"contact_email":"hello@shipshift.dev"}`. Маршрута нет ни в одном
   предыдущем образе. Контроль: несуществующий путь рядом (`…/mail-status-nope`) даёт 401, то есть 200 с
   этим телом — именно факт существования маршрута, а не «что угодно отвечает».
2. **Панель (#49/f13, #51/f10, #53/f15).** В живом бандле `https://panel-store.upready.dev/assets/index-BRZl1Jht.js`
   найдены строки, добавленные волной 4: «Открыть мой магазин» (f15), «Цена не сохранена» (f10),
   «Введите цену числом, например 1400» (f09/f10) — по 1 вхождению каждая.
3. **Витрина (#54/f16).** В HTML каталога клиента отдаются картинки из `/static/tenants/ten_01M2GQ…/`,
   одна из них проверена прямым запросом — 200.
4. **Доставка (#45/f06).** Бэкфилл отработал на живой БД (см. п. 5). Отдельно перепроверил магазин клиента:
   `TENANT=cherkashino` → «renamed **0** options across 1 tenants» — машинных названий у неё не осталось
   (её переименовали ещё на приёмке f06), скрипт идемпотентен. По всей базе не осталось ни одного имени
   вида «<Магазин> pickup/courier»: различных имён всего четыре — `Pickup` (244) и `Courier delivery` (241)
   у региональных опций базового стора, `Самовывоз` (14) и `Курьером` (14) у тенантов.

## 8. Каталог клиента, медиа и риск

Каталог свой, не демо: `GET /store/products?limit=1` с публикуемым ключом тенанта cherkashino →
**`count=32`**, первый товар — «Свечи АСД с чесноком». В волне 3 было 29: **+3 товара**, добавленных
за день через панель (приёмка f11 «товар, созданный владелицей»), ничего не потеряно.

| | |
|---|---|
| `/opt/upready-store/media-tenants` всего | **117 МБ**, 3 каталога тенантов |
| Каталог клиента `ten_01M2GQVGEN1204CN90C510DNRG` | **117 МБ, 338 файлов** |
| `ten_01M2EY6NESKPSDK0MT0P4NSKD7` | 96 КБ, 5 файлов |
| `ten_01M2EY8J0450YYQS29J04FFRGK` | 452 КБ, 2 файла |

**РИСК №15 «Эксплуатация»** (повторяю из d03, за день не изменился): медиа магазина лежат на одном
хосте, без S3 и без автоматических бэкапов — `S3_BUCKET` не задан, ночной per-tenant job и R2/restic
существуют только спекой `docs/multitenancy/backup-spec.md`. `pg_dump` спасает БД, но **не байты
картинок**: потеря `/opt/upready-store/media-tenants` = 338 файлов магазина клиента, восстановить
неоткуда. Сегодня не чинится — вынесено Ивану.

**Второй пункт Ивану:** без `SMTP_HOST` письма магазина (подтверждение заказа f02, восстановление
пароля f14) не уходят. Код ведёт себя честно — кнопка/экран сообщают «почта не настроена», а не врут, —
но живой почты у магазина владелицы сейчас нет.

## 9. Что удивило

1. **#50 f12-owner-raw-keys не смёржен** (OPEN), хотя приёмка `accept-f12-owner-raw-keys-1` в артефактах
   дня есть. Волна 4 = 9 PR из 10 ожидавшихся; сырые ключи перевода на экранах владелицы живьём остались.
2. **Первый запуск сборки через ssh «завис»** на 120 с и был снят харнессом в фон, хотя сама сборка шла
   нормально: `&` в zsh-строке привязывается ко ВСЕМУ and-списку, и подоболочка держит fd ssh-сессии
   (правило 5q). Лечится тем, что сборка всё равно пишет в файл на хосте, и ожидание идёт по дедлайну
   через отдельный ssh — так и сделано.
3. **Мой первый SQL-запрос про доставку был бессмысленным**: `left join tenant t on true` — это
   декартово произведение, вывод «cherkashino|Pickup» ничего не доказывал. Заменён на запуск самого
   скрипта с `TENANT=cherkashino` и на подсчёт различных имён по всей таблице (п. 7.4).
4. **Число boot-модулей выросло 324 → 326** — гвард f17 проверяет их импорты в каждой сборке, так что
   класс «образ собрался, а модуля внутри нет» закрыт не только для `sharp`.

## 10. #50 / f12-owner-raw-keys: образ бэкенда из `ba126e8` не собирается

Хронология по часам (WITA):

| | |
|---|---|
| 20:08 | снимок дерева, `origin/dev` = `a530e50`, `gh pr view 50` → OPEN |
| 20:11–20:22 | сборка и подъём волны 4 (`a530e50`) |
| 20:24 | **#50 смёржен** (`mergedAt` 2026-09-15T12:24:04Z), `origin/dev` → `ba126e8` |
| 20:33 | увидел это в HANDOFF соседней сессии, перепроверил у владельца: state **MERGED** |
| 20:35–20:44 | второй круг: rsync `ba126e8` → сборка → **бэкенд упал** |

Ошибка сборки (полный фрагмент — `build-f12-failure.txt`, лог на хосте
`/opt/upready-store/mt-build-d04b-20260915-143526.log`):

```
src/scripts/f12-seed-test-order.ts:55:16 - error TS2322: Type '{ id: string[]; }' is not assignable to type 'undefined'.
  55     filters: { sales_channels: { id: [salesChannelId] } },
                   ~~~~~~~~~~~~~~
warn: Backend build completed with errors (89.97s)
ERROR: process "/bin/sh -c npx medusa build --lint false && node scripts/copy-migration-data.js" did not complete successfully: exit code: 1
target backend: failed to solve
```

Причина точная: #50 добавил `apps/backend/src/scripts/f12-seed-test-order.ts` — приёмочную фикстуру,
в её же шапке написано «acceptance fixture ONLY … Never run against a real database — throwaway».
Но лежит она в `src/scripts/`, а `medusa build` компилирует весь `src/`, поэтому её тип-ошибка роняет
**продуктовый образ**. Тот же класс, что f17 (`sharp`): дефект, который виден только сборке образа,
а не `dev`-прогону.

Что сделано и чего не сделано:

- Продуктовый код не правил — бриф прямо запрещает (`no push, no merge, no product commit`).
  Это задача Ивану/следующей волне: убрать фикстуру из `src/scripts/` (или починить тип и закрыть
  класс — запретить приёмочным фикстурам лежать в компилируемом дереве).
- **Живой стек не пострадал**: упавшая сборка ничего не поднимала, все три контейнера как стояли,
  так и стоят на образах `a530e50` (`docker inspect` по каждому — ID совпадают, все healthy).
- Побочный эффект упавшей сборки, который я вычистил: панель успела собраться ДО падения бэкенда и
  увела тег `mt-panel:latest` на образ из непособираемого дерева (`07d614fa0bde`), при том что
  контейнер продолжал жить на `d23650cb1c62`. Любой следующий `up -d` поднял бы смешанное состояние —
  панель из `ba126e8`, бэкенд из `a530e50`. Образ сохранён под именем
  `mt-panel:d04b-f12-panel-only-DO-NOT-DEPLOY` (ничего не удалено), а `mt-panel:latest` возвращён на
  `d23650cb1c62`. Сейчас все три `:latest` равны тому, что обслуживает.
- Финальный свип (`health-final.txt`, 20:45 WITA) снят ПОСЛЕ всего этого и описывает именно
  обслуживающее состояние: 5/5 + 5/5 + 5 проверок реестра.
- БД второй круг не трогал вовсе (сборка образа, ни `up`, ни миграций), поэтому дамп
  `medusa_mt-post-d04-20260915-143059.dump` остаётся верным пост-деплойным снимком.
