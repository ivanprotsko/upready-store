---
id: 29-mp-sync-run
term_ru: "прогон синхронизации маркетплейса"
term_en: "mp_sync_run"
short: "Общая для всех маркетплейсов таблица прогонов импорта (одна на WB и Ozon вместе, а не по одной на каждый)."
used_in:
  - apps/backend/src/modules/marketplace/models/mp-sync-run.ts
related:
  - 26-wb-sync-run
status: кандидат
source: apps/backend/src/modules/marketplace/models/mp-sync-run.ts
---

# прогон синхронизации маркетплейса (`mp_sync_run`)

Модель `mp_sync_run` — нормализованная замена `wb_sync_run` на несколько маркетплейсов: одна таблица, потому что вопрос акцептора «что реально прогонялось, везде» на двух таблицах — это два запроса и один забытый маркетплейс. Строки `wb_sync_run` переносятся туда миграцией `marketplace = 'wb'`.
