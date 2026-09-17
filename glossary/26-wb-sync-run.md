---
id: 26-wb-sync-run
term_ru: "прогон синхронизации WB"
term_en: "wb_sync_run"
short: "Одна попытка чтения одного вида данных из Wildberries (карточки/цены/остатки/заказы/…) — от старта до конца."
used_in:
  - apps/backend/src/modules/wb/models/wb-sync-run.ts
  - apps/tenant-panel/src/routes/settings/wildberries/wildberries.tsx
related:
  - 29-mp-sync-run
  - 36-wb-mirror
status: устоялось
source: apps/backend/src/modules/wb/models/wb-sync-run.ts
---

# прогон синхронизации WB (`wb_sync_run`)

Модель `wb_sync_run`: `kind` из `WB_SYNC_KINDS`, статусы running/succeeded/rate_limited/failed. Упавший прогон остаётся видимым записью со статусом failed, а не пропадает — иначе пустое зеркало читалось бы как «нечего импортировать». `rate_limited` — отдельный статус, не ошибка: у базового токена лимит — штатный режим работы (5 запросов/час на отзывы и вопросы).
