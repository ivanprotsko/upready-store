---
id: 45-medusa-product-option
term_ru: "опция товара (Medusa)"
term_en: "product_option"
short: "Родная механика вариантов Medusa (например «Размер», «Цвет») — отдельно от собственных характеристик тенанта (id 14), не путать."
used_in:
  - apps/tenant-panel/src/hooks/api/product-options.tsx
  - apps/backend/src/api/tenants/product-options/route.ts
related:
  - 14-tenant-product-attribute
status: кандидат
source: apps/tenant-panel/src/hooks/api/product-options.tsx
---

# опция товара (Medusa) (`product_option`)

Опции товара — стандартный механизм Medusa для вариантов (комбинации значений порождают variant). Характеристика тенанта (`tenant_product_attribute`, id 14) — другая сущность: описательное поле каталога, не порождающее вариант. Общее слово «атрибут»/«характеристика» в панели используется для обеих сущностей вперемешку — источник разнобоя, который фиксирует эта запись словаря.
