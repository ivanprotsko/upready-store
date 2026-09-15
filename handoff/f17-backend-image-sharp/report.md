# f17-backend-image-sharp — Образ mt-backend не содержит модуль sharp

Ветка `fix/day16-backend-image-sharp`, база `dev`.

## Что было сломано

Бэкенд, собранный из `dev` в ~11:20 WITA, падал на старте:

```
Error starting server: An error occurred while registering API Routes.
Error: Cannot find module 'sharp'
Require stack: /app/src/api/tenants/branding/upload/route.js
```

`restart: unless-stopped` превращал это в цикл перезапусков (RestartCount=7).

## Причина — не «потеря при сборке», а секция в package.json

Бриф говорил, что `sharp` объявлен в `dependencies` (строка 74). Строка верна, **секция — нет**:
до этого PR `sharp` стоял в `devDependencies`. Цепочка целиком, каждое звено прочитано в коде:

1. `apps/backend/src/api/tenants/branding/upload/route.ts:4` — `import sharp from "sharp"` на
   верхнем уровне модуля. Medusa грузит каждый файл под `src/api` при старте, до первого запроса.
2. `apps/backend/package.json` — `sharp` стоял в `devDependencies`, не в `dependencies`.
3. `medusa build` копирует `apps/backend/package.json` в `.medusa/server/package.json` **дословно**,
   без фильтрации зависимостей — `@medusajs/framework` 2.19.0,
   `dist/build-tools/compiler.js:360` (обычный `copy`, одна строка).
4. Runtime-стадия Dockerfile ставит зависимости из этой копии командой
   `npm install --omit=dev` (`apps/backend/Dockerfile:88`), которая по определению пропускает
   `devDependencies`.

Поэтому `sharp` не попадал в образ ни разу. Проверено на самом хосте, read-only:

```
$ ssh root@84.46.251.149 'for T in d03-new-broken-sharp latest wave2-2508708; do …; done'
===== mt-backend:d03-new-broken-sharp =====
  sharp in node_modules: ABSENT
  require(sharp):        MODULE_NOT_FOUND: Cannot find module 'sharp'
  branding route file:   PRESENT
  package.json section:  deps=undefined devDeps=^0.35.4
===== mt-backend:latest =====
  sharp in node_modules: ABSENT
  require(sharp):        MODULE_NOT_FOUND: Cannot find module 'sharp'
  branding route file:   ABSENT
  package.json section:  deps=undefined devDeps=^0.35.4
===== mt-backend:wave2-2508708 =====
  sharp in node_modules: ABSENT
  require(sharp):        MODULE_NOT_FOUND: Cannot find module 'sharp'
  branding route file:   ABSENT
  package.json section:  deps=undefined devDeps=^0.35.4
```

Это и объясняет, почему платформа жила до сегодня: `sharp` отсутствовал во **всех трёх** образах,
но роут, который его импортирует, есть только в новом. Старые образы поднимались, потому что им
нечего было резолвить. (`latest` и `wave2-2508708` — один и тот же image ID `23b1b64e2ccc`,
проверено `docker images`; сейчас на хосте работает именно он.)

Версия `sharp` ни при чём: `^0.35.4` не менялась, менялась только секция. Требование брифа
«не трогать версии, пока замер не докажет обратное» выполнено.

## Что изменено

| Файл | Что |
|---|---|
| `apps/backend/package.json` | `sharp` перенесён из `devDependencies` в `dependencies` (версия `^0.35.4` та же) |
| `pnpm-lock.yaml` | та же запись перенесена между секциями импортера `apps/backend` — сгенерировано `pnpm install --lockfile-only`, разрешение пакета не изменилось (`version: 0.35.4(@types/node@20.19.26)`) |
| `apps/backend/scripts/verify-runtime-modules.mjs` | новый — гвард класса ошибок |
| `apps/backend/Dockerfile` | `+27` строк: гвард после runtime-install и комментарий о ловушке `--omit=dev` |

Правка lock-файла обязательна, а не косметика: build-стадия (`Dockerfile:54`) ставит зависимости
через `pnpm install --frozen-lockfile`, и package.json, разошедшийся с локом, уронил бы саму сборку.

### Гвард против класса

`apps/backend/scripts/verify-runtime-modules.mjs`, вызывается в `Dockerfile:103` сразу после того,
как в образе впервые оказались одновременно `node_modules` и скомпилированное дерево `src/`.

Скрипт **делает `require`** каждого модуля, который Medusa грузит на старте (`src/api`,
`src/subscribers`, `src/jobs`, `src/links`, `src/modules`, `src/workflows`, `src/scripts`,
`src/migration-scripts`, плюс `medusa-config.js`), то есть проверяет настоящий граф импортов, а не
догадку регуляркой по нему. Сборку роняет **только** `MODULE_NOT_FOUND`; всё остальное, что модуль
может бросить при импорте в пустой сборочной среде (нет `DATABASE_URL` и т.п.), печатается и
прощается — это факт о среде, а не о содержимом образа.

Два свойства проверены замером, а не заявлены:

- **ленивый `require` внутри функции не считается.** `src/scripts/import-cherkashina-reviews.ts:93`
  делает `require("pg")` внутри хелпера, `pg` остаётся devDependency — гвард на нём молчит, потому
  что простой `require` модуля тело функции не исполняет.
- **`__tests__` пропускаются.** Они компилируются в образ, но jest там не запускается, и их
  `describe is not defined` ничего не говорит о загрузочности образа.

Скрипт остаётся внутри образа, так что ту же проверку можно повторить на живом контейнере:

```
docker exec mt-backend node /usr/local/bin/verify-runtime-modules.mjs /app
```

## Как это замерено

Локальный Docker Desktop на машине Ивана сломан независимо от задачи (подробности ниже), поэтому
образ собран на живом хосте как **одноразовый** `mt-backend:f17-bench` — без compose, без сети
и БД стенда, три существующих тега не тронуты, образ удалён после замеров. Разрешение дал
диспетчер (сессия upready-store-59).

### 1. Образ, собранный из этой ветки (linux/x64, node 22, alpine/musl)

```
$ docker build -f apps/backend/Dockerfile -t mt-backend:f17-bench .     # контекст = корень репо, как в compose.mt.yml
rebuild rc=0
#20 8.899 verify-runtime-modules: 324 boot modules required, all imports resolve
#23 writing image sha256:608ac8082869643bbcf5cad1931a0fc3cd7624ddcfd1398ded65be8a5e7fb946

$ docker run --rm --entrypoint node mt-backend:f17-bench -e 'require("sharp"); console.log("ok")'
  require(sharp):        ok
  node_modules/@img:     colour sharp-libvips-linuxmusl-x64 sharp-linuxmusl-x64 sharp-wasm32
  sharp version:         libvips 8.18.6
  branding route file:   PRESENT
  package.json section:  deps=^0.35.4 devDeps=undefined
  the route itself:      route module loads
  arch: linux/x64 node v22.23.2
```

Последняя строка — самая важная: грузится **тот самый модуль**, на котором падал бэкенд
(`/app/src/api/tenants/branding/upload/route.js`), а не просто пакет рядом с ним. Платформенные
бинарники для musl/x64 на месте — вопрос брифа про «переживут ли они `--omit=dev`» снят замером:
переживают, потому что `npm install` выполняется ВНУТРИ образа и тянет бинарники под его
собственную платформу.

### 2. Гвард действительно роняет сборку (отрицательный контроль)

Поверх собранного образа, чтобы не пересобирать всё заново:

```
FROM mt-backend:f17-bench
RUN find /app/node_modules/sharp -delete
RUN node /usr/local/bin/verify-runtime-modules.mjs /app
```

```
negative-control build rc=1  (ожидается НЕ 0)
#6 9.167 verify-runtime-modules: 1 of 324 boot modules cannot resolve an import inside this image:
#6 9.168   src/api/tenants/branding/upload/route.js  ->  cannot find module 'sharp'
#6 ERROR: process "/bin/sh -c node /usr/local/bin/verify-runtime-modules.mjs /app" did not complete successfully: exit code: 1
ERROR: failed to build: failed to solve: process … exit code: 1
```

То есть ровно тот отказ, что положил живой бэкенд, теперь убивает СБОРКУ и печатает виновный файл.

### 3. Runtime-стадия, воспроизведённая без docker (до и после)

Скрипт повторяет строки 70 → 88 → 90 → 103 Dockerfile на macOS. Логи целиком:
file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-backend-image-sharp/artifacts/docs/f17-backend-image-sharp/runtime-stage-before.log
file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-backend-image-sharp/artifacts/docs/f17-backend-image-sharp/runtime-stage-after.log

| | package.json из HEAD~1 | package.json с фиксом |
|---|---|---|
| `dependencies.sharp` | undefined | `^0.35.4` |
| `node_modules/sharp` после `npm install --omit=dev` | **ABSENT** | **PRESENT** |
| `require("sharp")` | MODULE_NOT_FOUND | ok |
| гвард | **rc=1**, `src/api/tenants/branding/upload/route.js -> cannot find module 'sharp'` | **rc=0**, 321 модуль, ноль прощённых |

Заодно проверено, что `medusa build` действительно кладёт копию дословно:

```
$ diff -q apps/backend/package.json apps/backend/.medusa/server/package.json
IDENTICAL
```

### 4. Проверки, которые предписывает AGENTS.md для бэкенда

```
$ cd apps/backend && npx tsc --noEmit      # rc=0
$ npx medusa lint                          # rc=0 — ✖ 59 problems (0 errors, 59 warnings), все предсуществующие
$ corepack pnpm install --frozen-lockfile  # Done in 18.5s — лок и package.json сходятся
```

### 5. Живая платформа после работ на хосте — не задета

```
https://start.upready.dev/start/onboarding                          200 ssl=0
https://panel-store.upready.dev/                                    200 ssl=0
https://zolotaya-nit-1057.shipshift.dev/                            302 -> /ru, по редиректу 200 ssl=0
https://shipshift.dev/static/store-profiles/abstract/home-hero.webp 200 ssl=0

mt-backend Up 2 hours (healthy)      mt-panel Up 2 hours (healthy)
mt-storefront Up 2 hours (healthy)   mt-postgres Up 3 days (healthy)
mt-ingress-sync Up 3 days            upreadystore-bot Up 27 hours

/mt-backend image=mt-backend:latest status=running restarts=0 started=2026-09-15T04:12:06Z
docker images | grep mt-backend  →  d03-new-broken-sharp, latest, wave2-2508708 (только три известных)
```

`302` у витрины тенанта — штатный редирект локали (`/` → `/ru`), а не регрессия.

## Чего НЕТ и почему

- **`GET /health` 200 в docker run.** Не снято намеренно. Поднять бэкенд — значит дать ему БД, а
  единственная здесь — живая `mt-postgres` со всеми магазинами тенантов; цеплять к ней bench-контейнер
  я не стал. Вместо этого снято более узкое, но более прицельное: грузится сам модуль роута, на
  котором падал старт. `/health` 200 закрывает d03-deploy-mt-3 своим деплоем — это и есть его приёмка.
- **Сборка образа локально на Mac.** Невозможна: у Docker Desktop повреждён containerd-стор.
  `docker pull node:22-alpine` и сборка двухстрочного `FROM alpine:3.20` падают одинаково:
  `write /var/lib/containerd/io.containerd.metadata.v1.bolt/meta.db: input/output error`.
  Повреждение получено, пока диск Mac стоял на 100 %. Диск освобождён (25 ГБ, виноват был
  `~/.npm` = 29 ГБ, не Docker), но демон сам не восстановился — нужен рестарт Docker Desktop,
  который сегодня запрещён: на нём живут чужие стенды. Это FYI Ивану, не блокер задачи.
- **`pg` не перенесён в dependencies.** Он тоже devDependency, но
  `src/scripts/import-cherkashina-reviews.ts:93` требует его ЛЕНИВО, внутри функции, и запускает
  этот скрипт только оператор вручную. На старте контейнера он не нужен, гвард на нём молчит.

## Как принять за 10 минут

```bash
git fetch origin && git checkout fix/day16-backend-image-sharp

# 1. Секция изменилась, версия нет
node -e 'const p=require("./apps/backend/package.json");console.log("deps:",p.dependencies.sharp,"| devDeps:",p.devDependencies.sharp)'
#   deps: ^0.35.4 | devDeps: undefined

# 2. Лок сходится (иначе упала бы build-стадия Dockerfile)
corepack pnpm install --frozen-lockfile

# 3. Собрать образ и убедиться, что гвард отработал в сборке
docker build -f apps/backend/Dockerfile -t mt-backend:accept-bench .
#   ... verify-runtime-modules: 324 boot modules required, all imports resolve

# 4. sharp и сам падавший роут
docker run --rm --entrypoint node mt-backend:accept-bench -e 'require("sharp");console.log("sharp ok")'
docker run --rm --entrypoint node mt-backend:accept-bench -e 'require("/app/src/api/tenants/branding/upload/route.js");console.log("route ok")'

# 5. Гвард ловит класс (должно УПАСТЬ с exit code 1)
printf 'FROM mt-backend:accept-bench\nRUN find /app/node_modules/sharp -delete\nRUN node /usr/local/bin/verify-runtime-modules.mjs /app\n' > /tmp/negctl.Dockerfile
docker build -f /tmp/negctl.Dockerfile -t negctl:bench-1 /tmp

docker image rm mt-backend:accept-bench
```

Деплой после мержа — за d03-deploy-mt-3, как и записано в задаче.
