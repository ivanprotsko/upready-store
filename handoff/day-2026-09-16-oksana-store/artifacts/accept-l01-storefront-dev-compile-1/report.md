# Приёмка l01-storefront-dev-compile — раунд 1

- Записано: 2026-09-17 21:32 WITA (приёмщик, headless claude -p)
- PR #102, ветка feat/day17-storefront-dev-compile → dev, mergeable CLEAN
- Дерево воркера чистое на origin/<branch>, HEAD 01f39981

## Диф (4 файла, +3/-8, только apps/storefront)
- products.ts: удалён `export type { ProductOptionFilterGroup, ProductOptionFilterValue } from "@lib/util/option-filter-groups"` (строки 101–104); внутренний `import type` на строке 8 сохранён
- refinement-list/index.tsx:10, refinement-list/options-picker/index.tsx:5, mobile-refinement/index.tsx:24 — импорт типа переведён на @lib/util/option-filter-groups

## Замеры приёмщика (в worktree ветки, не против живого стенда 8000)
1. `rg -n 'import type .* from "@lib/data/products"' apps/storefront/src` → rc=1, НИ ОДНОГО импортёра типа из products.ts; 9 оставшихся импортов — только функции (listProducts, searchProducts, listProductOptionFilters…)
2. `./node_modules/.bin/next build` → rc=0, 20/20 static pages, ошибок компиляции нет
3. dev-сервер `next dev --turbopack -p 8047` (NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9022): Ready in 1395ms
   - `curl http://localhost:8047/ru` → **200**, 300 571 байт, <title>Kerbstone</title>, маркеров оверлея Build Error в HTML — 0
   - `curl -H 'Host: cherkashino.localhost:8047' http://localhost:8047/ru` → **200**, 299 444 байта
   - `grep -ic 'Ecmascript file had an error' dev-8047.log` → **0**; `grep -ic 'Only async functions are allowed'` → **0**
   - в логе только ожидаемые data-фолбэки (x-publishable-api-key у локального бэкенда) — это условие, которое задача явно разрешает
4. `npx tsc --noEmit` → rc=0
5. `npx vitest run` → rc=0, 27 файлов / 267 тестов пройдено
6. Сервер остановлен по порту, `lsof -iTCP:8047 -sTCP:LISTEN` → rc=1 (пусто), жильцов под worktree нет

## До/после на неисправленном коде
`curl http://localhost:8000/ru` (главный чекаут на dev, БЕЗ этого фикса) → **500**, в теле маркер ошибки присутствует (grep=1). То есть дефект на текущем dev реален, а в дереве PR отсутствует.

## Ниты
- Стенд на 8000 обслуживает главный чекаут и после мержа требует перезапуска — это действие Ивана/диспетчера, приёмщик деплой не трогает.
