---
id: 05-sales-channel
term_ru: "канал продаж"
term_en: "sales channel"
short: "Канал продаж Medusa, привязанный к тенанту 1:1 через module link; в него попадают товары магазина."
used_in:
  - apps/backend/src/links/tenant-sales-channel.ts
  - apps/backend/src/links/tenant-order.ts
related:
  - 01-tenant
  - 06-publishable-api-key
  - 22-tenant-order-link
status: устоялось
source: apps/backend/src/links/tenant-sales-channel.ts
---

# канал продаж (`sales channel`)

Каждому тенанту при создании (`createTenantWorkflow`) заводится один Sales Channel Medusa и связывается через link `tenant-sales-channel.ts` (пара `tenant_id`+`sales_channel_id`, не колонка). Товары тенанта попадают в этот канал; заказ, оформленный через канал, несёт его id, по которому `linkOrderToTenantWorkflow` находит владельца.
