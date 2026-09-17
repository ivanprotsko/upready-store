---
id: 23-tenant-product-category-link
term_ru: "владение категорией (tenant-product-category)"
term_en: "/tenants/product-categories"
short: "Module link владения категорией товара — категории в Medusa глобальные, и это единственная запись, чья она."
used_in:
  - apps/backend/src/links/tenant-product-category.ts
related:
  - 21-tenant-product-link
status: устоялось
source: apps/backend/src/links/tenant-product-category.ts
---

# владение категорией (tenant-product-category) (`/tenants/product-categories`)

Link `tenant-product-category.ts`: категории Medusa не привязаны к каналу продаж, поэтому этот link — единственная запись владения. `GET /tenants/product-categories` и `GET /store/tenant/product-categories` читают через него.
