---
id: 22-tenant-order-link
term_ru: "владение заказом (tenant-order)"
term_en: "/tenants/orders"
short: "Module link, которым заказ привязан к тенанту — заполняется через сопоставление канала продаж заказа с владельцем."
used_in:
  - apps/backend/src/links/tenant-order.ts
related:
  - 05-sales-channel
status: устоялось
source: apps/backend/src/links/tenant-order.ts
---

# владение заказом (tenant-order) (`/tenants/orders`)

Link `tenant-order.ts`, `isList: true`: `linkOrderToTenantWorkflow` (подписчик `order.placed`) сопоставляет sales channel заказа с тенантом-владельцем; `GET /tenants/orders` читает через этот link.
