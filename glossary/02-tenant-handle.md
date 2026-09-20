---
id: 02-tenant-handle
term_ru: "хэндл тенанта"
term_en: "handle"
short: "Уникальный URL-идентификатор магазина (tenant.handle), не путать с handle товара (см. 46)."
used_in:
  - apps/backend/src/modules/tenant/models/tenant.ts
  - apps/backend/src/api/tenants/tenant-scope.ts
related:
  - 01-tenant
  - 07-tenant-handle-alias
  - 46-product-handle
status: устоялось
source: apps/backend/src/modules/tenant/models/tenant.ts
---

# хэндл тенанта (`handle`)

Поле `handle` модели `tenant` — уникальный текстовый идентификатор магазина, из которого строится адрес витрины по умолчанию (`primaryHostFor`). Меняется владельцем; прежние значения переживают в `tenant_handle_alias` для 301-редиректов. Отдельная сущность от `handle` товара (id 46) — тот же термин в другом контексте, по стандарту словаря — разные записи.
