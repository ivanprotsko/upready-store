---
id: 38-ozon-posting
term_ru: "отправление Ozon (posting)"
term_en: "ozon_posting"
short: "Заказ Ozon (аналог сборочного задания WB) — зеркальная копия отправления из кабинета продавца Ozon."
used_in:
  - apps/backend/src/modules/ozon/models/ozon-posting.ts
related:
  - 37-wb-fbs-order
  - 29-mp-sync-run
status: устоялось
source: apps/backend/src/modules/ozon/models/ozon-posting.ts
---

# отправление Ozon (posting) (`ozon_posting`)

Модель `ozon_posting`: нормализуется адаптером Ozon и попадает в общий слой `mp_sync_run`/`mp_offer` наравне с WB.
