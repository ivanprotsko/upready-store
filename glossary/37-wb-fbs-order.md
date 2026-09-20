---
id: 37-wb-fbs-order
term_ru: "сборочное задание FBS (WB)"
term_en: "wb_fbs_order"
short: "Заказ Wildberries по схеме FBS (склад продавца) — зеркальная копия сборочного задания из кабинета WB."
used_in:
  - apps/backend/src/modules/wb/models/wb-fbs-order.ts
  - apps/tenant-panel/src/i18n/translations/ru.json
related:
  - 26-wb-sync-run
  - 36-wb-mirror
status: устоялось
source: apps/backend/src/modules/wb/models/wb-fbs-order.ts
---

# сборочное задание FBS (WB) (`wb_fbs_order`)

Модель `wb_fbs_order`: строки читаются из кабинета продавца WB и связываются с поставками (`wb-supply`). В панели — вкладка «Заказы FBS» раздела Wildberries; список берётся из нашей базы, обновление страницы не расходует лимит запросов к WB.
