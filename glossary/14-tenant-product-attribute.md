---
id: 14-tenant-product-attribute
term_ru: "характеристика товара"
term_en: "tenant_product_attribute"
short: "Собственное поле каталога, которое владелец сам заводит для своих товаров (например «Состав», «Объём») — не встроенный атрибут Medusa."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-product-attribute.ts
  - apps/tenant-panel/src/routes/product-attributes/attribute-list/attribute-list.tsx
related:
  - 15-tenant-product-attribute-option
  - 45-medusa-product-option
status: кандидат
source: apps/backend/src/modules/tenant/models/tenant-product-attribute.ts
---

# характеристика товара (`tenant_product_attribute`)

Модель `tenant_product_attribute`: схема характеристик — это то, что заявил владелец, а не ключ, случайно оказавшийся в `metadata`. `key` — машинное имя (для CSV-колонки `attr:<key>` и параметра фильтра `a_<key>`), `name` — переводимая подпись. `category_id=null` значит «на весь каталог». В панели — раздел `product-attributes`, отдельно от Medusa-атрибутов товара (weight/dimensions/material — родная механика Medusa, id 45).
