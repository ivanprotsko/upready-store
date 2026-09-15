# Пачка: краснота `dev`, снапшот модуля tenant и недостающие сюиты

Пять долгов качества, каждый назван приёмщиками замером и отложен «отдельной задачей». Источники:
- `logs/accept-t06-locale-currency-2.findings.md`, «Разбор трёх падений полного seam-сьюта» — там прямо написано
  «Отдельная задача для диспетчера: `dev` сейчас красный на этих трёх тестах»;
- `artifacts/accept-t11-seo-redirects-3/REPORT.md`, «Нитки», пункт 7;
- `logs/accept-t15-product-attributes-3.findings.md` (тот же `profile-data` красный на `dev`);
- `logs/accept-t12-legal-requisites-1.findings.md`, пункт 2 (снапшот модуля `tenant`);
- `logs/accept-t09-reviews-4.findings.md`, «Помарки», пункт 2.

## Что замерено

1. `src/migration-scripts/__tests__/profile-data.unit.spec.ts › i18n merge › leaves a locale the profile never
   translated identical to the base` — падает на самом `dev` (подтверждено тремя независимыми приёмками).
2. `integration-tests/http/tenants-domains.spec.ts › resolves a custom host as soon as the tenant adds it` —
   лишнее поле `is_primary`, приехало с `x02-domains`.
3–4. `integration-tests/http/tenants.spec.ts › resolves shipping options only from the tenant's own warehouse`
   и `› keeps two tenants' warehouses apart even in the same city` — приехали с PR #25 (t04-shipping-tariffs,
   переименование способов доставки).
5. `apps/backend/src/modules/tenant/migrations/.snapshot-tenant.json` **не знает `tenant_requisites`**:
   миграция `Migration20260915063900` написана руками (это законно и объяснено в файле), а снапшот за ней не
   пошёл. Следующая задача, которая тронет модуль `tenant`, получит от `db:generate` ДУБЛЬ миграции.
   Ловушка записана в `~/upready/memory/upready-store-tenant-module-generated-snapshot-merge-trap-2026-09-15.md`.
   Проверь ТЕКУЩЕЕ состояние снапшота на `dev` замером — часть таблиц могла доехать позже.
6. HTTP-сюит на `/tenants/reviews` и `/store/tenant/reviews` **нет** — автор t09 объявил это следующим шагом,
   приёмщик согласился как с долгом.

## Что сделать

Почини четыре красных теста ПО ПРИЧИНЕ (в каждом случае: что изменилось в коде и почему тест перестал быть
верным — либо тест устарел и правится тест, либо код сломался и правится код; назови, что именно, по каждому).
Догони снапшот модуля `tenant`. Напиши `integration-tests/http/tenants-reviews.spec.ts`.

## Критерий готовности

- `cd apps/backend && pnpm test:unit` → `Tests: 0 failed`; `pnpm test:integration:http` → `0 failed`.
  **Читается результирующая строка ВСЕГО файла (`ℹ fail`), а не PASS своего нового теста** (правило 19c);
  вывод обоих прогонов целиком в артефактах.
- `npx medusa db:migrate && npx medusa build && npx medusa db:generate tenant` на чистой ветке **не создаёт**
  новой миграции; вывод команды приложен, `git status` после неё пуст.
- `tenants-reviews.spec.ts` покрывает: счастливый путь модерации, 401 без токена владельца, 401 анонима на
  `POST /store/tenant/reviews`, изоляцию двух тенантов по одному `product_id`.
Отчёт `artifacts/docs/b15-quality-debt/report.md`. Один PR на всю пачку.
