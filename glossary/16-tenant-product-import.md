---
id: 16-tenant-product-import
term_ru: "импорт каталога (dry-run)"
term_en: "tenant_product_import"
short: "Загруженный владельцем CSV-прайс: сначала план (dry-run) с отчётом, применяется по отдельному подтверждению."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-product-import.ts
  - apps/tenant-panel/src/routes/products/product-import/product-import.tsx
related:
  - 33-dry-run
  - 14-tenant-product-attribute
status: устоялось
source: apps/backend/src/modules/tenant/models/tenant-product-import.ts
---

# импорт каталога (dry-run) (`tenant_product_import`)

Модель `tenant_product_import`: строка хранит исходный файл и отчёт плана, чтобы владелец мог перечитать отчёт после перезагрузки страницы. `confirm` перепланирует против текущего каталога, а не проигрывает старый план — правка товара между планом и подтверждением не будет затёрта. Статусы: pending / applied / partially_applied / rejected / cancelled.
