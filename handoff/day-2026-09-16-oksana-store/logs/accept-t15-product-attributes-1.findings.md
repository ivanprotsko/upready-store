# Приёмка PR #35 · t15-product-attributes · раунд 1 — REJECTED

Приёмщик: headless `claude -p`, главный чекаут `dev`. Отчёт составлен 2026-09-15 09:17 WITA.
PR: https://github.com/ivanprotsko/upready-store/pull/35 · head `feat/day16-product-attributes` · base `dev` — совпадает с заданием.

## Что блокирует (одна находка, в силах воркера)

### 1. PR на GitHub НЕ СЛИВАЕТСЯ: конфликт с `dev`, а разрешение лежит локально и не запушено

Замер:

```
$ gh pr view 35 --json mergeable,mergeStateStatus,headRefOid,updatedAt
{"headRefOid":"838e04c7b1fbe1bfcef4c714a43911507ad623cb","mergeStateStatus":"DIRTY","mergeable":"CONFLICTING","updatedAt":"2026-09-15T01:09:57Z"}
```

Перепроверено через 20 с после первого запроса — состояние то же (не «ещё считается»).

В воркtree `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-product-attributes`
дерево ЧИСТОЕ, но HEAD впереди своей ветки на origin:

```
$ git rev-parse HEAD                                  → b07f4e55eab46ba4f117b3dfaab04637aa433fef
$ git rev-parse origin/feat/day16-product-attributes  → 838e04c7b1fbe1bfcef4c714a43911507ad623cb
$ git rev-list --left-right --count origin/feat/day16-product-attributes...HEAD → 0  7
```

`b07f4e5` — это `Merge remote-tracking branch 'origin/dev' into feat/day16-product-attributes`
(2026-09-15 09:12:40 +0800), и его собственное сообщение перечисляет разрешённые конфликты:

```
# Conflicts:
#       apps/backend/src/modules/tenant/models/tenant.ts
#       apps/backend/src/modules/tenant/service.ts
#       apps/storefront/src/app/[locale]/(main)/categories/[...category]/page.tsx
```

То есть работа сделана, но НЕ ОТПРАВЛЕНА: GitHub — это книга учёта (18f), а на GitHub
стоит `838e04c7` без слияния. Лечение — один вызов из того же воркtree:

```
cd /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-product-attributes
git push origin feat/day16-product-attributes
gh pr view 35 --json mergeable   # должно стать MERGEABLE
```

(если после `git fetch origin` `dev` уедет дальше — повторить `git merge origin/dev`, разрешить, запушить).

## Что приёмщик ПРОВЕРИЛ САМ и что зелено (на смерженном дереве `b07f4e5`)

Прогнано мной, вывод — в артефактах рядом:

| Проверка | Результат |
|---|---|
| `apps/backend  npx tsc --noEmit` | rc=0 |
| `apps/tenant-panel  pnpm typecheck` | rc=0 |
| `apps/storefront  npx tsc --noEmit` | rc=0 |
| `apps/storefront  pnpm test` | Test Files 14 passed (14), Tests 141 passed (141), rc=0 |
| `apps/backend  pnpm test:unit` | Test Suites: 1 failed, 10 passed, 11 total · Tests: 1 failed, 115 passed, 116 total, rc=1 |

Единственное падение — `src/migration-scripts/__tests__/profile-data.unit.spec.ts`
«i18n merge › leaves a locale the profile never translated identical to the base»
(лишний `productOptions: {}` в профиле `fr`). Оно НЕ от этой ветки, и это замерено, а не
предположено: `git diff --name-only origin/dev...838e04c7 | grep -c migration-scripts` → `0`,
ветка не трогает ни тест, ни его данные. Воркер зафиксировал то же падение на точке ветвления.
Рекомендация — отдельная задача на `dev`, не блокирует t15.

Прочее из списка «повод отклонить» — чисто:
* удалённых файлов в диффе — `0` (`git diff --diff-filter=D --name-only origin/dev...838e04c7 | wc -l`);
* секретов в новом коде не найдено (грэп по `+`-строкам `apps/**/*.ts{,x}` на
  `secret|password|api_key|token` с литералом ≥12 символов — пусто);
* миграция `Migration20260915000453.ts` — ТОЛЬКО `create table if not exists` трёх новых таблиц
  `tenant_product_attribute{,_option,_value}` плюс индексы и FK; ни одной существующей таблицы
  не трогает, `down()` роняет только свои три. Защищённой инфраструктуры не касается;
* типизованное хранение значений (`value_text`/`value_number`/`value_boolean`) отвечает
  требованию задачи «число, записанное текстом, диапазоном не фильтруется».

## Чего приёмщик в этом раунде НЕ измерял

Живой стенд (`:9152`/`:5152`/`:8152`, база `upready_store_t15`) я НЕ поднимал и своих
скриншотов/curl по критериям приёмки не делал: PR в текущем виде слить нельзя, и живой замер
всё равно придётся повторить на том дереве, которое реально уедет в `dev`. Числа воркера
(диапазон 100..500 → 3 товара, фасеты медиана 24.8 мс на 3000 товаров, изоляция второго
магазина) в раунде 1 НЕ перепроверены — это делает раунд 2 после пуша.

## Что сделать воркеру

1. Запушить `feat/day16-product-attributes` (см. находку 1), убедиться, что `mergeable` стал `MERGEABLE`.
2. Больше ничего: код, схема и отчёт возражений не вызвали.
