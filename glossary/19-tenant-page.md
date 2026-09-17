---
id: 19-tenant-page
term_ru: "страница магазина"
term_en: "tenant_page"
short: "Одна страница витрины: либо зарезервированная (contacts/legal/about/privacy/offer), либо своя, с произвольным slug."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-page.ts
  - apps/tenant-panel/src/routes/pages/page-list/page-list.tsx
related:
  - 10-legal-offer
  - 09-tenant-requisites
status: устоялось
source: apps/backend/src/modules/tenant/models/tenant-page.ts
---

# страница магазина (`tenant_page`)

Модель `tenant_page` + `TENANT_PAGE_KEYS`. Пять ключей зарезервированы (у каждого фиксированная подпись из `page-sections.ts`), остальные — собственные страницы владельца с его собственным заголовком.
