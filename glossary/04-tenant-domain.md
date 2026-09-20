---
id: 04-tenant-domain
term_ru: "домен тенанта"
term_en: "tenant_domain"
short: "Кастомный хост магазина сверх системного адреса по handle; один может быть основным (is_primary)."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-domain.ts
  - apps/backend/src/tenant-legal/domain.ts
related:
  - 01-tenant
  - 02-tenant-handle
  - 10-legal-offer
status: устоялось
source: apps/backend/src/modules/tenant/models/tenant-domain.ts
---

# домен тенанта (`tenant_domain`)

Модель `tenant_domain` хранит хосты, на которых магазин отвечает, помимо адреса по умолчанию, построенного из `handle`. `is_primary` определяет каноническый адрес, который читает `resolveTenantDomain` для `{{ДОМЕН_САЙТА}}` в юридических документах.
