---
id: 17-tenant-home-config
term_ru: "конфигурация главной"
term_en: "tenant_home_config"
short: "Документ настройки главной страницы витрины конкретного магазина."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-home-config.ts
  - apps/tenant-panel/src/routes/home-settings/home-settings.tsx
related:
  - 01-tenant
status: устоялось
source: apps/backend/src/modules/tenant/models/tenant-home-config.ts
---

# конфигурация главной (`tenant_home_config`)

Модель `tenant_home_config`, `hasOne` у `tenant` — что показывается на главной странице витрины этого магазина. В панели — раздел `home-settings`.
