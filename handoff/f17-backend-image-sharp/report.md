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
