---
id: 10-legal-offer
term_ru: "публичная оферта"
term_en: "offer"
short: "Зарезервированная юридическая страница магазина (ключ страницы «offer»), подпись в панели — «Публичная оферта»."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-page.ts
  - apps/backend/src/api/tenants/requisites/helpers.ts
  - apps/tenant-panel/src/routes/pages/page-sections.ts
related:
  - 09-tenant-requisites
  - 19-tenant-page
status: устоялось
source: apps/backend/src/api/tenants/requisites/helpers.ts
---

# публичная оферта (`offer`)

Один из пяти зарезервированных ключей страницы (`TENANT_PAGE_KEYS` = contacts, legal, about, privacy, offer). Подпись «Публичная оферта» задана в двух местах намеренно в синхроне: `RESERVED_PAGE_LABELS.offer` бэкенда и `page-sections.ts` панели (комментарий в коде объясняет дублирование — у роута бэкенда нет доступа к бандлу панели).
