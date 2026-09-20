# Приёмка f17-backend-image-sharp · PR #44 · раунд 1

Приёмщик: headless-сессия, главный чекаут `dev`. Отчёт составлен 2026-09-15 14:05 WITA.
Ветка `fix/day16-backend-image-sharp`, база `dev`, HEAD = origin = `a2a5104`, `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`.

## Замеры приёмщика (не текст PR — правило 18f)

Локальный Docker Desktop действительно сломан независимо от задачи — проверено самостоятельно:
`docker pull node:22-alpine` → rc=1, `write /var/lib/containerd/io.containerd.metadata.v1.bolt/meta.db: input/output error`
(`local-docker-broken.log`). Поэтому образ собран приёмщиком на 84.46.251.149 из **своей** копии
дерева ветки (`git archive origin/fix/day16-backend-image-sharp` → /opt/upready-store/accept-f17),
своим одноразовым тегом `mt-backend:accept-f17-bench`, вне compose и вне сети coolify.

| # | Критерий приёмки | Команда | Ожидалось | Замерено |
|---|---|---|---|---|
| 1 | `require('sharp')` в образе | `docker run --rm --entrypoint node mt-backend:accept-f17-bench -e "require('sharp')…"` | ok | **REQUIRE_SHARP_OK, libvips 8.18.6**, rc=0 |
| 2 | Грузится сам падавший роут | `… -e "require('/app/src/api/tenants/branding/upload/route.js')"` | загружается | **ROUTE_MODULE_OK**, rc=0 |
| 3 | Платформенные бинарники | `ls node_modules/@img` | под linux/musl/x64 | colour, sharp-libvips-linuxmusl-x64, sharp-linuxmusl-x64, sharp-wasm32; `uname -m` = x86_64, node v22.23.2 |
| 4 | Сборочный гвард отработал | `node /usr/local/bin/verify-runtime-modules.mjs /app` в образе | все импорты резолвятся | **324 boot modules required, all imports resolve**, rc=0 |
| 5 | Гвард роняет СБОРКУ, а не хост (отрицательный контроль) | `docker build --no-cache` поверх образа с `find /app/node_modules/sharp -delete` | rc≠0 | **rc=1**, `1 of 324 boot modules cannot resolve an import inside this image: src/api/tenants/branding/upload/route.js -> cannot find module 'sharp'` |
| 6 | **GET /health 200 в docker run** — критерий, который PR НЕ снял | одноразовый `postgres:16-alpine` в изолированной сети + контейнер образа с env по форме compose.mt.yml | 200 | **HEALTH_200 after 200s**, тело `OK`; в логе `Server is ready on port: 9000`, ни одного `Cannot find module` |

Файлы: `image-measurements.log` (1–4), `health-200.log` и `backend-boot.log` (6), `cleanup-and-live.log`.

## Код (прочитан, не пересказан)

- `apps/backend/package.json`: `sharp ^0.35.4` перенесён из `devDependencies` в `dependencies`, версия не менялась — требование «не трогать версии» выполнено.
- `pnpm-lock.yaml`: та же запись перенесена между секциями импортера `apps/backend`, разрешение то же (`0.35.4(@types/node@20.19.26)`).
- `apps/backend/src`: `import sharp from "sharp"` ровно в одном файле — `api/tenants/branding/upload/route.ts:4`, на верхнем уровне модуля. Диагноз PR подтверждён.
- `apps/backend/Dockerfile`: гвард стоит ПОСЛЕ `npm install --omit=dev` и ПОСЛЕ `COPY … .medusa/server ./` — то есть в первой точке, где в образе есть и node_modules, и скомпилированный `src/`. Скрипт остаётся в образе (`/usr/local/bin`), его можно переиграть на живом контейнере.
- `apps/backend/scripts/verify-runtime-modules.mjs`: делает настоящий `require` каждого модуля boot-директорий, роняет сборку ТОЛЬКО на `MODULE_NOT_FOUND`, прочее терпит и печатает; `__tests__`/`data`/`node_modules` пропущены; `process.chdir(root)` — потому что medusa-config объявляет модули путями относительно cwd.
- `.dockerignore` (корневой, единственный, что читается при контексте `.`) файл гварда не исключает — COPY в Dockerfile действительно находит его.
- Секретов в диффе нет (`grep` по password/secret/key/token в патче — ноль), миграций нет, удалений нет, изменений в защищённой инфраструктуре нет. Скоуп-крипа нет: 4 файла кода + логи замеров + отчёт + HANDOFF.

## Прочие проверки

- `npx tsc --noEmit` в `apps/backend` — **rc=0** (прогнал сам, в воркtree ветки).
- Живая платформа после всех работ приёмщика на хосте: start.upready.dev/start/onboarding 200, panel-store.upready.dev 200, zolotaya-nit-1057.shipshift.dev 200 ssl=0, shipshift.dev/static/... 200, hooks.svgnoon.upready.dev/health 200. Контейнеры mt-backend/mt-panel/mt-storefront/mt-postgres/mt-ingress-sync/upreadystore-bot/coolify-proxy/agentcreatr-bridge — все Up. Три исходных тега mt-backend (d03-new-broken-sharp, latest, wave2-2508708) на месте, ни один не тронут; мои одноразовые образы и контейнеры удалены.

## Ниты (не основание для отклонения)

1. На хосте остались два МОИХ артефакта приёмки, которые я не удалил: каталог `/opt/upready-store/accept-f17` (~230 МБ копии исходников ветки) и пустая docker-сеть `accept-f17-net`. Оба удаления блокирует protected-infra-guard (rule 42e, `rm -r` под `/opt/upready-store` и `network rm`), а escape `INFRA_OK=1` требует явного OK Ивана — я его не имею и не подставлял. Снести можно одной командой с разрешения Ивана; на живые сервисы не влияет.
2. В воркtree ветки лежит неотслеженный `handoff/fix-day16-backend-image-sharp/s-2026-09-15/002-status.json` и правка HANDOFF.json — журнал процесса, к мержу отношения не имеет.
3. `pg` остаётся devDependency при ленивом `require` в `src/scripts/import-cherkashina-reviews.ts:93` — гвард его молчанием покрывает корректно, но класс «ленивый require девзависимости» гвардом не ловится by design. Это осознанное ограничение, задокументировано в шапке скрипта.

## Вердикт

Все шесть критериев приёмки закрыты замером приёмщика, включая `GET /health` 200, который PR честно объявил неснятым. Принято.
