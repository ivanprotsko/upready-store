# t02-cherkashina-port — перенос миграции магазина Оксаны в `dev`

Ветка `feat/day16-cherkashina-port` от `dev` (после `git merge origin/dev` — база fd033d5).
Замеры сделаны 2026-09-15 03:39 WITA на локальном стенде, поднятом из этой рабочей копии.
Прод не трогался: ни тенанта, ни импорта, ни деплоя.

## Что перенесено

**1. Скрипты миграции** — `apps/backend/scripts/cherkashina-migration/` (взято
`git checkout feat/cherkashina-tenant -- …`, ветка не слита):
`measure-source.mjs`, `export-source.mjs`, `feature-inventory.mjs`, `import.mjs`,
`rehost-images.mjs`, `measure-target.mjs`, `render-registry.mjs`, `render-report.mjs`,
`lib/{http,psql,mapping-registry}.mjs` + новые `lib/cli.mjs` и `README.md`.

**2. Локаль публичных страниц тенанта** — `apps/backend/src/api/store/tenant/pages/route.ts`,
`…/pages/[key]/route.ts`, `apps/backend/src/api/tenants/pages/page-helpers.ts`
(`requestedPageLocale` + `pickPageForLocale`), `apps/storefront/src/lib/data/tenant-pages.ts`,
кейс фолбэка в `apps/backend/integration-tests/http/tenants-pages.spec.ts`.

**3. Документы миграции** — `artifacts/docs/2026-09-12-cherkashina-migration/`:
`01-feature-inventory.md` (19 КБ), `02-mapping-registry.md` (32 КБ), `03-migration-report.md` (23 КБ).

### Про «перенос руками» второго куска

Бриф исходил из того, что `dev` ушёл вперёд и локаль придётся накладывать руками. Замерено:

```
$ MB=$(git merge-base HEAD origin/dev)   # в worktree feat/cherkashina-tenant, MB = 8dba58c
SAME  apps/backend/src/api/store/tenant/pages/route.ts
SAME  apps/backend/src/api/store/tenant/pages/[key]/route.ts
SAME  apps/backend/src/api/tenants/pages/page-helpers.ts
SAME  apps/storefront/src/lib/data/tenant-pages.ts
SAME  apps/backend/integration-tests/http/tenants-pages.spec.ts
```

Все пять файлов на `dev` и на базе ветки — один и тот же блоб, поэтому ручной перенос и
`git checkout` дают побайтово одно и то же; взят checkout этих пяти путей. Каждый файл прочитан
и сверен с сегодняшним `dev` до коммита.

### Что НЕ перенесено и почему

- **Правка файлового провайдера** (`medusa-config.ts`: `backend_url` из `MEDUSA_BACKEND_URL`) —
  выброшена намеренно. На `dev` ту же дыру закрывает `LOCAL_FILE_BACKEND_URL`:
  `apps/backend/medusa-config.ts:83-89` объявляет провайдер `@medusajs/medusa/file-local` с
  `backend_url: process.env.LOCAL_FILE_BACKEND_URL || "http://localhost:9000/static"`, а
  `apps/backend/src/tenant-files/index.ts:76` читает эту опцию из контейнера
  (`localProviderOptions(container).backend_url || LOCAL_BACKEND_URL_DEFAULT`). Выигрывает механизм
  `dev`; версия ветки его бы дублировала другим именем переменной.
- **Снимок каталога** `source-snapshot.json` (1 МБ, 26 051 строка) и `02-mapping-registry.json`
  (534 КБ) в git не заведены: скрипты принимают их пути аргументами. Реестр перенесён рендером
  `.md` (32 КБ против 534 КБ JSON) — в нём таблица «старый URL → новый», которую ждёт
  `t11-seo-redirects`. JSON остаётся на ветке `feat/cherkashina-tenant`.
- Ветка `feat/cherkashina-tenant` не слита, коммиты не перенесены, её worktree не тронут.

## Что починено в скриптах

Живой импорт пойдёт на `https://shipshift.dev`, поэтому убраны привязки к стенду 2026-09-12:

| Было | Стало |
|---|---|
| ни у одного скрипта нет `--help`; вызов без обязательного аргумента печатал одну строку | у всех восьми `--help` → usage, rc=0; без обязательного аргумента — причина + usage, rc=2 (`lib/cli.mjs`) |
| `PSQL_DEFAULT = /opt/homebrew/opt/postgresql@16/bin/psql` — путь этой машины | `PSQL_BIN` → homebrew, если стоит → `psql` из `PATH`; у трёх psql-скриптов есть `--psql-bin` |
| `TENANT_HOST` по умолчанию `<handle>.localhost:8043`, URL собирался как `http://${TENANT_HOST}` — схема зашита | `--storefront-origin` (полный origin, живой: `https://<handle>.shipshift.dev`), `--tenant-host` как алиас, http угадывается только для `localhost`/`*.localhost` |
| `SOURCE_STORE_ORIGIN = "https://olavka.ru"` константой | `--source-origin` с тем же значением по умолчанию |
| несуществующий `--source-root` выяснялся на первой из 335 загрузок | проверяется до первой фазы, отказ с именем флага |

`README.md` в каталоге скриптов: таблица «что читает / что пишет / что требует в командной строке»
по каждому скрипту, один копируемый пример (живой dry-run), и что `--dry-run` НЕ офлайн — он логинится
и пишет реестр строками `pending`.

## Замеры

Стенд: бэкенд `npx medusa develop` на :9088, БД `upready_store_t02` —
копия `upready_store_cherkashina` (`createdb -T`), с накатанными миграциями `dev`; витрина
`npx next dev -p 8088`, тенант резолвится по хосту `cherkashino.localhost`. Оригинальная БД стенда
2026-09-12 не изменялась.

Данные тенанта `cherkashino` (ten_01M29Q4KYQHC70JZBENWZ8Z88M), как есть после миграции:
`about` в ru и en, `contacts`/`offer`/`privacy` — только ru.

### Проверки

```
cd apps/backend  && npx medusa lint                  rc=0   ✖ 6 problems (0 errors, 6 warnings)
cd apps/backend  && npx tsc --noEmit                 rc=0
cd apps/backend  && pnpm test:unit                   rc=1   Tests: 1 failed, 61 passed, 62 total
cd apps/backend  && DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9199 \
                    pnpm test:integration:http -- integration-tests/http/tenants-pages.spec.ts
                                                     rc=0   PASS, Tests: 9 passed, 9 total (ℹ fail: 0)
cd apps/backend  && … pnpm test:integration:http     rc=1   Test Suites: 1 failed, 11 passed, 12 total
                                                            Tests: 1 failed, 125 passed, 126 total
cd apps/storefront && npx tsc --noEmit               rc=0
cd apps/storefront && npx next lint                  rc=0   ✔ No ESLint warnings or errors
cd apps/storefront && npx next build                 rc=0
```

`tenants-pages.spec.ts` целиком зелёный, включая новый кейс
«serves the visitor's locale on the storefront and falls back to en, then to any locale».

**Две красные проверки — не мои, они уже красные на `dev`.** `git diff --name-only origin/dev..HEAD`
даёт 5 файлов кода (страницы тенанта + их seam-спека) и каталог скриптов; ни
`src/migration-scripts/**`, ни `integration-tests/http/tenants-domains.spec.ts` в нём нет:

- `profile-data.unit.spec.ts` › «leaves a locale the profile never translated identical to the base»:
  в merged-каталоге появился лишний `"productOptions": {}`.
- `tenants-domains.spec.ts` › «resolves a custom host as soon as the tenant adds it, without a restart»:
  ответ `/tenants/domains` несёт `is_primary: false`, спека ждёт `{id, host}`. Поле `is_primary`
  приехало на `dev` позже спеки.

Обе стоит завести отдельными задачами (чинить их здесь — расширять этот PR).

### Локаль: было / стало на живом стенде

`--help` скриптов (критерий приёмки):

```
$ node apps/backend/scripts/cherkashina-migration/import.mjs --help    # rc=0
import.mjs — create the tenant and import the source catalog, content and home into it.
Talks ONLY to the tenant HTTP API (/auth/tenant/*, /tenants/*) of --backend; never SQL into the target.
Idempotent: a registry row already `migrated` is verified, not redone.

  node import.mjs --snapshot <file.json> --registry <file.json> --admin-email <e> --admin-password <p> [options]
  … 25 строк опций …
```

И он же живьём против стенда (`--dry-run`, пароль намеренно неверный, rc=0):

```
$ node …/import.mjs --backend http://localhost:9088 --snapshot <snapshot> --registry <scratch>/dry-registry.json \
    --handle cherkashino --storefront-origin https://cherkashino.shipshift.dev \
    --admin-email owner-cherkashino@example.test --admin-password … --only tenant,categories --dry-run
[03:38 WITA] import (dry-run) → http://localhost:9088, tenant cherkashino, phases tenant,categories
[03:38 WITA] dry-run: no tenant admin yet; the write phases will be skipped
{ "tenant": { "total": 1, "migrated": 0, "skipped": 0, "failed": 0, "pending": 1 } }
```

API (`PK` = publishable key тенанта), **до** правки — код `dev`, тот же стенд:

```
$ curl -H "x-publishable-api-key: $PK" '…/store/tenant/pages/about?locale=ru'
{"page":{…,"key":"about","locale":"en","title":"Oksana Cherkashina",…}}          ← русский запрос, английский ответ
$ curl -H "x-publishable-api-key: $PK" '…/store/tenant/pages/offer?locale=ru'
http=404 {"type":"not_found","message":"Page with key \"offer\" was not found"}   ← оферта существует только в ru
$ curl -H "x-publishable-api-key: $PK" '…/store/tenant/pages'
{"pages":[{"key":"about","title":"Oksana Cherkashina"}]}                          ← в футере одна ссылка из четырёх
```

**после** правки:

```
$ …/store/tenant/pages/about?locale=ru → {"key":"about","locale":"ru","title":"Черкашина Оксана",…}
$ …/store/tenant/pages/about?locale=en → {"key":"about","locale":"en","title":"Oksana Cherkashina",…}
$ …/store/tenant/pages/offer?locale=en → {"key":"offer","locale":"ru","title":"Публичная оферта",…}  (фолбэк)
$ …/store/tenant/pages/offer?locale=de → {"key":"offer","locale":"ru","title":"Публичная оферта",…}  (фолбэк)
$ -H 'x-medusa-locale: ru' …/store/tenant/pages/about → locale "ru" (без ?locale=, заголовком)
$ …/store/tenant/pages/about?locale=%3Cscript%3E → http=200, locale "en" (кривая локаль = «нет предпочтения», не 400)
$ …/store/tenant/pages?locale=ru
{"pages":[{"key":"contacts","title":"Контакты и реквизиты","locale":"ru"},{"key":"about","title":"Черкашина Оксана","locale":"ru"},
          {"key":"privacy","title":"Политика конфиденциальности","locale":"ru"},{"key":"offer","title":"Публичная оферта","locale":"ru"}]}
$ …/store/tenant/pages?locale=en
{"pages":[{"key":"contacts","title":"Контакты и реквизиты","locale":"ru"},{"key":"about","title":"Oksana Cherkashina","locale":"en"},
          {"key":"privacy","title":"Политика конфиденциальности","locale":"ru"},{"key":"offer","title":"Публичная оферта","locale":"ru"}]}
```

Витрина (то, что открывает человек), **до**:

```
BEFORE http://cherkashino.localhost:8088/ru/pages/about  http=200  <title>Oksana Cherkashina | Оксана Черкашина</title>
BEFORE http://cherkashino.localhost:8088/ru/pages/offer  http=404  <title>Страница не найдена | Оксана Черкашина</title>
```

**после**:

```
AFTER  /ru/pages/about  http=200  <title>Черкашина Оксана | Оксана Черкашина</title>
AFTER  /en/pages/about  http=200  <title>Oksana Cherkashina | Оксана Черкашина</title>
AFTER  /ru/pages/offer  http=200  <title>Публичная оферта | Оксана Черкашина</title>
AFTER  /en/pages/offer  http=200  <title>Публичная оферта | Оксана Черкашина</title>   (фолбэк на ru)
```

В футере страницы `/ru/pages/offer` после правки стоят все четыре ссылки с русскими заголовками
(`Контакты и реквизиты`, `Черкашина Оксана`, `Политика конфиденциальности`, `Публичная оферта`);
до правки список нёс одну — английский `About`.

## Как принять за 10 минут

1. `node apps/backend/scripts/cherkashina-migration/import.mjs --help` — печатает usage, rc=0.
   То же у остальных семи скриптов.
2. `cd apps/backend && npx medusa lint && npx tsc --noEmit` — оба rc=0.
3. Стенд: `createdb -h localhost -p 5433 -U ivanprotsko -T upready_store_cherkashina upready_store_t02`
   (эта БД уже создана на машине замера — тогда шаг пропускается),
   `apps/backend/.env` с `PORT=9088` и `DATABASE_URL=postgres://ivanprotsko@localhost:5433/upready_store_t02`,
   `npx medusa db:migrate`, `npx medusa develop`; ключ тенанта —
   `select k.token from api_key k join tenant_tenant_api_key_api_key t on t.api_key_id=k.id where t.tenant_id='ten_01M29Q4KYQHC70JZBENWZ8Z88M'`.
   Дальше два curl: `?locale=ru` у `about` даёт русский, `?locale=en` у `offer` даёт русский (фолбэк).
4. `cd apps/backend && DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9199 pnpm test:integration:http -- integration-tests/http/tenants-pages.spec.ts`
   — 9 passed, 9 total.
5. Витрина: `apps/storefront/.env` с `NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9088`,
   `npx next dev -p 8088`, открыть `http://cherkashino.localhost:8088/ru/pages/offer`.

## Чего эта задача не делает

Тенант не создаётся и ничего никуда не импортируется — это `x01-tenant-live-import` после деплоя.
Деплоя нет. Страницы без ключа (`delivery`, `faq`, `wholesale`, `returns`, согласия, памятка возврата)
по-прежнему не показываются — это `t05-page-keys`. Локаль/валюта тенанта по умолчанию — `t06`.
