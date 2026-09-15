# Образ бэкенда не собирается после #50: приёмочная фикстура f12 лежит в компилируемом дереве

Деплой d04 (artifacts/d04-deploy-mt-4/report.md, раздел 10; лог artifacts/d04-deploy-mt-4/build-f12-failure.txt) упал на сборке образа mt-backend из `origin/dev` = `ba126e8`:

```
src/scripts/f12-seed-test-order.ts:55:16 - error TS2322: Type '{ id: string[]; }' is not assignable to type 'undefined'.
ERROR: process "/bin/sh -c npx medusa build --lint false && node scripts/copy-migration-data.js" did not complete successfully: exit code: 1
```

Файл `apps/backend/src/scripts/f12-seed-test-order.ts` — одноразовая приёмочная фикстура (в её шапке: «acceptance fixture ONLY … Never run against a real database»). `medusa build` компилирует весь `src/`, поэтому фикстура роняет ПРОДУКТОВЫЙ образ. Живой хост остался на `a530e50` без f12.

## Что сделать

1. Убрать фикстуру из компилируемого дерева: перенести в некомпилируемое место (например `apps/backend/scripts/fixtures/` — проверь `tsconfig.json` `include`/`exclude` и Dockerfile, чтобы каталог не попадал в `medusa build`), поправить её типы, чтобы она хотя бы проходила `tsc` при прямом запуске через `tsx`/`medusa exec`.
2. Закрыть класс, а не место: (а) в `AGENTS.md` бэкенда — правило «приёмочные фикстуры и одноразовые seed-скрипты живут вне `src/`»; (б) добавить в корневые скрипты команду `pnpm check:backend-build` = `cd apps/backend && npx medusa build --lint false` (или эквивалент), которую приёмка обязана гонять для любого PR, трогающего `apps/backend`; (в) юнит-проверка (vitest/node:test), которая падает, если под `apps/backend/src/scripts/` появляется файл с маркером `fixture ONLY`/`seed-test` — с сообщением, куда его класть.
3. Прогнать `npx medusa build --lint false` локально в `apps/backend` — rc=0, вывод в `artifacts/docs/f18-f12-fixture-build/medusa-build.txt`.

## Критерий готовности

`npx medusa build --lint false` в `apps/backend` завершается rc=0 на ветке; юнит-проверка из п.2в красная на коммите `ba126e8` (покажи прогон `git stash`/checkout не нужен — достаточно теста с фикстурным путём) и зелёная на ветке; PR открыт. Локальный Docker Desktop сломан — `docker build` не запускай, сборку образа проверит деплой d05.
