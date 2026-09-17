---
id: 12-tenant-notification-settings
term_ru: "настройки уведомлений тенанта"
term_en: "tenant_notification_settings"
short: "Кто и как узнаёт о новом заказе конкретного магазина — одна строка на тенант, создаётся при первом обращении."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-notification-settings.ts
related:
  - 01-tenant
status: устоялось
source: apps/backend/src/modules/tenant/models/tenant-notification-settings.ts
---

# настройки уведомлений тенанта (`tenant_notification_settings`)

Модель `tenant_notification_settings`, `hasOne` у `tenant`. Строка создаётся лениво при первом использовании, а не заранее для всех магазинов.
