---
id: 15-tenant-product-attribute-option
term_ru: "значение характеристики (select)"
term_en: "tenant_product_attribute_option"
short: "Один вариант характеристики типа select: машинное значение для фильтра/CSV + переводимая подпись для покупателя."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-product-attribute-option.ts
related:
  - 14-tenant-product-attribute
status: кандидат
source: apps/backend/src/modules/tenant/models/tenant-product-attribute-option.ts
---

# значение характеристики (select) (`tenant_product_attribute_option`)

Модель `tenant_product_attribute_option`, по образцу `product_option_value` Medusa: машинный `value` хранится в товаре и в URL фильтра, `label` переводится и показывается покупателю.
