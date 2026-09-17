---
id: 21-tenant-product-link
term_ru: "владение товаром (tenant-product)"
term_en: "tenant.products"
short: "Module link, которым записана принадлежность товара тенанту; по нему панель и API читают «свои» товары."
used_in:
  - apps/backend/src/links/tenant-product.ts
related:
  - 05-sales-channel
  - 20-tenant-scope
status: устоялось
source: apps/backend/src/links/tenant-product.ts
---

# владение товаром (tenant-product) (`tenant.products`)

Link `tenant-product.ts`: `createTenantProductWorkflow` пишет связь, `GET /tenants/products` читает через неё. Товар также состоит в канале продаж тенанта — по нему фильтрует витрина, а этот link — запись владения для API тенанта.
