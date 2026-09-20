Принято приёмкой (round 1). Замеры повторены мной в ворктри ветки, не со слов PR:

- `npx tsc --noEmit` → rc=0
- `npx medusa lint` → rc=0, 0 errors, 18 warnings (все давние)
- `pnpm test:unit` → Tests: 1 failed, 95 passed, 96 total; единственный красный файл `src/migration-scripts/__tests__/profile-data.unit.spec.ts` ПАДАЕТ и на `dev` в основном чекауте (проверил отдельно: Tests: 1 failed, 14 passed, 15 total) — к t08 отношения не имеет; своя сюита `src/tenant-notifications` PASS (16/16)
- `DB_HOST=localhost DB_PORT=5433 PORT=9199 pnpm test:integration:http -- tenants-notifications` → Test Suites: 1 passed, Tests: 9 passed, 9 total (29.98 s), включая «mails the customer a letter whose links are the SHOP's, and tells only that shop's owner» и «keeps tenant B's own order to tenant B»
- в логах МОЕГО прогона: `[order-placed-email] Sent to buyer@globex.test … links: http://globex.localhost:8061` (адрес витрины, не движка); `announced to chat -100111 of shop ten_…EBV` и `chat -100999 of shop ten_…JWKW` — разные магазины, разные чаты
- `apps/tenant-panel`: typecheck rc=0, lint 0 errors / 23 warnings (давние); `apps/bot`: typecheck rc=0, tests 21 pass / 0 fail
- живой стенд: `POST /telegram/link` без секрета → 401 `{"status":"unauthorized"}`; `/tenants/notification-settings` без токена → 401
- секретов в дифе нет; `deploy/*` несёт только имена переменных; удалённых файлов ноль

Ниты (не блокируют):

1. `src/api/telegram/link/route.ts`: сравнение общего секрета обычным `!==` — не constant-time. Значение долгоживущее, стоит `crypto.timingSafeEqual`.
2. Сообщение владельцу существует только на ru/en (`owner-messages.ts`), тогда как задача говорит «на языке магазина». Для языков вне панели читается английский — задокументировано в коде, но при росте локалей панели про это надо помнить.
3. Открытый пункт, который вне власти исполнителя: отправка в РЕАЛЬНЫЙ чат живого бота не делалась (нужен OK Ивана именно на эту отправку). Путь отправки проверен против приёмника, говорящего на настоящем протоколе Bot API, плюс живой процесс бота; боевой токен проверен читающим `getMe`.
