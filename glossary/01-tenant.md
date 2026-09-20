---
id: 01-tenant
term_ru: "тенант"
term_en: "tenant"
short: "Один магазин на общем бэкенде: свой каталог, свой канал продаж, свой ключ витрины, свой домен."
used_in:
  - apps/backend/src/modules/tenant/models/tenant.ts
  - apps/backend/src/api/tenants/tenant-scope.ts
related:
  - 02-tenant-handle
  - 05-sales-channel
  - 06-publishable-api-key
  - 20-tenant-scope
status: устоялось
source: apps/backend/src/modules/tenant/models/tenant.ts
---

# тенант (`tenant`)

Строка `tenant` в модуле `tenant` — единица арендатора платформы. Один бэкенд обслуживает много тенантов; у каждого свой sales channel и publishable API key (module links, не колонки), свой домен, свои реквизиты, страницы, характеристики товаров и настройки. Рецепт Medusa называет это vendor, здесь — владелец магазина.
