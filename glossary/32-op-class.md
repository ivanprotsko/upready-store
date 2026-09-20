---
id: 32-op-class
term_ru: "класс операций"
term_en: "opClass"
short: "Группа однотипных запросов записи (stocks, prices, feedback_answers, fbs_orders), на которую владелица даёт согласие целиком."
used_in:
  - apps/backend/src/modules/wb-write/write-endpoints.ts
  - apps/backend/src/modules/marketplace-write/models/marketplace-write-consent.ts
related:
  - 31-marketplace-write-consent
status: кандидат
source: apps/backend/src/modules/wb-write/write-endpoints.ts
---

# класс операций (`opClass`)

`opClass` (WB-эндпоинты, `wb-write/write-endpoints.ts`) и `op_class` (модели `marketplace-write-*`): stocks, prices, feedback_answers, fbs_orders. Согласие действует на весь класс, а не на отдельный вызов.
