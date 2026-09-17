---
id: 18-tenant-locale-settings
term_ru: "языковые настройки тенанта"
term_en: "tenant_locale_settings"
short: "Какие из 36 языков витрины магазин предлагает, какой из них по умолчанию, и в какой стране цена по умолчанию."
used_in:
  - apps/backend/src/modules/tenant/models/tenant-locale-settings.ts
  - apps/tenant-panel/src/routes/settings/locale/locale.tsx
related:
  - 01-tenant
status: устоялось
source: apps/backend/src/modules/tenant/models/tenant-locale-settings.ts
---

# языковые настройки тенанта (`tenant_locale_settings`)

Модель `tenant_locale_settings`, `hasOne` у `tenant`. В панели языковые переключатели читают `LOCALE_CODES` того же списка, что и витрина.
